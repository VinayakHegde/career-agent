import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import type { ApplicationPack, Mode } from "../schemas/application.js";
import { resolveModel } from "../llm/ollama.js";
import { formatDuration } from "../llm/perf.js";
import { writeJsonArtifact, timestampSlug } from "../tools/write-artifact.js";
import { runPhase1 } from "../graphs/phase1-single-agent.js";
import { runPhase2 } from "../graphs/phase2-router.js";
import { runPhase3 } from "../graphs/phase3-plan-execute.js";
import { runPhase4 } from "../graphs/phase4-supervisor-workers.js";
import { runPhase5 } from "../graphs/phase5-collaboration.js";
import { getFixtures, type EvalFixture } from "./fixtures.js";
import { scorePack, aggregate, type EvalScore } from "./scoring.js";

/**
 * Integration evals harness. For each fixture × phase it runs the orchestrator
 * end-to-end against the configured Ollama model and scores the resulting pack
 * for grounding, no-evidence honesty, completeness, and latency.
 *
 * NOTE: this calls a live model and is therefore slow and non-deterministic. The
 * pure scoring logic lives in scoring.ts and is unit-tested separately.
 *
 * Usage:
 *   pnpm eval                          # default: phase 2, all fixtures
 *   pnpm eval --phases 1,3,4           # compare phases
 *   pnpm eval --model qwen3:14b        # override the model for the run
 *   pnpm eval --fixture honesty        # only fixtures whose id contains "honesty"
 */

type PhaseId = "1" | "2" | "3" | "4" | "5";
const VALID_PHASES: PhaseId[] = ["1", "2", "3", "4", "5"];

async function runPhase(phase: PhaseId, fx: EvalFixture): Promise<ApplicationPack> {
  const base = { cvText: fx.cvText, jobText: fx.jobText, mode: fx.mode as Mode };
  switch (phase) {
    case "1":
      return runPhase1(base);
    case "2":
      return (await runPhase2({ ...base })).pack;
    case "3":
      return (await runPhase3(base)).pack;
    case "4":
      return (await runPhase4(base)).pack;
    case "5":
      return (await runPhase5(base)).pack;
  }
}

interface EvalRow {
  fixtureId: string;
  phase: PhaseId;
  mode: Mode;
  model: string;
  score?: EvalScore;
  error?: string;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`.padStart(4);
}

function printRow(row: EvalRow): void {
  const head = `  [phase ${row.phase}] ${row.fixtureId}`;
  if (row.error) {
    console.log(`${head}: ✗ ${row.error}`);
    return;
  }
  const s = row.score!;
  console.log(
    `${head}: ground ${pct(s.groundingRate)} · honesty ${pct(s.noEvidenceHonesty)} · ` +
      `complete ${pct(s.completeness)} · ungrounded ${s.ungroundedClaims}/${s.totalClaims} · ` +
      `${formatDuration(s.latencyMs)}`,
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      phases: { type: "string", default: "2" },
      model: { type: "string" },
      fixture: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(
      "Usage: pnpm eval [--phases 1,2,3,4,5] [--model <name>] [--fixture <id-substring>]",
    );
    return;
  }

  if (values.model) process.env.OLLAMA_MODEL = values.model;
  const model = resolveModel();

  const phases = values.phases
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is PhaseId => (VALID_PHASES as string[]).includes(p));
  if (phases.length === 0) {
    console.error(`No valid phases in "${values.phases}". Use any of: ${VALID_PHASES.join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  let fixtures = await getFixtures();
  if (values.fixture) {
    fixtures = fixtures.filter((f) => f.id.includes(values.fixture!));
  }
  if (fixtures.length === 0) {
    console.error("No fixtures matched.");
    process.exitCode = 1;
    return;
  }

  console.log(`\n▶ Running evals`);
  console.log(`  model:    ${model}`);
  console.log(`  phases:   ${phases.join(", ")}`);
  console.log(`  fixtures: ${fixtures.map((f) => f.id).join(", ")}\n`);

  const rows: EvalRow[] = [];
  for (const phase of phases) {
    for (const fx of fixtures) {
      const startedAt = performance.now();
      const row: EvalRow = { fixtureId: fx.id, phase, mode: fx.mode, model };
      try {
        const pack = await runPhase(phase, fx);
        const latencyMs = performance.now() - startedAt;
        row.score = scorePack(pack, fx.cvText, fx.mode, latencyMs);
      } catch (err) {
        row.error = (err as Error).message;
      }
      rows.push(row);
      printRow(row);
    }
  }

  // Per-phase aggregate summary.
  console.log(`\n── Summary ──`);
  for (const phase of phases) {
    const scores = rows.filter((r) => r.phase === phase && r.score).map((r) => r.score!);
    const failures = rows.filter((r) => r.phase === phase && r.error).length;
    const agg = aggregate(scores);
    console.log(
      `  phase ${phase}: ground ${pct(agg.avgGroundingRate)} · honesty ${pct(agg.avgNoEvidenceHonesty)} · ` +
        `complete ${pct(agg.avgCompleteness)} · ungrounded ${agg.totalUngroundedClaims} · ` +
        `avg ${formatDuration(agg.avgLatencyMs)}${failures ? ` · ${failures} failed` : ""}`,
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model,
    phases,
    rows,
    summary: phases.map((phase) => ({
      phase,
      ...aggregate(rows.filter((r) => r.phase === phase && r.score).map((r) => r.score!)),
    })),
  };
  const reportPath = await writeJsonArtifact(`evals-${timestampSlug()}.json`, report);
  console.log(`\n✓ Eval report written to ${reportPath}\n`);
}

main().catch((err: unknown) => {
  console.error("\n✗ Eval run failed:", err);
  process.exitCode = 1;
});
