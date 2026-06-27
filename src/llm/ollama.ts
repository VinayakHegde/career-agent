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

/**
 * Build a configured ChatOllama client.
 *
 * `think: false` disables qwen3's reasoning tokens, which keeps structured
 * (JSON) outputs clean and avoids the model leaking `<think>` blocks into
 * parsed results. Callers can override any field for one-off needs.
 */
export function getChatModel(overrides: Partial<ChatOllamaInput> = {}): ChatOllama {
  return new ChatOllama({
    model: resolveModel(),
    baseUrl: process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_BASE_URL,
    temperature: resolveTemperature(),
    think: false,
    ...overrides,
  });
}
