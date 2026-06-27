import { NO_EVIDENCE, type ApplicationPack } from "../schemas/application.js";

function evidenceLabel(evidence: string): string {
  return evidence.trim().toLowerCase() === NO_EVIDENCE ? `_${NO_EVIDENCE}_` : `"${evidence}"`;
}

/** Render an application pack as a readable Markdown report. */
export function renderPackMarkdown(pack: ApplicationPack, meta: { mode: string; model: string }): string {
  const lines: string[] = [];
  lines.push(`# Application Pack`);
  lines.push("");
  lines.push(`- **Mode:** ${meta.mode}`);
  lines.push(`- **Model:** ${meta.model}`);
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push("");

  if (pack.jobAnalysis) {
    const j = pack.jobAnalysis;
    lines.push(`## 1. Job Requirements Breakdown`);
    lines.push("");
    lines.push(`**Role:** ${j.roleTitle}`);
    lines.push("");
    lines.push(j.summary);
    lines.push("");
    for (const r of j.requirements) {
      lines.push(`- [${r.category} · ${r.importance}] ${r.requirement}`);
    }
    lines.push("");
  }

  if (pack.matchAnalysis) {
    const m = pack.matchAnalysis;
    lines.push(`## 2. CV-to-Job Match Analysis`);
    lines.push("");
    lines.push(`**Overall fit:** ${m.overallFit}`);
    lines.push("");
    for (const item of m.matches) {
      lines.push(`- **${item.status.toUpperCase()}** — ${item.requirement}`);
      lines.push(`  - Evidence: ${evidenceLabel(item.evidence)}`);
      lines.push(`  - ${item.comment}`);
    }
    lines.push("");
  }

  if (pack.gapAnalysis) {
    const g = pack.gapAnalysis;
    lines.push(`## 3. Gap Analysis`);
    lines.push("");
    if (g.missingSkills.length === 0) lines.push("_No significant gaps identified._");
    for (const s of g.missingSkills) {
      lines.push(`- **${s.severity}** — ${s.skill}`);
      lines.push(`  - ${s.honestSuggestion}`);
    }
    if (g.transferableStrengths.length) {
      lines.push("");
      lines.push(`**Transferable strengths:**`);
      for (const t of g.transferableStrengths) lines.push(`- ${t}`);
    }
    lines.push("");
  }

  if (pack.cvTailoring) {
    lines.push(`## 4. Tailored CV Bullet Suggestions`);
    lines.push("");
    for (const b of pack.cvTailoring.bullets) {
      const flag = b.grounded ? "" : " ⚠️ (ungrounded)";
      lines.push(`- ${b.suggestion}${flag}`);
      lines.push(`  - Targets: ${b.targetRequirement}`);
      lines.push(`  - Evidence: ${evidenceLabel(b.evidence)}`);
    }
    lines.push("");
  }

  if (pack.interviewPrep) {
    lines.push(`## 5. Interview Preparation Questions`);
    lines.push("");
    for (const q of pack.interviewPrep.questions) {
      lines.push(`- **[${q.category}]** ${q.question}`);
      lines.push(`  - Why: ${q.whyAsked}`);
      lines.push(`  - Answer angle: ${q.answerAngle}`);
    }
    lines.push("");
  }

  if (pack.critique) {
    const c = pack.critique;
    lines.push(`## Critic Review`);
    lines.push("");
    lines.push(`**Verdict:** ${c.approved ? "approved" : "changes suggested"}`);
    lines.push("");
    lines.push(c.summary);
    if (c.findings.length) {
      lines.push("");
      for (const f of c.findings) {
        lines.push(`- **[${f.issue} · ${f.severity}]** ${f.target}`);
        lines.push(`  - Fix: ${f.suggestedFix}`);
      }
    }
    lines.push("");
  }

  if (pack.verification) {
    const v = pack.verification;
    lines.push(`## Evidence Verification`);
    lines.push("");
    lines.push(`**All claims supported:** ${v.allSupported ? "yes" : "no"}`);
    lines.push("");
    for (const item of v.items) {
      lines.push(`- **${item.verdict}** — ${item.claim}`);
      lines.push(`  - Evidence: ${evidenceLabel(item.evidence)}`);
    }
    if (v.notes.trim()) {
      lines.push("");
      lines.push(v.notes);
    }
    lines.push("");
  }

  if (pack.strategyBrief) {
    const s = pack.strategyBrief;
    lines.push(`## 6. Final Application Strategy Brief`);
    lines.push("");
    lines.push(`**Recommendation:** ${s.recommendation}`);
    lines.push("");
    lines.push(s.positioning);
    lines.push("");
    if (s.topStrengthsToEmphasize.length) {
      lines.push(`**Strengths to emphasize:**`);
      for (const t of s.topStrengthsToEmphasize) lines.push(`- ${t}`);
      lines.push("");
    }
    if (s.risksToMitigate.length) {
      lines.push(`**Risks to mitigate:**`);
      for (const r of s.risksToMitigate) lines.push(`- ${r}`);
      lines.push("");
    }
    if (s.nextSteps.length) {
      lines.push(`**Next steps:**`);
      for (const n of s.nextSteps) lines.push(`- ${n}`);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
