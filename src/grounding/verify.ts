import {
  NO_EVIDENCE,
  type ApplicationPack,
  type GroundingCheck,
  type GroundingReport,
  type GroundingStatus,
} from "../schemas/application.js";

/**
 * Deterministic grounding verification.
 *
 * The project's headline promise is "never invent experience". The LLM agents
 * are *asked* to cite CV evidence (or the literal no-evidence string), but they
 * are trusted, not checked. This module makes the promise provable by checking
 * every cited evidence string against the raw CV with plain string/token math —
 * no model in the loop, so it cannot be talked around.
 */

/** Token-overlap ratio below which a non-substring quote is considered invented. */
export const PARTIAL_THRESHOLD = 0.6;
/** Minimum length (in normalized chars) for a substring match to count as grounded. */
const MIN_SUBSTRING_LEN = 3;

/** Lowercase, strip punctuation to spaces, and collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the evidence is the explicit, honest "no evidence" sentinel. */
export function isNoEvidence(evidence: string): boolean {
  return evidence.trim().toLowerCase() === NO_EVIDENCE;
}

function tokenize(text: string): string[] {
  const norm = normalizeText(text);
  return norm.length ? norm.split(" ") : [];
}

/**
 * Classify one evidence string against the CV.
 *  - "no-evidence": the honest sentinel — not a violation.
 *  - "grounded":    a normalized substring of the CV (the strict check).
 *  - "partial":     enough token overlap to be a paraphrase of real CV content.
 *  - "ungrounded":  little/no overlap — i.e. likely invented.
 */
export function classifyEvidence(
  evidence: string,
  normalizedCv: string,
  cvTokenSet: Set<string>,
): { status: GroundingStatus; matchRatio: number } {
  if (isNoEvidence(evidence)) return { status: "no-evidence", matchRatio: 0 };

  const normEvidence = normalizeText(evidence);
  if (normEvidence.length === 0) return { status: "ungrounded", matchRatio: 0 };

  if (normEvidence.length >= MIN_SUBSTRING_LEN && normalizedCv.includes(normEvidence)) {
    return { status: "grounded", matchRatio: 1 };
  }

  const tokens = normEvidence.split(" ");
  const matched = tokens.filter((t) => cvTokenSet.has(t)).length;
  const ratio = tokens.length === 0 ? 0 : matched / tokens.length;

  if (ratio >= PARTIAL_THRESHOLD) return { status: "partial", matchRatio: ratio };
  return { status: "ungrounded", matchRatio: ratio };
}

interface EvidenceClaim {
  source: string;
  claim: string;
  evidence: string;
}

/** Collect every evidence-bearing claim out of a pack, in a stable order. */
export function collectEvidenceClaims(pack: ApplicationPack): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];

  pack.matchAnalysis?.matches.forEach((m, i) => {
    claims.push({
      source: `matchAnalysis.matches[${i}]`,
      claim: `${m.status}: ${m.requirement}`,
      evidence: m.evidence,
    });
  });

  pack.cvTailoring?.bullets.forEach((b, i) => {
    claims.push({
      source: `cvTailoring.bullets[${i}]`,
      claim: b.suggestion,
      evidence: b.evidence,
    });
  });

  pack.verification?.items.forEach((v, i) => {
    claims.push({
      source: `verification.items[${i}]`,
      claim: v.claim,
      evidence: v.evidence,
    });
  });

  return claims;
}

/**
 * Run the deterministic grounding audit over a pack and the CV it was built
 * from, returning a report with per-claim verdicts and two headline scores.
 */
export function verifyGrounding(pack: ApplicationPack, cvText: string): GroundingReport {
  const normalizedCv = normalizeText(cvText);
  const cvTokenSet = new Set(tokenize(cvText));
  const claims = collectEvidenceClaims(pack);

  const checks: GroundingCheck[] = claims.map(({ source, claim, evidence }) => {
    const { status, matchRatio } = classifyEvidence(evidence, normalizedCv, cvTokenSet);
    return { source, claim, evidence, status, matchRatio };
  });

  const totals = {
    total: checks.length,
    grounded: checks.filter((c) => c.status === "grounded").length,
    partial: checks.filter((c) => c.status === "partial").length,
    noEvidence: checks.filter((c) => c.status === "no-evidence").length,
    ungrounded: checks.filter((c) => c.status === "ungrounded").length,
  };

  // Grounding score: among claims that assert evidence (exclude honest no-evidence),
  // how many are real (partial counts as half). Vacuously 1 when nothing is asserted.
  const asserting = totals.total - totals.noEvidence;
  const groundingScore = asserting === 0 ? 1 : (totals.grounded + 0.5 * totals.partial) / asserting;

  // Honesty score: the share of claims that are not fabricated.
  const honestyScore = totals.total === 0 ? 1 : (totals.total - totals.ungrounded) / totals.total;

  return { groundingScore, honestyScore, totals, checks };
}
