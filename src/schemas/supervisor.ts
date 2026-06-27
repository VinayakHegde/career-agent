import { z } from "zod";

/** The specialist workers a supervisor can delegate to. */
export const WORKERS = [
  "job_analyst",
  "cv_evidence",
  "gap_analyst",
  "cv_writer",
  "critic",
  "interview_coach",
  "synthesizer",
] as const;
export type Worker = (typeof WORKERS)[number];

/** Supervisor may pick a worker or stop. */
export const SUPERVISOR_CHOICES = [...WORKERS, "FINISH"] as const;
export type SupervisorChoice = (typeof SUPERVISOR_CHOICES)[number];

export const SupervisorDecisionSchema = z.object({
  next: z.enum(SUPERVISOR_CHOICES),
  reason: z.string().describe("One short sentence justifying the choice."),
});
export type SupervisorDecision = z.infer<typeof SupervisorDecisionSchema>;
