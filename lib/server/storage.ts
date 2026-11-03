import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Local file storage for chat attachments. Files live outside public/ and
 * are only served through the authenticated /api/attachments route.
 */

const STORAGE_ROOT = process.env.BURNFIRE_STORAGE_DIR
  ? path.resolve(process.env.BURNFIRE_STORAGE_DIR)
  : path.join(process.cwd(), "storage");

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
]);

function resolveSafe(relativePath: string): string {
  const absolute = path.resolve(STORAGE_ROOT, relativePath);
  if (!absolute.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("Invalid storage path");
  }
  return absolute;
}

/** Persists an uploaded file and returns its storage-relative path. */
export async function saveChatAttachment(
  uploaderId: string,
  file: File,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "file";
  const relative = path.join("chat-attachments", uploaderId, `${randomUUID()}-${safeName}`);
  const absolute = resolveSafe(relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()));
  return relative;
}

export async function deleteStoredFile(relativePath: string): Promise<void> {
  try {
    await unlink(resolveSafe(relativePath));
  } catch {
    // Already gone — nothing to clean up.
  }
}

/** Opens a stored file as a web stream for a Response body. */
export async function openStoredFile(
  relativePath: string,
): Promise<{ stream: ReadableStream; size: number } | null> {
  const absolute = resolveSafe(relativePath);
  try {
    const info = await stat(absolute);
    return {
      stream: Readable.toWeb(createReadStream(absolute)) as ReadableStream,
      size: info.size,
    };
  } catch {
    return null;
  }
}
