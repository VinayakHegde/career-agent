import type { z } from "zod";
import type { ChatOllamaInput } from "@langchain/ollama";
import { getChatModel, resolveModelForRole, type AgentRole } from "./ollama.js";
import { timed } from "./perf.js";

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

interface StructuredCallOptions<S extends z.ZodTypeAny> {
  /** Schema the model output is coerced into. */
  schema: S;
  /** A short name for the schema (helps some models with tool/JSON naming). */
  name: string;
  /** System prompt: role, rules, grounding constraints. */
  system: string;
  /** User prompt: the actual task and inputs. */
  human: string;
  /**
   * Logical role of this call. Used to pick a per-role model (see
   * `resolveModelForRole`); falls back to the global model when unset.
   */
  role?: AgentRole;
  /** Per-call model overrides (e.g. a different temperature). */
  modelOverrides?: Partial<ChatOllamaInput>;
  /** How many extra attempts to make if parsing fails. Default 1. */
  retries?: number;
}

/**
 * Run a single structured-output LLM call and return a validated object.
 *
 * Uses Ollama's structured-output support via `withStructuredOutput`, then
 * retries once with a stricter reminder if the model returns something that
 * doesn't match the schema. Throws a `StructuredOutputError` if it still fails.
 */
export async function callStructured<S extends z.ZodTypeAny>(
  opts: StructuredCallOptions<S>,
): Promise<z.infer<S>> {
  const { schema, name, system, human, role, modelOverrides, retries = 1 } = opts;
  // A per-call `model` override always wins; otherwise resolve from the role.
  const model = getChatModel({ model: resolveModelForRole(role), ...modelOverrides });
  const structured = model.withStructuredOutput(schema, { name });

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const reminder =
      attempt === 0
        ? ""
        : "\n\nIMPORTANT: Your previous reply could not be parsed. " +
          "Return ONLY a single JSON object that matches the required schema exactly.";
    try {
      return (await timed(name, () =>
        structured.invoke([
          ["system", system],
          ["human", human + reminder],
        ]),
      )) as z.infer<S>;
    } catch (err) {
      lastError = err;
    }
  }

  throw new StructuredOutputError(
    `Model "${model.model}" failed to produce valid output for "${name}" after ${retries + 1} attempt(s).`,
    lastError,
  );
}
