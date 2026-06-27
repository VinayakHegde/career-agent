import { callStructured } from "../llm/structured.js";
import {
  GapAnalysisSchema,
  type GapAnalysis,
  type JobAnalysis,
  type MatchAnalysis,
} from "../schemas/application.js";
import { GROUNDING_RULES, asContext, cvBlock } from "./shared.js";

const SYSTEM = `${GROUNDING_RULES}

Role: Gap Analyst. Identify skills/requirements the candidate is missing or weak on,
rate severity, and suggest only HONEST ways to address each gap (e.g. learning,
reframing transferable experience). Never suggest fabricating experience.`;

/** Derive missing skills and transferable strengths from the match analysis. */
export async function analyzeGaps(
  cvText: string,
  job: JobAnalysis,
  match: MatchAnalysis,
): Promise<GapAnalysis> {
  return callStructured({
    schema: GapAnalysisSchema,
    name: "gap_analysis",
    system: SYSTEM,
    human:
      `Identify the candidate's gaps and transferable strengths for this role.\n\n` +
      `${cvBlock(cvText)}\n\n${asContext("JOB_REQUIREMENTS", job)}\n\n` +
      `${asContext("MATCH_ANALYSIS", match)}`,
  });
}
