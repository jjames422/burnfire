import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { requireUser } from "@/lib/server/http";
import type { MentionCandidate } from "@/lib/api/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: channelId } = await params;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const candidates = await query<MentionCandidate>(
    `select * from get_channel_mention_candidates($1, $2, $3, 8)`,
    [user.id, channelId, q],
  );
  return NextResponse.json({ candidates });
}
