import { createHash, randomBytes } from "node:crypto";

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/portal";
  if (/[\u0000-\u0020\\]/.test(value)) return "/portal";
  try {
    const url = new URL(value, "https://portal.invalid");
    if (url.origin !== "https://portal.invalid" || url.pathname.startsWith("//") || url.pathname.startsWith("/auth")) return "/portal";
    // Reject encoded slashes/backslashes and controls before any downstream decoding.
    if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|20|7f)/i.test(value)) return "/portal";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/portal";
  }
}

function isLocalhost(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function configuredPortalOrigin(): string {
  const url = new URL(process.env.PORTAL_URL ?? process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.burnfire2.com");
  if (url.username || url.password || (url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && isLocalhost(url)))) {
    throw new Error("Portal origin must use HTTPS.");
  }
  return url.origin;
}

export function trustedAuthOrigin(origin: string | null, requestUrl?: string): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password) return null;
    if (origin === configuredPortalOrigin()) return origin;
    if (origin === "https://burnfire2.com" || origin === "https://www.burnfire2.com") return origin;
    if (process.env.NODE_ENV !== "production" && isLocalhost(url) &&
        (url.protocol === "http:" || url.protocol === "https:") &&
        requestUrl && new URL(requestUrl).origin === origin) return origin;
  } catch {
    return null;
  }
  return null;
}

export function newAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

export function validAuthToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
