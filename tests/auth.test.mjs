import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { logAuthFailure } from "../lib/auth/logging.ts";
import {
  configuredPortalOrigin, hashAuthToken, newAuthToken,
  safeReturnTo, trustedAuthOrigin, validAuthToken,
} from "../lib/auth/security.ts";

test("return paths preserve invite workflows and cannot escape the portal", () => {
  assert.equal(safeReturnTo("/academy/invite?token=abc-123"), "/academy/invite?token=abc-123");
  assert.equal(safeReturnTo("/command?tab=members#invite"), "/command?tab=members#invite");
  for (const value of [
    null, "", "https://evil.example", "//evil.example", "/\\evil.example",
    "/%2f%2fevil.example", "/%5cevil.example", "/\nevil", "/%0devil", "/auth/link",
    "/a/..//evil.example", "/.//evil.example", "/%2e%2e//evil.example",
    "javascript:alert(1)", " /portal",
  ]) assert.equal(safeReturnTo(value), "/portal", String(value));
});

test("tokens are cryptographically random, fixed length, and hashed at rest", () => {
  const first = newAuthToken();
  const second = newAuthToken();
  assert.equal(validAuthToken(first), true);
  assert.notEqual(first, second);
  assert.equal(hashAuthToken(first).length, 64);
  assert.notEqual(hashAuthToken(first), first);
  assert.equal(hashAuthToken(first), hashAuthToken(first));
  for (const value of [null, "", "a".repeat(42), "a".repeat(44), "/".repeat(43), " ".repeat(43)]) {
    assert.equal(validAuthToken(value), false);
  }
});

test("trusted origins are exact, canonical, and restrict local HTTP to development", () => {
  const previous = { node: process.env.NODE_ENV, portal: process.env.PORTAL_URL, public: process.env.NEXT_PUBLIC_PORTAL_URL };
  try {
    process.env.NODE_ENV = "production";
    process.env.PORTAL_URL = "https://portal.burnfire2.com";
    assert.equal(configuredPortalOrigin(), "https://portal.burnfire2.com");
    assert.equal(trustedAuthOrigin("https://portal.burnfire2.com"), "https://portal.burnfire2.com");
    assert.equal(trustedAuthOrigin("https://burnfire2.com"), "https://burnfire2.com");
    assert.equal(trustedAuthOrigin("https://www.burnfire2.com"), "https://www.burnfire2.com");
    for (const origin of [
      null, "null", "https://portal.burnfire2.com.evil.example", "https://evil.example",
      "http://portal.burnfire2.com", "https://portal.burnfire2.com/", "https://user@portal.burnfire2.com",
      "https://portal.burnfire2.com:444", "http://localhost:3000",
      "https://burnfire2.com.evil.example", "https://www.burnfire2.com.evil.example",
      "https://burnfire2.com:444", "http://burnfire2.com", "http://www.burnfire2.com",
      "https://burnfire2.com/", "https://user@burnfire2.com", "https://other.burnfire2.com",
    ]) assert.equal(trustedAuthOrigin(origin), null, String(origin));
    process.env.NODE_ENV = "development";
    assert.equal(trustedAuthOrigin("http://localhost:3000", "http://localhost:3000/api/auth/verify"), "http://localhost:3000");
    assert.equal(trustedAuthOrigin("http://127.0.0.1:3000", "http://127.0.0.1:3000/api/auth/verify"), "http://127.0.0.1:3000");
    assert.equal(trustedAuthOrigin("http://localhost:4000", "http://localhost:3000/api/auth/verify"), null);
    assert.equal(trustedAuthOrigin("http://localhost:3000"), null);
    assert.equal(trustedAuthOrigin("http://192.168.1.1:3000"), null);
    process.env.PORTAL_URL = "http://evil.example";
    assert.throws(configuredPortalOrigin);
    delete process.env.PORTAL_URL;
    process.env.NEXT_PUBLIC_PORTAL_URL = "https://portal.example.test";
    assert.equal(configuredPortalOrigin(), "https://portal.example.test");
  } finally {
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.node, PORTAL_URL: previous.portal, NEXT_PUBLIC_PORTAL_URL: previous.public,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("legacy origins never trust arbitrary request hosts", () => {
  assert.equal(trustedAuthOrigin("https://attacker.example", "https://attacker.example/api/auth/verify"), null);
  assert.equal(trustedAuthOrigin("https://burnfire2.com", "https://burnfire2.com/api/auth/verify"), "https://burnfire2.com");
  assert.equal(trustedAuthOrigin("https://www.burnfire2.com", "https://www.burnfire2.com/api/auth/verify"), "https://www.burnfire2.com");
});

test("auth failure logging emits only fixed context codes, never error payloads", () => {
  const logged = [];
  const previous = console.error;
  console.error = (...args) => logged.push(args);
  try {
    logAuthFailure("CODE_DELIVERY_FAILED", new Error("email=private@example.test token=secret code=123456"));
    logAuthFailure("LINK_CONSUMPTION_FAILED");
    logAuthFailure("token=secret");
    logAuthFailure("__proto__");
    assert.deepEqual(logged, [
      ["[auth] CODE_DELIVERY_FAILED"],
      ["[auth] LINK_CONSUMPTION_FAILED"],
      ["[auth] AUTH_OPERATION_FAILED"],
      ["[auth] AUTH_OPERATION_FAILED"],
    ]);
  } finally {
    console.error = previous;
  }
});

test("auth exception handlers record sanitized context before returning errors", async () => {
  const routes = {
    "request-code": "CODE_REQUEST_FAILED",
    verify: "CODE_VERIFICATION_FAILED",
    "request-link": "LINK_REQUEST_FAILED",
    "consume-link": "LINK_CONSUMPTION_FAILED",
    session: "SESSION_LOAD_FAILED",
    signout: "SIGNOUT_FAILED",
    "passkeys/[action]/[step]": "PASSKEY_VERIFICATION_FAILED",
  };
  for (const [route, code] of Object.entries(routes)) {
    const source = await readFile(new URL(`../app/api/auth/${route}/route.ts`, import.meta.url), "utf8");
    assert.ok(source.includes(`logAuthFailure("${code}")`), route);
    assert.doesNotMatch(source, /console\.(?:error|log)\(/);
  }
  const auth = await readFile(new URL("../lib/server/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /catch\s*\{\s*logAuthFailure\("CODE_DELIVERY_FAILED"\)/);
});
