import { callStructured } from "../llm/structured.js";
import { JobAnalysisSchema, type JobAnalysis } from "../schemas/application.js";
import { GROUNDING_RULES, jobBlock } from "./shared.js";

const SYSTEM = `${GROUNDING_RULES}

Role: Job Analyst. You break a job description into concrete, categorized requirements.
Classify each as a must-have, nice-to-have, or responsibility, and rate its importance.`;

/** Turn raw job-description text into a structured requirements breakdown. */
export async function analyzeJob(jobText: string): Promise<JobAnalysis> {
  return callStructured({
    schema: JobAnalysisSchema,
    name: "job_analysis",
    role: "analysis",
    system: SYSTEM,
    human: `Analyze this job description and produce the structured breakdown.\n\n${jobBlock(jobText)}`,
  });
}
