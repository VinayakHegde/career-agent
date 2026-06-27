import { z } from "zod";

/**
 * The single most important rule of this project: the system must never invent
 * experience. When there is no supporting evidence in the CV, the model must
 * say so using exactly this string.
 */
export const NO_EVIDENCE = "no direct evidence found" as const;

const evidence = z
  .string()
  .describe(
    `A short, near-verbatim quote or specific reference from the CV that supports this. ` +
      `If the CV contains nothing relevant, use exactly: "${NO_EVIDENCE}".`,
  );

/* ----------------------------- 1. Job analysis ---------------------------- */

export const JobRequirementSchema = z.object({
  requirement: z.string().describe("A single, concrete requirement or responsibility."),
  category: z.enum(["must-have", "nice-to-have", "responsibility"]),
  importance: z.enum(["high", "medium", "low"]),
});

export const JobAnalysisSchema = z.object({
  roleTitle: z.string(),
  summary: z.string().describe("2-3 sentence plain-language summary of the role."),
  requirements: z.array(JobRequirementSchema).min(1),
});
export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;

/* --------------------------- 2. Match analysis ---------------------------- */

export const MatchItemSchema = z.object({
  requirement: z.string(),
  status: z.enum(["strong", "partial", "missing"]),
  evidence,
  comment: z.string().describe("Brief, factual explanation of the match status."),
});

export const MatchAnalysisSchema = z.object({
  overallFit: z.enum(["strong", "moderate", "weak"]),
  matches: z.array(MatchItemSchema).min(1),
});
export type MatchAnalysis = z.infer<typeof MatchAnalysisSchema>;

/* ---------------------------- 3. Gap analysis ----------------------------- */

export const SkillGapSchema = z.object({
  skill: z.string(),
  severity: z.enum(["critical", "moderate", "minor"]),
  honestSuggestion: z
    .string()
    .describe("How the candidate could honestly address or offset this gap."),
});

export const GapAnalysisSchema = z.object({
  missingSkills: z.array(SkillGapSchema),
  transferableStrengths: z
    .array(z.string())
    .describe("Existing CV strengths that partially offset the gaps."),
});
export type GapAnalysis = z.infer<typeof GapAnalysisSchema>;

/* ------------------------- 4. CV bullet tailoring ------------------------- */

export const CvBulletSchema = z.object({
  targetRequirement: z.string().describe("Which job requirement this bullet speaks to."),
  suggestion: z.string().describe("A rewritten/tailored CV bullet."),
  evidence,
  grounded: z
    .boolean()
    .describe(`true only if 'evidence' is a real CV reference (not "${NO_EVIDENCE}").`),
});

export const CvTailoringSchema = z.object({
  bullets: z.array(CvBulletSchema).min(1),
});
export type CvTailoring = z.infer<typeof CvTailoringSchema>;

/* --------------------------- 5. Interview prep ---------------------------- */

export const InterviewQuestionSchema = z.object({
  question: z.string(),
  category: z.enum(["technical", "behavioral", "role-specific", "gap-probing"]),
  whyAsked: z.string().describe("Why an interviewer would likely ask this."),
  answerAngle: z
    .string()
    .describe("A grounded angle for answering, referencing CV evidence where possible."),
});

export const InterviewPrepSchema = z.object({
  questions: z.array(InterviewQuestionSchema).min(1),
});
export type InterviewPrep = z.infer<typeof InterviewPrepSchema>;

/* ------------------------- 6. Strategy brief ------------------------------ */

export const StrategyBriefSchema = z.object({
  positioning: z.string().describe("One-paragraph positioning statement for the candidate."),
  topStrengthsToEmphasize: z.array(z.string()),
  risksToMitigate: z.array(z.string()),
  recommendation: z.enum([
    "apply-strong",
    "apply-with-tailoring",
    "stretch",
    "not-recommended",
  ]),
  nextSteps: z.array(z.string()),
});
export type StrategyBrief = z.infer<typeof StrategyBriefSchema>;

