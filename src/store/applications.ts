import type { ApplicationPack, Mode } from "../schemas/application.js";
import { getDb } from "./db.js";

/**
 * Data-access layer for saved applications. Each record is one orchestration run:
 * its inputs (CV + job text), the resulting pack, and the headline grounding
 * scores, so past runs can be listed and re-rendered without re-calling a model.
 */

export interface NewApplication {
  model: string;
  phase: string;
  mode: Mode;
  cvText: string;
  jobText: string;
  pack: ApplicationPack;
}

export interface ApplicationSummary {
  id: number;
  createdAt: string;
  model: string;
  phase: string;
  mode: string;
  groundingScore: number | null;
  honestyScore: number | null;
}

export interface ApplicationRecord extends ApplicationSummary {
  cvText: string;
  jobText: string;
  pack: ApplicationPack;
}

interface ApplicationRow {
  id: number;
  created_at: string;
  model: string;
  phase: string;
  mode: string;
  cv_text: string;
  job_text: string;
  pack_json: string;
  grounding_score: number | null;
  honesty_score: number | null;
}

function toSummary(row: ApplicationRow): ApplicationSummary {
  return {
    id: row.id,
    createdAt: row.created_at,
    model: row.model,
    phase: row.phase,
    mode: row.mode,
    groundingScore: row.grounding_score,
    honestyScore: row.honesty_score,
  };
}

/** Persist a completed run and return its new id. */
export function saveApplication(app: NewApplication): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO applications
         (created_at, model, phase, mode, cv_text, job_text, pack_json, grounding_score, honesty_score)
       VALUES (@created_at, @model, @phase, @mode, @cv_text, @job_text, @pack_json, @grounding_score, @honesty_score)`,
    )
    .run({
      created_at: new Date().toISOString(),
      model: app.model,
      phase: app.phase,
      mode: app.mode,
      cv_text: app.cvText,
      job_text: app.jobText,
      pack_json: JSON.stringify(app.pack),
      grounding_score: app.pack.grounding?.groundingScore ?? null,
      honesty_score: app.pack.grounding?.honestyScore ?? null,
    });
  return Number(result.lastInsertRowid);
}

/** List recent applications (most recent first). */
export function listApplications(limit = 20): ApplicationSummary[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM applications ORDER BY id DESC LIMIT ?`)
    .all(limit) as ApplicationRow[];
  return rows.map(toSummary);
}

/** Load a single application by id, with its full pack, or undefined if missing. */
export function getApplication(id: number): ApplicationRecord | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM applications WHERE id = ?`).get(id) as ApplicationRow | undefined;
  if (!row) return undefined;
  return {
    ...toSummary(row),
    cvText: row.cv_text,
    jobText: row.job_text,
    pack: JSON.parse(row.pack_json) as ApplicationPack,
  };
}
