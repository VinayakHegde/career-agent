import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import type { Mode } from "../schemas/application.js";
import { resolveModel } from "../llm/ollama.js";
import { formatDuration } from "../llm/perf.js";
import { writeJsonArtifact, timestampSlug } from "../tools/write-artifact.js";
import { generateApplicationPack, PHASES, type Phase } from "../core/orchestrator.js";
import { getFixtures } from "./fixtures.js";
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

interface EvalRow {
  fixtureId: string;
  phase: Phase;
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
      seed: { type: "string", default: "42" },
      temperature: { type: "string", default: "0" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(
      "Usage: pnpm eval [--phases 1,2,3,4,5] [--model <name>] [--fixture <id-substring>] " +
        "[--seed <int>] [--temperature <float>]",
    );
    return;
  }

  if (values.model) process.env.OLLAMA_MODEL = values.model;
  // Default to deterministic sampling (temp 0 + fixed seed) so eval scores are
  // reproducible across runs; both are overridable via flags.
  process.env.OLLAMA_TEMPERATURE = values.temperature;
  process.env.OLLAMA_SEED = values.seed;
  const model = resolveModel();

  const phases = values.phases
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is Phase => (PHASES as string[]).includes(p));
  if (phases.length === 0) {
    console.error(`No valid phases in "${values.phases}". Use any of: ${PHASES.join(", ")}.`);
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
  console.log(`  sampling: temperature ${values.temperature}, seed ${values.seed}`);
  console.log(`  phases:   ${phases.join(", ")}`);
  console.log(`  fixtures: ${fixtures.map((f) => f.id).join(", ")}\n`);

  const rows: EvalRow[] = [];
  for (const phase of phases) {
    for (const fx of fixtures) {
      const startedAt = performance.now();
      const row: EvalRow = { fixtureId: fx.id, phase, mode: fx.mode, model };
      try {
        const { pack } = await generateApplicationPack({
          cvText: fx.cvText,
          jobText: fx.jobText,
          phase,
          mode: fx.mode,
        });
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
    temperature: values.temperature,
    seed: values.seed,
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
