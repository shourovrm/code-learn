import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../src/app.js";
import type { LearnerEvent } from "../src/learner.js";
import * as store from "../src/store.js";
import { quizQuestions } from "./quiz-fixture.js";
import { tempDir } from "./temp.js";
import { lessonText } from "./lesson-fixture.js";

/** A trackless quiz course, so lessons and exercises save without installing anything. */
const roadmap = JSON.stringify({ goal: "Judgment", style: "quiz", concepts: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });

let ws: string;
beforeEach(async () => {
  vi.stubEnv("CODE_LEARN_HOME", tempDir());
  ws = tempDir();
  await app.saveRoadmap(ws, "quiz", roadmap);
});
afterEach(() => vi.unstubAllEnvs());

const lesson = (id: string, concept: string) => ({ id, concept, title: `About ${id}`, markdown: lessonText(`# ${id}\n\nText.`) });
const quiz = (slug: string, concepts: string[]) => ({
  "exercise.yaml": JSON.stringify({ slug, style: "quiz", concepts, difficulty: 1 }),
  "README.md": "# A decision\n\nChoose what to do.",
  "quiz.yaml": JSON.stringify({ questions: quizQuestions(slug) }),
});
const failed = (exercise: string): LearnerEvent => ({ format_version: 1, kind: "check", at: new Date().toISOString(), exercise, concepts: ["a"], difficulty: 1, passed: 0, total: 5, assisted: false });

describe("rebuildTopics", () => {
  it.each([true, false])("refuses a topic outside the roadmap and an empty selection (replace %s)", async (replace) => {
    await expect(app.rebuildTopics(ws, "quiz", ["nope"], { replace })).rejects.toThrow(/not in the roadmap/);
    await expect(app.rebuildTopics(ws, "quiz", [], { replace })).rejects.toThrow(/at least one topic/);
  });

  it("with replace, removes the selected topics' lessons and the exercises only they cover, with their learner files", async () => {
    await app.saveLesson(ws, lesson("a-intro", "a"));
    await app.saveLesson(ws, lesson("b-intro", "b"));
    await app.saveExercise(ws, quiz("a-only", ["a"]));
    await app.saveExercise(ws, quiz("a-and-b", ["a", "b"]));
    await app.rebuildTopics(ws, "quiz", ["a"], { replace: true });
    expect(app.listLessons(ws).map((l) => l.id)).toEqual(["b-intro"]);
    expect(store.listExercises("quiz").map((e) => e.slug)).toEqual(["a-and-b"]);
    expect(existsSync(join(ws, "exercises/quiz/a-only"))).toBe(false);
    expect(existsSync(join(ws, "exercises/quiz/a-and-b/answers.yaml"))).toBe(true);
  });

  it("with replace, restarts the topic's progress with a rebuild event and keeps the earlier events", async () => {
    await app.saveExercise(ws, quiz("a-only", ["a"]));
    store.appendEvent("quiz", failed("a-only"));
    store.appendEvent("quiz", failed("a-only"));
    expect(app.nextStep(ws)).toMatchObject({ kind: "stuck", concept: "a" });
    const earlier = store.readEvents("quiz");
    await app.rebuildTopics(ws, "quiz", ["a"], { replace: true });
    expect(store.readEvents("quiz").slice(0, earlier.length)).toEqual(earlier);
    expect(store.readEvents("quiz").at(-1)).toMatchObject({ kind: "rebuild", concepts: ["a"] });
    expect(app.nextStep(ws)).toMatchObject({ kind: "author", concept: "a", difficulty: 1 });
  });

  it("with replace, never reuses a removed lesson id or exercise slug, since its events stay in the log", async () => {
    await app.saveLesson(ws, lesson("a-intro", "a"));
    await app.saveExercise(ws, quiz("a-only", ["a"]));
    await app.markLessonRead(ws, "a-intro");
    store.appendEvent("quiz", failed("a-only"));
    await app.rebuildTopics(ws, "quiz", ["a"], { replace: true });
    await expect(app.saveLesson(ws, lesson("a-intro", "a"))).rejects.toThrow(/already used/);
    await expect(app.saveExercise(ws, quiz("a-only", ["a"]))).rejects.toThrow(/already used/);
  });

  it("without replace, changes nothing on disk or in the log", async () => {
    await app.saveLesson(ws, lesson("a-intro", "a"));
    await app.saveExercise(ws, quiz("a-only", ["a"]));
    const before = store.readEvents("quiz");
    await app.rebuildTopics(ws, "quiz", ["a"], { replace: false });
    expect(app.listLessons(ws).map((l) => l.id)).toEqual(["a-intro"]);
    expect(store.listExercises("quiz").map((e) => e.slug)).toEqual(["a-only"]);
    expect(existsSync(join(ws, "exercises/quiz/a-only/answers.yaml"))).toBe(true);
    expect(store.readEvents("quiz")).toEqual(before);
  });
});
