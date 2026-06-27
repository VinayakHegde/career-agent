import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeBullets } from "./writer.js";
import type { CvTailoring } from "../schemas/application.js";

function bullet(suggestion: string): CvTailoring["bullets"][number] {
  return { targetRequirement: "req", suggestion, evidence: "evidence", grounded: true };
}

test("dedupeBullets drops bullets with the same normalized suggestion", () => {
  const tailoring: CvTailoring = {
    bullets: [
      bullet("Introduced distributed tracing (OpenTelemetry)."),
      bullet("introduced distributed tracing   (opentelemetry)"), // same after normalization
      bullet("Mentored two junior engineers."),
    ],
  };
  const result = dedupeBullets(tailoring);
  assert.equal(result.bullets.length, 2);
  assert.equal(result.bullets[0]!.suggestion, "Introduced distributed tracing (OpenTelemetry).");
  assert.equal(result.bullets[1]!.suggestion, "Mentored two junior engineers.");
});

test("dedupeBullets keeps the first occurrence (preserving order)", () => {
  const tailoring: CvTailoring = {
    bullets: [bullet("A"), bullet("B"), bullet("A"), bullet("C")],
  };
  assert.deepEqual(
    dedupeBullets(tailoring).bullets.map((b) => b.suggestion),
    ["A", "B", "C"],
  );
});

test("dedupeBullets never returns an empty list", () => {
  const tailoring: CvTailoring = { bullets: [bullet("   ")] };
  // The only bullet normalizes to empty; fall back to the original rather than [].
  assert.equal(dedupeBullets(tailoring).bullets.length, 1);
});
