import { parseArgs } from "node:util";
import { MODES, type ApplicationPack, type Mode } from "./schemas/application.js";
import { readTextFile, FileReadError } from "./tools/read-file.js";
import { writeArtifact, writeJsonArtifact, timestampSlug } from "./tools/write-artifact.js";
import { resolveModel } from "./llm/ollama.js";
import { StructuredOutputError } from "./llm/structured.js";
import { runPhase1 } from "./graphs/phase1-single-agent.js";
import { runPhase2 } from "./graphs/phase2-router.js";
import { runPhase3 } from "./graphs/phase3-plan-execute.js";
import { runPhase4 } from "./graphs/phase4-supervisor-workers.js";
import { runPhase5 } from "./graphs/phase5-collaboration.js";
import { renderPackMarkdown } from "./render/pack-markdown.js";

const HELP = `
Career Agent Orchestrator

Usage:
  pnpm dev --cv <path> --job <path> [--mode <mode>] [--request "<text>"] [--phase 1|2] [--model <name>]

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
  if (!["1", "2", "3", "4", "5"].includes(phase)) {
    console.error(`Error: invalid --phase "${phase}". Use 1, 2, 3, 4, or 5.`);
    process.exitCode = 1;
    return;
  }

  if (values.model) process.env.OLLAMA_MODEL = values.model;
  const model = resolveModel();

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

  let pack: ApplicationPack;
  let mode: Mode;

  if (phase === "1") {
    mode = explicitMode ?? "full";
    pack = await runPhase1({
      cvText,
      jobText,
      mode,
      onStep: (label) => console.log(`  • ${label}…`),
    });
  } else if (phase === "3") {
    mode = explicitMode ?? "full";
    const result = await runPhase3({
      cvText,
      jobText,
      mode,
      onStep: (label) => console.log(`  • ${label}`),
    });
    pack = result.pack;
    if (result.evaluation) {
      console.log(`\n  evaluator: ${result.evaluation.complete ? "complete" : "accepted with notes"}`);
      console.log(`  ${result.evaluation.summary}`);
    }
  } else if (phase === "4") {
    mode = explicitMode ?? "full";
    const result = await runPhase4({
      cvText,
      jobText,
      mode,
      onStep: (label) => console.log(`  • ${label}`),
    });
    pack = result.pack;
  } else if (phase === "5") {
    mode = explicitMode ?? "cv-tailoring";
    const result = await runPhase5({
      cvText,
      jobText,
      mode,
      onStep: (label) => console.log(`  • ${label}`),
    });
    pack = result.pack;
    console.log(`\n  collaboration: ${result.approved ? "approved" : "accepted"} after ${result.rounds} writer pass(es)`);
  } else {
    const result = await runPhase2({
      cvText,
      jobText,
      mode: explicitMode,
      request: values.request,
      onStep: (node) => console.log(`  • node: ${node}`),
    });
    pack = result.pack;
    mode = result.mode;
  }

  const slug = `${mode}-${timestampSlug()}`;
  const jsonPath = await writeJsonArtifact(`pack-${slug}.json`, pack);
  const markdown = renderPackMarkdown(pack, { mode, model });
  const mdPath = await writeArtifact(`pack-${slug}.md`, markdown);

  console.log(`\n✓ Done (mode: ${mode}).`);
  console.log(`  JSON:     ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}\n`);
  console.log(markdown);
}

main().catch((err: unknown) => {
  if (err instanceof FileReadError) {
    console.error(`\n✗ ${err.message}`);
  } else if (err instanceof StructuredOutputError) {
    console.error(`\n✗ ${err.message}`);
    console.error("  Tip: try a larger model (e.g. --model qwen3:14b) or rerun.");
  } else {
    console.error("\n✗ Unexpected error:", err);
  }
  process.exitCode = 1;
});
