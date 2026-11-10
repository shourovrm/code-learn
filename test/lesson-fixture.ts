import { LESSON_GOAL, LESSON_SECTIONS } from "../src/schemas.js";

/** A lesson's Markdown with every part code-learn asks for, and `body` as its opening text. */
export function lessonText(body = "Text."): string {
  const sections = LESSON_SECTIONS.map((name) => `## ${name}\n\nText.`);
  return [`${LESSON_GOAL} do it.`, body, ...sections].join("\n\n");
}
