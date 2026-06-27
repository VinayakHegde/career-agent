import { test } from "node:test";
import assert from "node:assert/strict";
import { eligibleWorkers, completedKinds } from "./phase4-supervisor-workers.js";
import type { SupervisorStateType } from "../schemas/graph-state.js";

/** Build a supervisor state for testing; only the fields read by the SUTs matter. */
function state(partial: Partial<SupervisorStateType>): SupervisorStateType {
  return { mode: "full", log: [], ...partial } as SupervisorStateType;
}

// Minimal stand-ins so the presence checks (`if (state.jobAnalysis)`) pass.
const present = { any: true } as never;

test("completedKinds reflects which slices are populated", () => {
  const done = completedKinds(state({ jobAnalysis: present, matchAnalysis: present }));
  assert.deepEqual([...done].sort(), ["job_analysis", "match_analysis"]);
});

test("eligibleWorkers only offers job_analyst at the very start", () => {
  assert.deepEqual(eligibleWorkers(state({})), ["job_analyst"]);
});

test("eligibleWorkers fans out once match analysis is available (full mode)", () => {
  const eligible = eligibleWorkers(state({ jobAnalysis: present, matchAnalysis: present }));
  assert.deepEqual([...eligible].sort(), ["cv_writer", "gap_analyst", "interview_coach"]);
});

test("eligibleWorkers offers the critic after the writer, before critique is done", () => {
  const eligible = eligibleWorkers(
    state({
      mode: "cv-tailoring",
      jobAnalysis: present,
      matchAnalysis: present,
      gapAnalysis: present,
      cvTailoring: present,
      critiqueDone: false,
    }),
  );
  assert.deepEqual(eligible, ["critic"]);
});

test("eligibleWorkers offers nothing (FINISH) once everything required is done", () => {
  const eligible = eligibleWorkers(
    state({
      mode: "cv-tailoring",
      jobAnalysis: present,
      matchAnalysis: present,
      gapAnalysis: present,
      cvTailoring: present,
      critiqueDone: true,
    }),
  );
  assert.deepEqual(eligible, []);
});

test("eligibleWorkers offers the synthesizer last in full mode", () => {
  const eligible = eligibleWorkers(
    state({
      mode: "full",
      jobAnalysis: present,
      matchAnalysis: present,
      gapAnalysis: present,
      cvTailoring: present,
      interviewPrep: present,
      critiqueDone: true,
    }),
  );
  assert.deepEqual(eligible, ["synthesizer"]);
});
