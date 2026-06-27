import type { ApplicationPack, Mode } from "../schemas/application.js";
import { MODE_TASKS, type TaskKind } from "../schemas/plan.js";
import { verifyGrounding } from "../grounding/verify.js";

/**
 * Pure scoring functions for the evals harness. None of these call a model:
 * given a finished pack + the CV it was built from, they compute objective
 * metrics so runs are comparable across phases and models.
 */

/** Map a planner task kind to the pack field it populates. */
const TASK_TO_FIELD: Record<TaskKind, keyof ApplicationPack> = {
  job_analysis: "jobAnalysis",
  match_analysis: "matchAnalysis",
  gap_analysis: "gapAnalysis",
  cv_tailoring: "cvTailoring",
  interview_prep: "interviewPrep",
  strategy_brief: "strategyBrief",
};

/** The pack fields a given mode is expected to produce. */
export function expectedSectionsForMode(mode: Mode): Array<keyof ApplicationPack> {
  return MODE_TASKS[mode].map((kind) => TASK_TO_FIELD[kind]);
}

export interface CompletenessScore {
  /** Fraction of expected sections that are present (0..1). */
  completeness: number;
  presentSections: string[];
  missingSections: string[];
}

/** How many of the mode's expected sections actually got produced. */
export function scoreCompleteness(pack: ApplicationPack, mode: Mode): CompletenessScore {
  const expected = expectedSectionsForMode(mode);
  const present: string[] = [];
  const missing: string[] = [];
  for (const field of expected) {
    if (pack[field] != null) present.push(field);
    else missing.push(field);
  }
  return {
    completeness: expected.length === 0 ? 1 : present.length / expected.length,
    presentSections: present,
    missingSections: missing,
  };
}

export interface EvalScore {
  /** Share of asserted evidence backed by the CV (partial = 0.5). */
  groundingRate: number;
  /** Share of claims that are not fabricated (the "never invent" guarantee). */
  noEvidenceHonesty: number;
  /** Share of expected sections present. */
  completeness: number;
  missingSections: string[];
  ungroundedClaims: number;
  totalClaims: number;
  latencyMs: number;
}

/** Compute the full score for a single eval run. */
export function scorePack(
  pack: ApplicationPack,
  cvText: string,
  mode: Mode,
  latencyMs: number,
): EvalScore {
  const grounding = verifyGrounding(pack, cvText);
  const completeness = scoreCompleteness(pack, mode);
  return {
    groundingRate: grounding.groundingScore,
    noEvidenceHonesty: grounding.honestyScore,
    completeness: completeness.completeness,
    missingSections: completeness.missingSections,
    ungroundedClaims: grounding.totals.ungrounded,
    totalClaims: grounding.totals.total,
    latencyMs,
  };
}

export interface AggregateScore {
  runs: number;
  avgGroundingRate: number;
  avgNoEvidenceHonesty: number;
  avgCompleteness: number;
  totalUngroundedClaims: number;
  avgLatencyMs: number;
}

/** Average a set of per-run scores into a single summary row. */
export function aggregate(scores: EvalScore[]): AggregateScore {
  const n = scores.length;
  if (n === 0) {
    return {
      runs: 0,
      avgGroundingRate: 0,
      avgNoEvidenceHonesty: 0,
      avgCompleteness: 0,
      totalUngroundedClaims: 0,
      avgLatencyMs: 0,
    };
  }
  const sum = (pick: (s: EvalScore) => number) => scores.reduce((a, s) => a + pick(s), 0);
  return {
    runs: n,
    avgGroundingRate: sum((s) => s.groundingRate) / n,
    avgNoEvidenceHonesty: sum((s) => s.noEvidenceHonesty) / n,
    avgCompleteness: sum((s) => s.completeness) / n,
    totalUngroundedClaims: sum((s) => s.ungroundedClaims),
    avgLatencyMs: sum((s) => s.latencyMs) / n,
  };
}
