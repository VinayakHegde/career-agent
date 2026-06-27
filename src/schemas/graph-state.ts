import { Annotation } from "@langchain/langgraph";
import type {
  JobAnalysis,
  MatchAnalysis,
  GapAnalysis,
  CvTailoring,
  InterviewPrep,
  StrategyBrief,
  Critique,
  Verification,
  GroundingReport,
  Mode,
} from "./application.js";
import type { Task, Evaluation } from "./plan.js";
import type { SupervisorChoice } from "./supervisor.js";

/**
 * The shared state that flows through the LangGraph graph. Each node receives
 * the current state and returns a partial update. Unless a custom reducer is
 * given, the default behavior is "last write wins" (overwrite).
 */
export const GraphState = Annotation.Root({
  // --- Inputs ---
  cvText: Annotation<string>(),
  jobText: Annotation<string>(),

  /** Optional free-text request used by the router to infer the mode. */
  request: Annotation<string | undefined>(),

  /** The resolved mode. The router writes this; routing edges read it. */
  mode: Annotation<Mode>(),

  // --- Accumulating results (each node fills in its own slice) ---
  jobAnalysis: Annotation<JobAnalysis | undefined>(),
  matchAnalysis: Annotation<MatchAnalysis | undefined>(),
  gapAnalysis: Annotation<GapAnalysis | undefined>(),
  cvTailoring: Annotation<CvTailoring | undefined>(),
  interviewPrep: Annotation<InterviewPrep | undefined>(),
  strategyBrief: Annotation<StrategyBrief | undefined>(),

  /** Human-readable trace of which nodes ran, appended to as we go. */
  log: Annotation<string[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export type GraphStateType = typeof GraphState.State;

/**
 * State for the Phase 3 plan-and-execute graph. Extends the basic pack slices
 * with a typed task list, an evaluation result, and a retry counter so the
 * graph can self-correct once before finishing.
 */
export const PlanExecuteState = Annotation.Root({
  cvText: Annotation<string>(),
  jobText: Annotation<string>(),
  mode: Annotation<Mode>(),

  /** The planner's task list; the executor mutates statuses in place. */
  tasks: Annotation<Task[]>({ reducer: (_current, update) => update, default: () => [] }),

  // Result slices, filled in by the executor.
  jobAnalysis: Annotation<JobAnalysis | undefined>(),
  matchAnalysis: Annotation<MatchAnalysis | undefined>(),
  gapAnalysis: Annotation<GapAnalysis | undefined>(),
  cvTailoring: Annotation<CvTailoring | undefined>(),
  interviewPrep: Annotation<InterviewPrep | undefined>(),
  strategyBrief: Annotation<StrategyBrief | undefined>(),

  /** The evaluator's verdict on the latest pack. */
  evaluation: Annotation<Evaluation | undefined>(),

  /** How many self-correction retries have been spent (max 1). */
  retryCount: Annotation<number>({ reducer: (_current, update) => update, default: () => 0 }),

  log: Annotation<string[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export type PlanExecuteStateType = typeof PlanExecuteState.State;

/**
 * State for the Phase 4 supervisor-worker graph. The supervisor writes `next`;
 * the routing edge sends control to that worker (or ends). Workers fill in
 * their slice and route back to the supervisor.
 */
export const SupervisorState = Annotation.Root({
  cvText: Annotation<string>(),
  jobText: Annotation<string>(),
  mode: Annotation<Mode>(),

  jobAnalysis: Annotation<JobAnalysis | undefined>(),
  matchAnalysis: Annotation<MatchAnalysis | undefined>(),
  gapAnalysis: Annotation<GapAnalysis | undefined>(),
  cvTailoring: Annotation<CvTailoring | undefined>(),
  interviewPrep: Annotation<InterviewPrep | undefined>(),
  strategyBrief: Annotation<StrategyBrief | undefined>(),

  /** Critic's review of the writer's bullets. */
  critique: Annotation<Critique | undefined>(),
  /** Whether the critic has run (prevents re-reviewing in Phase 4). */
  critiqueDone: Annotation<boolean>({ reducer: (_c, u) => u, default: () => false }),

  /** The supervisor's chosen next step. */
  next: Annotation<SupervisorChoice | undefined>(),

  log: Annotation<string[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export type SupervisorStateType = typeof SupervisorState.State;

/**
 * State for the Phase 5 collaboration loop. The writer, critic, and evidence
 * verifier iterate on the CV bullets until the supervisor approves (or the
 * revision budget is spent).
 */
export const CollaborationState = Annotation.Root({
  cvText: Annotation<string>(),
  jobText: Annotation<string>(),
  mode: Annotation<Mode>(),

  jobAnalysis: Annotation<JobAnalysis | undefined>(),
  matchAnalysis: Annotation<MatchAnalysis | undefined>(),

  /** The current draft of tailored bullets (overwritten each revision). */
  cvTailoring: Annotation<CvTailoring | undefined>(),
  /** Latest critic and verifier feedback on the current draft. */
  critique: Annotation<Critique | undefined>(),
  verification: Annotation<Verification | undefined>(),
  /** Deterministic grounding of the current draft (model-free hard gate). */
  grounding: Annotation<GroundingReport | undefined>(),

  /** Number of writer passes so far (1 draft + N revisions). */
  round: Annotation<number>({ reducer: (_c, u) => u, default: () => 0 }),
  /** Whether the supervisor has approved the final bullets. */
  approved: Annotation<boolean>({ reducer: (_c, u) => u, default: () => false }),

  log: Annotation<string[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export type CollaborationStateType = typeof CollaborationState.State;
