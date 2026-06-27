import { StateGraph, START, END } from "@langchain/langgraph";
import { SupervisorState, type SupervisorStateType } from "../schemas/graph-state.js";
import { DEPENDENCIES, MODE_TASKS, type TaskKind } from "../schemas/plan.js";
import { WORKERS, type Worker } from "../schemas/supervisor.js";
import type { ApplicationPack, Mode } from "../schemas/application.js";
import { analyzeJob } from "../agents/job-analyst.js";
import { analyzeMatch } from "../agents/cv-analyst.js";
import { analyzeGaps } from "../agents/gap-analyst.js";
import { suggestCvBullets } from "../agents/writer.js";
import { prepInterview } from "../agents/interview-coach.js";
import { buildStrategyBrief } from "../agents/synthesizer.js";
import { reviewCvBullets } from "../agents/critic.js";
import { decideNext } from "../agents/supervisor.js";
import { packFromState } from "./pack.js";

/** Which pack section each worker produces (critic produces a critique, not a section). */
const WORKER_SECTION: Record<Worker, TaskKind | undefined> = {
  job_analyst: "job_analysis",
  cv_evidence: "match_analysis",
  gap_analyst: "gap_analysis",
  cv_writer: "cv_tailoring",
  interview_coach: "interview_prep",
  synthesizer: "strategy_brief",
  critic: undefined,
};

/* ----------------------------- Eligibility ------------------------------- */

export function completedKinds(state: SupervisorStateType): Set<TaskKind> {
  const done = new Set<TaskKind>();
  if (state.jobAnalysis) done.add("job_analysis");
  if (state.matchAnalysis) done.add("match_analysis");
  if (state.gapAnalysis) done.add("gap_analysis");
  if (state.cvTailoring) done.add("cv_tailoring");
  if (state.interviewPrep) done.add("interview_prep");
  if (state.strategyBrief) done.add("strategy_brief");
  return done;
}

/**
 * Compute which workers the supervisor may legally choose right now. This is the
 * guardrail that keeps an 8B supervisor honest: it can only pick eligible steps.
 */
export function eligibleWorkers(state: SupervisorStateType): Worker[] {
  const need = new Set<TaskKind>(MODE_TASKS[state.mode]);
  const done = completedKinds(state);
  const eligible: Worker[] = [];

  for (const w of WORKERS) {
    if (w === "critic" || w === "synthesizer") continue; // handled specially below
    const section = WORKER_SECTION[w];
    if (!section || !need.has(section) || done.has(section)) continue;
    if (DEPENDENCIES[section].every((d) => done.has(d))) eligible.push(w);
  }

  // Critic reviews the writer's output once, when tailoring is in scope.
  if (need.has("cv_tailoring") && done.has("cv_tailoring") && !state.critiqueDone) {
    eligible.push("critic");
  }

  // Synthesizer runs last: every other expected section done (and critic, if applicable).
  if (need.has("strategy_brief") && !done.has("strategy_brief")) {
    const others = [...need].filter((k) => k !== "strategy_brief");
    const othersDone = others.every((k) => done.has(k));
    const criticOk = !need.has("cv_tailoring") || state.critiqueDone;
    if (othersDone && criticOk) eligible.push("synthesizer");
  }

  return eligible;
}

/* -------------------------------- Nodes ---------------------------------- */

async function supervisorNode(state: SupervisorStateType): Promise<Partial<SupervisorStateType>> {
  const eligible = eligibleWorkers(state);
  if (eligible.length === 0) {
    return { next: "FINISH", log: ["supervisor → FINISH"] };
  }

  const critiqueNote = state.critique
    ? `Critic verdict: ${state.critique.approved ? "approved" : "found issues"} — ${state.critique.summary}`
    : "Critic has not reviewed yet.";

  const decision = await decideNext({
    mode: state.mode,
    completed: [...completedKinds(state)],
    eligible,
    critiqueNote,
  });

  // Guardrail: only honor a choice the graph deems eligible; otherwise take the
  // first eligible step. FINISH is only valid when nothing is eligible.
  const next = (eligible as string[]).includes(decision.next) ? (decision.next as Worker) : eligible[0]!;
  return { next, log: [`supervisor → ${next} (${decision.reason})`] };
}

