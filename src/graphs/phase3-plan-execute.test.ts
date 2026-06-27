import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKinds, topoSort, pickNextTask } from "./phase3-plan-execute.js";
import type { Task, TaskKind } from "../schemas/plan.js";

test("topoSort puts dependencies before dependents", () => {
  const sorted = topoSort(["strategy_brief", "match_analysis", "job_analysis"]);
  assert.ok(sorted.indexOf("job_analysis") < sorted.indexOf("match_analysis"));
  assert.ok(sorted.indexOf("match_analysis") < sorted.indexOf("strategy_brief"));
});

test("normalizeKinds drops kinds not allowed for the mode", () => {
  const result = normalizeKinds(["job_analysis", "match_analysis", "cv_tailoring"], "job-analysis");
  assert.deepEqual(result, ["job_analysis"]);
});

test("normalizeKinds injects required tasks the planner omitted", () => {
  // Planner only proposed cv_tailoring, but cv-tailoring mode needs the chain.
  const result = normalizeKinds(["cv_tailoring"], "cv-tailoring");
  assert.deepEqual([...result].sort(), [
    "cv_tailoring",
    "gap_analysis",
    "job_analysis",
    "match_analysis",
  ]);
  // And it must still be dependency-ordered.
  assert.ok(result.indexOf("job_analysis") < result.indexOf("match_analysis"));
  assert.ok(result.indexOf("match_analysis") < result.indexOf("cv_tailoring"));
});

test("normalizeKinds dedupes repeated kinds", () => {
  const result = normalizeKinds(["job_analysis", "job_analysis"], "job-analysis");
  assert.deepEqual(result, ["job_analysis"]);
});

function task(kind: TaskKind, status: Task["status"] = "pending"): Task {
  return { id: kind, kind, objective: "", status };
}

test("pickNextTask returns the first task whose dependencies are done", () => {
  const tasks: Task[] = [task("job_analysis", "done"), task("match_analysis"), task("gap_analysis")];
  const next = pickNextTask(tasks);
  assert.equal(next?.kind, "match_analysis");
});

test("pickNextTask skips tasks with unmet dependencies", () => {
  // match_analysis is still pending, so gap_analysis (which needs it) is blocked.
  const tasks: Task[] = [task("match_analysis"), task("gap_analysis")];
  assert.equal(pickNextTask(tasks)?.kind, "match_analysis");
});

test("pickNextTask returns undefined when everything is done", () => {
  const tasks: Task[] = [task("job_analysis", "done"), task("match_analysis", "done")];
  assert.equal(pickNextTask(tasks), undefined);
});
