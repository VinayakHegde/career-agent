import { parseArgs } from "node:util";
import { MODES, type ApplicationPack, type Mode } from "./schemas/application.js";
import { readTextFile, FileReadError } from "./tools/read-file.js";
import { writeArtifact, writeJsonArtifact, timestampSlug } from "./tools/write-artifact.js";
import { resolveModel, assertModelsAvailable, OllamaUnavailableError } from "./llm/ollama.js";
import { StructuredOutputError } from "./llm/structured.js";
import { formatDuration, type PerfSummary } from "./llm/perf.js";
import { generateApplicationPack, isPhase } from "./core/orchestrator.js";
import { renderPackMarkdown } from "./render/pack-markdown.js";

const HELP = `
Career Agent Orchestrator

Usage:
  pnpm dev --cv <path> --job <path> [--mode <mode>] [--request "<text>"] [--phase 1-5] [--model <name>]

Options:
  --cv       Path to a CV/resume Markdown file        (required)
  --job      Path to a job description Markdown file   (required)
  --mode     One of: ${MODES.join(", ")}
  --request  Free-text request; the Phase 2 router infers the mode from it
  --phase    1 sequential, 2 router, 3 plan-execute, 4 supervisor, 5 collaboration  (default: 2)
  --model    Override OLLAMA_MODEL for this run
  --help     Show this help

Examples:
  pnpm dev --cv ./data/cv.sample.md --job ./data/job-description.sample.md --mode full
  pnpm dev --cv ./data/cv.sample.md --job ./data/job-description.sample.md --request "help me prep for the interview"
`.trim();

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cv: { type: "string" },
      job: { type: "string" },
      mode: { type: "string" },
      request: { type: "string" },
      phase: { type: "string", default: "2" },
      model: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (!values.cv || !values.job) {
    console.error("Error: --cv and --job are both required.\n");
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  if (values.mode && !isMode(values.mode)) {
    console.error(`Error: invalid --mode "${values.mode}". Valid modes: ${MODES.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const explicitMode = values.mode as Mode | undefined;

  const phase = values.phase ?? "2";
  if (!isPhase(phase)) {
    console.error(`Error: invalid --phase "${phase}". Use 1, 2, 3, 4, or 5.`);
    process.exitCode = 1;
    return;
  }

  if (values.model) process.env.OLLAMA_MODEL = values.model;
  const model = resolveModel();

  // Fail fast with an actionable message if Ollama is down or the model is missing.
  await assertModelsAvailable();

  const [cvText, jobText] = await Promise.all([
    readTextFile(values.cv),
    readTextFile(values.job),
  ]);

  console.log(`\n▶ Generating application pack`);
  console.log(`  phase: ${phase}`);
  console.log(`  model: ${model}`);
  if (explicitMode) console.log(`  mode:  ${explicitMode}`);
  else if (values.request) console.log(`  request: "${values.request}" (router will pick the mode)`);
  console.log("");

  const result = await generateApplicationPack({
    cvText,
    jobText,
    phase,
    mode: explicitMode,
    request: values.request,
    onEvent: (event) => console.log(`  • ${event.label}`),
  });
  const { pack, mode } = result;

  if (result.evaluation) {
    console.log(`\n  evaluator: ${result.evaluation.complete ? "complete" : "accepted with notes"}`);
    console.log(`  ${result.evaluation.summary}`);
  }
  if (phase === "5") {
    console.log(`\n  collaboration: ${result.approved ? "approved" : "accepted"} after ${result.rounds} writer pass(es)`);
  }

  const slug = `${mode}-${timestampSlug()}`;
  const jsonPath = await writeJsonArtifact(`pack-${slug}.json`, pack);
  const markdown = renderPackMarkdown(pack, { mode, model });
  const mdPath = await writeArtifact(`pack-${slug}.md`, markdown);

  console.log(`\n✓ Done (mode: ${mode}).`);
  console.log(`  JSON:     ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
  printGroundingSummary(pack);
  printPerfSummary(result.wallMs, result.perf);
  console.log("");
  console.log(markdown);
}

/** Print the deterministic grounding audit headline. */
function printGroundingSummary(pack: ApplicationPack): void {
  const g = pack.grounding;
  if (!g) return;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  console.log(`\n🔎 Grounding (deterministic)`);
  console.log(`  grounding score: ${pct(g.groundingScore)}   honesty: ${pct(g.honestyScore)}`);
  console.log(
    `  ${g.totals.grounded} grounded · ${g.totals.partial} partial · ` +
      `${g.totals.noEvidence} no-evidence · ${g.totals.ungrounded} ungrounded (of ${g.totals.total})`,
  );
  if (g.totals.ungrounded > 0) {
    console.log(`  ⚠️  ${g.totals.ungrounded} cited evidence string(s) not found in the CV.`);
  }
}

/** Print a per-run performance breakdown: wall time + per-call-kind timings. */
function printPerfSummary(wallMs: number, perf: PerfSummary): void {
  const { rows, llmTotalMs, callCount, inputTokens, outputTokens } = perf;
  console.log(`\n⏱  Performance`);
  console.log(`  wall time:  ${formatDuration(wallMs)}`);
  console.log(`  llm calls:  ${callCount} (${formatDuration(llmTotalMs)} in-model)`);
  if (inputTokens > 0 || outputTokens > 0) {
    console.log(`  tokens:     ${inputTokens} in / ${outputTokens} out (${inputTokens + outputTokens} total)`);
  }
  for (const r of rows) {
    const count = r.count > 1 ? ` ×${r.count}` : "";
    console.log(`    - ${r.label}${count}: total ${formatDuration(r.totalMs)}, avg ${formatDuration(r.avgMs)}`);
  }
}

main().catch((err: unknown) => {
  if (err instanceof FileReadError) {
    console.error(`\n✗ ${err.message}`);
  } else if (err instanceof OllamaUnavailableError) {
    console.error(`\n✗ ${err.message}`);
  } else if (err instanceof StructuredOutputError) {
    console.error(`\n✗ ${err.message}`);
    console.error("  Tip: try a larger model (e.g. --model qwen3:14b) or rerun.");
  } else {
    console.error("\n✗ Unexpected error:", err);
  }
  process.exitCode = 1;
});