async function jobAnalystNode(state: SupervisorStateType): Promise<Partial<SupervisorStateType>> {
  return { jobAnalysis: await analyzeJob(state.jobText), log: ["job_analyst ✓"] };
}

async function cvEvidenceNode(state: SupervisorStateType): Promise<Partial<SupervisorStateType>> {
  return { matchAnalysis: await analyzeMatch(state.cvText, state.jobAnalysis!), log: ["cv_evidence ✓"] };
}

async function gapAnalystNode(state: SupervisorStateType): Promise<Partial<SupervisorStateType>> {
  const gapAnalysis = await analyzeGaps(state.cvText, state.jobAnalysis!, state.matchAnalysis!);
  return { gapAnalysis, log: ["gap_analyst ✓"] };
}

async function cvWriterNode(state: SupervisorStateType): Promise<Partial<SupervisorStateType>> {
  const cvTailoring = await suggestCvBullets(state.cvText, state.jobAnalysis!, state.matchAnalysis!);
  return { cvTailoring, log: ["cv_writer ✓"] };
}

async function criticNode(state: SupervisorStateType): Promise<Partial<SupervisorStateType>> {
  const critique = await reviewCvBullets(state.cvText, state.cvTailoring!);
  return {
    critique,
    critiqueDone: true,
    log: [`critic ✓ (${critique.approved ? "approved" : `${critique.findings.length} finding(s)`})`],
  };
}

async function interviewCoachNode(state: SupervisorStateType): Promise<Partial<SupervisorStateType>> {
  const interviewPrep = await prepInterview(state.cvText, state.jobAnalysis!, state.matchAnalysis!);
  return { interviewPrep, log: ["interview_coach ✓"] };
}

async function synthesizerNode(state: SupervisorStateType): Promise<Partial<SupervisorStateType>> {
  return { strategyBrief: await buildStrategyBrief(packFromState(state)), log: ["synthesizer ✓"] };
}

/* ------------------------------- Routing --------------------------------- */

const routeFromSupervisor = (s: SupervisorStateType) => (s.next === "FINISH" || !s.next ? END : s.next);

/* ------------------------------ Graph wiring ----------------------------- */

export function buildPhase4Graph() {
  const graph = new StateGraph(SupervisorState)
    .addNode("supervisor", supervisorNode)
    .addNode("job_analyst", jobAnalystNode)
    .addNode("cv_evidence", cvEvidenceNode)
    .addNode("gap_analyst", gapAnalystNode)
    .addNode("cv_writer", cvWriterNode)
    .addNode("critic", criticNode)
    .addNode("interview_coach", interviewCoachNode)
    .addNode("synthesizer", synthesizerNode)
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", routeFromSupervisor, [...WORKERS, END]);

  // Every worker reports back to the supervisor for the next decision.
  for (const w of WORKERS) graph.addEdge(w, "supervisor");

  return graph.compile();
}

export interface Phase4Input {
  cvText: string;
  jobText: string;
  mode: Mode;
  onStep?: (label: string) => void;
}

export interface Phase4Result {
  pack: ApplicationPack;
}

export async function runPhase4(input: Phase4Input): Promise<Phase4Result> {
  const app = buildPhase4Graph();
  const acc: Partial<SupervisorStateType> = {};

  const stream = await app.stream(
    { cvText: input.cvText, jobText: input.jobText, mode: input.mode },
    { streamMode: "updates", recursionLimit: 60 },
  );

  for await (const chunk of stream) {
    for (const [node, update] of Object.entries(chunk)) {
      Object.assign(acc, update);
      const logs = (update as Partial<SupervisorStateType>).log;
      input.onStep?.(logs?.length ? logs[logs.length - 1]! : node);
    }
  }

  const pack = packFromState(acc);
  pack.critique = acc.critique;
  return { pack };
}
