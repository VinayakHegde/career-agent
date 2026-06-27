import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_EVIDENCE, type ApplicationPack } from "../schemas/application.js";
import { renderPackMarkdown } from "./pack-markdown.js";

const meta = { mode: "full", model: "qwen3:8b" };

test("renderPackMarkdown renders job analysis with role and requirements", () => {
  const pack: ApplicationPack = {
    jobAnalysis: {
      roleTitle: "Backend Engineer",
      summary: "Build services.",
      requirements: [{ requirement: "Node.js", category: "must-have", importance: "high" }],
    },
  };
  const md = renderPackMarkdown(pack, meta);
  assert.match(md, /# Application Pack/);
  assert.match(md, /\*\*Role:\*\* Backend Engineer/);
  assert.match(md, /\[must-have · high\] Node\.js/);
});

test("renderPackMarkdown italicizes the no-evidence sentinel and quotes real evidence", () => {
  const pack: ApplicationPack = {
    matchAnalysis: {
      overallFit: "moderate",
      matches: [
        { requirement: "A", status: "strong", evidence: "built billing service", comment: "ok" },
        { requirement: "B", status: "missing", evidence: NO_EVIDENCE, comment: "none" },
      ],
    },
  };
  const md = renderPackMarkdown(pack, meta);
  assert.match(md, /Evidence: "built billing service"/);
  assert.match(md, new RegExp(`Evidence: _${NO_EVIDENCE}_`));
});

test("renderPackMarkdown renders the grounding audit and lists ungrounded claims", () => {
  const pack: ApplicationPack = {
    grounding: {
      groundingScore: 0.5,
      honestyScore: 0.75,
      totals: { total: 4, grounded: 1, partial: 1, noEvidence: 1, ungrounded: 1 },
      checks: [
        {
          source: "cvTailoring.bullets[0]",
          claim: "Led a 50-person ML team",
          evidence: "managed kubernetes clusters",
          status: "ungrounded",
          matchRatio: 0,
        },
      ],
    },
  };
  const md = renderPackMarkdown(pack, meta);
  assert.match(md, /## Grounding Audit \(deterministic\)/);
  assert.match(md, /\*\*Grounding score:\*\* 50%/);
  assert.match(md, /\*\*Honesty score:\*\* 75%/);
  assert.match(md, /Ungrounded claims/);
  assert.match(md, /cvTailoring\.bullets\[0\]/);
});

test("renderPackMarkdown notes when no ungrounded claims are detected", () => {
  const pack: ApplicationPack = {
    grounding: {
      groundingScore: 1,
      honestyScore: 1,
      totals: { total: 2, grounded: 2, partial: 0, noEvidence: 0, ungrounded: 0 },
      checks: [],
    },
  };
  const md = renderPackMarkdown(pack, meta);
  assert.match(md, /No ungrounded claims detected/);
});
