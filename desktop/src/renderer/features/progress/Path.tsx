import type { CSSProperties } from 'react';
import type { CourseView, TopicView } from '../../../shared/api';
import { useRouter } from '../../app/router';
import { Button } from '../../ui/Button';
import { Sprig } from '../../ui/Sprig';
import { Growth } from '../../ui/Growth';
import { Icon } from '../../ui/Icon';
import { continueRoute, offeredTopic, reviewText } from '../../app/course';
import { Writing } from '../lessons/Writing';

const STATE_LABEL = { covered: 'Read', mastered: 'Mastered', now: 'Now', later: 'Later' } as const;
/** Each stop lands this long after the one before it, so the branch fills in order; past the first few, all at once. */
const STEP_MS = 140;
const STAGGERED = 8;

/** The topic code-learn offers now: a due (or being written) review, otherwise the current topic. */
function currentIndex(topics: TopicView[]): number {
  const offered = offeredTopic(topics);
  return offered ? topics.indexOf(offered) : -1;
}

/**
 * The course as a path along Sprig's branch: each topic is a leaf, the branch is green between topics the learner has
 * reached, and Sprig sits on the topic code-learn offers now. A finished course has Sprig at the branch's end.
 */
/** The select mode's ticks: which topics are chosen, and the toggle for one (Rebuild.tsx). */
export type Picking = { chosen: ReadonlySet<string>; toggle: (id: string) => void };

export function Path({ course, picking }: { course: CourseView; picking?: Picking }) {
  const { topics } = course;
  const at = currentIndex(topics);
  // Reached: mastered, or the current topic. A topic passed over (skipped, or locked behind the current one) sits on grey.
  const reached = topics.map((t, i) => t.state === 'mastered' || t.state === 'covered' || i === at);
  return (
    <div className="path-wrap">
      <ol className={picking ? 'path picking' : 'path'} aria-label="Topics">
        {topics.map((t, i) => (
          <Stop key={t.id} topic={t} index={i} current={i === at} track={course.track} up={i > 0 && reached[i - 1] && reached[i]} down={i < topics.length - 1 && reached[i] && reached[i + 1]} last={i === topics.length - 1} picking={picking} />
        ))}
      </ol>
      {at < 0 && course.done && (
        <div className="path-end" aria-hidden="true" style={timing(topics.length)}>
          <Sprig mood="cheer" width={96} name={course.track} />
        </div>
      )}
    </div>
  );
}

/** When a stop's part of the sequence starts: the CSS times the branch, leaf, title and Sprig from it. */
const timing = (i: number): CSSProperties => ({ '--d': `${Math.min(i, STAGGERED) * STEP_MS}ms` }) as CSSProperties;

type StopProps = { topic: TopicView; index: number; current: boolean; track: string; up: boolean; down: boolean; last: boolean; picking?: Picking };

/** One topic on the path: its leaf on the branch, then its title, or the current topic's card with Sprig on it. */
function Stop({ topic, index, current, track, up, down, last, picking }: StopProps) {
  const { go } = useRouter();
  return (
    <li className={`stop ${topic.state}${current ? ' current' : ''}`} style={timing(index)} aria-current={current ? 'step' : undefined}>
      {picking && <input type="checkbox" className="topic-pick" aria-label={topic.title} checked={picking.chosen.has(topic.id)} onChange={() => picking.toggle(topic.id)} />}
      <span className="vine" aria-hidden="true">
        {index > 0 && <i className={`seg up${up ? ' on' : ''}`} />}
        {!last && <i className={`seg down${down ? ' on' : ''}`} />}
      </span>
      <Leaf state={topic.state} current={current} />
      {current ? (
        <Current topic={topic} track={track} />
      ) : topic.state === 'mastered' || topic.state === 'covered' ? (
        <div className="stop-row">
          {/* A mastered topic opens again: its lessons and the activity, to reread or practise. */}
          <button type="button" className="stop-name link" onClick={() => go({ to: 'topic', topicId: topic.id })}>{topic.title}</button>
          {topic.reviewIn && <span className="soon">{reviewText(topic.reviewIn)}</span>}
        </div>
      ) : (
        <div className="stop-row">
          <span className="stop-name">{topic.title}</span>
        </div>
      )}
    </li>
  );
}

/** A topic's mark on the stem: a sprout when done, a shoot for the topic under way, a seed while it waits. */
function Leaf({ state, current }: { state: TopicView['state']; current: boolean }) {
  const stage = current || state === 'now' ? 'shoot' : state === 'later' ? 'seed' : 'sprout';
  return (
    <span className={`leaf ${state}`} role="img" aria-label={STATE_LABEL[state]}>
      <Growth stage={stage} />
    </span>
  );
}

/** The topic code-learn offers now, with Sprig perched on its card: Continue, or a due review. */
function Current({ topic, track }: { topic: TopicView; track: string }) {
  const { go } = useRouter();
  const mood = topic.review ? 'look' : topic.stuck ? 'think' : 'ready';
  return (
    <div className="stop-card">
      <span className="perch" aria-hidden="true">
        <Sprig mood={mood} width={84} name={track} />
      </span>
      <div className="stop-main">
        {/* The topic page lists its lessons, so one already read opens again from here. */}
        <button type="button" className="stop-title link" onClick={() => go({ to: 'topic', topicId: topic.id })}>{topic.title}</button>
        {topic.review === 'writing' ? (
          <Writing kind="author" concept={topic.id} label="Writing the review" compact waiting="Writing the review" />
        ) : (
          !topic.review && <Steps topic={topic} />
        )}
      </div>
      {topic.review === 'writing' ? null : topic.review === 'due' ? (
        <Button onClick={() => go({ to: 'practice', concept: topic.id })}>Review</Button>
      ) : (
        <Button onClick={() => go(continueRoute(topic))}>Continue</Button>
      )}
    </div>
  );
}

/** How far into the topic: one step per lesson, then the activity. The words say the lessons read. */
function Steps({ topic }: { topic: TopicView }) {
  const read = topic.lessons.filter((l) => l.state === 'read').length;
  const all = topic.lessons.length > 0 && read === topic.lessons.length;
  return (
    <div className="steps">
      <span className="step-bar" aria-hidden="true">
        {topic.lessons.map((l) => <i key={l.id} className={l.state} />)}
        {topic.activity !== 'none' && <i className={`act ${topic.activity}`} />}
      </span>
      {all ? (
        <span className="done"><Icon name="check" color="var(--green-ink)" size={14} />Lessons</span>
      ) : (
        topic.lessons.length > 0 && <span className="step-text">Lessons {read} of {topic.lessons.length}</span>
      )}
    </div>
  );
}
