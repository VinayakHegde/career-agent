import { StateGraph, START, END } from "@langchain/langgraph";
import { PlanExecuteState, type PlanExecuteStateType } from "../schemas/graph-state.js";
import {
  DEPENDENCIES,
  MODE_TASKS,
  type Task,
  type TaskKind,
} from "../schemas/plan.js";
import type { ApplicationPack, Mode } from "../schemas/application.js";
import { analyzeJob } from "../agents/job-analyst.js";
import { analyzeMatch } from "../agents/cv-analyst.js";
import { analyzeGaps } from "../agents/gap-analyst.js";
import { suggestCvBullets } from "../agents/writer.js";
import { prepInterview } from "../agents/interview-coach.js";
import { buildStrategyBrief } from "../agents/synthesizer.js";
import { planTasks } from "../agents/planner.js";
import { evaluatePack } from "../agents/evaluator.js";
import { packFromState } from "./pack.js";

const MAX_RETRIES = 1;

/* --------------------------- Plan normalization -------------------------- */

/** Keep planner influence (ordering) but guarantee a valid, mode-correct plan. */
export function normalizeKinds(proposed: TaskKind[], mode: Mode): TaskKind[] {
  const allowed = new Set(MODE_TASKS[mode]);
  const seen = new Set<TaskKind>();
  const ordered: TaskKind[] = [];
  for (const k of proposed) {
    if (allowed.has(k) && !seen.has(k)) {
      seen.add(k);
      ordered.push(k);
    }
  }
  // Inject any required tasks the planner omitted.
  for (const k of MODE_TASKS[mode]) {
    if (!seen.has(k)) ordered.push(k);
  }
  return topoSort(ordered);
}

/** Topologically sort a small task set so dependencies always come first. */
export function topoSort(kinds: TaskKind[]): TaskKind[] {
  const set = new Set(kinds);
  const done = new Set<TaskKind>();
  const result: TaskKind[] = [];
  while (result.length < kinds.length) {
    let progressed = false;
    for (const k of kinds) {
      if (done.has(k)) continue;
      const deps = DEPENDENCIES[k].filter((d) => set.has(d));
      if (deps.every((d) => done.has(d))) {
        result.push(k);
        done.add(k);
        progressed = true;
      }
    }
    if (!progressed) break; // safety against cycles (none expected)
  }
  return result;
}

/* ----------------------------- Task helpers ------------------------------ */

export function pickNextTask(tasks: Task[]): Task | undefined {
  const doneKinds = new Set(tasks.filter((t) => t.status === "done").map((t) => t.kind));
  return tasks.find(
    (t) =>
      t.status === "pending" &&
      DEPENDENCIES[t.kind].every((d) => !tasks.some((x) => x.kind === d) || doneKinds.has(d)),
  );
}

function setStatus(tasks: Task[], id: string, status: Task["status"]): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, status } : t));
}

/** Run the agent for a single task kind, returning its state slice. */
async function runTask(
  kind: TaskKind,
  state: PlanExecuteStateType,
): Promise<Partial<PlanExecuteStateType>> {
  switch (kind) {
    case "job_analysis":
      return { jobAnalysis: await analyzeJob(state.jobText) };
    case "match_analysis":
      return { matchAnalysis: await analyzeMatch(state.cvText, state.jobAnalysis!) };
    case "gap_analysis":
      return {
        gapAnalysis: await analyzeGaps(state.cvText, state.jobAnalysis!, state.matchAnalysis!),
      };
    case "cv_tailoring":
      return {
        cvTailoring: await suggestCvBullets(state.cvText, state.jobAnalysis!, state.matchAnalysis!),
      };
    case "interview_prep":
      return {
        interviewPrep: await prepInterview(state.cvText, state.jobAnalysis!, state.matchAnalysis!),
      };
    case "strategy_brief":
      return { strategyBrief: await buildStrategyBrief(packFromState(state)) };
  }
}

/* -------------------------------- Nodes ---------------------------------- */

