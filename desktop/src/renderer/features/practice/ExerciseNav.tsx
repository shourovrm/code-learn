import type { TopicView } from '../../../shared/api';
import { useRouter } from '../../app/router';
import { Button } from '../../ui/Button';

/**
 * Previous and Next between the course's exercises, in roadmap order. An exercise is a topic whose activity is open
 * or passed; the ends have no step past them.
 */
export function ExerciseNav({ topics, concept }: { topics: TopicView[]; concept: string }) {
  const { go } = useRouter();
  const exercises = topics.filter((t) => t.activity === 'open' || t.activity === 'passed');
  const at = exercises.findIndex((t) => t.id === concept);
  if (at < 0) return null;
  const goTo = (topic: TopicView) => go({ to: 'practice', concept: topic.id });
  return (
    <nav className="exnav" aria-label="Exercises">
      <Button variant="ghost" disabled={at === 0} onClick={() => goTo(exercises[at - 1]!)}>‹ Previous</Button>
      <span className="quiet-text">{at + 1} of {exercises.length}</span>
      <Button variant="ghost" disabled={at === exercises.length - 1} onClick={() => goTo(exercises[at + 1]!)}>Next ›</Button>
    </nav>
  );
}
