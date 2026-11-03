import { NextResponse, type NextRequest } from "next/server";
import { queryOne, withTransaction } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";
import { academyStepLimit } from "@/lib/server/academy";

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const step = Number(body?.current_step);
  const needsAssistance = body?.needs_assistance === true;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isInteger(step) || step < 0 || step > 30) {
    return jsonError("Invalid academy progress.");
  }

  const enrollment = await queryOne<{ user_id: string }>(
    `select user_id from academy_enrollments where user_id = $1`,
    [user.id],
  );
  if (!enrollment) return jsonError("Redeem a BF2 recruit invitation to continue.", 403);
  const limit = await academyStepLimit(user.id);
  if (limit === null || step > limit) return jsonError("Complete the required identity and training steps before continuing.", 409);

  const result = await withTransaction(async (client) => {
    const content = await client.query<{ id: string; title: string }>(
      `select id, title from academy_content
       where slug = $1 and status = 'published'`,
      [slug],
    );
    const module = content.rows[0];
    if (!module) return { error: "This training section is not currently published.", status: 404 };

    await client.query(
      `insert into academy_progress (user_id, content_id, status, current_step, needs_assistance)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, content_id) do update set
         status = case when academy_progress.status = 'completed'
                       then 'completed' else excluded.status end,
         current_step = excluded.current_step,
         needs_assistance = academy_progress.needs_assistance or excluded.needs_assistance,
         updated_at = now()`,
      [
        user.id,
        module.id,
        needsAssistance ? "needs_assistance" : "in_progress",
        step,
        needsAssistance,
      ],
    );
    await client.query(
      `update academy_enrollments
       set current_step = greatest(current_step, $2)
       where user_id = $1`,
      [user.id, step],
    );

    if (needsAssistance) {
      await client.query(
        `insert into command_followups
           (user_id, issue_key, content_id, reason, assigned_to, created_by)
         values ($1, $2, $3, $4, (
           select assigned_officer from academy_enrollments where user_id = $1
         ), $1)
         on conflict (user_id, issue_key) where status <> 'resolved'
         do update set reason = excluded.reason, updated_at = now()`,
        [
          user.id,
          `academy:${slug}`,
          module.id,
          `Recruit requested help with ${module.title}.`,
        ],
      );
    }
    return { saved: true };
  });

  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json({ saved: true });
}
