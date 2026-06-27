import { Annotation } from "@langchain/langgraph";
import type {
  JobAnalysis,
  MatchAnalysis,
  GapAnalysis,
  CvTailoring,
  InterviewPrep,
  StrategyBrief,
  Mode,
} from "./application.js";

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
