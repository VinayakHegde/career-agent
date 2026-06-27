import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationPack } from "../schemas/application.js";

// Point the store at a throwaway database BEFORE the store module reads the env.
const TMP_DB = path.join(os.tmpdir(), `career-agent-test-${process.pid}-${Date.now()}.db`);
process.env.CAREER_DB_PATH = TMP_DB;

const { saveApplication, listApplications, getApplication } = await import("./applications.js");
const { closeDb } = await import("./db.js");

function pack(grounding: number, honesty: number): ApplicationPack {
  return {
    jobAnalysis: {
      roleTitle: "Engineer",
      summary: "s",
      requirements: [{ requirement: "r", category: "must-have", importance: "high" }],
    },
    grounding: {
      groundingScore: grounding,
      honestyScore: honesty,
      totals: { total: 1, grounded: 1, partial: 0, noEvidence: 0, ungrounded: 0 },
      checks: [],
    },
  };
}

before(() => {
  // Clean slate in case a previous crashed run left the temp file behind.
  closeDb();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${TMP_DB}${suffix}`, { force: true });
});

after(() => {
  closeDb();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${TMP_DB}${suffix}`, { force: true });
});

test("saveApplication persists a run and returns an incrementing id", () => {
  const id1 = saveApplication({ model: "qwen3:8b", phase: "2", mode: "full", cvText: "cv1", jobText: "job1", pack: pack(1, 1) });
  const id2 = saveApplication({ model: "qwen3:8b", phase: "1", mode: "cv-tailoring", cvText: "cv2", jobText: "job2", pack: pack(0.5, 0.75) });
  assert.ok(id1 > 0);
  assert.equal(id2, id1 + 1);
});

test("listApplications returns summaries most-recent-first with scores", () => {
  const apps = listApplications();
  assert.equal(apps.length, 2);
  assert.equal(apps[0]!.mode, "cv-tailoring"); // saved last
  assert.equal(apps[0]!.groundingScore, 0.5);
  assert.equal(apps[0]!.honestyScore, 0.75);
  assert.equal(apps[1]!.mode, "full");
});

test("getApplication round-trips the full pack and inputs", () => {
  const apps = listApplications();
  const full = getApplication(apps[1]!.id);
  assert.ok(full);
  assert.equal(full!.cvText, "cv1");
  assert.equal(full!.jobText, "job1");
  assert.equal(full!.pack.grounding?.groundingScore, 1);
  assert.equal(full!.pack.jobAnalysis?.roleTitle, "Engineer");
});

test("getApplication returns undefined for a missing id", () => {
  assert.equal(getApplication(99999), undefined);
});
