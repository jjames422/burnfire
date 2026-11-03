import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const enrolled = await queryOne<{ user_id: string }>(
    `select user_id from academy_enrollments where user_id = $1`,
    [user.id],
  );
  if (!enrolled) return jsonError("Redeem a BF2 recruit invitation to read alliance announcements.", 403);

  const announcements = await query(
    `select c.id, c.slug, c.version, c.title, c.body, c.published_at,
            c.required, a.acknowledged_at
     from academy_content c
     left join academy_acknowledgments a on a.user_id = $1 and a.content_id = c.id
     where c.content_type = 'announcement' and c.status = 'published'
     order by c.published_at desc nulls last, c.slug`,
    [user.id],
  );
  return NextResponse.json({ announcements });
}
