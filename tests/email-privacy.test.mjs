import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

process.env.EMAIL_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
const { decryptEmail, emailIndex, encryptEmail, maskEmail } = await import("../lib/server/email-privacy.ts");

test("email addresses are encrypted, indexed case-insensitively, and masked", () => {
  const email = "Frankster1030@Gmail.com";
  const stored = encryptEmail(email);
  assert.ok(!stored.toLowerCase().includes("frankster"), "Ciphertext does not reveal the address");
  assert.notEqual(encryptEmail(email), stored, "Each encryption uses a fresh nonce");
  assert.equal(decryptEmail(stored), "frankster1030@gmail.com");
  assert.equal(emailIndex(email), emailIndex(" frankster1030@gmail.com "));
  assert.notEqual(emailIndex(email), emailIndex("frankster1031@gmail.com"));
  assert.match(emailIndex(email), /^[0-9a-f]{64}$/);
  assert.equal(maskEmail(email), "f•••@gmail.com");

  const [version, payload] = stored.split(".");
  const tampered = Buffer.from(payload, "base64url");
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptEmail(`${version}.${tampered.toString("base64url")}`), "Tampered ciphertext is rejected");
});
