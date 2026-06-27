import { callStructured } from "../llm/structured.js";
import { EvaluationSchema, type Evaluation, type TaskKind } from "../schemas/plan.js";
import type { ApplicationPack, Mode } from "../schemas/application.js";
import { NO_EVIDENCE } from "../schemas/application.js";
import { asContext } from "./shared.js";

const SYSTEM = `You are an Evaluator for a career-application assistant. You check
the produced pack for COMPLETENESS and GROUNDING. Flag a section if:
- it is missing or empty;
- it makes a claim about the candidate with no CV evidence and without saying "${NO_EVIDENCE}";
- it exaggerates or invents experience.

List the sections that should be regenerated in 'sectionsToRedo'. Only mark
'complete: true' when every expected section is present and well-grounded. Be
strict but fair; do not request redoing sections that are already solid.`;

/** Evaluate the assembled pack against the mode's expectations. */
export async function evaluatePack(
  pack: ApplicationPack,
  mode: Mode,
  expectedSections: TaskKind[],
): Promise<Evaluation> {
  return callStructured({
    schema: EvaluationSchema,
    name: "evaluation",
    role: "critique",
    system: SYSTEM,
    human:
      `Goal mode: "${mode}". Expected sections: ${expectedSections.join(", ")}.\n\n` +
      `Evaluate this pack for completeness and grounding.\n\n${asContext("PACK", pack)}`,
  });
}