async function planNode(state: PlanExecuteStateType): Promise<Partial<PlanExecuteStateType>> {
  const plan = await planTasks(state.mode);
  const objectives = new Map(plan.tasks.map((t) => [t.kind, t.objective]));
  const kinds = normalizeKinds(
    plan.tasks.map((t) => t.kind),
    state.mode,
  );
  const tasks: Task[] = kinds.map((kind, i) => ({
    id: `t${i + 1}`,
    kind,
    objective: objectives.get(kind) ?? `Produce ${kind}.`,
    status: "pending",
  }));
  return { tasks, log: [`plan: ${kinds.join(" → ")}`] };
}

async function executeNode(state: PlanExecuteStateType): Promise<Partial<PlanExecuteStateType>> {
  const next = pickNextTask(state.tasks);
  if (!next) return {};
  try {
    const update = await runTask(next.kind, state);
    return { ...update, tasks: setStatus(state.tasks, next.id, "done"), log: [`execute: ${next.kind} ✓`] };
  } catch (err) {
    return {
      tasks: setStatus(state.tasks, next.id, "failed"),
      log: [`execute: ${next.kind} ✗ (${(err as Error).message})`],
    };
  }
}

async function evaluateNode(state: PlanExecuteStateType): Promise<Partial<PlanExecuteStateType>> {
  const expected = MODE_TASKS[state.mode];
  const evaluation = await evaluatePack(packFromState(state), state.mode, expected);

  const canRetry = state.retryCount < MAX_RETRIES;
  const redo = evaluation.sectionsToRedo.filter((k) => state.tasks.some((t) => t.kind === k));

  if (evaluation.complete || !canRetry || redo.length === 0) {
    return { evaluation, log: [`evaluate: ${evaluation.complete ? "complete" : "accepted (no more retries)"}`] };
  }

  // Re-queue flagged sections for one corrective pass.
  const redoSet = new Set(redo);
  const tasks = state.tasks.map((t) => (redoSet.has(t.kind) ? { ...t, status: "pending" as const } : t));
  return {
    evaluation,
    tasks,
    retryCount: state.retryCount + 1,
    log: [`evaluate: retry requested for ${redo.join(", ")}`],
  };
}

/* ------------------------------- Routing --------------------------------- */

const afterExecute = (s: PlanExecuteStateType) => (pickNextTask(s.tasks) ? "execute" : "evaluate");
const afterEvaluate = (s: PlanExecuteStateType) => (pickNextTask(s.tasks) ? "execute" : END);

/* ------------------------------ Graph wiring ----------------------------- */

export function buildPhase3Graph() {
  return new StateGraph(PlanExecuteState)
    .addNode("plan", planNode)
    .addNode("execute", executeNode)
    .addNode("evaluate", evaluateNode)
    .addEdge(START, "plan")
    .addEdge("plan", "execute")
    .addConditionalEdges("execute", afterExecute, ["execute", "evaluate"])
    .addConditionalEdges("evaluate", afterEvaluate, ["execute", END])
    .compile();
}

export interface Phase3Input {
  cvText: string;
  jobText: string;
  mode: Mode;
  onStep?: (label: string) => void;
}

export interface Phase3Result {
  pack: ApplicationPack;
  tasks: Task[];
  evaluation?: PlanExecuteStateType["evaluation"];
}

export async function runPhase3(input: Phase3Input): Promise<Phase3Result> {
  const app = buildPhase3Graph();
  const acc: Partial<PlanExecuteStateType> = {};

  const stream = await app.stream(
    { cvText: input.cvText, jobText: input.jobText, mode: input.mode },
    { streamMode: "updates", recursionLimit: 50 },
  );

  for await (const chunk of stream) {
    for (const [node, update] of Object.entries(chunk)) {
      Object.assign(acc, update);
      const logs = (update as Partial<PlanExecuteStateType>).log;
      input.onStep?.(logs?.length ? logs[logs.length - 1]! : node);
    }
  }

  return { pack: packFromState(acc), tasks: acc.tasks ?? [], evaluation: acc.evaluation };
}
