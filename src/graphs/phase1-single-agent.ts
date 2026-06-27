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

  // gap, tailoring, and interview prep all depend ONLY on the match, not on
  // each other, so we fan them out concurrently. (Real speedup requires Ollama
  // concurrency, i.e. OLLAMA_NUM_PARALLEL >= 2.)
  const parallel: Array<Promise<unknown>> = [];
  const labels: string[] = [];

  if (mode === "cv-tailoring" || mode === "full") {
    labels.push("gap analysis", "CV tailoring");
    parallel.push(
      analyzeGaps(cvText, pack.jobAnalysis, pack.matchAnalysis).then((r) => (pack.gapAnalysis = r)),
      suggestCvBullets(cvText, pack.jobAnalysis, pack.matchAnalysis).then((r) => (pack.cvTailoring = r)),
    );
  }
  if (mode === "interview-prep" || mode === "full") {
    labels.push("interview prep");
    parallel.push(
      prepInterview(cvText, pack.jobAnalysis, pack.matchAnalysis).then((r) => (pack.interviewPrep = r)),
    );
  }

  if (parallel.length > 0) {
    step(`Running in parallel: ${labels.join(", ")}`);
    await Promise.all(parallel);
  }

  if (mode === "full") {
    step("Synthesizing final strategy brief");
    pack.strategyBrief = await buildStrategyBrief(pack);
  }

  return pack;
}
