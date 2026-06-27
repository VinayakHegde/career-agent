import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import * as canned from "../testing/canned-llm.js";

/**
 * End-to-end wiring test for the Phase 4 supervisor graph. With a canned LLM the
 * supervisor always returns "FINISH", which isn't eligible until everything is
 * done — so the graph's guardrail falls back to the first eligible worker and the
 * run still walks the full dependency-ordered pipeline to completion.
 * Requires `--experimental-test-module-mocks`.
 */

let runPhase4: (typeof import("./phase4-supervisor-workers.js"))["runPhase4"];

before(async () => {
  mock.module("../llm/structured.js", { namedExports: canned });
  ({ runPhase4 } = await import("./phase4-supervisor-workers.js"));
});

test("full mode drives the supervisor loop through every worker", async () => {
  const { pack } = await runPhase4({ cvText: "cv", jobText: "job", mode: "full" });
  assert.ok(pack.jobAnalysis, "job analysis produced");
  assert.ok(pack.matchAnalysis, "match analysis produced");
  assert.ok(pack.gapAnalysis, "gap analysis produced");
  assert.ok(pack.cvTailoring, "cv tailoring produced");
  assert.ok(pack.interviewPrep, "interview prep produced");
  assert.ok(pack.strategyBrief, "strategy brief produced");
  assert.ok(pack.critique, "critic ran on the writer's bullets");
});

test("job-analysis mode finishes after a single worker", async () => {
  const { pack } = await runPhase4({ cvText: "cv", jobText: "job", mode: "job-analysis" });
  assert.ok(pack.jobAnalysis, "job analysis produced");
  assert.equal(pack.matchAnalysis, undefined, "no match analysis for job-analysis mode");
  assert.equal(pack.strategyBrief, undefined, "no strategy brief for job-analysis mode");
});
