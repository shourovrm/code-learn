import { parse, stringify } from 'yaml';
import type { QuizQuestion, TestView } from '../../../shared/api';

/** Whether every question has a choice: Check waits for it, since checking one answer at a time would reveal the key. */
export function answeredAll(questions: QuizQuestion[], text: string): boolean {
  try {
    const answers = parse(text) as Record<string, unknown> | null;
    return questions.every((_, i) => typeof answers?.[i + 1] === 'number');
  } catch {
    return false;
  }
}

type VisibleTestView = Extract<TestView, { hidden: false }>;

/** How many questions have a choice, for the status beside Check. */
export function answeredCount(text: string): number {
  try {
    const answers = parse(text) as Record<string, unknown> | null;
    return Object.values(answers ?? {}).filter((choice) => typeof choice === 'number').length;
  } catch {
    return 0;
  }
}

/**
 * The same numbered YAML file the terminal edits; no answer key reaches this component. After a Check, `graded` has each
 * question's verdict (named by its number) and the picked choice's explanation, shown under that question.
 */
export function QuizAnswers({ questions, text, disabled, graded, onChange }: {
  questions: QuizQuestion[]; text: string; disabled: boolean; graded?: TestView[]; onChange: (text: string) => void;
}) {
  let answers: Record<string, number | null>;
  try {
    answers = parse(text);
    if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.entries(answers).some(([n, choice]) =>
      !/^[1-9][0-9]*$/.test(n) || !questions[Number(n) - 1] || (choice !== null && (!Number.isInteger(choice) || choice < 1 || choice > questions[Number(n) - 1].choices.length)))) throw new Error();
  } catch {
    return <p role="alert">Fix answers.yaml to use question and choice numbers, then reopen this exercise.</p>;
  }
  return <ol className="quiz-questions">
    {questions.map((q, i) => {
      const verdict = graded?.find((t): t is VisibleTestView => !t.hidden && t.name === String(i + 1));
      return <li className="quiz-card" key={i}><fieldset className="stack" disabled={disabled}>
        <legend className="h3"><span className="quiz-number" aria-hidden="true">Question {i + 1} of {questions.length}</span>{q.text}</legend>
        {q.choices.map((c, j) => <label className={`opt${answers[i + 1] === j + 1 ? ' on' : ''}`} key={j}>
          <input type="radio" name={`question-${i + 1}`} checked={answers[i + 1] === j + 1}
            onChange={() => onChange(stringify({ ...answers, [i + 1]: j + 1 }))} />
          <span className="opt-mark" aria-hidden="true">{String.fromCharCode(65 + j)}</span>
          {c.text}
        </label>)}
        {verdict && <div className={`quiz-verdict ${verdict.status === 'pass' ? 'right' : 'wrong'}`}>
          <strong>{verdict.status === 'pass' ? 'Right' : 'Wrong'}</strong>
          {verdict.status !== 'pass' && verdict.message && <p>{verdict.message}</p>}
        </div>}
      </fieldset></li>;
    })}
  </ol>;
}
