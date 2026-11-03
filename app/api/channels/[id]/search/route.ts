import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";
import type { SearchResultRow } from "@/lib/api/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: channelId } = await params;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return jsonError("Enter at least two characters to search.");

  const results = await query<SearchResultRow>(
    `select * from search_channel_messages($1, $2, $3)`,
    [user.id, channelId, q],
  );
  return NextResponse.json({ results });
}
