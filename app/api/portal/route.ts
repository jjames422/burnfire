import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/http";
import { queryOne } from "@/lib/server/db";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const access = await queryOne(
    `select p.in_game_name, am.game_rank, am.verified_at,
            is_platform_admin(p.id) as is_site_admin,
            e.user_id is not null as enrolled,
            e.completed_at, e.identity_status,
            (select count(*)::int from academy_acknowledgments a
             join academy_content c on c.id = a.content_id
             where a.user_id = p.id and c.status = 'published' and c.required
               and c.content_type in ('rule', 'module')) as completed_sections,
            (select count(*)::int from academy_content
             where status = 'published' and required
               and content_type in ('rule', 'module')) as total_sections
     from profiles p
     left join alliance_members am on am.user_id = p.id and am.alliance = 'burnfire'
     left join academy_enrollments e on e.user_id = p.id
     where p.id = $1`,
    [user.id],
  );
  return NextResponse.json({ access }, { headers: { "Cache-Control": "private, no-store" } });
}
