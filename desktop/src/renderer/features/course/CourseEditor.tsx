import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Concept, Roadmap } from '../../../shared/api';
import { addTopic, moveTopic, removeTopic, renameTopic } from '../../../shared/roadmap';
import { useApi } from '../../app/api';
import { cacheFor, lessonCache } from '../../app/cache';
import { useJob } from '../../app/useJob';
import { useRouter } from '../../app/router';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { JobBar } from '../../ui/JobBar';
import { stagger } from '../../ui/motion';
import { TopicItem } from './TopicItem';
import { ExternalLink } from '../../ui/ExternalLink';
import { Limit } from '../../ui/Limit';
import { Markdown } from '../../ui/Markdown';
import { LIMITS } from '../../../shared/limits';

/** Rename, reorder, add or remove topics, or ask code-learn for changes. Then approve (§4.2). */
export function CourseEditor({ roadmap }: { roadmap: Roadmap }) {
  const api = useApi();
  const { go, fail } = useRouter();
  const [concepts, setConcepts] = useState(roadmap.concepts);
  const [sources, setSources] = useState(roadmap.sources);
  const [editing, setEditing] = useState<string>();
  const [adding, setAdding] = useState(false);
  /** Why the learner's own edit was refused. */
  const [notice, setNotice] = useState('');
  /** What code-learn said when it changed nothing: agent-written Markdown, not an error. */
  const [reply, setReply] = useState('');
  const [request, setRequest] = useState('');
  const [asking, setAsking] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  /** The learner's own toolchain request, sent with Suggest. */
  const [suggestion, setSuggestion] = useState('');
  /** Accepted with Use: the toolchain card then shows only what it is. */
  const [toolchainKept, setToolchainKept] = useState(false);
  /** Kept with Keep code: the agent's practice note goes, and the toolchain card shows. */
  const [codeKept, setCodeKept] = useState(false);
  const dragFrom = useRef<string>(undefined);
  // "Ask code-learn for changes" and Go deeper run a roadmap-change job (§4.11).
  const job = useJob((p) => p.kind === 'roadmap', []);
  // A change the learner started, left and came back to is running here too: the same locks apply (the sidebar opens
  // this screen for it), and when it ends the draft it changed is read again.
  const working = asking || Boolean(job);
  const ran = useRef(false);
  useEffect(() => {
    if (job) ran.current = true;
    else if (ran.current && !asking) {
      ran.current = false;
      api.draft().then((draft) => {
        if (!draft) return;
        setConcepts(draft.concepts);
        setSources(draft.sources);
      }, (err: unknown) => fail(err));
    }
  }, [job]);

  /** Applies an edit and saves it, so the draft survives leaving or closing code-learn; or says why it was refused. */
  function edit(change: (cs: Concept[]) => Concept[]) {
    if (working) return;
    let next: Concept[];
    try {
      next = change(concepts);
    } catch (e) {
      setNotice((e as Error).message);
      setReply('');
      return;
    }
    setConcepts(next);
    setNotice('');
    setReply('');
    api.saveDraft(next).catch((err: unknown) => fail(err, { to: 'course', roadmap: { ...roadmap, concepts: next, sources } }));
  }

  function rename(id: string, title: string) {
    if (title) edit((cs) => renameTopic(cs, id, title));
    setEditing(undefined);
  }

  function add(title: string) {
    if (title) edit((cs) => addTopic(cs, title));
    setAdding(false);
  }

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (request.trim()) await change(request.trim());
  }

  /**
   * "Go deeper": the same roadmap change, asking to split one topic into its smaller skills. The topic keeps the
   * learner's title: an agent that retitles it while splitting gets it back.
   */
  function deeper(id: string, title: string) {
    if (!working) void change(`Go deeper on "${title}": split it into the smaller skills it needs, each its own topic with its prerequisites. Keep "${title}" as the first of them, with its id.`, { id, title });
  }

  /** code-learn changes the roadmap as it stands now, so the learner's own edits wait until it's done (an open one closes). */
  async function change(text: string, keep?: { id: string; title: string }) {
    setAsking(true);
    setEditing(undefined);
    setAdding(false);
    try {
      const result = await api.reviseRoadmap(concepts, text);
      const retitled = keep && result.roadmap.concepts.some((c) => c.id === keep.id && c.title !== keep.title);
      const next = retitled ? renameTopic(result.roadmap.concepts, keep.id, keep.title) : result.roadmap.concepts;
      if (retitled) await api.saveDraft(next);
      setConcepts(next);
      setSources(result.roadmap.sources);
      setNotice('');
      setReply(result.changed ? '' : result.text || 'No change.');
      setRequest('');
    } catch (err) {
      // Come back to the edited roadmap, not the one this screen opened with.
      fail(err, { to: 'course', roadmap: { ...roadmap, concepts, sources } });
    } finally {
      setAsking(false);
    }
  }

  async function suggest(e: FormEvent) {
    e.preventDefault();
    if (!suggestion.trim()) return;
    await change(`Practise with a different toolchain: ${suggestion.trim()}`);
    setSuggestion('');
  }

  async function discard() {
    try {
      await api.discardDraft();
      go({ to: 'goal' });
    } catch (err) {
      fail(err);
    }
  }

  async function approve() {
    try {
      await api.approve(concepts);
      // A new course reuses lesson ids, so cached lessons belong to the old one.
      lessonCache(api).clear();
      cacheFor(api, 'conversations').clear();
      const now = (await api.course())?.topics.find((t) => t.state === 'now');
      go(now ? { to: 'topic', topicId: now.id } : { to: 'learn' });
    } catch (err) {
      fail(err);
    }
  }

  return (
    <main className="main editor">
      <div className="editor-body">
        <div className="stack editor-col">
          <div className="editor-head a-up">
            <h1 className="h2">{roadmap.title}</h1>
            <Button variant="ghost" onClick={() => setDiscarding(true)}>Discard draft</Button>
          </div>
          {roadmap.goal !== roadmap.title && <p className="sub a-up">{roadmap.goal}</p>}
          {sources.length > 0 && (
            <section className="sources a-up" style={stagger(0, 100)} aria-labelledby="sources-t">
              <h2 id="sources-t">Sources</h2>
              <ul>
                {sources.map((s) => (
                  <li key={s.url}><ExternalLink href={s.url}>{s.title}</ExternalLink></li>
                ))}
              </ul>
            </section>
          )}
          {roadmap.practiceNote && !codeKept ? (
            <section className="card practice-card note" aria-labelledby="fit-t">
              <h2 id="fit-t">Code practice may not fit this subject</h2>
              <p>{roadmap.practiceNote}</p>
              <div className="practice-actions">
                <Button variant="ghost" disabled={working} onClick={() => void change('Switch this course to quiz practice only, with no track.')}>Switch to Quiz</Button>
                <Button variant="ghost" onClick={() => setCodeKept(true)}>Keep code, with {roadmap.track}</Button>
              </div>
            </section>
          ) : (
            roadmap.track !== '' && (
              <section className="card practice-card" aria-labelledby="toolchain-t">
                <h2 id="toolchain-t">Practise with: {roadmap.track}</h2>
                <p>Exercises are built and tested with this toolchain. Nothing is installed until you approve the course.</p>
                {!toolchainKept && (
                  <>
                    <div className="practice-actions">
                      <Button variant="primary" onClick={() => setToolchainKept(true)}>Use {roadmap.track}</Button>
                    </div>
                    <form className="practice-actions" onSubmit={suggest}>
                      <Field aria-label="Or tell the agent what you'd like instead" value={suggestion} maxLength={LIMITS.words} disabled={working} onChange={(e) => setSuggestion(e.target.value)} />
                      <Button type="submit" variant="ghost" disabled={!suggestion.trim() || working}>Suggest</Button>
                    </form>
                  </>
                )}
              </section>
            )
          )}
          <ol className="topics" aria-label="Roadmap">
            {concepts.map((c, i) => (
              <TopicItem
                key={c.id}
                index={i}
                count={concepts.length}
                title={c.title}
                editing={editing === c.id}
                onEdit={() => setEditing(c.id)}
                onRename={(title) => rename(c.id, title)}
                onRemove={() => edit((cs) => removeTopic(cs, c.id))}
                onDeeper={() => deeper(c.id, c.title)}
                onMove={(to) => edit((cs) => moveTopic(cs, c.id, to))}
                onDragStart={() => (dragFrom.current = c.id)}
                onDrop={() => dragFrom.current && edit((cs) => moveTopic(cs, dragFrom.current!, i))}
                locked={working}
              />
            ))}
            {adding && <TopicItem index={concepts.length} count={concepts.length + 1} title="" editing onEdit={() => {}} onRename={add} />}
          </ol>
          <button className="add a-up" type="button" style={stagger(0, 100)} disabled={adding || working} onClick={() => setAdding(true)}>
            <Icon name="plus" color="var(--ink)" size={16} />
            Add a topic
          </button>
        </div>
      </div>
      {/* Its own space under the topics: asking, what code-learn said, and Approve are always in view, and nothing covers them. */}
      <footer className="editor-foot">
        <div className="stack editor-col">
          {job && <JobBar job={job} label="Changing the roadmap" />}
          <div role="status">
            {working ? (
              !job && <p className="quiet-text">Updating the roadmap…</p>
            ) : reply ? (
              <div className="note"><Markdown text={reply} className="md small" /></div>
            ) : (
              notice && <p className="alert">{notice}</p>
            )}
          </div>
          <div className="editor-actions">
            <form className="composer" onSubmit={ask}>
              <Field aria-label="Ask code-learn for changes" placeholder="Ask code-learn for changes" value={request} maxLength={LIMITS.words} disabled={working} onChange={(e) => setRequest(e.target.value)} />
              <Button type="submit" variant="ghost" size="lg" disabled={!request.trim() || working}>Apply</Button>
            </form>
            {/* A typed request is applied or cleared first, so approving never drops it. */}
            <Button size="lg" disabled={concepts.length === 0 || editing !== undefined || adding || working || request.trim() !== ''} onClick={approve}>Approve</Button>
          </div>
          <Limit value={request} max={LIMITS.words} />
        </div>
      </footer>
      {discarding && (
        <Dialog title="Discard this draft?" text={`“${roadmap.title}” and its roadmap are deleted. This can't be undone.`} onClose={() => setDiscarding(false)}>
          <Button variant="ghost" size="lg" onClick={() => setDiscarding(false)}>Keep it</Button>
          <Button size="lg" onClick={() => void discard()}>Discard draft</Button>
        </Dialog>
      )}
    </main>
  );
}
