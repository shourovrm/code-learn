import type { TopicView } from '../../../shared/api';
import { useRouter } from '../../app/router';
import { Button } from '../../ui/Button';

/**
 * Previous and Next through every topic, in roadmap order: to a topic's exercise when it is open or passed, otherwise
 * to its topic page. The ends have no step past them.
 */
export function ExerciseNav({ topics, concept }: { topics: TopicView[]; concept: string }) {
  const { go } = useRouter();
  const at = topics.findIndex((t) => t.id === concept);
  if (at < 0) return null;
  const goTo = (topic: TopicView) => {
    if (topic.activity === 'open' || topic.activity === 'passed') go({ to: 'practice', concept: topic.id });
    else go({ to: 'topic', topicId: topic.id });
  };
  return (
    <nav className="exnav" aria-label="Topics">
      <Button variant="ghost" disabled={at === 0} onClick={() => goTo(topics[at - 1]!)}>‹ Previous</Button>
      <span className="quiet-text">Topic {at + 1} of {topics.length}</span>
      <Button variant="ghost" disabled={at === topics.length - 1} onClick={() => goTo(topics[at + 1]!)}>Next ›</Button>
    </nav>
  );
}
