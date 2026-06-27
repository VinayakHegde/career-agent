import type { ApplicationPack, Mode } from "../schemas/application.js";
import { analyzeJob } from "../agents/job-analyst.js";
import { analyzeMatch } from "../agents/cv-analyst.js";
import { analyzeGaps } from "../agents/gap-analyst.js";
import { suggestCvBullets } from "../agents/writer.js";
import { prepInterview } from "../agents/interview-coach.js";
import { buildStrategyBrief } from "../agents/synthesizer.js";

export interface Phase1Input {
  cvText: string;
  jobText: string;
  mode: Mode;
  /** Optional progress hook so the CLI can report each step as it runs. */
  onStep?: (label: string) => void;
}

/**
 * Phase 1: a plain sequential pipeline (no graph yet). Each step is an isolated
 * structured LLM call. Which steps run depends on the requested mode.
 *
 * This intentionally avoids LangGraph — that arrives in Phase 2 — so the first
 * milestone stays small and easy to reason about.
 */
export async function runPhase1(input: Phase1Input): Promise<ApplicationPack> {
  const { cvText, jobText, mode } = input;
  const step = (label: string) => input.onStep?.(label);
  const pack: ApplicationPack = {};

  step("Analyzing job description");
  pack.jobAnalysis = await analyzeJob(jobText);

  if (mode === "job-analysis") return pack;

  // Every remaining mode needs the CV-to-job match as a foundation.
  step("Matching CV against requirements");
  pack.matchAnalysis = await analyzeMatch(cvText, pack.jobAnalysis);

  if (mode === "cv-tailoring" || mode === "full") {
    step("Analyzing skill gaps");
    pack.gapAnalysis = await analyzeGaps(cvText, pack.jobAnalysis, pack.matchAnalysis);

    step("Drafting tailored CV bullets");
    pack.cvTailoring = await suggestCvBullets(cvText, pack.jobAnalysis, pack.matchAnalysis);
  }

  if (mode === "interview-prep" || mode === "full") {
    step("Preparing interview questions");
    pack.interviewPrep = await prepInterview(cvText, pack.jobAnalysis, pack.matchAnalysis);
  }

  if (mode === "full") {
    step("Synthesizing final strategy brief");
    pack.strategyBrief = await buildStrategyBrief(pack);
  }

  return pack;
}
