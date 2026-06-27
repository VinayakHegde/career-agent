import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_EVIDENCE, type ApplicationPack } from "../schemas/application.js";
import {
  expectedSectionsForMode,
  scoreCompleteness,
  scorePack,
  aggregate,
  type EvalScore,
} from "./scoring.js";

test("expectedSectionsForMode maps modes to pack fields", () => {
  assert.deepEqual(expectedSectionsForMode("job-analysis"), ["jobAnalysis"]);
  assert.deepEqual(expectedSectionsForMode("interview-prep"), [
    "jobAnalysis",
    "matchAnalysis",
    "interviewPrep",
  ]);
  assert.equal(expectedSectionsForMode("full").length, 6);
});

test("scoreCompleteness is full when all expected sections are present", () => {
  const pack: ApplicationPack = {
    jobAnalysis: { roleTitle: "x", summary: "y", requirements: [{ requirement: "r", category: "must-have", importance: "high" }] },
  };
  const r = scoreCompleteness(pack, "job-analysis");
  assert.equal(r.completeness, 1);
  assert.deepEqual(r.missingSections, []);
});

test("scoreCompleteness reports the missing fraction and which sections are absent", () => {
  const pack: ApplicationPack = {
    jobAnalysis: { roleTitle: "x", summary: "y", requirements: [{ requirement: "r", category: "must-have", importance: "high" }] },
  };
  const r = scoreCompleteness(pack, "full");
  assert.equal(r.completeness, 1 / 6);
  assert.ok(r.missingSections.includes("matchAnalysis"));
  assert.ok(r.missingSections.includes("strategyBrief"));
});

test("scorePack combines grounding, honesty, completeness, and latency", () => {
  const cv = "Built a billing microservice in Node.js.";
  const pack: ApplicationPack = {
    matchAnalysis: {
      overallFit: "moderate",
      matches: [
        { requirement: "a", status: "strong", evidence: "billing microservice", comment: "" },
        { requirement: "b", status: "missing", evidence: NO_EVIDENCE, comment: "" },
      ],
    },
  };
  const score = scorePack(pack, cv, "cv-tailoring", 1234);
  assert.equal(score.groundingRate, 1); // 1 grounded of 1 asserting
  assert.equal(score.noEvidenceHonesty, 1); // nothing fabricated
  assert.equal(score.ungroundedClaims, 0);
  assert.equal(score.totalClaims, 2);
  assert.equal(score.latencyMs, 1234);
  // cv-tailoring expects 4 sections; only matchAnalysis present → 1/4.
  assert.equal(score.completeness, 0.25);
});

test("aggregate averages scores and sums ungrounded claims", () => {
  const scores: EvalScore[] = [
    { groundingRate: 1, noEvidenceHonesty: 1, completeness: 1, missingSections: [], ungroundedClaims: 0, totalClaims: 3, latencyMs: 100 },
    { groundingRate: 0.5, noEvidenceHonesty: 0.75, completeness: 0.5, missingSections: [], ungroundedClaims: 2, totalClaims: 4, latencyMs: 300 },
  ];
  const agg = aggregate(scores);
  assert.equal(agg.runs, 2);
  assert.equal(agg.avgGroundingRate, 0.75);
  assert.equal(agg.avgCompleteness, 0.75);
  assert.equal(agg.totalUngroundedClaims, 2);
  assert.equal(agg.avgLatencyMs, 200);
});

test("aggregate of an empty set is all zeros", () => {
  assert.deepEqual(aggregate([]), {
    runs: 0,
    avgGroundingRate: 0,
    avgNoEvidenceHonesty: 0,
    avgCompleteness: 0,
    totalUngroundedClaims: 0,
    avgLatencyMs: 0,
  });
});
