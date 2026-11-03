import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/http";
import { query, queryOne } from "@/lib/server/db";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const access = await queryOne<{ is_site_admin: boolean }>(
    `select p.in_game_name, am.game_rank, am.verified_at,
            is_platform_admin(p.id) as is_site_admin,
            e.user_id is not null as enrolled,
            e.completed_at, e.identity_status, e.game_identifier,
            (am.user_id is null and e.invitation_id is null) as can_request_rank,
            mr.requested_rank, mr.requested_title, mr.status as request_status,
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
     left join membership_requests mr on mr.user_id = p.id
     where p.id = $1`,
    [user.id],
  );
  const tasks = access?.is_site_admin ? await query(
    `select u.id as user_id, coalesce(p.in_game_name, 'Profile not completed') as in_game_name, u.email,
            r.requested_rank, r.requested_title, u.created_at
     from users u left join profiles p on p.id = u.id
     left join membership_requests r on r.user_id = u.id
     left join alliance_members am on am.user_id = u.id
     where not is_platform_admin(u.id) and (am.user_id is null or am.alliance = 'burnfire')
       and (r.status = 'pending' or (am.verified_at is null and r.user_id is null))
     order by u.created_at`,
  ) : [];
  const summary = access?.is_site_admin ? await queryOne(
    `select (select count(*)::int from users) as total_accounts,
            (select count(*)::int from users u
             left join membership_requests r on r.user_id = u.id
             left join alliance_members am on am.user_id = u.id
             where not is_platform_admin(u.id) and (am.user_id is null or am.alliance = 'burnfire')
               and (r.status = 'pending' or (am.verified_at is null and r.user_id is null))) as pending_approvals,
            (select count(*)::int from users u left join profiles p on p.id = u.id where p.id is null) as incomplete_profiles`,
  ) : null;
  return NextResponse.json({ access, tasks, summary }, { headers: { "Cache-Control": "private, no-store" } });
}
