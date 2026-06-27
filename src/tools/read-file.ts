import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export class FileReadError extends Error {
  constructor(
    message: string,
    readonly filePath: string,
  ) {
    super(message);
    this.name = "FileReadError";
  }
}

/**
 * Read a UTF-8 text file, returning a clear error for the common failure modes
 * (missing file, pointing at a directory, empty file).
 */
export async function readTextFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  let content: string;
  try {
    content = await fs.readFile(resolved, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new FileReadError(`File not found: ${resolved}`, resolved);
    }
    if (code === "EISDIR") {
      throw new FileReadError(`Expected a file but got a directory: ${resolved}`, resolved);
    }
    throw new FileReadError(`Could not read file: ${resolved} (${code ?? "unknown error"})`, resolved);
  }
  if (content.trim().length === 0) {
    throw new FileReadError(`File is empty: ${resolved}`, resolved);
  }
  return content;
}

/** LangChain tool wrapper, used by the agentic graphs in later phases. */
export const readFileTool = tool(
  async ({ filePath }: { filePath: string }) => readTextFile(filePath),
  {
    name: "read_file",
    description: "Read a UTF-8 text file (e.g. a CV or job description) from disk.",
    schema: z.object({
      filePath: z.string().describe("Absolute or relative path to the file."),
    }),
  },
);
