import { useEffect, useRef, useState } from 'react';
import type { ComputerCheck } from '../../../shared/api';
import { useApi } from '../../app/api';
import { useRouter, type Route } from '../../app/router';
import { Failed, Stale } from '../../app/Problems';
import { timing, useLoad } from '../../app/useLoad';
import { Button } from '../../ui/Button';
import { Status } from '../../ui/Icon';
import { stagger } from '../../ui/motion';
import { CHECK_ABOUT, CHECK_NAMES, NOT_YET } from './fixes';

const STATE_TEXT = { ok: 'Ready', problem: 'Needs a step', waiting: 'Waiting' } as const;

/** Can this computer run graded checks? Re-checks by itself until it can. */
export function Computer({ then, fromConnect = false }: { then: Route; fromConnect?: boolean }) {
  const api = useApi();
  const { go } = useRouter();
  // One check at a time: a click or focus while one runs waits for its result. The ref is set the moment a
  // check starts, before React re-renders with `loading`, so a focus in between can't start a second one.
  const checking = useRef(false);
  const { data, error, stale, loading, reload } = useLoad(
    async () => {
      checking.current = true;
      try {
        return await api.computer();
      } finally {
        checking.current = false;
      }
    },
    [],
    { settled: (c) => c.ready, every: timing.recheckMs },
  );
  // On the way in from Connect, ready at the first check: nothing to show, so code-learn moves on. An explicit
  // Check this computer, or one where the learner had a step to take, says "This computer is ready." and waits.
  const hadStep = useRef(!fromConnect);
  if (data && !data.ready) hadStep.current = true;
  const ready = data?.ready ?? false;
  useEffect(() => {
    if (ready && !hadStep.current) go(then);
  }, [ready]);
  const recheck = () => {
    if (!checking.current) reload();
  };
  const action = useRef<HTMLButtonElement>(null);
  const focusInList = useRef(false);

  // Coming back to the window re-checks at once.
  useEffect(() => {
    if (data?.ready || loading) return;
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, [data?.ready, loading, reload]);

  // A re-check can remove the step that had focus; move focus to the next action.
  useEffect(() => {
    if (focusInList.current && document.activeElement === document.body) {
      focusInList.current = false;
      action.current?.focus();
    }
  }, [data]);

  if (error) return <Failed error={error} retry={reload} />;
  if (!data || (data.ready && !hadStep.current)) return null;
  const problem = data.checks.find((c) => c.state === 'problem');
  return (
    <main className="center">
      <div className="stack setup-col">
        <h1 className="h1 a-up">Check this computer</h1>
        <p className="sub a-up" style={stagger(1)}>code-learn runs your code in a sandbox, on this computer.</p>
        <ul className="stack plain" onFocus={() => (focusInList.current = true)}>
          {data.checks.map((c, i) => <CheckItem key={c.id} check={c} index={i} />)}
        </ul>
        <p className="quiet-text" role="status">
          {data.ready ? 'This computer is ready.' : `${problem ? `${NOT_YET[problem.id]} ` : ''}Checking again every few seconds.`}
        </p>
        <div className="actions">
          {data.ready ? (
            <Button ref={action} size="lg" onClick={() => go(then)}>Continue</Button>
          ) : (
            <>
              <Button ref={action} variant="ghost" size="lg" onClick={recheck}>Check again</Button>
              <Button variant="text" onClick={() => go(then)}>Later</Button>
            </>
          )}
        </div>
      </div>
      {stale !== undefined && <Stale error={stale} retry={reload} />}
    </main>
  );
}

function CheckItem({ check, index }: { check: ComputerCheck; index: number }) {
  const name = CHECK_NAMES[check.id];
  return (
    <li className={`card check a-up${check.state === 'ok' ? ' on' : ''}`} style={stagger(index + 2)} aria-label={name}>
      <div className="check-head">
        {check.state === 'ok' && <Status kind="ok" size={24} />}
        {check.state === 'problem' && <Status kind="fail" size={24} label="Needs a step" />}
        {check.state === 'waiting' && <span className="ico wait" aria-hidden="true" />}
        <b>{name}</b>
        <span className={`check-state ${check.state}`}>{STATE_TEXT[check.state]}</span>
      </div>
      <p className="quiet-text">{CHECK_ABOUT[check.id]}</p>
      {check.state === 'problem' && (
        <div className="fix">
          {/* Core's message already ends with what to do. */}
          {check.reason && <p>{check.reason}</p>}
          {check.installCommand && <CopyCommand command={check.installCommand} />}
        </div>
      )}
    </li>
  );
}

/** A command for the learner to run in a terminal. code-learn runs nothing as root, so it only offers the text. */
function CopyCommand({ command }: { command: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopy('copied');
    } catch {
      // The command stays on screen, selectable, so the learner can still copy it by hand.
      setCopy('failed');
    }
  }
  return (
    <>
      <div className="command">
        <code>{command}</code>
        <Button variant="ghost" onClick={copyCommand}>{copy === 'copied' ? 'Copied' : 'Copy'}</Button>
      </div>
      {copy === 'failed' && <p className="quiet-text" role="status">Couldn't copy it. Select the command and copy it yourself.</p>}
    </>
  );
}
