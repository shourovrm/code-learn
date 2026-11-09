import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApi } from '../../app/api';
import { useRouter } from '../../app/router';
import { SAY, problemOf, sayOf } from '../../app/errors';
import { Failed } from '../../app/Problems';
import { useJobs } from '../../app/useJob';
import { useLoad } from '../../app/useLoad';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Sprig } from '../../ui/Sprig';
import { Field } from '../../ui/Field';
import { JobBar } from '../../ui/JobBar';
import { stagger } from '../../ui/motion';
import { Limit } from '../../ui/Limit';
import { LIMITS } from '../../../shared/limits';

/** Who uses a toolchain, as the card says it: the courses by title, or that none does. */
function usageLine(usedBy: string[]): string {
  if (usedBy.length === 0) return 'Not used by any course.';
  return `Used by ${usedBy.length === 1 ? '1 course' : `${usedBy.length} courses`}: ${usedBy.join(', ')}`;
}

/** What code-learn has set up. Anything else is one request away. */
export function Tracks() {
  const api = useApi();
  const { go, fail } = useRouter();
  const { data: tracks, error, reload } = useLoad(() => api.tracks(), []);
  const [topic, setTopic] = useState('');
  const [rebuilding, setRebuilding] = useState<string>();
  const [rebuilt, setRebuilt] = useState<string>();
  const [failed, setFailed] = useState<{ ref: string; text: string }>();
  const [confirming, setConfirming] = useState<{ ref: string; name: string }>();
  const [removing, setRemoving] = useState(false);
  // A removed track's card takes the focused button with it; focus goes to the heading so it isn't lost to the page.
  const heading = useRef<HTMLHeadingElement>(null);
  // Rebuilds running now, also those started before the learner left and came back (§4.11).
  const rebuilds = useJobs((p) => p.kind === 'rebuild', []);
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => void (here.current = false);
  }, []);
  if (error) return <Failed error={error} retry={reload} />;
  if (!tracks) return null;

  async function rebuild(ref: string, name: string) {
    setRebuilding(ref);
    setRebuilt(undefined);
    setFailed(undefined);
    try {
      await api.rebuild(ref);
      setRebuilt(ref);
    } catch (e) {
      // A damaged record has its banner, and so has a failure after the learner left: no card is there to say it.
      // Any other failure is said on the card: what happened and what to do, as far as code-learn knows.
      const problem = problemOf(e);
      if (problem === 'repair' || problem === 'connect' || !here.current) fail(e);
      else {
        const say = sayOf(e, problem);
        const lead = `Couldn't rebuild ${name}.`;
        setFailed({ ref, text: problem === 'offline' ? say : say === SAY.other ? lead : `${lead} ${say}` });
      }
    } finally {
      setRebuilding(undefined);
    }
  }

  async function remove({ ref, name }: { ref: string; name: string }) {
    setRemoving(true);
    setRebuilt(undefined);
    setFailed(undefined);
    try {
      await api.removeTrack(ref);
      setConfirming(undefined);
      reload();
      heading.current?.focus();
    } catch (e) {
      setConfirming(undefined);
      const problem = problemOf(e);
      if (problem === 'repair' || problem === 'connect' || !here.current) fail(e);
      else {
        // Core's refusal ("... is used by course ..., so it can't be removed while they need it.") already says what to do.
        const say = sayOf(e, problem);
        setFailed({ ref, text: say === SAY.other ? `Couldn't remove ${name}.` : say });
      }
    } finally {
      setRemoving(false);
    }
  }

  function start(e: FormEvent) {
    e.preventDefault();
    if (topic.trim()) go({ to: 'research', goal: { topic: topic.trim(), known: '', depth: 'standard', practice: 'code' } });
  }

  return (
    <main className="main page">
      <h1 className="h2 a-up" ref={heading} tabIndex={-1}>Toolchains</h1>
      <p className="sub">The compilers, interpreters and libraries installed for your courses. Courses that use the same language share one toolchain.</p>
      {tracks.length > 0 && (
        <ul className="track-grid plain">
          {tracks.map((t, i) => {
            const job = rebuilds.find((j) => j.progress.track === t.name);
            const inUse = t.usedBy.length > 0;
            return (
              <li key={t.ref} className="card track a-up" style={stagger(i + 1)} aria-label={t.name}>
                <Sprig width={140} name={t.name} perch />
                <b>{t.name}</b>
                <p className="quiet-text">{usageLine(t.usedBy)}</p>
                {job && <JobBar job={job} label={`Rebuilding ${t.name}`} compact />}
                <Button variant="ghost" disabled={rebuilding === t.ref || Boolean(job)} onClick={() => rebuild(t.ref, t.name)}>Rebuild</Button>
                <Button variant="ghost" disabled={rebuilding === t.ref || Boolean(job) || inUse} onClick={() => setConfirming({ ref: t.ref, name: t.name })}>Remove</Button>
                {inUse && <p className="quiet-text">To remove it, first delete these courses in Courses.</p>}
                <span className="quiet-text" role="status">{failed?.ref === t.ref ? failed.text : rebuilt === t.ref ? 'Rebuilt.' : ''}</span>
              </li>
            );
          })}
        </ul>
      )}
      {confirming && (
        <Dialog
          title={`Remove ${confirming.name}?`}
          text={`This deletes the ${confirming.name} toolchain that code-learn installed on this computer. You can install it again later.`}
          onClose={() => setConfirming(undefined)}
        >
          <Button variant="ghost" size="lg" onClick={() => setConfirming(undefined)}>Cancel</Button>
          <Button size="lg" disabled={removing} onClick={() => remove(confirming)}>Remove</Button>
        </Dialog>
      )}
      <section className="card new a-up" style={stagger(4)} aria-labelledby="new-t">
        <h2 className="h3" id="new-t">Learn something new</h2>
        <form className="composer" onSubmit={start}>
          <Field aria-labelledby="new-t" value={topic} maxLength={LIMITS.topic} onChange={(e) => setTopic(e.target.value)} />
          <Button type="submit" size="lg" disabled={!topic.trim()}>Start</Button>
        </form>
        <Limit value={topic} max={LIMITS.topic} />
      </section>
    </main>
  );
}