/* ------------------------- 7. Critic review ------------------------------- */

export const CritiqueFindingSchema = z.object({
  target: z.string().describe("The bullet/claim under review (quote a short snippet)."),
  issue: z.enum(["exaggeration", "weak-evidence", "ungrounded", "other"]),
  severity: z.enum(["high", "medium", "low"]),
  suggestedFix: z.string().describe("A concrete, honest way to fix the issue."),
});

export const CritiqueSchema = z.object({
  approved: z.boolean().describe("True only if there are no high/medium grounding issues."),
  findings: z.array(CritiqueFindingSchema),
  summary: z.string(),
});
export type Critique = z.infer<typeof CritiqueSchema>;

/* ----------------------- 8. Evidence verification ------------------------- */

export const VerificationItemSchema = z.object({
  claim: z.string().describe("The specific claim/bullet being verified."),
  verdict: z.enum(["supported", "partially-supported", "unsupported"]),
  evidence,
});

export const VerificationSchema = z.object({
  allSupported: z.boolean().describe("True only if every claim is at least partially supported."),
  items: z.array(VerificationItemSchema),
  notes: z.string(),
});
export type Verification = z.infer<typeof VerificationSchema>;

/* --------------------- 9. Deterministic grounding ------------------------- */

/**
 * The result of a single deterministic evidence check. Unlike the LLM-driven
 * `Verification`, this is computed mechanically by substring/token matching the
 * cited evidence against the raw CV text — it cannot be fooled by the model.
 */
export const GROUNDING_STATUSES = ["grounded", "partial", "no-evidence", "ungrounded"] as const;
export type GroundingStatus = (typeof GROUNDING_STATUSES)[number];

export const GroundingCheckSchema = z.object({
  /** Where the claim came from, e.g. "cvTailoring.bullets[2]". */
  source: z.string(),
  /** The human-readable claim/suggestion the evidence is meant to support. */
  claim: z.string(),
  /** The evidence string as produced by the model. */
  evidence: z.string(),
  status: z.enum(GROUNDING_STATUSES),
  /** Token-overlap ratio with the CV (1 = exact normalized substring). */
  matchRatio: z.number().min(0).max(1),
});
export type GroundingCheck = z.infer<typeof GroundingCheckSchema>;

export const GroundingReportSchema = z.object({
  /**
   * Grounding score in [0,1]: of all claims that *assert* evidence (i.e. not the
   * honest no-evidence string), the share backed by real CV text (partial = 0.5).
   */
  groundingScore: z.number().min(0).max(1),
  /**
   * Honesty score in [0,1]: the share of claims that are NOT fabricated — i.e.
   * grounded, partially grounded, or explicitly marked "no direct evidence found".
   * This is the provable form of the "never invent experience" guarantee.
   */
  honestyScore: z.number().min(0).max(1),
  totals: z.object({
    total: z.number().int(),
    grounded: z.number().int(),
    partial: z.number().int(),
    noEvidence: z.number().int(),
    ungrounded: z.number().int(),
  }),
  checks: z.array(GroundingCheckSchema),
});
export type GroundingReport = z.infer<typeof GroundingReportSchema>;

/* --------------------------- The full pack -------------------------------- */

export const ApplicationPackSchema = z.object({
  jobAnalysis: JobAnalysisSchema.optional(),
  matchAnalysis: MatchAnalysisSchema.optional(),
  gapAnalysis: GapAnalysisSchema.optional(),
  cvTailoring: CvTailoringSchema.optional(),
  interviewPrep: InterviewPrepSchema.optional(),
  strategyBrief: StrategyBriefSchema.optional(),
  critique: CritiqueSchema.optional(),
  verification: VerificationSchema.optional(),
  /** Deterministic grounding audit, computed after the pack is assembled. */
  grounding: GroundingReportSchema.optional(),
});
export type ApplicationPack = z.infer<typeof ApplicationPackSchema>;

export const MODES = ["job-analysis", "cv-tailoring", "interview-prep", "full"] as const;
export type Mode = (typeof MODES)[number];
