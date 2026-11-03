import { NextResponse, type NextRequest } from "next/server";
import { queryOne } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const currentStep = Number(body?.current_step);
  if (!Number.isInteger(currentStep) || currentStep < 0 || currentStep > 20) {
    return jsonError("Invalid orientation step.");
  }
  const enrollment = await queryOne<{ current_step: number }>(
    `update academy_enrollments set current_step = $2
     where user_id = $1 returning current_step`,
    [user.id, currentStep],
  );
  if (!enrollment) return jsonError("Redeem a BF2 recruit invitation to continue.", 403);
  return NextResponse.json({ current_step: enrollment.current_step });
}
