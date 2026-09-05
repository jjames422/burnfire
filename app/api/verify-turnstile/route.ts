import { NextResponse } from "next/server";

/**
 * The one server-side piece of the comments feature. Holds no Supabase
 * credentials — the browser still inserts the comment directly with the
 * anon key after this confirms the Turnstile token is real. Secret key is
 * server-only (never NEXT_PUBLIC_), so it never reaches the client bundle.
 */
export async function POST(request: Request) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ success: false, error: "Turnstile is not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const token = body?.token;

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ success: false, error: "Missing token" }, { status: 400 });
  }

  const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: secretKey, response: token }),
  });

  const result = await verifyResponse.json();

  return NextResponse.json({ success: Boolean(result.success) });
}
