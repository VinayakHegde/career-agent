import { callStructured } from "../llm/structured.js";
import {
  CvTailoringSchema,
  type CvTailoring,
  type Critique,
  type JobAnalysis,
  type MatchAnalysis,
  type Verification,
} from "../schemas/application.js";
import { normalizeText } from "../grounding/verify.js";
import { GROUNDING_RULES, asContext, cvBlock } from "./shared.js";

/**
 * Drop near-duplicate bullets. Local 8B models tend to restate the same CV line
 * against several requirements; we key on the normalized suggestion text and
 * keep the first occurrence (which also preserves the model's ordering).
 */
export function dedupeBullets(tailoring: CvTailoring): CvTailoring {
  const seen = new Set<string>();
  const bullets = tailoring.bullets.filter((b) => {
    const key = normalizeText(b.suggestion);
    if (key.length === 0 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Never return an empty list (the schema requires >= 1 bullet); fall back to
  // the original if dedup somehow removed everything.
  return { bullets: bullets.length > 0 ? bullets : tailoring.bullets };
}

const SYSTEM = `${GROUNDING_RULES}

Role: CV Writer. Propose tailored CV bullet points that better target the job.
Each bullet MUST be grounded in real CV evidence. If you cannot ground a bullet,
set grounded=false and use the no-evidence string rather than inventing content.
Rephrasing for emphasis is allowed; adding new facts is not.`;

const REVISE_SYSTEM = `${GROUNDING_RULES}

Role: CV Writer (revision). You are revising your previous bullets using a
critic's findings and an evidence verifier's verdicts. Fix every flagged issue:
- soften or remove exaggerated/unsupported claims;
- strengthen weak evidence with exact CV quotes;
- keep any bullet the verifier marked "supported".
Do not introduce new unsupported claims. The result must be more grounded, not less.`;

/** Suggest tailored, evidence-grounded CV bullets for the target role. */
export async function suggestCvBullets(
  cvText: string,
  job: JobAnalysis,
  match: MatchAnalysis,
): Promise<CvTailoring> {
  const result = await callStructured({
    schema: CvTailoringSchema,
    name: "cv_tailoring",
    role: "writing",
    system: SYSTEM,
    human:
      `Write tailored CV bullets that emphasize the candidate's real, relevant experience.\n\n` +
      `${cvBlock(cvText)}\n\n${asContext("JOB_REQUIREMENTS", job)}\n\n` +
      `${asContext("MATCH_ANALYSIS", match)}`,
  });
  return dedupeBullets(result);
}

/** Revise prior bullets to address critic findings and verification verdicts. */
export async function reviseCvBullets(args: {
  cvText: string;
  job: JobAnalysis;
  match: MatchAnalysis;
  previous: CvTailoring;
  critique: Critique;
  verification?: Verification;
  /** Bullet suggestions whose cited evidence was not found in the CV (deterministic). */
  ungroundedClaims?: string[];
}): Promise<CvTailoring> {
  const verificationBlock = args.verification
    ? `\n\n${asContext("EVIDENCE_VERIFICATION", args.verification)}`
    : "";
  // A deterministic list of bullets whose evidence was NOT found in the CV. This
  // is the hard, model-free signal the reviser must act on (remove or re-ground).
  const ungroundedBlock = args.ungroundedClaims?.length
    ? `\n\nThe following bullets cite evidence that is NOT present in the CV and MUST be ` +
      `removed or re-grounded with an exact CV quote:\n` +
      args.ungroundedClaims.map((c) => `- ${c}`).join("\n")
    : "";
  const result = await callStructured({
    schema: CvTailoringSchema,
    name: "cv_tailoring_revision",
    role: "writing",
    system: REVISE_SYSTEM,
    human:
      `Revise the previous bullets to resolve the feedback below.\n\n` +
      `${cvBlock(args.cvText)}\n\n${asContext("PREVIOUS_BULLETS", args.previous)}\n\n` +
      `${asContext("CRITIC_FINDINGS", args.critique)}${verificationBlock}${ungroundedBlock}`,
  });
  return dedupeBullets(result);
}
