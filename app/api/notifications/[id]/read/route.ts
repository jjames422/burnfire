import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { requireUser } from "@/lib/server/http";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: notificationId } = await params;

  await query(`select mark_notification_read($1, $2)`, [user.id, notificationId]);
  return NextResponse.json({ ok: true });
}
