import { test } from "node:test";
import assert from "node:assert/strict";
import { END } from "@langchain/langgraph";
import { afterJob, afterMatch, afterWriter, afterInterview } from "./phase2-router.js";
import type { GraphStateType } from "../schemas/graph-state.js";

const at = (mode: GraphStateType["mode"]) => ({ mode }) as GraphStateType;

test("afterJob ends early for job-analysis, otherwise continues to match", () => {
  assert.equal(afterJob(at("job-analysis")), END);
  assert.equal(afterJob(at("full")), "match");
  assert.equal(afterJob(at("cv-tailoring")), "match");
});

test("afterMatch routes to interview for interview-prep, else to gap", () => {
  assert.equal(afterMatch(at("interview-prep")), "interview");
  assert.equal(afterMatch(at("cv-tailoring")), "gap");
  assert.equal(afterMatch(at("full")), "gap");
});

test("afterWriter continues to interview only in full mode", () => {
  assert.equal(afterWriter(at("full")), "interview");
  assert.equal(afterWriter(at("cv-tailoring")), END);
});

test("afterInterview continues to synth only in full mode", () => {
  assert.equal(afterInterview(at("full")), "synth");
  assert.equal(afterInterview(at("interview-prep")), END);
});
