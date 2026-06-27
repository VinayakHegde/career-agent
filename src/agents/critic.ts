import { callStructured } from "../llm/structured.js";
import {
  CritiqueSchema,
  NO_EVIDENCE,
  type Critique,
  type CvTailoring,
} from "../schemas/application.js";
import { GROUNDING_RULES, asContext, cvBlock } from "./shared.js";

const SYSTEM = `${GROUNDING_RULES}

Role: Critic. You review proposed CV bullet suggestions against the CV and flag:
- exaggeration (claims stronger than the CV supports);
- weak-evidence (evidence too vague to support the claim);
- ungrounded (no CV basis, and not marked "${NO_EVIDENCE}").

For each problem, quote the offending snippet and propose an HONEST fix. Set
approved=true only if there are no high or medium severity issues.`;

/** Review tailored CV bullets for exaggeration or weak grounding. */
export async function reviewCvBullets(
  cvText: string,
  tailoring: CvTailoring,
): Promise<Critique> {
  return callStructured({
    schema: CritiqueSchema,
    name: "critique",
    role: "critique",
    system: SYSTEM,
    human:
      `Review these proposed CV bullets strictly for grounding and honesty.\n\n` +
      `${cvBlock(cvText)}\n\n${asContext("PROPOSED_BULLETS", tailoring)}`,
  });
}
