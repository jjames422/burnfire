import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/server/http";
import type { GuideReactionsPayload, ReactionType } from "@/lib/api/types";

const REACTION_TYPES: ReactionType[] = ["fire", "skull", "heart", "clap"];

/** Public: reaction totals (plus the caller's own reactions when signed in). */
export async function GET(request: NextRequest) {
  const alliance = request.nextUrl.searchParams.get("alliance") ?? "";
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!alliance || !slug) return jsonError("Missing guide reference.");

  const user = await getSessionUser();
  const [countRows, ownRows] = await Promise.all([
    query<{ reaction_type: ReactionType; count: number }>(
      `select reaction_type, count from reactions where alliance = $1 and guide_slug = $2`,
      [alliance, slug],
    ),
    user
      ? query<{ reaction_type: ReactionType }>(
          `select reaction_type from guide_reactions
           where alliance = $1 and guide_slug = $2 and user_id = $3`,
          [alliance, slug, user.id],
        )
      : Promise.resolve([]),
  ]);

  const payload: GuideReactionsPayload = {
    counts: { fire: 0, skull: 0, heart: 0, clap: 0 },
    reacted: { fire: false, skull: false, heart: false, clap: false },
    signed_in: Boolean(user),
  };
  for (const row of countRows) payload.counts[row.reaction_type] = row.count;
  for (const row of ownRows) payload.reacted[row.reaction_type] = true;
  return NextResponse.json(payload);
}

/** Adds the caller's reaction (one per type per guide). */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const alliance = typeof body?.alliance === "string" ? body.alliance : "";
  const slug = typeof body?.guide_slug === "string" ? body.guide_slug : "";
  const type = body?.reaction_type as ReactionType;
  if (!alliance || !slug || !REACTION_TYPES.includes(type)) {
    return jsonError("Invalid reaction.");
  }

  try {
    await query(`select add_guide_reaction($1, $2, $3, $4)`, [
      user.id,
      alliance,
      slug,
      type,
    ]);
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "You already reacted."));
  }
  return NextResponse.json({ ok: true });
}
