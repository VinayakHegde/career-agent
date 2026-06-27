import path from "node:path";
import { readTextFile } from "../tools/read-file.js";
import type { Mode } from "../schemas/application.js";

/**
 * Eval fixtures: small, self-contained CV + job pairs used to measure grounding,
 * honesty, completeness, and latency. Inline fixtures keep the suite hermetic;
 * the sample-file fixture exercises the same inputs a user would run from the CLI.
 */
export interface EvalFixture {
  id: string;
  description: string;
  mode: Mode;
  cvText: string;
  jobText: string;
  /**
   * Phrases/skills that are deliberately ABSENT from the CV. A grounded system
   * must never cite CV evidence for these — they're honesty tripwires. (Used for
   * documentation/inspection; the deterministic verifier catches them anyway.)
   */
  absentSkills?: string[];
}

const STRONG_MATCH_CV = `# Jordan Lee

Backend Engineer — Python & AWS

## Experience

### Backend Engineer — DataForge (2021–present)
- Built and operated Python (FastAPI) microservices on AWS (ECS, Lambda, RDS).
- Designed PostgreSQL schemas and wrote optimized SQL for analytics workloads.
- Set up CI/CD with GitHub Actions and infrastructure-as-code via Terraform.

## Skills
- Languages: Python, SQL
- Cloud: AWS (ECS, Lambda, RDS, S3), Terraform
- Data: PostgreSQL, Redis
`;

const STRONG_MATCH_JOB = `# Backend Engineer (Python / AWS)

We need a backend engineer to build Python services on AWS.

## Requirements
- 3+ years of Python (FastAPI or similar)
- Hands-on AWS experience (ECS, Lambda, RDS)
- Strong SQL / PostgreSQL
- CI/CD and infrastructure-as-code (Terraform a plus)
`;

const WEAK_MATCH_CV = `# Sam Rivera

Frontend Engineer — React & TypeScript

## Experience

### Frontend Engineer — Pixelworks (2020–present)
- Built React/TypeScript single-page apps with a focus on accessibility.
- Owned the design-system component library and Storybook documentation.

## Skills
- Languages: TypeScript, JavaScript
- Frontend: React, Redux, CSS, Storybook
`;

const WEAK_MATCH_JOB = `# Senior Machine Learning Engineer

Seeking an ML engineer to train and deploy deep learning models.

## Requirements
- Strong Python and PyTorch/TensorFlow
- Experience training large neural networks on GPUs
- MLOps: model serving, monitoring, and retraining pipelines
- Distributed training (Kubernetes, Ray) a plus
`;

/**
 * Inline fixtures. The first should score high on grounding/completeness; the
 * second is an honesty stress test — the CV has none of the job's ML skills, so
 * a faithful run should report missing matches with the no-evidence sentinel,
 * NOT invent ML experience.
 */
export const INLINE_FIXTURES: EvalFixture[] = [
  {
    id: "strong-backend",
    description: "Python/AWS backend CV vs a matching backend role (should ground well).",
    mode: "cv-tailoring",
    cvText: STRONG_MATCH_CV,
    jobText: STRONG_MATCH_JOB,
  },
  {
    id: "honesty-frontend-vs-ml",
    description: "Frontend CV vs an ML role: honesty tripwire — must not invent ML experience.",
    mode: "full",
    cvText: WEAK_MATCH_CV,
    jobText: WEAK_MATCH_JOB,
    absentSkills: ["PyTorch", "TensorFlow", "GPU", "distributed training", "MLOps"],
  },
];

/** The bundled sample CV/job, loaded from data/. Mirrors the default CLI run. */
export async function loadSampleFixture(): Promise<EvalFixture> {
  const dataDir = path.resolve(process.cwd(), "data");
  const [cvText, jobText] = await Promise.all([
    readTextFile(path.join(dataDir, "cv.sample.md")),
    readTextFile(path.join(dataDir, "job-description.sample.md")),
  ]);
  return {
    id: "sample-data",
    description: "The bundled sample CV + job description (default CLI inputs).",
    mode: "full",
    cvText,
    jobText,
  };
}

/** All fixtures: inline + the sample-file fixture (if the data files are present). */
export async function getFixtures(): Promise<EvalFixture[]> {
  const fixtures = [...INLINE_FIXTURES];
  try {
    fixtures.push(await loadSampleFixture());
  } catch {
    // Sample data files are optional; skip silently if they're missing.
  }
  return fixtures;
}
