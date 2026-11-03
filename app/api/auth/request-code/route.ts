import { NextResponse, type NextRequest } from "next/server";
import { requestLoginCode } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const { error } = await requestLoginCode(email);
  if (error) return jsonError(error);
  return NextResponse.json({ sent: true });
}
