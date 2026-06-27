import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import * as canned from "../testing/canned-llm.js";
import type { ApplicationPack, Mode } from "../schemas/application.js";

/**
 * End-to-end wiring tests for the Phase 2 router graph. The LLM is replaced with
 * a canned stub (see canned-llm.ts), so this exercises the real compiled
 * LangGraph — conditional edges and all — and asserts which sections each mode
 * actually produces. Requires `--experimental-test-module-mocks`.
 */

let runPhase2: (typeof import("./phase2-router.js"))["runPhase2"];

before(async () => {
  mock.module("../llm/structured.js", { namedExports: canned });
  ({ runPhase2 } = await import("./phase2-router.js"));
});

async function sectionsFor(mode: Mode): Promise<Array<keyof ApplicationPack>> {
  const { pack } = await runPhase2({ cvText: "cv", jobText: "job", mode });
  return (Object.keys(pack) as Array<keyof ApplicationPack>).filter((k) => pack[k] != null);
}

test("job-analysis mode stops after the job analysis", async () => {
  assert.deepEqual(await sectionsFor("job-analysis"), ["jobAnalysis"]);
});

test("interview-prep mode skips gap analysis and CV tailoring", async () => {
  const sections = (await sectionsFor("interview-prep")).sort();
  assert.deepEqual(sections, ["interviewPrep", "jobAnalysis", "matchAnalysis"]);
});

test("cv-tailoring mode produces gap analysis and tailoring but no interview/strategy", async () => {
  const sections = (await sectionsFor("cv-tailoring")).sort();
  assert.deepEqual(sections, ["cvTailoring", "gapAnalysis", "jobAnalysis", "matchAnalysis"]);
});

test("full mode produces every section", async () => {
  const sections = (await sectionsFor("full")).sort();
  assert.deepEqual(sections, [
    "cvTailoring",
    "gapAnalysis",
    "interviewPrep",
    "jobAnalysis",
    "matchAnalysis",
    "strategyBrief",
  ]);
});
