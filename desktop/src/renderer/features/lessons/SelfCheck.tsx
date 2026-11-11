import type { Lesson } from '../../../shared/api';
import { Markdown } from '../../ui/Markdown';

/** A lesson's self-check: each answer stays closed until asked, so the learner answers first. */
export function SelfCheck({ questions }: { questions: NonNullable<Lesson['selfCheck']> }) {
  return (
    <section className="self-check" aria-labelledby="self-check-t">
      <h2 className="h2" id="self-check-t">Check yourself</h2>
      <ol>
        {questions.map((c, i) => (
          <li key={i}>
            <Markdown text={c.question} />
            <details className="answers">
              <summary>Show answer</summary>
              <Markdown text={c.answer} />
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
