import { z } from "zod";
import type { Mode } from "./application.js";

/** The unit of work a planner can schedule. Each maps to one agent. */
export const TASK_KINDS = [
  "job_analysis",
  "match_analysis",
  "gap_analysis",
  "cv_tailoring",
  "interview_prep",
  "strategy_brief",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/* ------------------------------- Planning -------------------------------- */

export const PlannedTaskSchema = z.object({
  kind: z.enum(TASK_KINDS),
  objective: z.string().describe("One sentence: what this task should accomplish."),
});

export const PlanSchema = z.object({
  reasoning: z.string().describe("Brief rationale for the chosen task order."),
  tasks: z.array(PlannedTaskSchema).min(1),
});
export type Plan = z.infer<typeof PlanSchema>;

/* ------------------------------ Execution -------------------------------- */

export type TaskStatus = "pending" | "done" | "failed";

export interface Task {
  id: string;
  kind: TaskKind;
  objective: string;
  status: TaskStatus;
}

/** Which tasks each kind requires to have completed first. */
export const DEPENDENCIES: Record<TaskKind, TaskKind[]> = {
  job_analysis: [],
  match_analysis: ["job_analysis"],
  gap_analysis: ["match_analysis"],
  cv_tailoring: ["match_analysis"],
  interview_prep: ["match_analysis"],
  strategy_brief: ["job_analysis", "match_analysis"],
};

/** The task set each mode is expected to ultimately produce. */
export const MODE_TASKS: Record<Mode, TaskKind[]> = {
  "job-analysis": ["job_analysis"],
  "cv-tailoring": ["job_analysis", "match_analysis", "gap_analysis", "cv_tailoring"],
  "interview-prep": ["job_analysis", "match_analysis", "interview_prep"],
  full: [
    "job_analysis",
    "match_analysis",
    "gap_analysis",
    "cv_tailoring",
    "interview_prep",
    "strategy_brief",
  ],
};

/* ------------------------------ Evaluation ------------------------------- */

export const EvaluationIssueSchema = z.object({
  section: z.enum(TASK_KINDS),
  problem: z.string(),
  severity: z.enum(["high", "medium", "low"]),
});

export const EvaluationSchema = z.object({
  complete: z.boolean().describe("True if every required section is present and well-grounded."),
  issues: z.array(EvaluationIssueSchema),
  sectionsToRedo: z
    .array(z.enum(TASK_KINDS))
    .describe("Sections that should be regenerated to fix the issues."),
  summary: z.string(),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;
