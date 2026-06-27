import { callStructured } from "../llm/structured.js";
import {
  InterviewPrepSchema,
  type InterviewPrep,
  type JobAnalysis,
  type MatchAnalysis,
} from "../schemas/application.js";
import { GROUNDING_RULES, asContext, cvBlock } from "./shared.js";

const SYSTEM = `${GROUNDING_RULES}

Role: Interview Coach. Generate likely interview questions for this role, including
gap-probing questions where the CV is weak. For each, give a grounded angle for the
answer that uses real CV evidence. Where there is no evidence, say so honestly.`;

/** Produce role-specific interview questions with grounded answer angles. */
export async function prepInterview(
  cvText: string,
  job: JobAnalysis,
  match: MatchAnalysis,
): Promise<InterviewPrep> {
  return callStructured({
    schema: InterviewPrepSchema,
    name: "interview_prep",
    system: SYSTEM,
    human:
      `Prepare interview questions and grounded answer angles for this candidate and role.\n\n` +
      `${cvBlock(cvText)}\n\n${asContext("JOB_REQUIREMENTS", job)}\n\n` +
      `${asContext("MATCH_ANALYSIS", match)}`,
  });
}
