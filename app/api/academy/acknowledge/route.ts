import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/http";
import { jsonError } from "@/lib/server/http";
import { withTransaction } from "@/lib/server/db";

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return jsonError("Select a valid training section.");
  }

  const result = await withTransaction(async (client) => {
    const enrolled = await client.query(
      `select 1 from academy_enrollments where user_id = $1 for update`,
      [user.id],
    );
    if (!enrolled.rowCount) return { error: "Redeem a BF2 recruit invitation to continue.", status: 403 };

    const contentResult = await client.query<{ id: string }>(
      `select id from academy_content where slug = $1 and status = 'published'`,
      [slug],
    );
    const content = contentResult.rows[0];
    if (!content) return { error: "This training section is not currently published.", status: 404 };

    const questions = await client.query(
      `select 1 from academy_questions where content_id = $1 limit 1`,
      [content.id],
    );
    if (questions.rowCount) {
      const passed = await client.query(
        `select 1 from academy_quiz_attempts
         where user_id = $1 and content_id = $2 and passed
         limit 1`,
        [user.id, content.id],
      );
      if (!passed.rowCount) {
        return { error: "Complete and pass this section's knowledge check before acknowledging it.", status: 409 };
      }
    }

    const inserted = await client.query(
      `insert into academy_acknowledgments (user_id, content_id)
       values ($1, $2) on conflict do nothing returning user_id`,
      [user.id, content.id],
    );
    if (!inserted.rowCount) {
      return { error: "You have already acknowledged this version.", status: 409 };
    }

    await client.query(
      `insert into academy_progress (user_id, content_id, status, completed_at)
       values ($1, $2, 'completed', now())
       on conflict (user_id, content_id) do update set
         status = 'completed', completed_at = coalesce(academy_progress.completed_at, now()),
         updated_at = now()`,
      [user.id, content.id],
    );

    const completion = await client.query<{ done: boolean }>(
      `select not exists (
         select 1 from academy_content c
         left join academy_acknowledgments a
           on a.content_id = c.id and a.user_id = $1
         where c.status = 'published' and c.required
           and c.content_type in ('rule', 'module') and a.user_id is null
       ) and exists (
         select 1 from academy_enrollments e
         where e.user_id = $1 and e.officer_interest is not null
       ) as done`,
      [user.id],
    );
    if (completion.rows[0]?.done) {
      await client.query(
        `update academy_enrollments set completed_at = coalesce(completed_at, now())
         where user_id = $1`,
        [user.id],
      );
    }
    return { acknowledged: true, onboarding_complete: completion.rows[0]?.done ?? false };
  });

  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json(result);
}
