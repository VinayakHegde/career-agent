import { callStructured } from "../llm/structured.js";
import {
  CvTailoringSchema,
  type CvTailoring,
  type JobAnalysis,
  type MatchAnalysis,
} from "../schemas/application.js";
import { GROUNDING_RULES, asContext, cvBlock } from "./shared.js";

const SYSTEM = `${GROUNDING_RULES}

Role: CV Writer. Propose tailored CV bullet points that better target the job.
Each bullet MUST be grounded in real CV evidence. If you cannot ground a bullet,
set grounded=false and use the no-evidence string rather than inventing content.
Rephrasing for emphasis is allowed; adding new facts is not.`;

/** Suggest tailored, evidence-grounded CV bullets for the target role. */
export async function suggestCvBullets(
  cvText: string,
  job: JobAnalysis,
  match: MatchAnalysis,
): Promise<CvTailoring> {
  return callStructured({
    schema: CvTailoringSchema,
    name: "cv_tailoring",
    system: SYSTEM,
    human:
      `Write tailored CV bullets that emphasize the candidate's real, relevant experience.\n\n` +
      `${cvBlock(cvText)}\n\n${asContext("JOB_REQUIREMENTS", job)}\n\n` +
      `${asContext("MATCH_ANALYSIS", match)}`,
  });
}
