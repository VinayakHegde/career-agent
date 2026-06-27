import { callStructured } from "../llm/structured.js";
import {
  MatchAnalysisSchema,
  VerificationSchema,
  type CvTailoring,
  type JobAnalysis,
  type MatchAnalysis,
  type Verification,
} from "../schemas/application.js";
import { GROUNDING_RULES, asContext, cvBlock } from "./shared.js";

const SYSTEM = `${GROUNDING_RULES}

Role: CV Evidence Analyst. For each job requirement, decide whether the CV shows
strong, partial, or no (missing) evidence. Cite the supporting CV text for every
"strong" or "partial" status. Use the no-evidence string for anything missing.`;

const VERIFY_SYSTEM = `${GROUNDING_RULES}

Role: CV Evidence Verifier. You fact-check proposed CV bullets against the CV.
For each bullet, decide whether it is supported, partially-supported, or
unsupported by the CV, and cite the exact supporting text. A bullet is
"unsupported" if the CV contains no basis for it.`;

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

/** Verify each proposed CV bullet against the CV (the "CV Evidence Agent"). */
export async function verifyBullets(
  cvText: string,
  tailoring: CvTailoring,
): Promise<Verification> {
  return callStructured({
    schema: VerificationSchema,
    name: "verification",
    system: VERIFY_SYSTEM,
    human:
      `Verify each proposed bullet strictly against the CV.\n\n` +
      `${cvBlock(cvText)}\n\n${asContext("PROPOSED_BULLETS", tailoring)}`,
  });
}
