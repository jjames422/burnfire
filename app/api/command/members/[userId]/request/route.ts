import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer } from "@/lib/server/command";
import { withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

type RouteContext = { params: Promise<{ userId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;
  if (!officer.is_site_admin) return jsonError("A site administrator must review this membership request.", 403);

  const { userId } = await params;
  if (!UUID.test(userId)) return jsonError("Member not found.", 404);
  const body = await request.json().catch(() => null);
  if (body?.confirmed !== true) return jsonError("Invalid request.");

  const result = await withTransaction(async (client) => {
    const request = await client.query<{ status: string }>(
      "select status from membership_requests where user_id = $1 for update", [userId],
    );
    if (!request.rowCount) return { error: "Member not found.", status: 404 };
    if (request.rows[0].status !== "pending") {
      return { error: "This request has already been reviewed.", status: 409 };
    }
    await client.query(
      `update membership_requests set status = 'rejected', reviewed_by = $2, reviewed_at = now()
       where user_id = $1`,
      [userId, user.id],
    );
    return { rejected: true };
  });

  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json(result);
}
