import { callStructured } from "../llm/structured.js";
import {
  SupervisorDecisionSchema,
  type SupervisorDecision,
  type Worker,
} from "../schemas/supervisor.js";
import type { Mode } from "../schemas/application.js";

const SYSTEM = `You are the Supervisor of a team of specialist agents that build a
career application pack. At each step you delegate to exactly one specialist, or
finish. Specialists:
- job_analyst: breaks down the job's requirements.
- cv_evidence: matches the CV to the requirements with cited evidence.
- gap_analyst: identifies missing skills.
- cv_writer: drafts tailored, grounded CV bullets.
- critic: reviews the writer's bullets for exaggeration / weak evidence.
- interview_coach: prepares interview questions.
- synthesizer: writes the final strategy brief (do this last).

Choose the next step ONLY from the provided list of eligible options. Prefer
finishing dependencies before dependents, and always run the critic after the
writer. Pick FINISH only when it is offered.`;

/**
 * Ask the supervisor which specialist to run next. The graph constrains the
 * choice to currently eligible options; this call decides among them.
 */
export async function decideNext(args: {
  mode: Mode;
  completed: string[];
  eligible: Worker[];
  critiqueNote: string;
}): Promise<SupervisorDecision> {
  const options = [...args.eligible, "FINISH"].join(", ");
  return callStructured({
    schema: SupervisorDecisionSchema,
    name: "supervisor_decision",
    system: SYSTEM,
    human:
      `Goal mode: "${args.mode}".\n` +
      `Completed so far: ${args.completed.length ? args.completed.join(", ") : "(nothing yet)"}.\n` +
      `${args.critiqueNote}\n` +
      `Eligible next steps: ${options}.\n\n` +
      `Pick the single best next step from the eligible list.`,
  });
}
