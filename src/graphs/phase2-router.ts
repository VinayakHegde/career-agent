import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState, type GraphStateType } from "../schemas/graph-state.js";
import type { ApplicationPack, Mode } from "../schemas/application.js";
import { analyzeJob } from "../agents/job-analyst.js";
import { analyzeMatch } from "../agents/cv-analyst.js";
import { analyzeGaps } from "../agents/gap-analyst.js";
import { suggestCvBullets } from "../agents/writer.js";
import { prepInterview } from "../agents/interview-coach.js";
import { buildStrategyBrief } from "../agents/synthesizer.js";
import { classifyIntent } from "../agents/router.js";

/* ------------------------------- Nodes ----------------------------------- */
// Each node receives the current state and returns a partial update.

async function routerNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  // Explicit mode wins; otherwise infer from free text; otherwise default to full.
  let mode: Mode = state.mode;
  if (!mode) {
    mode = state.request ? await classifyIntent(state.request) : "full";
  }
  return { mode, log: [`router → mode=${mode}`] };
}

async function jobAnalystNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  return { jobAnalysis: await analyzeJob(state.jobText), log: ["job_analyst"] };
}

async function matchNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const matchAnalysis = await analyzeMatch(state.cvText, state.jobAnalysis!);
  return { matchAnalysis, log: ["match"] };
}

async function gapNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const gapAnalysis = await analyzeGaps(state.cvText, state.jobAnalysis!, state.matchAnalysis!);
  return { gapAnalysis, log: ["gap"] };
}

async function writerNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const cvTailoring = await suggestCvBullets(state.cvText, state.jobAnalysis!, state.matchAnalysis!);
  return { cvTailoring, log: ["writer"] };
}

async function interviewNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const interviewPrep = await prepInterview(state.cvText, state.jobAnalysis!, state.matchAnalysis!);
  return { interviewPrep, log: ["interview"] };
}

async function synthNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const strategyBrief = await buildStrategyBrief(packFromState(state));
  return { strategyBrief, log: ["synth"] };
}

/* ----------------------------- Routing edges ----------------------------- */
// Conditional edge functions read the resolved mode and pick the next node.

const afterJob = (s: GraphStateType) => (s.mode === "job-analysis" ? END : "match");
const afterMatch = (s: GraphStateType) => (s.mode === "interview-prep" ? "interview" : "gap");
const afterWriter = (s: GraphStateType) => (s.mode === "full" ? "interview" : END);
const afterInterview = (s: GraphStateType) => (s.mode === "full" ? "synth" : END);

/* ------------------------------ Graph wiring ----------------------------- */

export function buildPhase2Graph() {
  return new StateGraph(GraphState)
    .addNode("router", routerNode)
    .addNode("job_analyst", jobAnalystNode)
    .addNode("match", matchNode)
    .addNode("gap", gapNode)
    .addNode("writer", writerNode)
    .addNode("interview", interviewNode)
    .addNode("synth", synthNode)
    .addEdge(START, "router")
    .addEdge("router", "job_analyst")
    .addConditionalEdges("job_analyst", afterJob, ["match", END])
    .addConditionalEdges("match", afterMatch, ["gap", "interview"])
    .addEdge("gap", "writer")
    .addConditionalEdges("writer", afterWriter, ["interview", END])
    .addConditionalEdges("interview", afterInterview, ["synth", END])
    .addEdge("synth", END)
    .compile();
}

function packFromState(state: Partial<GraphStateType>): ApplicationPack {
  return {
    jobAnalysis: state.jobAnalysis,
    matchAnalysis: state.matchAnalysis,
    gapAnalysis: state.gapAnalysis,
    cvTailoring: state.cvTailoring,
    interviewPrep: state.interviewPrep,
    strategyBrief: state.strategyBrief,
  };
}

export interface Phase2Input {
  cvText: string;
  jobText: string;
  /** Explicit mode. If omitted, the router infers from `request` (or uses "full"). */
  mode?: Mode;
  request?: string;
  onStep?: (node: string) => void;
}

export interface Phase2Result {
  pack: ApplicationPack;
  mode: Mode;
}

/**
 * Phase 2: run the routed LangGraph graph. We stream node-level updates so the
 * CLI can report progress, accumulating each node's slice into the final pack.
 */
export async function runPhase2(input: Phase2Input): Promise<Phase2Result> {
  const app = buildPhase2Graph();
  const acc: Partial<GraphStateType> = {};

  const stream = await app.stream(
    { cvText: input.cvText, jobText: input.jobText, mode: input.mode, request: input.request },
    { streamMode: "updates" },
  );

  for await (const chunk of stream) {
    for (const [node, update] of Object.entries(chunk)) {
      input.onStep?.(node);
      Object.assign(acc, update);
    }
  }

  return { pack: packFromState(acc), mode: acc.mode ?? input.mode ?? "full" };
}
