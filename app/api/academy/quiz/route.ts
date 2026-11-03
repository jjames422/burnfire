import { NextResponse, type NextRequest } from "next/server";
import { scoreQuiz } from "@/lib/academy/quiz-score";
import { queryOne, withTransaction } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";

type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const answers =
    body?.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !answers) {
    return jsonError("Submit answers for a valid training section.");
  }

  const enrolled = await queryOne<{ user_id: string }>(
    `select user_id from academy_enrollments where user_id = $1`,
    [user.id],
  );
  if (!enrolled) return jsonError("Redeem a BF2 recruit invitation to continue.", 403);

  const result = await withTransaction(async (client) => {
    const contentResult = await client.query<{ id: string; title: string }>(
      `select id, title from academy_content where slug = $1 and status = 'published'`,
      [slug],
    );
    const content = contentResult.rows[0];
    if (!content) return { error: "This training section is not currently published.", status: 404 };

    const questionResult = await client.query<QuizQuestion>(
      `select id, prompt, options, correct_index, explanation
       from academy_questions where content_id = $1 order by sort_order, id`,
      [content.id],
    );
    const questions = questionResult.rows;
    if (questions.length === 0) return { error: "This section has no published knowledge check.", status: 409 };

    const score = scoreQuiz(questions, answers);
    if (!score) {
      return { error: "Answer every question in this knowledge check.", status: 400 };
    }

    const { correctCount, questionCount, passed, answers: storedAnswers } = score;

    await client.query(
      `insert into academy_quiz_attempts
         (user_id, content_id, answers, correct_count, question_count, passed)
       values ($1, $2, $3::jsonb, $4, $5, $6)`,
      [
        user.id,
        content.id,
        JSON.stringify(storedAnswers),
        correctCount,
        questionCount,
        passed,
      ],
    );
    await client.query(
      `insert into academy_progress (user_id, content_id, status, needs_assistance)
       values ($1, $2, $3, $4)
       on conflict (user_id, content_id) do update set
         status = case when academy_progress.status = 'completed'
                       then 'completed' else excluded.status end,
         needs_assistance = academy_progress.needs_assistance or excluded.needs_assistance,
         updated_at = now()`,
      [user.id, content.id, passed ? "in_progress" : "needs_assistance", !passed],
    );
    if (!passed) {
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
          `quiz:${slug}`,
          content.id,
          `Knowledge check not passed for ${content.title}.`,
        ],
      );
    }

    return {
      passed,
      correct_count: correctCount,
      question_count: questionCount,
      results: questions.map((question) => ({
        id: question.id,
        correct: storedAnswers[question.id] === question.correct_index,
        correct_index: question.correct_index,
        explanation: question.explanation,
      })),
    };
  });

  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json(result);
}
