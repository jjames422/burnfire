import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";

type AcademyContentRow = {
  id: string;
  slug: string;
  version: number;
  content_type: "rule" | "module" | "announcement";
  title: string;
  body: string;
  required: boolean;
  verification_status: "verified" | "leadership_review";
  progress_status: "not_started" | "in_progress" | "completed" | "needs_assistance";
  current_step: number;
  acknowledged_at: string | null;
  latest_quiz_passed: boolean | null;
  questions: {
    id: string;
    slug: string;
    prompt: string;
    options: string[];
    sort_order: number;
  }[];
};

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const enrollment = await queryOne<{
    in_game_name: string;
    communication_preference: "external_chat" | "website" | "both" | null;
    alliance_mail_help: boolean | null;
    officer_interest: "yes" | "later" | "no" | null;
    current_step: number;
    completed_at: string | null;
  }>(
    `select p.in_game_name, e.communication_preference, e.alliance_mail_help,
            e.officer_interest, e.current_step, e.completed_at
     from academy_enrollments e join profiles p on p.id = e.user_id
     where e.user_id = $1`,
    [user.id],
  );
  if (!enrollment) return jsonError("Redeem a BF2 recruit invitation to access the academy.", 403);

  const content = await query<AcademyContentRow>(
    `select c.id, c.slug, c.version, c.content_type, c.title, c.body,
            c.required, c.verification_status,
            coalesce(p.status, 'not_started') as progress_status,
            coalesce(p.current_step, 0) as current_step,
            a.acknowledged_at,
            latest.passed as latest_quiz_passed,
            coalesce(
              jsonb_agg(jsonb_build_object(
                'id', q.id, 'slug', q.slug, 'prompt', q.prompt,
                'options', q.options, 'sort_order', q.sort_order
              ) order by q.sort_order) filter (where q.id is not null),
              '[]'::jsonb
            ) as questions
     from academy_content c
     left join academy_progress p on p.content_id = c.id and p.user_id = $1
     left join academy_acknowledgments a on a.content_id = c.id and a.user_id = $1
     left join academy_questions q on q.content_id = c.id
     left join lateral (
       select passed from academy_quiz_attempts attempt
       where attempt.user_id = $1 and attempt.content_id = c.id
       order by attempt.created_at desc limit 1
     ) latest on true
     where c.status = 'published' and c.content_type in ('rule', 'module')
     group by c.id, p.status, p.current_step, a.acknowledged_at
              , latest.passed
     order by case c.content_type when 'rule' then 0 else 1 end, c.slug`,
    [user.id],
  );

  return NextResponse.json({ enrollment, content });
}
