import { callStructured } from "../llm/structured.js";
import {
  MatchAnalysisSchema,
  type JobAnalysis,
  type MatchAnalysis,
} from "../schemas/application.js";
import { GROUNDING_RULES, asContext, cvBlock } from "./shared.js";

const SYSTEM = `${GROUNDING_RULES}

Role: CV Evidence Analyst. For each job requirement, decide whether the CV shows
strong, partial, or no (missing) evidence. Cite the supporting CV text for every
"strong" or "partial" status. Use the no-evidence string for anything missing.`;

/** Compare the CV against the analyzed job requirements, citing evidence. */
export async function analyzeMatch(
  cvText: string,
  job: JobAnalysis,
): Promise<MatchAnalysis> {
  return callStructured({
    schema: MatchAnalysisSchema,
    name: "match_analysis",
    system: SYSTEM,
    human:
      `Assess how well the CV matches each job requirement.\n\n` +
      `${cvBlock(cvText)}\n\n${asContext("JOB_REQUIREMENTS", job)}`,
  });
}
