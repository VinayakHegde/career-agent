import { performance } from "node:perf_hooks";

/**
 * Lightweight, process-wide performance tracking. Each LLM call is timed and
 * recorded under a label (the structured-output schema name), so we can print a
 * per-run breakdown at the end. Set PERF=1 to also log each call as it finishes.
 */

interface Timing {
  label: string;
  ms: number;
}

const timings: Timing[] = [];
const perfEnabled = process.env.PERF === "1" || process.env.PERF === "true";

export function isPerfEnabled(): boolean {
  return perfEnabled;
}

export function recordTiming(label: string, ms: number): void {
  timings.push({ label, ms });
  if (perfEnabled) {
    console.error(`  ⏱  ${label}: ${formatDuration(ms)}`);
  }
}

/** Time an async operation and record it under `label`. */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    recordTiming(label, performance.now() - start);
  }
}

export function resetTimings(): void {
  timings.length = 0;
}

export interface PerfRow {
  label: string;
  count: number;
  totalMs: number;
  avgMs: number;
}

export interface PerfSummary {
  rows: PerfRow[];
  /** Total time spent inside model calls (sum of all timings). */
  llmTotalMs: number;
  callCount: number;
}

export function getPerfSummary(): PerfSummary {
  const map = new Map<string, { count: number; totalMs: number }>();
  for (const t of timings) {
    const cur = map.get(t.label) ?? { count: 0, totalMs: 0 };
    cur.count += 1;
    cur.totalMs += t.ms;
    map.set(t.label, cur);
  }
  const rows: PerfRow[] = [...map.entries()]
    .map(([label, v]) => ({ label, count: v.count, totalMs: v.totalMs, avgMs: v.totalMs / v.count }))
    .sort((a, b) => b.totalMs - a.totalMs);
  const llmTotalMs = timings.reduce((sum, t) => sum + t.ms, 0);
  return { rows, llmTotalMs, callCount: timings.length };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
