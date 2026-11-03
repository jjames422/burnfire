import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer } from "@/lib/server/command";
import { query, withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

type QuestionInput = {
  slug: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  sort_order: number;
};

const CONTENT_TYPES = new Set(["rule", "module", "announcement"]);
const REVIEW_STATES = new Set(["verified", "leadership_review"]);

function isQuestion(value: unknown): value is QuestionInput {
  if (!value || typeof value !== "object") return false;
  const question = value as Partial<QuestionInput>;
  return (
    typeof question.slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(question.slug) &&
    typeof question.prompt === "string" &&
    question.prompt.trim().length > 0 &&
    question.prompt.length <= 1000 &&
    Array.isArray(question.options) &&
    question.options.length >= 2 &&
    question.options.length <= 8 &&
    question.options.every((option) => typeof option === "string" && option.trim().length > 0 && option.length <= 500) &&
    Number.isInteger(question.correct_index) &&
    Number(question.correct_index) >= 0 &&
    Number(question.correct_index) < question.options.length &&
    typeof question.explanation === "string" &&
    question.explanation.trim().length > 0 &&
    question.explanation.length <= 1000 &&
    Number.isInteger(question.sort_order) &&
    Number(question.sort_order) >= 0
  );
}

export async function GET() {
  const { response } = await requireCommandOfficer("r4");
  if (response) return response;
  const content = await query(
    `select c.id, c.slug, c.version, c.content_type, c.title, c.body, c.required,
            c.status, c.verification_status, c.created_at, c.published_at,
            coalesce(jsonb_agg(jsonb_build_object(
              'slug', q.slug, 'prompt', q.prompt, 'options', q.options,
              'correct_index', q.correct_index, 'explanation', q.explanation,
              'sort_order', q.sort_order
            ) order by q.sort_order) filter (where q.id is not null), '[]'::jsonb) as questions
     from academy_content c
     left join academy_questions q on q.content_id = c.id
     group by c.id
     order by c.slug, c.version desc`,
  );
  return NextResponse.json({ content });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireCommandOfficer("r4");
  if (response) return response;
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const contentBody = typeof body?.body === "string" ? body.body.trim() : "";
  const contentType = typeof body?.content_type === "string" ? body.content_type : "";
  const verificationStatus =
    typeof body?.verification_status === "string" ? body.verification_status : "verified";
  const required = body?.required === true;
  const id = typeof body?.id === "string" ? body.id : null;
  const questions = body?.questions;

  if (action === "publish") {
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Select a draft to publish.");
    const published = await withTransaction(async (client) => {
      const draftResult = await client.query<{ slug: string; status: string; verification_status: string; content_type: string; required: boolean }>(
        `select slug, status, verification_status, content_type, required
         from academy_content where id = $1 for update`,
        [id],
      );
      const draft = draftResult.rows[0];
      if (!draft || draft.status !== "draft") {
        return { error: "Only a saved draft can be published.", status: 409 };
      }
      if (draft.verification_status !== "verified") {
        return { error: "Complete leadership review before publishing this content.", status: 409 };
      }
      if (draft.required && ["rule", "module"].includes(draft.content_type)) {
        const questions = await client.query(
          `select 1 from academy_questions where content_id = $1 limit 1`,
          [id],
        );
        if (!questions.rowCount) {
          return { error: "Required training needs a knowledge check before publication.", status: 409 };
        }
      }
      await client.query(
        `select id from academy_content where slug = $1 for update`,
        [draft.slug],
      );
      await client.query(
        `update academy_content set status = 'retired'
         where slug = $1 and status = 'published'`,
        [draft.slug],
      );
      await client.query(
        `update academy_content set status = 'published', published_by = $2, published_at = now()
         where id = $1`,
        [id, user.id],
      );
      return { published: true };
    });
    if ("error" in published && published.error) return jsonError(published.error, published.status ?? 400);
    return NextResponse.json(published);
  }

  if (action !== "save") return jsonError("Choose save or publish.");
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    title.length < 1 ||
    title.length > 160 ||
    contentBody.length < 1 ||
    contentBody.length > 30000 ||
    !CONTENT_TYPES.has(contentType) ||
    !REVIEW_STATES.has(verificationStatus) ||
    (questions !== undefined &&
      (!Array.isArray(questions) || !questions.every(isQuestion) ||
        new Set(questions.map((question) => question.slug)).size !== questions.length))
  ) {
    return jsonError("Review the content fields and try again.");
  }

  const saved = await withTransaction(async (client) => {
    let contentId = id;
    if (contentId) {
      const draft = await client.query<{ id: string }>(
        `select id from academy_content where id = $1 and status = 'draft' for update`,
        [contentId],
      );
      if (!draft.rows[0]) return { error: "Only drafts can be edited.", status: 409 };
      await client.query(
        `update academy_content set slug = $2, content_type = $3, title = $4, body = $5,
           required = $6, verification_status = $7
         where id = $1`,
        [contentId, slug, contentType, title, contentBody, required, verificationStatus],
      );
    } else {
      const current = await client.query<{ version: number; id: string }>(
        `select version, id from academy_content where slug = $1
         order by version desc limit 1 for update`,
        [slug],
      );
      const version = (current.rows[0]?.version ?? 0) + 1;
      const inserted = await client.query<{ id: string }>(
        `insert into academy_content
           (slug, version, content_type, title, body, required, status,
            verification_status, created_by)
         values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8)
         returning id`,
        [slug, version, contentType, title, contentBody, required, verificationStatus, user.id],
      );
      contentId = inserted.rows[0].id;
      const source = current.rows[0];
      if (source) {
        await client.query(
          `insert into academy_questions
             (content_id, slug, prompt, options, correct_index, explanation, sort_order)
           select $1, slug, prompt, options, correct_index, explanation, sort_order
           from academy_questions where content_id = $2`,
          [contentId, source.id],
        );
      }
    }

    if (Array.isArray(questions)) {
      await client.query(`delete from academy_questions where content_id = $1`, [contentId]);
      for (const question of questions as QuestionInput[]) {
        await client.query(
          `insert into academy_questions
             (content_id, slug, prompt, options, correct_index, explanation, sort_order)
           values ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
          [
            contentId,
            question.slug,
            question.prompt.trim(),
            JSON.stringify(question.options),
            question.correct_index,
            question.explanation.trim(),
            question.sort_order,
          ],
        );
      }
    }
    return { id: contentId };
  });

  if ("error" in saved && saved.error) return jsonError(saved.error, saved.status ?? 400);
  return NextResponse.json({ id: saved.id });
}
