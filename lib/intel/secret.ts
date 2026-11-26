import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time bearer check for machine endpoints. Short secrets are refused outright. */
export function secretMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(secret));
}
