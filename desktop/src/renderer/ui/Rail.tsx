import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Message } from '../../shared/api';
import type { HeardJob } from '../app/useJob';
import { Button } from './Button';
import { Sprig } from './Sprig';
import { Field } from './Field';
import { JobBar } from './JobBar';
import { Markdown } from './Markdown';
import { Limit } from './Limit';
import { LIMITS } from '../../shared/limits';

function Entry({ m }: { m: Message }) {
  if (m.from === 'you') return <p className="you a-up"><b>You:</b> {m.text}</p>;
  return <div className="note a-up"><Markdown text={m.text} className="md small" /></div>;
}

/**
 * The code-learn tutor beside a lesson or activity. While it answers, `answering` is that turn's progress (§4.11).
 * `onAsk` may resolve false when the question failed: it goes back in the field, unless the learner typed again.
 */
export function Rail({ messages, onAsk, busy = false, answering, name, children }: {
  messages: Message[]; onAsk: (text: string) => unknown; busy?: boolean; answering?: HeardJob; name?: string; children?: ReactNode;
}) {
  const [text, setText] = useState('');
  // The log scrolls inside the rail and follows the newest message. Its own scrollTop only: scrollIntoView would scroll the page too.
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length, busy]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText('');
    if ((await onAsk(q)) === false) setText((now) => now || q);
  }
  return (
    <aside className="coach" aria-label="code-learn">
      <div className="chead"><Sprig width={40} name={name} />code-learn</div>
      <div className="cbody" role="log" aria-busy={busy} ref={log}>
        {messages.map((m, i) => <Entry key={i} m={m} />)}
        {busy && (
          <div className="note thinking a-up">
            <span role="status">code-learn is thinking…</span>
            {answering && <JobBar job={answering} label="code-learn's answer" compact />}
          </div>
        )}
      </div>
      <div className="cfoot">
        {children}
        <form className="composer" onSubmit={submit}>
          <Field aria-label="Ask code-learn" placeholder="Ask code-learn" value={text} maxLength={LIMITS.words} onChange={(e) => setText(e.target.value)} />
          <Button variant="ghost" type="submit" disabled={busy}>Send</Button>
        </form>
        <Limit value={text} max={LIMITS.words} />
      </div>
    </aside>
  );
}
