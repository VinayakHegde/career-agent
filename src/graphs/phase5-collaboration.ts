import { StateGraph, START, END } from "@langchain/langgraph";
import { CollaborationState, type CollaborationStateType } from "../schemas/graph-state.js";
import type { ApplicationPack, Mode } from "../schemas/application.js";
import { analyzeJob } from "../agents/job-analyst.js";
import { analyzeMatch, verifyBullets } from "../agents/cv-analyst.js";
import { suggestCvBullets, reviseCvBullets } from "../agents/writer.js";
import { reviewCvBullets } from "../agents/critic.js";
import { approveFinal } from "../agents/supervisor.js";
import { verifyTailoringGrounding, ungroundedClaims } from "../grounding/verify.js";

/** 1 initial draft + up to 2 revisions before the supervisor must accept. */
const MAX_WRITES = 3;

/* -------------------------------- Nodes ---------------------------------- */

async function jobNode(state: CollaborationStateType): Promise<Partial<CollaborationStateType>> {
  return { jobAnalysis: await analyzeJob(state.jobText), log: ["job_analyst ✓"] };
}

async function matchNode(state: CollaborationStateType): Promise<Partial<CollaborationStateType>> {
  return { matchAnalysis: await analyzeMatch(state.cvText, state.jobAnalysis!), log: ["cv_evidence: match ✓"] };
}

/** Writer drafts on the first pass, then revises using critic + verifier feedback. */
async function writeNode(state: CollaborationStateType): Promise<Partial<CollaborationStateType>> {
  const isRevision = state.round > 0;
  const round = state.round + 1;
  const cvTailoring = isRevision
    ? await reviseCvBullets({
        cvText: state.cvText,
        job: state.jobAnalysis!,
        match: state.matchAnalysis!,
        previous: state.cvTailoring!,
        critique: state.critique!,
        verification: state.verification,
        // Hand the writer the deterministic list of bullets that weren't found
        // in the CV, so the revision provably fixes the grounding failures.
        ungroundedClaims: state.grounding ? ungroundedClaims(state.grounding) : undefined,
      })
    : await suggestCvBullets(state.cvText, state.jobAnalysis!, state.matchAnalysis!);
  return { cvTailoring, round, log: [isRevision ? `writer: revised (round ${round})` : "writer: drafted (round 1)"] };
}

async function criticNode(state: CollaborationStateType): Promise<Partial<CollaborationStateType>> {
  const critique = await reviewCvBullets(state.cvText, state.cvTailoring!);
  return { critique, log: [`critic: ${critique.approved ? "approved" : `${critique.findings.length} finding(s)`}`] };
}

async function verifyNode(state: CollaborationStateType): Promise<Partial<CollaborationStateType>> {
  // Two independent signals: the LLM verifier (nuanced) and the deterministic
  // grounding check (model-free, authoritative for "is this quote in the CV?").
  const verification = await verifyBullets(state.cvText, state.cvTailoring!);
  const grounding = verifyTailoringGrounding(state.cvTailoring!, state.cvText);
  return {
    verification,
    grounding,
    log: [
      `verifier: ${verification.allSupported ? "all supported" : "unsupported claims found"}; ` +
        `grounding: ${grounding.totals.ungrounded} ungrounded`,
    ],
  };
}

async function reviewNode(state: CollaborationStateType): Promise<Partial<CollaborationStateType>> {
  const ungrounded = state.grounding?.totals.ungrounded ?? 0;

  if (state.round >= MAX_WRITES) {
    const note = ungrounded > 0 ? ` (warning: ${ungrounded} still ungrounded)` : "";
    return { approved: true, log: [`supervisor: approved (revision budget reached)${note}`] };
  }

  // Deterministic hard gate: never approve while any bullet cites evidence that
  // isn't in the CV, regardless of what the LLM critic/verifier concluded.
  if (ungrounded > 0) {
    return {
      approved: false,
      log: [`supervisor: revise (${ungrounded} ungrounded bullet(s) — deterministic gate)`],
    };
  }

  const approval = await approveFinal({ critique: state.critique!, verification: state.verification! });
  return {
    approved: approval.decision === "approve",
    log: [`supervisor: ${approval.decision} (${approval.reason})`],
  };
}

/* ------------------------------- Routing --------------------------------- */

const afterReview = (s: CollaborationStateType) => (s.approved ? END : "write");

/* ------------------------------ Graph wiring ----------------------------- */

export function buildPhase5Graph() {
  return new StateGraph(CollaborationState)
    .addNode("job", jobNode)
    .addNode("match", matchNode)
    .addNode("write", writeNode)
    .addNode("critic", criticNode)
    .addNode("verify", verifyNode)
    .addNode("review", reviewNode)
    .addEdge(START, "job")
    .addEdge("job", "match")
    .addEdge("match", "write")
    // Critic and verifier both read the current draft and are independent of
    // each other, so they fan out from the writer and run concurrently...
    .addEdge("write", "critic")
    .addEdge("write", "verify")
    // ...then join: review runs once both have finished.
    .addEdge("critic", "review")
    .addEdge("verify", "review")
    .addConditionalEdges("review", afterReview, ["write", END])
    .compile();
}

export interface Phase5Input {
  cvText: string;
  jobText: string;
  mode: Mode;
  onStep?: (label: string) => void;
}

export interface Phase5Result {
  pack: ApplicationPack;
  rounds: number;
  approved: boolean;
}

export async function runPhase5(input: Phase5Input): Promise<Phase5Result> {
  const app = buildPhase5Graph();
  const acc: Partial<CollaborationStateType> = {};

  const stream = await app.stream(
    { cvText: input.cvText, jobText: input.jobText, mode: input.mode },
    { streamMode: "updates", recursionLimit: 60 },
  );

  for await (const chunk of stream) {
    for (const [node, update] of Object.entries(chunk)) {
      Object.assign(acc, update);
      const logs = (update as Partial<CollaborationStateType>).log;
      input.onStep?.(logs?.length ? logs[logs.length - 1]! : node);
    }
  }

  const pack: ApplicationPack = {
    jobAnalysis: acc.jobAnalysis,
    matchAnalysis: acc.matchAnalysis,
    cvTailoring: acc.cvTailoring,
    critique: acc.critique,
    verification: acc.verification,
  };
  return { pack, rounds: acc.round ?? 0, approved: acc.approved ?? false };
}
