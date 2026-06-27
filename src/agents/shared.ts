import { NO_EVIDENCE } from "../schemas/application.js";

/**
 * Grounding contract shared by every agent. This is the heart of the project's
 * "never invent experience" guarantee and is injected into each system prompt.
 */
export const GROUNDING_RULES = `
You are part of a career-application assistant. You must follow these rules without exception:
1. NEVER invent, exaggerate, or assume experience, skills, or achievements.
2. Every claim about the candidate must be supported by evidence drawn from the CV.
3. When there is no supporting evidence in the CV, you MUST write exactly: "${NO_EVIDENCE}".
4. Prefer short, near-verbatim quotes from the CV as evidence.
5. Be concise, factual, and specific. Do not add commentary outside the requested fields.
`.trim();

/** Wrap the CV text with a clear delimiter for prompts. */
export function cvBlock(cv: string): string {
  return `<CV>\n${cv}\n</CV>`;
}

/** Wrap the job description text with a clear delimiter for prompts. */
export function jobBlock(job: string): string {
  return `<JOB_DESCRIPTION>\n${job}\n</JOB_DESCRIPTION>`;
}

/** Compactly serialize an upstream result so a downstream agent can use it. */
export function asContext(label: string, data: unknown): string {
  return `<${label}>\n${JSON.stringify(data, null, 2)}\n</${label}>`;
}
