import "dotenv/config";
import { ChatOllama, type ChatOllamaInput } from "@langchain/ollama";

/** Default model. Small enough to run comfortably on a 36GB machine. */
export const DEFAULT_MODEL = "qwen3:8b";
export const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

/** Resolve the configured model name (env wins, falls back to the default). */
export function resolveModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Logical agent roles. Each structured call declares the role it plays so we can
 * route cheap, mechanical work (routing/planning) to a small model and reserve a
 * stronger model for generative or critical work (writing/critique/synthesis).
 */
export const AGENT_ROLES = [
  "routing",
  "planning",
  "analysis",
  "writing",
  "critique",
  "synthesis",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * Resolve the model for a given role. Precedence:
 *   1. OLLAMA_MODEL_<ROLE>   (e.g. OLLAMA_MODEL_WRITING=qwen3:14b)
 *   2. OLLAMA_MODEL          (global override)
 *   3. DEFAULT_MODEL
 * Roles with no specific override transparently fall back to the global model,
 * so the default single-model behaviour is unchanged.
 */
export function resolveModelForRole(role?: AgentRole): string {
  if (role) {
    const perRole = process.env[`OLLAMA_MODEL_${role.toUpperCase()}`]?.trim();
    if (perRole) return perRole;
  }
  return resolveModel();
}

function resolveTemperature(): number {
  const raw = process.env.OLLAMA_TEMPERATURE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0.2;
}

/** Optional fixed sampling seed (OLLAMA_SEED). Combined with temperature 0 this
 * makes runs reproducible — useful for evals. Returns undefined when unset. */
function resolveSeed(): number | undefined {
  const raw = process.env.OLLAMA_SEED;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Build a configured ChatOllama client.
 *
 * `think: false` disables qwen3's reasoning tokens, which keeps structured
 * (JSON) outputs clean and avoids the model leaking `<think>` blocks into
 * parsed results. Callers can override any field for one-off needs.
 */
export function resolveBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function getChatModel(overrides: Partial<ChatOllamaInput> = {}): ChatOllama {
  const seed = resolveSeed();
  return new ChatOllama({
    model: resolveModel(),
    baseUrl: resolveBaseUrl(),
    temperature: resolveTemperature(),
    ...(seed !== undefined ? { seed } : {}),
    think: false,
    ...overrides,
  });
}

/** Raised when Ollama is unreachable or a required model isn't pulled. */
export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

/** Every distinct model this run might use: the global default + any per-role overrides. */
export function requiredModels(): string[] {
  const models = new Set<string>([resolveModel()]);
  for (const role of AGENT_ROLES) models.add(resolveModelForRole(role));
  return [...models];
}

/** True if an installed model name satisfies a requested one (tolerating the ":latest" tag). */
function modelMatches(installed: string, requested: string): boolean {
  return installed === requested || installed === `${requested}:latest` || requested === `${installed}:latest`;
}

/**
 * Preflight check: confirm Ollama is reachable and every model this run needs is
 * already pulled. Throws an OllamaUnavailableError with an actionable message
 * rather than letting a cryptic connection/404 surface mid-run.
 */
export async function assertModelsAvailable(timeoutMs = 4000): Promise<void> {
  const baseUrl = resolveBaseUrl();
  let installed: string[];
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { models?: Array<{ name: string }> };
    installed = (body.models ?? []).map((m) => m.name);
  } catch (err) {
    throw new OllamaUnavailableError(
      `Could not reach Ollama at ${baseUrl} (${(err as Error).message}). ` +
        `Is it running? Start it with \`ollama serve\`.`,
    );
  }

  const missing = requiredModels().filter((m) => !installed.some((i) => modelMatches(i, m)));
  if (missing.length > 0) {
    throw new OllamaUnavailableError(
      `Model(s) not found in Ollama: ${missing.join(", ")}. ` +
        `Pull with: ${missing.map((m) => `\`ollama pull ${m}\``).join(", ")}. ` +
        `Installed: ${installed.length ? installed.join(", ") : "(none)"}.`,
    );
  }
}
