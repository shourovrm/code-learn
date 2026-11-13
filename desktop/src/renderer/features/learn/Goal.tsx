import { useEffect, useState, type FormEvent } from 'react';
import type { Depth, Practice } from '../../../shared/api';
import { useApi } from '../../app/api';
import { useRouter } from '../../app/router';
import { useLoad } from '../../app/useLoad';
import { Button } from '../../ui/Button';
import { Sprig } from '../../ui/Sprig';
import { Field } from '../../ui/Field';
import { stagger } from '../../ui/motion';
import { Banner } from '../../ui/Banner';
import { Limit } from '../../ui/Limit';
import { LIMITS } from '../../../shared/limits';
import { shownTopic } from '../../../shared/topic';

/** How long typing pauses before the goal counts as settled, so the notice never names half a word. */
const SETTLE_MS = 600;

const DEPTHS: [Depth, string][] = [
  ['overview', 'Overview'],
  ['standard', 'Standard'],
  ['in-depth', 'In depth'],
];

/** Code and quiz are chips: both on is a mixed course, and neither on is lessons only. */
function practiceOf(code: boolean, quiz: boolean): Practice {
  if (code) return quiz ? 'both' : 'code';
  return quiz ? 'quiz' : 'none';
}

/** Any language or framework. code-learn asks what the learner already knows, and how deep to go. */
export function Goal() {
  const { go } = useRouter();
  const api = useApi();
  const { data: tracks } = useLoad(() => api.tracks(), []);
  // A roadmap not approved yet: the learner left it, or code-learn was closed (§4.2).
  const { data: draft } = useLoad(() => api.draft(), []);
  const [topic, setTopic] = useState('');
  const [known, setKnown] = useState('');
  const [instructions, setInstructions] = useState('');
  const [depth, setDepth] = useState<Depth>('standard');
  const [code, setCode] = useState(true);
  const [quiz, setQuiz] = useState(false);
  const practice = practiceOf(code, quiz);
  const goal = topic.trim();
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(goal), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [goal]);
  const shown = shownTopic(goal);
  const isNew = goal !== '' && goal === settled && tracks !== undefined && !tracks.some((t) => t.name.toLowerCase() === shown.toLowerCase());

  function start(e: FormEvent) {
    e.preventDefault();
    if (goal) go({ to: 'research', goal: { topic: goal, known: known.trim(), instructions: instructions.trim(), depth, practice } });
  }

  return (
    <main className="center">
      <form className="stack wide goal-form" onSubmit={start}>
        <h1 className="h1 a-up" id="goal-q">What do you want to learn?</h1>
        <div className="goal-box a-up" style={stagger(1)}>
          <input aria-labelledby="goal-q" value={topic} maxLength={LIMITS.topic} onChange={(e) => setTopic(e.target.value)} autoFocus />
          <Button type="submit" disabled={!goal}>Start</Button>
        </div>
        <Limit value={topic} max={LIMITS.topic} />
        <Field className="a-up" style={stagger(2)} aria-label="What you already know (optional)" placeholder="What you already know (optional)" value={known} maxLength={LIMITS.known} onChange={(e) => setKnown(e.target.value)} />
        <Limit value={known} max={LIMITS.known} />
        <textarea className="field a-up" style={stagger(3)} aria-label="Instructions" placeholder="Optional: how the course should be made, e.g. Linux examples, short lessons, focus on pointers" rows={2} value={instructions} maxLength={LIMITS.instructions} onChange={(e) => setInstructions(e.target.value)} />
        <Limit value={instructions} max={LIMITS.instructions} />
        <div className="depth a-up" style={stagger(4)} role="radiogroup" aria-labelledby="depth-q">
          <span className="depth-q" id="depth-q">How deep</span>
          {DEPTHS.map(([id, label]) => (
            <label key={id} className={`opt${depth === id ? ' on' : ''}`}>
              <input type="radio" name="depth" value={id} checked={depth === id} onChange={() => setDepth(id)} />
              {label}
            </label>
          ))}
        </div>
        <div className="depth a-up" style={stagger(5)} role="group" aria-labelledby="practice-q">
          <span className="depth-q" id="practice-q">How to practise</span>
          <button type="button" className={`opt${code ? ' on' : ''}`} aria-pressed={code} onClick={() => setCode(!code)}>Code</button>
          <button type="button" className={`opt${quiz ? ' on' : ''}`} aria-pressed={quiz} onClick={() => setQuiz(!quiz)}>Quiz</button>
        </div>
        <p className="quiet-text a-up" style={stagger(5)}>Pick any, or none to read lessons only.</p>
        {draft && (
          <p className="draft-note a-up" style={stagger(5)}>
            Starting a new course replaces your draft <b>{draft.title}</b>.{' '}
            <Button variant="text" className="draft-link" onClick={() => go({ to: 'course', roadmap: draft })}>Open the draft</Button>
          </p>
        )}
        {isNew && code && (
          <Banner art={<Sprig mood="look" width={56} />}><b>{shown} isn't set up yet.</b> code-learn will set it up.</Banner>
        )}
      </form>
    </main>
  );
}
