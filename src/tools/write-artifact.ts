import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const OUTPUT_DIR = path.resolve(process.cwd(), "outputs");

async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

/** A filesystem-safe timestamp like 2026-06-22T22-05-01. */
export function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/:/g, "-").replace(/\..+$/, "");
}

/** Write a text artifact into outputs/ and return its absolute path. */
export async function writeArtifact(fileName: string, content: string): Promise<string> {
  await ensureOutputDir();
  const fullPath = path.join(OUTPUT_DIR, fileName);
  await fs.writeFile(fullPath, content, "utf-8");
  return fullPath;
}

/** Write a pretty-printed JSON artifact into outputs/. */
export async function writeJsonArtifact(fileName: string, data: unknown): Promise<string> {
  return writeArtifact(fileName, JSON.stringify(data, null, 2) + "\n");
}

/** LangChain tool wrapper, used by the agentic graphs in later phases. */
export const writeArtifactTool = tool(
  async ({ fileName, content }: { fileName: string; content: string }) =>
    writeArtifact(fileName, content),
  {
    name: "write_artifact",
    description: "Save a text artifact into the outputs/ directory.",
    schema: z.object({
      fileName: z.string().describe("File name (no directory), e.g. 'pack.md'."),
      content: z.string(),
    }),
  },
);
