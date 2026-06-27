import { z } from "zod";
import { callStructured } from "../llm/structured.js";
import { MODES, type Mode } from "../schemas/application.js";

const IntentSchema = z.object({
  mode: z.enum(MODES),
  reasoning: z.string().describe("One short sentence explaining the choice."),
});

const SYSTEM = `You are a routing classifier for a career-application assistant.
Map the user's request to exactly one mode:
- "job-analysis": they only want the job's requirements broken down.
- "cv-tailoring": they want help matching/tailoring their CV to the job.
- "interview-prep": they want interview questions and preparation.
- "full": they want the complete application pack, or the request is broad/unclear.
Pick "full" when in doubt.`;

/** Classify a free-text request into one of the supported modes. */
export async function classifyIntent(request: string): Promise<Mode> {
  const result = await callStructured({
    schema: IntentSchema,
    name: "route_intent",
    role: "routing",
    system: SYSTEM,
    human: `Classify this request:\n"""\n${request}\n"""`,
  });
  return result.mode;
}
