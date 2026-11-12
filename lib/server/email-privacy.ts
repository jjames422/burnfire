import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Email addresses are never stored in plaintext.
 *
 * - `emailIndex` is a keyed HMAC-SHA256 "blind index": deterministic, so
 *   sign-in can find an account by the address the user types, but useless
 *   for recovering the address without the server key.
 * - `encryptEmail` / `decryptEmail` use AES-256-GCM so a member can be shown
 *   their own address. Other members' addresses are never decrypted for
 *   display.
 *
 * Both keys are derived from EMAIL_ENCRYPTION_KEY (32 random bytes, base64).
 * Losing that key makes every stored address unrecoverable AND breaks
 * sign-in to existing accounts, so it must be backed up outside the server.
 */

const VERSION = "v1";

/** Server configuration/integrity failure; never shown to members. */
class EmailPrivacyError extends Error {}
let keys: { encryption: Buffer; index: Buffer } | null = null;

function derivedKeys(): { encryption: Buffer; index: Buffer } {
  if (keys) return keys;
  const raw = process.env.EMAIL_ENCRYPTION_KEY ?? "";
  const root = Buffer.from(raw, "base64");
  if (root.length !== 32) {
    throw new EmailPrivacyError("EMAIL_ENCRYPTION_KEY must be 32 random bytes encoded as base64.");
  }
  const derive = (info: string) =>
    Buffer.from(hkdfSync("sha256", root, "burnfire-email-privacy", info, 32));
  keys = { encryption: derive("aes-256-gcm"), index: derive("hmac-sha256-index") };
  return keys;
}

/** Normalizes an address the same way for indexing everywhere. */
export function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deterministic, keyed lookup value for an address (hex). */
export function emailIndex(email: string): string {
  return createHmac("sha256", derivedKeys().index).update(canonicalEmail(email)).digest("hex");
}

/** Encrypts an address for storage: `v1.<base64url(iv | tag | ciphertext)>`. */
export function encryptEmail(email: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKeys().encryption, iv);
  const ciphertext = Buffer.concat([cipher.update(canonicalEmail(email), "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

export function decryptEmail(stored: string): string {
  const [version, payload] = stored.split(".", 2);
  if (version !== VERSION || !payload) throw new EmailPrivacyError("Unsupported email ciphertext.");
  const data = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", derivedKeys().encryption, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

/** A hint such as `f•••@gmail.com` — enough to tell invitations apart. */
export function maskEmail(email: string): string {
  const [local, domain] = canonicalEmail(email).split("@");
  return `${local.slice(0, 1)}•••@${domain ?? ""}`;
}
