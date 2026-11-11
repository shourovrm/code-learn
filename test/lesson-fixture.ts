/** What every lesson carries besides its text: the goal and the self-check code-learn shows around the text. */
export const LESSON_FRAME = {
  goal: "Read two words from input.",
  selfCheck: [{ question: "What does `read a b` store in `b`?", answer: "The second word." }],
};

/** A lesson's fields for `save_lesson`, with `markdown` as its text. */
export function lessonFields(markdown = "Text.") {
  return { markdown, ...LESSON_FRAME };
}
