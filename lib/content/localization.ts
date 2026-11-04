import { createHash } from "node:crypto";

export function contentSourceHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function isTranslationFresh(source: string, snapshotHash: unknown): snapshotHash is string {
  return typeof snapshotHash === "string" && contentSourceHash(source) === snapshotHash;
}
