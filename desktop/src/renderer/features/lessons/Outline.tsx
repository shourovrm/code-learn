import { useState } from 'react';
import type { TopicView } from '../../../shared/api';
import { useRouter } from '../../app/router';
import { Growth } from '../../ui/Growth';
import { Icon } from '../../ui/Icon';
import { Writing } from './Writing';

/** The topic's pages beside a lesson: its lessons, its activity and the next topic. It folds away to a strip. */
export function Outline({ topic, current, next }: { topic: TopicView; current: string; next?: TopicView }) {
  const { go } = useRouter();
  const [folded, setFolded] = useState(false);
  if (folded) {
    return (
      <div className="stmt outline folded">
        <button type="button" className="item link" onClick={() => setFolded(false)}>Show panel</button>
      </div>
    );
  }
  const open = topic.activity === 'open' || topic.activity === 'passed';
  const lessonWriting = topic.lessons.some((l) => l.state === 'writing');
  const pages = topic.lessons.length + (topic.activity === 'none' ? 0 : 1);
  const done = topic.lessons.filter((l) => l.state === 'read').length + (topic.activity === 'passed' ? 1 : 0);
  return (
    <nav className="stmt outline" aria-label={topic.title}>
      <button type="button" className="item link" onClick={() => go({ to: 'learn' })}>‹ All topics</button>
      <h2 className="h3">{topic.title}</h2>
      <span className="locked">{`${done} of ${pages} done`}</span>
      {topic.lessons.map((l) =>
        l.state === 'failed' ? (
          <span key={l.id} className="item"><Growth stage="seed" size={20} />code-learn couldn't write this lesson.</span>
        ) : l.state === 'writing' ? (
          <div key={l.id} className="item writing">
            <span className="item-head"><Growth stage="seed" size={20} />{l.title}</span>
            <Writing kind="lesson" concept={topic.id} label="Writing the lesson" compact />
          </div>
        ) : (
          <button key={l.id} type="button" className="item link" aria-current={l.id === current ? 'page' : undefined} onClick={() => go({ to: 'lesson', lessonId: l.id })}>
            <Growth stage={l.id === current ? 'shoot' : l.state === 'read' ? 'sprout' : 'seed'} size={20} />
            <span className="fill">{l.title}</span>
            {l.state === 'read' && <span role="img" aria-label="Read"><Icon name="check" color="var(--leaf-on-packet)" size={14} /></span>}
          </button>
        ),
      )}
      {topic.activity !== 'none' && (open ? (
        <button type="button" className="item link" onClick={() => go({ to: 'practice', concept: topic.id })}>
          <Growth stage={topic.activity === 'passed' ? 'sprout' : 'seed'} size={20} />
          Exercise
        </button>
      ) : topic.activity === 'writing' ? (
        <div className="item writing">
          <span className="item-head"><Growth stage="seed" size={20} />Exercise</span>
          <Writing kind="author" concept={topic.id} label="Writing the exercise" compact waiting={lessonWriting ? 'Waiting for the lesson' : undefined} />
        </div>
      ) : (
        <>
          <span className="item">
            <Growth stage="seed" size={20} />
            <span className="fill">Exercise</span>
          </span>
          {topic.activity === 'locked' && <span className="locked">Opens after you finish the lessons</span>}
        </>
      ))}
      {next && (
        <>
          <span className="locked">Next topic</span>
          <button type="button" className="item link" onClick={() => go({ to: 'topic', topicId: next.id })}>{next.title}</button>
        </>
      )}
      <button type="button" className="item link" onClick={() => setFolded(true)}>Hide panel</button>
    </nav>
  );
}
