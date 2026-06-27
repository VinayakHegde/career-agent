import type { ApplicationPack } from "../schemas/application.js";

/** Fields every graph state shares that together form an application pack. */
export interface PackSlices {
  jobAnalysis?: ApplicationPack["jobAnalysis"];
  matchAnalysis?: ApplicationPack["matchAnalysis"];
  gapAnalysis?: ApplicationPack["gapAnalysis"];
  cvTailoring?: ApplicationPack["cvTailoring"];
  interviewPrep?: ApplicationPack["interviewPrep"];
  strategyBrief?: ApplicationPack["strategyBrief"];
}

/** Collect the pack sections out of a (partial) graph state. */
export function packFromState(state: PackSlices): ApplicationPack {
  return {
    jobAnalysis: state.jobAnalysis,
    matchAnalysis: state.matchAnalysis,
    gapAnalysis: state.gapAnalysis,
    cvTailoring: state.cvTailoring,
    interviewPrep: state.interviewPrep,
    strategyBrief: state.strategyBrief,
  };
}
