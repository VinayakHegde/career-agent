import { performance } from "node:perf_hooks";
import type { ApplicationPack, Mode } from "../schemas/application.js";
import type { GroundingReport } from "../schemas/application.js";
import type { Evaluation } from "../schemas/plan.js";
import { getPerfSummary, resetTimings, type PerfSummary } from "../llm/perf.js";
import { verifyGrounding } from "../grounding/verify.js";
import { runPhase1 } from "../graphs/phase1-single-agent.js";
import { runPhase2 } from "../graphs/phase2-router.js";
import { runPhase3 } from "../graphs/phase3-plan-execute.js";
import { runPhase4 } from "../graphs/phase4-supervisor-workers.js";
import { runPhase5 } from "../graphs/phase5-collaboration.js";

/**
 * CLI-agnostic orchestration core.
 *
 * This is the single entry point that turns CV + job text into a graded
 * application pack. It is intentionally free of I/O (no file reading, no
 * console, no process.exit) so the CLI, an HTTP API, or the evals harness can
 * all share it. Progress is surfaced through an `onEvent` callback rather than
 * by logging, so callers decide how to present it (CLI line, SSE frame, etc.).
 */

export type Phase = "1" | "2" | "3" | "4" | "5";
export const PHASES: Phase[] = ["1", "2", "3", "4", "5"];

export function isPhase(value: string): value is Phase {
  return (PHASES as string[]).includes(value);
}

/** A progress event emitted as the orchestration runs. */
export interface StepEvent {
  type: "step";
  phase: Phase;
  /** Human-readable description of the step that just ran. */
  label: string;
}
export type OrchestratorEvent = StepEvent;

export interface GenerateInput {
  cvText: string;
  jobText: string;
  /** Orchestration strategy. Defaults to "2" (router graph). */
  phase?: Phase;
  /** Explicit mode. If omitted, Phase 2 infers it from `request` (else "full"). */
  mode?: Mode;
  /** Free-text request used by the Phase 2 router to infer the mode. */
  request?: string;
  onEvent?: (event: OrchestratorEvent) => void;
}

export interface GenerateResult {
  pack: ApplicationPack;
  mode: Mode;
  phase: Phase;
  /** Deterministic grounding audit of the assembled pack. */
  grounding: GroundingReport;
  /** Wall-clock time spent orchestrating, in milliseconds. */
  wallMs: number;
  /** Per-run LLM performance + token totals. */
  perf: PerfSummary;
  /** Phase 3 only: the evaluator's verdict. */
  evaluation?: Evaluation;
  /** Phase 5 only: whether the bullets were approved and after how many writer passes. */
  approved?: boolean;
  rounds?: number;
}

/** Run the orchestrator end-to-end and return a graded, structured result. */
export async function generateApplicationPack(input: GenerateInput): Promise<GenerateResult> {
  const phase: Phase = input.phase ?? "2";
  const emitStep = (label: string) => input.onEvent?.({ type: "step", phase, label });

  // Reset process-wide perf counters so the summary reflects only this run.
  resetTimings();
  const startedAt = performance.now();

  let pack: ApplicationPack;
  let mode: Mode;
  let evaluation: Evaluation | undefined;
  let approved: boolean | undefined;
  let rounds: number | undefined;

  const common = { cvText: input.cvText, jobText: input.jobText, onStep: emitStep };

  if (phase === "1") {
    mode = input.mode ?? "full";
    pack = await runPhase1({ ...common, mode });
  } else if (phase === "3") {
    mode = input.mode ?? "full";
    const result = await runPhase3({ ...common, mode });
    pack = result.pack;
    evaluation = result.evaluation;
  } else if (phase === "4") {
    mode = input.mode ?? "full";
    pack = (await runPhase4({ ...common, mode })).pack;
  } else if (phase === "5") {
    mode = input.mode ?? "cv-tailoring";
    const result = await runPhase5({ ...common, mode });
    pack = result.pack;
    approved = result.approved;
    rounds = result.rounds;
  } else {
    const result = await runPhase2({ ...common, mode: input.mode, request: input.request });
    pack = result.pack;
    mode = result.mode;
  }

  const wallMs = performance.now() - startedAt;

  // Deterministic grounding audit: cheap, model-free, always run so the
  // "never invent experience" guarantee is provable rather than just asserted.
  pack.grounding = verifyGrounding(pack, input.cvText);

  return {
    pack,
    mode,
    phase,
    grounding: pack.grounding,
    wallMs,
    perf: getPerfSummary(),
    evaluation,
    approved,
    rounds,
  };
}
