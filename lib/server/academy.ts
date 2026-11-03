import { queryOne } from "./db";

export async function academyStepLimit(userId: string): Promise<number | null> {
  const row = await queryOne<{ step_limit: number }>(
    `select case when nullif(trim(e.game_identifier), '') is null then 1
                 when e.communication_preference is null then 2
                 else coalesce((
                   select min(ordered.position)::int + 2
                   from (
                     select c.id, c.required,
                       row_number() over (
                         order by case c.content_type when 'rule' then 0 else 1 end, c.slug
                       ) as position
                     from academy_content c
                     where c.status = 'published' and c.content_type in ('rule', 'module')
                   ) ordered
                   left join academy_acknowledgments a on a.content_id = ordered.id and a.user_id = e.user_id
                   where ordered.required and a.user_id is null
                 ), (select count(*)::int + 3 from academy_content
                     where status = 'published' and content_type in ('rule', 'module')))
            end as step_limit
     from academy_enrollments e where e.user_id = $1`,
    [userId],
  );
  return row?.step_limit ?? null;
}
