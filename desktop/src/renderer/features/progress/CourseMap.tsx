import { useState, type ReactNode } from 'react';
import type { CourseView, Usage } from '../../../shared/api';
import { useRouter } from '../../app/router';
import { useBusy } from '../../app/useBusy';
import { useApi } from '../../app/api';
import { Failed, Stale, Stalled } from '../../app/Problems';
import { useCourse } from '../../app/useCourse';
import { useLoad } from '../../app/useLoad';
import { Button } from '../../ui/Button';
import { stagger } from '../../ui/motion';
import { Goal } from '../learn/Goal';
import { Complete } from './Complete';
import { Path } from './Path';
import { RebuildBar, RebuildDialog } from './Rebuild';
import { SetupProgress } from './SetupProgress';

/** The course as a path the learner moves along, with mastery so far and what the agent used beside it. */
export function CourseMap() {
  const api = useApi();
  const { fail } = useRouter();
  const changing = useBusy();
  const { data: course, error, stale, reload } = useCourse();
  // Read again whenever the course is: jobs that finish while the map is open add to it.
  const { data: usage } = useLoad(() => api.usage(), [course]);
  // A finished course celebrates first; View course opens its map again.
  const [viewing, setViewing] = useState(false);
  // Which way the Activities switch is going: it can take a while (a roadmap job on, setup stopping off).
  const [turning, setTurning] = useState<'on' | 'off'>('on');
  // Rebuild's select mode: the topics ticked so far, and the confirmation once Rebuild is pressed.
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  if (error) return <Failed error={error} retry={reload} />;
  if (course === undefined) return null;
  if (course === null) return <Goal />;
  if (course.done && !viewing) return <Complete course={course} onView={() => setViewing(true)} />;
  const topics = course.topics;
  const toggle = (id: string) => setChosen((ids) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const endPicking = () => {
    setPicking(false);
    setChosen(new Set());
  };
  // Leaves select mode first, then asks core; the map is read again either way, so it shows what core did.
  async function rebuild(replace: boolean, instructions: string) {
    const ids = [...chosen];
    setConfirming(false);
    endPicking();
    try {
      await api.rebuildTopics(ids, replace, instructions);
    } catch (e) {
      fail(e);
    }
    reload();
  }
  return (
    <main className="main map">
      <div className="map-main">
        <div className="map-head a-up">
          <div className="map-title">
            <h1 className="h2">{course.title}</h1>
            {!picking && <Button variant="ghost" onClick={() => setPicking(true)}>Rebuild…</Button>}
          </div>
          {course.goal !== course.title && <p className="sub">{course.goal}</p>}
        </div>
        <SetupProgress course={course} />
        {picking && (
          <RebuildBar
            topics={topics}
            chosen={chosen}
            onSelectAll={(all) => setChosen(new Set(all ? topics.map((t) => t.id) : []))}
            onCancel={endPicking}
            onRebuild={() => setConfirming(true)}
          />
        )}
        <Path course={course} picking={picking ? { chosen, toggle } : undefined} />
      </div>
      {confirming && (
        <RebuildDialog
          topics={topics.filter((t) => chosen.has(t.id))}
          everything={chosen.size === topics.length}
          onClose={() => setConfirming(false)}
          onConfirm={rebuild}
        />
      )}
      <Aside course={course} usage={usage ?? null}>
        <div className="card activities">
          <h2 className="h3 fill" id="activities-label">Exercises</h2>
          <button type="button" className="switch" role="switch" aria-labelledby="activities-label" aria-describedby={changing.busy ? 'activities-why' : undefined} aria-checked={course.activities} disabled={changing.busy} onClick={() => changing.guard(async () => {
            setTurning(course.activities ? 'off' : 'on');
            try {
              await api.setActivities(!course.activities);
              reload();
            } catch (e) {
              fail(e);
            }
          })}><span className="thumb" /></button>
          {changing.busy && <p className="quiet-text why" id="activities-why" role="status">Turning exercises {turning}</p>}
        </div>
      </Aside>
      {course.stalled && <Stalled stalled={course.stalled} work={course.stalledWork} later={course.later} retry={reload} />}
      {stale !== undefined && <Stale error={stale} retry={reload} />}
    </main>
  );
}

function Aside({ course, usage, children }: { course: CourseView; usage: Usage | null; children: ReactNode }) {
  const started = course.topics.filter((t) => t.state !== 'later');
  const lessons = course.topics.flatMap((t) => t.lessons);
  const mastered = course.topics.filter((t) => t.state === 'mastered').length;
  return (
    <aside className="map-side">
      <section className="card a-up" style={stagger(1)} aria-labelledby="mastery-t">
        <h2 className="h3" id="mastery-t">{course.activities ? 'Mastery' : 'Lessons read'}</h2>
        {course.activities ? (
          <>
            <p className="tally"><b>{mastered}</b> of {course.topics.length} {course.topics.length === 1 ? 'topic' : 'topics'}</p>
            {started.map((t, i) => (
              <div key={t.id} className="mastery-row">
                <span>{t.title}</span>
                <div className="bar" role="img" aria-label={`${t.title}: ${t.state === 'mastered' ? 'mastered' : 'in progress'}`}>
                  <i style={{ width: `${Math.round(t.mastery * 100)}%`, ...stagger(0, 500 + i * 100) }} />
                </div>
              </div>
            ))}
          </>
        ) : <p className="tally"><b>{lessons.filter((l) => l.state === 'read').length}</b> of {lessons.length} lessons</p>}
      </section>
      {children}
      {usage && usage.total.costUsd > 0 && <UsageCard cost={usage.total.costUsd} />}
    </aside>
  );
}

const dollars = (n: number) => (n < 0.01 ? 'under $0.01' : `$${n.toFixed(2)}`);

/**
 * What the agent estimated the course has cost so far, once it reported a cost (§4.12). Only the estimate: token
 * counts are the agent's bookkeeping, agent names stay on the connect screen, and code-learn can't tell a plan from an
 * API key, so it says nothing about billing.
 */
function UsageCard({ cost }: { cost: number }) {
  return (
    <section className="card usage a-up" style={stagger(2)} aria-labelledby="usage-t">
      <h2 className="h3" id="usage-t">Usage</h2>
      <dl>
        <dt>Estimated cost</dt>
        <dd>{dollars(cost)}</dd>
      </dl>
    </section>
  );
}
