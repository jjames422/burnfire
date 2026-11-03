import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasOfficerAccess } from "../lib/command/access.ts";
import { scoreQuiz } from "../lib/academy/quiz-score.ts";

test("officer authorization follows the verified alliance rank hierarchy", () => {
  assert.equal(hasOfficerAccess("r1", "r3"), false);
  assert.equal(hasOfficerAccess("r2", "r3"), false);
  assert.equal(hasOfficerAccess("r3", "r3"), true);
  assert.equal(hasOfficerAccess("r3", "r4"), false);
  assert.equal(hasOfficerAccess("r4", "r4"), true);
  assert.equal(hasOfficerAccess("r5", "r4"), true);
  assert.equal(hasOfficerAccess(null, "r3"), false);
});

test("quiz scoring requires a complete answer set and the 80 percent threshold", () => {
  const questions = [
    { id: "q1", correct_index: 0 },
    { id: "q2", correct_index: 1 },
    { id: "q3", correct_index: 2 },
    { id: "q4", correct_index: 0 },
    { id: "q5", correct_index: 1 },
  ];

  assert.equal(
    scoreQuiz(questions, { q1: 0, q2: 1, q3: 2, q4: 0, q5: 0 })?.passed,
    true,
  );
  assert.equal(
    scoreQuiz(questions, { q1: 0, q2: 1, q3: 2, q4: 1, q5: 0 })?.passed,
    false,
  );
  assert.equal(scoreQuiz(questions, { q1: 0 }), null);
  assert.equal(scoreQuiz(questions, { q1: 0, q2: 1, q3: 2, q4: 0, qx: 1 }), null);
  assert.equal(scoreQuiz([], {}), null);
});

test("seeded curriculum keeps the required rules and policy values", async () => {
  const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  const start = schema.indexOf("insert into academy_content");
  const end = schema.indexOf("on conflict (slug, version)", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const seed = schema.slice(start, end);

  assert.equal([...seed.matchAll(/\('rule-\d{2}-/g)].length, 12);
  assert.match(seed, /3,200/);
  assert.match(seed, /Diamonds and real-money purchases are never required/);
  assert.match(seed, /already been hit twice/);
  assert.match(seed, /leadership_review/);
});
