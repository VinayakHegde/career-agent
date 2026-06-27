import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_EVIDENCE, type ApplicationPack } from "../schemas/application.js";
import {
  normalizeText,
  isNoEvidence,
  classifyEvidence,
  collectEvidenceClaims,
  verifyGrounding,
  verifyTailoringGrounding,
  ungroundedClaims,
} from "./verify.js";

const CV = `Designed and built a billing microservice in Node.js handling 2M invoice events.
Introduced structured logging and distributed tracing with OpenTelemetry.`;

function cvIndex(cv: string) {
  const normalizedCv = normalizeText(cv);
  return { normalizedCv, cvTokenSet: new Set(normalizedCv.split(" ")) };
}

test("normalizeText lowercases, strips punctuation, and collapses whitespace", () => {
  assert.equal(normalizeText("  Node.js,  REST!!  APIs "), "node js rest apis");
});

test("isNoEvidence matches the sentinel regardless of case/whitespace", () => {
  assert.equal(isNoEvidence(NO_EVIDENCE), true);
  assert.equal(isNoEvidence("  No Direct Evidence Found  "), true);
  assert.equal(isNoEvidence("built a billing service"), false);
});

test("classifyEvidence: exact normalized substring is grounded", () => {
  const { normalizedCv, cvTokenSet } = cvIndex(CV);
  const r = classifyEvidence("billing microservice", normalizedCv, cvTokenSet);
  assert.equal(r.status, "grounded");
  assert.equal(r.matchRatio, 1);
});

test("classifyEvidence: the no-evidence sentinel is honest, not a violation", () => {
  const { normalizedCv, cvTokenSet } = cvIndex(CV);
  assert.equal(classifyEvidence(NO_EVIDENCE, normalizedCv, cvTokenSet).status, "no-evidence");
});

test("classifyEvidence: reordered real tokens count as partial", () => {
  const { normalizedCv, cvTokenSet } = cvIndex(CV);
  const r = classifyEvidence("tracing distributed logging", normalizedCv, cvTokenSet);
  assert.equal(r.status, "partial");
  assert.ok(r.matchRatio >= 0.6);
});

test("classifyEvidence: invented content with no overlap is ungrounded", () => {
  const { normalizedCv, cvTokenSet } = cvIndex(CV);
  const r = classifyEvidence("managed kubernetes clusters across regions", normalizedCv, cvTokenSet);
  assert.equal(r.status, "ungrounded");
});

test("classifyEvidence: empty evidence is ungrounded", () => {
  const { normalizedCv, cvTokenSet } = cvIndex(CV);
  assert.equal(classifyEvidence("", normalizedCv, cvTokenSet).status, "ungrounded");
});

test("collectEvidenceClaims pulls from match, tailoring, and verification", () => {
  const pack: ApplicationPack = {
    matchAnalysis: {
      overallFit: "moderate",
      matches: [{ requirement: "Node.js", status: "strong", evidence: "Node.js", comment: "x" }],
    },
    cvTailoring: {
      bullets: [{ targetRequirement: "obs", suggestion: "did tracing", evidence: "tracing", grounded: true }],
    },
    verification: {
      allSupported: true,
      items: [{ claim: "billing", verdict: "supported", evidence: "billing microservice" }],
      notes: "",
    },
  };
  const claims = collectEvidenceClaims(pack);
  assert.equal(claims.length, 3);
  assert.deepEqual(
    claims.map((c) => c.source),
    ["matchAnalysis.matches[0]", "cvTailoring.bullets[0]", "verification.items[0]"],
  );
});

test("verifyGrounding computes totals and headline scores", () => {
  const pack: ApplicationPack = {
    matchAnalysis: {
      overallFit: "moderate",
      matches: [
        { requirement: "billing", status: "strong", evidence: "billing microservice", comment: "" }, // grounded
        { requirement: "obs", status: "partial", evidence: "tracing distributed logging", comment: "" }, // partial
        { requirement: "k8s", status: "missing", evidence: NO_EVIDENCE, comment: "" }, // no-evidence
        { requirement: "ml", status: "strong", evidence: "managed kubernetes clusters", comment: "" }, // ungrounded
      ],
    },
  };
  const report = verifyGrounding(pack, CV);
  assert.deepEqual(report.totals, {
    total: 4,
    grounded: 1,
    partial: 1,
    noEvidence: 1,
    ungrounded: 1,
  });
  // grounding = (1 + 0.5*1) / (4 - 1 no-evidence) = 0.5
  assert.equal(report.groundingScore, 0.5);
  // honesty = (4 - 1 ungrounded) / 4 = 0.75
  assert.equal(report.honestyScore, 0.75);
});

test("verifyGrounding is vacuously perfect when there are no claims", () => {
  const report = verifyGrounding({}, CV);
  assert.equal(report.totals.total, 0);
  assert.equal(report.groundingScore, 1);
  assert.equal(report.honestyScore, 1);
});

test("verifyTailoringGrounding + ungroundedClaims surface fabricated bullets", () => {
  const report = verifyTailoringGrounding(
    {
      bullets: [
        { targetRequirement: "a", suggestion: "real work", evidence: "billing microservice", grounded: true },
        { targetRequirement: "b", suggestion: "invented", evidence: "led a 500-person org", grounded: false },
      ],
    },
    CV,
  );
  assert.equal(report.totals.ungrounded, 1);
  assert.deepEqual(ungroundedClaims(report), ["invented"]);
});
