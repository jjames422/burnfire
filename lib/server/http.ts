import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./auth";

/** JSON error response with a user-presentable message. */
export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Resolves the acting user for an API route. Returns a ready-to-send 401
 * response when nobody is signed in.
 */
export async function requireUser(): Promise<
  { user: SessionUser; response?: undefined } | { user?: undefined; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to continue.", 401) };
  return { user };
}

/**
 * Converts thrown database errors (raise exception in db/schema.sql
 * functions) into client-facing messages.
 */
export function databaseErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    // plpgsql `raise exception` messages are written for end users.
    if (/^[A-Z]/.test(message) && message.length <= 120 && !message.includes("\n")) {
      return message;
    }
  }
  return fallback;
}
