import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { FileReadError } from "./read-file.js";

/**
 * Reads a CV or job description from disk and returns its plain text, supporting
 * Markdown/plain text, PDF, and Word (.docx). Parsing is split from disk access
 * (`extractTextFromBuffer`) so a future HTTP API can reuse it on uploaded bytes
 * without touching the filesystem.
 */

export const SUPPORTED_DOC_EXTENSIONS = [".md", ".markdown", ".txt", ".pdf", ".docx"] as const;

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Extract plain text from a document buffer, dispatching on extension. Markdown,
 * plain text, and unknown text-like extensions are decoded as UTF-8.
 */
export async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string> {
  switch (ext.toLowerCase()) {
    case ".pdf":
      return extractPdf(buffer);
    case ".docx":
      return extractDocx(buffer);
    case ".doc":
      throw new Error("Legacy .doc files are not supported — export as .docx or PDF.");
    default:
      return buffer.toString("utf-8");
  }
}

/** Read a document from disk and return its extracted, non-empty plain text. */
export async function readDocument(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolved);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new FileReadError(`File not found: ${resolved}`, resolved);
    if (code === "EISDIR") throw new FileReadError(`Expected a file but got a directory: ${resolved}`, resolved);
    throw new FileReadError(`Could not read file: ${resolved} (${code ?? "unknown error"})`, resolved);
  }

  let text: string;
  try {
    text = (await extractTextFromBuffer(buffer, path.extname(resolved))).trim();
  } catch (err) {
    throw new FileReadError(`Could not extract text from ${resolved}: ${(err as Error).message}`, resolved);
  }
  if (text.length === 0) {
    throw new FileReadError(`No text could be extracted from: ${resolved}`, resolved);
  }
  return text;
}
