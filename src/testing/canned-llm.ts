/**
 * A deterministic, model-free stand-in for `callStructured`, used by graph-wiring
 * tests. It returns a canned, schema-shaped object per structured-call `name` so
 * the LangGraph graphs can be exercised end-to-end without invoking Ollama.
 *
 * Tests install it with the node:test module mocker:
 *   mock.module("../llm/structured.js", { namedExports: { callStructured } });
 */

interface CannedOpts {
  name: string;
}

const CANNED: Record<string, unknown> = {
  route_intent: { mode: "full", reasoning: "" },
  job_analysis: {
    roleTitle: "Role",
    summary: "summary",
    requirements: [{ requirement: "req", category: "must-have", importance: "high" }],
  },
  match_analysis: {
    overallFit: "moderate",
    matches: [{ requirement: "req", status: "strong", evidence: "evidence", comment: "comment" }],
  },
  gap_analysis: { missingSkills: [], transferableStrengths: [] },
  cv_tailoring: {
    bullets: [{ targetRequirement: "req", suggestion: "suggestion", evidence: "evidence", grounded: true }],
  },
  cv_tailoring_revision: {
    bullets: [{ targetRequirement: "req", suggestion: "suggestion", evidence: "evidence", grounded: true }],
  },
  interview_prep: {
    questions: [{ question: "q", category: "technical", whyAsked: "why", answerAngle: "angle" }],
  },
  strategy_brief: {
    positioning: "positioning",
    topStrengthsToEmphasize: [],
    risksToMitigate: [],
    recommendation: "apply-strong",
    nextSteps: [],
  },
  critique: { approved: true, findings: [], summary: "ok" },
  verification: { allSupported: true, items: [], notes: "" },
  // Always "FINISH": the supervisor graph's guardrail falls back to the first
  // eligible worker when FINISH isn't allowed, so the run still progresses.
  supervisor_decision: { next: "FINISH", reason: "" },
  approval: { decision: "approve", reason: "" },
  plan: { reasoning: "", tasks: [] },
  evaluation: { complete: true, issues: [], sectionsToRedo: [], summary: "" },
};

/** Drop-in mock for `callStructured`; resolves a canned object for the given name. */
export async function callStructured(opts: CannedOpts): Promise<unknown> {
  const canned = CANNED[opts.name];
  if (canned === undefined) {
    throw new Error(`cannedCallStructured: no canned response for "${opts.name}"`);
  }
  return canned;
}

/** Mirrors the real module's export so importers that reference it still resolve. */
export class StructuredOutputError extends Error {}
