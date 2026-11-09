import type { LessonState, TopicView } from '../../../shared/api';
import { useRouter } from '../../app/router';
import { Growth, type Stage } from '../../ui/Growth';

const LESSON_STAGE: Record<LessonState, Stage> = { read: 'sprout', ready: 'shoot', writing: 'seed', failed: 'seed' };

/** The topic's lessons and this exercise beside the task, each drawn as how far it has come. A lesson opens from here. */
export function TopicSteps({ topic, title }: { topic: TopicView; title: string }) {
  const { go } = useRouter();
  return (
    <nav className="topic-steps" aria-label="This topic">
      <h2 className="topic-steps-head">This topic</h2>
      <ol>
        {topic.lessons.map((lesson) => (
          <li key={lesson.id}>
            <Growth stage={LESSON_STAGE[lesson.state]} />
            {lesson.state === 'read' || lesson.state === 'ready'
              ? <button type="button" className="link" onClick={() => go({ to: 'lesson', lessonId: lesson.id })}>{lesson.title}</button>
              : <span>{lesson.title}</span>}
          </li>
        ))}
        <li aria-current="step">
          <Growth stage={topic.activity === 'passed' ? 'sprout' : 'shoot'} />
          {title}
        </li>
      </ol>
    </nav>
  );
}
