export type ScorableQuestion = { id: string; correct_index: number };

export type QuizScore = {
  correctCount: number;
  questionCount: number;
  passed: boolean;
  answers: Record<string, number>;
};

export const QUIZ_PASSING_RATIO = 0.8;

export function scoreQuiz(
  questions: ScorableQuestion[],
  submitted: Record<string, unknown>,
): QuizScore | null {
  if (questions.length === 0) return null;
  const validIds = new Set(questions.map((question) => question.id));
  const entries = Object.entries(submitted);
  if (
    entries.length !== questions.length ||
    entries.some(([id, answer]) => !validIds.has(id) || !Number.isInteger(answer))
  ) {
    return null;
  }

  const answers: Record<string, number> = {};
  for (const [id, answer] of entries) answers[id] = Number(answer);
  const correctCount = questions.reduce(
    (count, question) => count + Number(answers[question.id] === question.correct_index),
    0,
  );
  return {
    correctCount,
    questionCount: questions.length,
    passed: correctCount >= Math.ceil(questions.length * QUIZ_PASSING_RATIO),
    answers,
  };
}
