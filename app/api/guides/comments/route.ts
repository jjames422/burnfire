import { NextResponse, type NextRequest } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/server/http";
import type { GuideCommentRow } from "@/lib/api/types";

/** Public: approved comments for a guide. */
export async function GET(request: NextRequest) {
  const alliance = request.nextUrl.searchParams.get("alliance") ?? "";
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!alliance || !slug) return jsonError("Missing guide reference.");

  const comments = await query<GuideCommentRow>(
    `select * from get_guide_comments($1, $2)`,
    [alliance, slug],
  );
  return NextResponse.json({ comments });
}

/** Signed-in members post comments under their community identity. */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const alliance = typeof body?.alliance === "string" ? body.alliance : "";
  const slug = typeof body?.guide_slug === "string" ? body.guide_slug : "";
  const text = typeof body?.body === "string" ? body.body : "";
  if (!alliance || !slug) return jsonError("Missing guide reference.");

  try {
    const row = await queryOne<{ post_guide_comment: string }>(
      `select post_guide_comment($1, $2, $3, $4)`,
      [user.id, alliance, slug, text],
    );
    return NextResponse.json({ comment_id: row?.post_guide_comment });
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "Comment could not be posted."));
  }
}
