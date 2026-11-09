import { useEffect, useRef, useState } from 'react';
import type { TopicView } from '../../../shared/api';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';

/** How many topic titles the confirmation names before it counts the rest. */
const NAMED = 3;

const topicWord = (n: number) => (n === 1 ? 'topic' : 'topics');

/**
 * The select mode's bar above the topics: Select all (checked when every topic is ticked, mixed when some are), the
 * count, Cancel, and the rebuild button, which reads "Rebuild all N" once every topic is ticked.
 */
export function RebuildBar({ topics, chosen, onSelectAll, onCancel, onRebuild }: {
  topics: TopicView[];
  chosen: ReadonlySet<string>;
  onSelectAll: (all: boolean) => void;
  onCancel: () => void;
  onRebuild: () => void;
}) {
  const every = chosen.size === topics.length;
  const all = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (all.current) all.current.indeterminate = chosen.size > 0 && !every;
  });
  return (
    <div className="card rebuild-bar">
      <label className="rebuild-all">
        <input ref={all} type="checkbox" checked={every} onChange={(e) => onSelectAll(e.target.checked)} />
        Select all
      </label>
      <span className="quiet-text">{chosen.size} of {topics.length} selected</span>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button disabled={chosen.size === 0} onClick={onRebuild}>{every ? `Rebuild all ${topics.length}` : 'Rebuild selected'}</Button>
    </div>
  );
}

/**
 * Asks before rebuilding: names the chosen topics, and offers to replace the old lessons and exercises (ticked by
 * default). `everything` is true when every topic of the course is chosen.
 */
export function RebuildDialog({ topics, everything, onClose, onConfirm }: {
  topics: TopicView[];
  everything: boolean;
  onClose: () => void;
  onConfirm: (replace: boolean) => void;
}) {
  const [replace, setReplace] = useState(true);
  const count = topics.length;
  const title = everything ? `Rebuild all ${count} ${topicWord(count)}?` : `Rebuild ${count} ${topicWord(count)}?`;
  return (
    <Dialog
      title={title}
      text="Your agent writes new lessons and exercises for:"
      onClose={onClose}
      body={(
        <>
          <ul className="rebuild-list">
            {topics.slice(0, NAMED).map((t) => <li key={t.id}>{t.title}</li>)}
            {count > NAMED && <li>and {count - NAMED} more</li>}
          </ul>
          <label className="rebuild-replace">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Replace the existing lessons and exercises. Their attempts and mastery reset.
          </label>
          <p className="quiet-text">Untick to keep them and add the new ones beside them.</p>
        </>
      )}
    >
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={() => onConfirm(replace)}>{`Rebuild ${count} ${topicWord(count)}`}</Button>
    </Dialog>
  );
}
