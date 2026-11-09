import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { CourseSummary, Practice } from '../../../shared/api';
import { LIMITS } from '../../../shared/limits';
import { useApi } from '../../app/api';
import { SAY, problemOf, sayOf } from '../../app/errors';
import { Failed } from '../../app/Problems';
import { useRouter } from '../../app/router';
import { useLoad } from '../../app/useLoad';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { hueColor } from '../../ui/Sprig';

const PRACTICE: Record<Practice, string> = { code: 'Code', quiz: 'Quiz', none: 'Lessons only' };

/** The line under a course's name: how it is practised, and the toolchain it uses. */
function metaOf(course: CourseSummary): string {
  return course.track ? `${PRACTICE[course.practice]} · ${course.track} toolchain` : PRACTICE[course.practice];
}

/** The learner's courses, to rename and delete (§4.13). The quick list at the foot of the sidebar stays for switching. */
export function CoursesPage() {
  const api = useApi();
  const { go, fail } = useRouter();
  const { data: courses, error, reload } = useLoad(() => api.courses(), []);
  const [renaming, setRenaming] = useState<{ id: string; title: string }>();
  const [deleting, setDeleting] = useState<CourseSummary>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ id: string; text: string }>();
  if (error) return <Failed error={error} retry={reload} />;
  if (!courses) return null;

  /**
   * Runs one change to a course, then shows the list again. A failure needing the banner goes there; any other is
   * said on the course's row. Returns whether the change was made.
   */
  async function change(id: string, couldnt: string, work: () => Promise<unknown>): Promise<boolean> {
    setFailed(undefined);
    try {
      await work();
      reload();
      // The sidebar's courses and course on screen are read again when the route changes.
      go({ to: 'courses' });
      return true;
    } catch (e) {
      const problem = problemOf(e);
      if (problem === 'repair' || problem === 'connect') fail(e);
      else {
        const say = sayOf(e, problem);
        setFailed({ id, text: say === SAY.other ? `Couldn't ${couldnt}.` : say });
      }
      return false;
    }
  }

  async function rename(e: FormEvent, course: CourseSummary, title: string) {
    e.preventDefault();
    if (await change(course.id, 'rename the course', () => api.renameCourse(course.id, title))) setRenaming(undefined);
  }

  async function remove(course: CourseSummary) {
    setBusy(true);
    await change(course.id, 'delete the course', () => api.deleteCourse(course.id));
    setBusy(false);
    setDeleting(undefined);
  }

  function cancelRename(e: KeyboardEvent) {
    if (e.key === 'Escape') setRenaming(undefined);
  }

  return (
    <main className="main page">
      <h1 className="h2 a-up" tabIndex={-1}>Courses</h1>
      <p className="sub">Rename or delete your courses. The quick list at the bottom left stays for switching.</p>
      {courses.length === 0 && <p className="quiet-text">No course yet.</p>}
      <ul className="course-list plain">
        {courses.map((course) => (
          <li key={course.id} className={course.current ? 'card course current' : 'card course'}>
            <span className="badge" style={{ background: hueColor(course.track) }} aria-hidden="true">{course.title.charAt(0).toUpperCase()}</span>
            {renaming?.id === course.id ? (
              <form className="edit" onSubmit={(e) => void rename(e, course, renaming.title.trim())}>
                <Field aria-label="Course name" value={renaming.title} maxLength={LIMITS.courseTitle} autoFocus onKeyDown={cancelRename} onChange={(e) => setRenaming({ id: course.id, title: e.target.value })} />
                <Button type="submit" disabled={!renaming.title.trim()}>Save</Button>
                <Button variant="ghost" onClick={() => setRenaming(undefined)}>Cancel</Button>
              </form>
            ) : (
              <>
                <div className="t">
                  <b>{course.title}</b>
                  {course.current && <span className="open-tag">Open</span>}
                  <p className="quiet-text">{metaOf(course)}</p>
                </div>
                <Button variant="ghost" onClick={() => setRenaming({ id: course.id, title: course.title })}>Rename</Button>
                <Button variant="ghost" onClick={() => setDeleting(course)}>Delete</Button>
              </>
            )}
            {failed?.id === course.id && <p className="quiet-text" role="status">{failed.text}</p>}
          </li>
        ))}
      </ul>
      {deleting && (
        <Dialog
          title={`Delete "${deleting.title}"?`}
          text="This removes, and can't be undone:"
          body={(
            <>
              <ul className="quiet-text">
                <li>its roadmap, lessons and exercises</li>
                <li>your attempts and mastery for it</li>
                <li>your exercise files in the workspace</li>
              </ul>
              {deleting.track && <p className="quiet-text">The {deleting.track} toolchain stays installed. Remove it under Toolchains if no course needs it.</p>}
            </>
          )}
          onClose={() => setDeleting(undefined)}
        >
          <Button variant="ghost" size="lg" onClick={() => setDeleting(undefined)}>Cancel</Button>
          <Button size="lg" disabled={busy} onClick={() => void remove(deleting)}>Delete course</Button>
        </Dialog>
      )}
    </main>
  );
}
