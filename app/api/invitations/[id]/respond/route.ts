import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/server/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: invitationId } = await params;

  const body = await request.json().catch(() => null);
  const accept = Boolean(body?.accept);
  try {
    await query(`select respond_to_alliance_invitation($1, $2, $3)`, [
      user.id,
      invitationId,
      accept,
    ]);
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "Invitation could not be processed."));
  }
  return NextResponse.json({ ok: true });
}
