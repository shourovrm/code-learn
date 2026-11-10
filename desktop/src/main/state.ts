// desktop.json in the app's userData folder (DESIGN §2): the chosen agent, the
// workspace folder, and the tutor's session per course. It carries format_version and is written
// atomically, like every code-learn-owned file.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentId, Depth, SyncResult } from '../shared/api';

export interface DesktopState {
  format_version: 1;
  agent?: AgentId;
  /** The workspace folder, when it isn't ~/code-learn (O5). */
  workspace?: string;
  /** Tutor session or thread ids, keyed `course|agent`. */
  sessions: Record<string, string>;
  /** The course on screen, one the learner approved. Before approval a roadmap is a draft and no work starts (§4.2). */
  approved?: string;
  /** Every course the learner approved, oldest first (§4.13). A file from before several courses has `approved` alone. */
  courses?: string[];
  /** The words the learner typed for each course researched before roadmaps had titles: its name on screen (W-5). */
  names?: Record<string, string>;
  /** The activity style to restore after turning activities off. */
  activityStyles?: Record<string, string>;
  /** The learner's model choice per agent (O6). Absent: the recommended one. */
  models?: Partial<Record<AgentId, string>>;
  /** The instructions given when a topic was last rebuilt, keyed `course|concept`, for its lesson and exercise jobs. */
  rebuildNotes?: Record<string, string>;
  /** How deep the learner asked each course to go, for its lesson and exercise jobs. Absent: standard. */
  courseDepths?: Record<string, Depth>;
  /** The depth chosen when a topic was rebuilt, keyed `course|concept`: it replaces the course's depth for that topic. */
  topicDepths?: Record<string, Depth>;
  /** The private GitHub repository the learner syncs with (DESIGN "Sync"), and how its last sync went. */
  sync?: { via: 'gh' | 'git'; name: string; remote: string; last?: SyncResult };
}

export const workspaceOf = (state: DesktopState, home: string) => state.workspace ?? join(home, 'code-learn');

const omitKey = <T>(record: Record<string, T> | undefined, key: string) =>
  record && Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

/**
 * The state once a course is deleted: off the list, with its session, name and activity style gone. If it was on screen,
 * the newest course left is (none when no course is left).
 */
export function withoutCourse(state: DesktopState, course: string): DesktopState {
  const courses = coursesOf(state).filter((id) => id !== course);
  return {
    ...state,
    courses,
    approved: state.approved === course ? courses.at(-1) : state.approved,
    sessions: Object.fromEntries(Object.entries(state.sessions).filter(([key]) => !key.startsWith(`${course}|`))),
    names: omitKey(state.names, course),
    activityStyles: omitKey(state.activityStyles, course),
    rebuildNotes: state.rebuildNotes && Object.fromEntries(Object.entries(state.rebuildNotes).filter(([key]) => !key.startsWith(`${course}|`))),
    courseDepths: omitKey(state.courseDepths, course),
    topicDepths: state.topicDepths && Object.fromEntries(Object.entries(state.topicDepths).filter(([key]) => !key.startsWith(`${course}|`))),
  };
}

/** The name a renamed course shows, with its typed name removed: the title shows instead. */
export const withoutName = (state: DesktopState, course: string): DesktopState => ({ ...state, names: omitKey(state.names, course) });

/** The learner's courses, oldest first (§4.13). */
export const coursesOf = (state: DesktopState): string[] => state.courses ?? (state.approved ? [state.approved] : []);

export function desktopState(dir: string) {
  const file = join(dir, 'desktop.json');
  const read = (): DesktopState => {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      return { format_version: 1, sessions: {} };
    }
    const parsed = JSON.parse(raw) as DesktopState;
    if (parsed.format_version !== 1) throw new Error(`Unknown format_version in ${file}`);
    return parsed;
  };
  return {
    read,
    update(change: (s: DesktopState) => DesktopState): DesktopState {
      const next = change(read());
      mkdirSync(dir, { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
      renameSync(temp, file);
      return next;
    },
  };
}
