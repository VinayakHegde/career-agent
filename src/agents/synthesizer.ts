import { callStructured } from "../llm/structured.js";
import {
  StrategyBriefSchema,
  type ApplicationPack,
  type StrategyBrief,
} from "../schemas/application.js";
import { GROUNDING_RULES, asContext } from "./shared.js";

const SYSTEM = `${GROUNDING_RULES}

Role: Final Synthesizer. Combine the analyses into a concise application strategy:
positioning, strengths to emphasize, risks to mitigate, an overall recommendation,
and concrete next steps. Base everything strictly on the provided analyses.`;

/** Synthesize all available sections into a final strategy brief. */
export async function buildStrategyBrief(pack: ApplicationPack): Promise<StrategyBrief> {
  return callStructured({
    schema: StrategyBriefSchema,
    name: "strategy_brief",
    role: "synthesis",
    system: SYSTEM,
    human:
      `Synthesize a final application strategy brief from these analyses.\n\n` +
      `${asContext("ANALYSES", pack)}`,
  });
}
