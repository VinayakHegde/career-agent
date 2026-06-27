import { callStructured } from "../llm/structured.js";
import { PlanSchema, type Plan } from "../schemas/plan.js";
import type { Mode } from "../schemas/application.js";

const SYSTEM = `You are a Planner for a career-application assistant.
Given a goal mode, produce an ordered task list. Available task kinds:
- job_analysis: break the job description into requirements.
- match_analysis: compare the CV to the requirements (needs job_analysis).
- gap_analysis: find missing skills (needs match_analysis).
- cv_tailoring: suggest grounded CV bullets (needs match_analysis).
- interview_prep: generate interview questions (needs match_analysis).
- strategy_brief: synthesize a final brief (needs everything else).

Rules:
- Respect dependencies: a task must come after the tasks it needs.
- Only include tasks relevant to the goal mode.
- Do not invent task kinds outside the list above.`;

/** Ask the planner to propose a typed task list for the given mode. */
export async function planTasks(mode: Mode): Promise<Plan> {
  return callStructured({
    schema: PlanSchema,
    name: "plan",
    role: "planning",
    system: SYSTEM,
    human: `Goal mode: "${mode}". Produce the ordered task list to fulfill it.`,
  });
}
