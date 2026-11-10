// Job briefs (DESIGN §3.2, §8). The brief itself is core's JOB_BRIEFS
// (src/templates.ts), so the terminal and the app say the same thing; the app
// adds only the job's details: the goal, request, concept or track.
import type { Depth, Practice } from '../../shared/api';
import type { JobKind } from './jobs';

/**
 * The most characters of learner code a tutor brief carries, and of a failed proposal's problem a setup brief
 * carries. A brief is one command-line argument, and Windows takes 32,767 characters for a whole command line, which
 * quoting can double, so there they are smaller (§3.1).
 */
const ROOM = { code: 64 * 1024, problem: 16 * 1024 };
const WINDOWS_ROOM = { code: 8 * 1024, problem: 4 * 1024 };

/** The learner's chosen depth, as the research brief says it. */
const DEPTH: Record<Depth, string> = {
  overview: 'an overview, about 8 topics',
  standard: 'standard, about 15 topics',
  'in-depth': 'in depth, about 25 to 30 topics',
};

/**
 * Added to an author's brief when it relaunches in its own session: its saves didn't pass, so the next attempt must
 * differ, not repeat (adaptive-activities proposal, the authoring loop).
 */
export const CHANGE_APPROACH =
  "Your last attempt didn't save an exercise that passed code-learn's checks. Change your approach rather than repeating it: write a smaller task, a different task of the kind the concept needs, or simpler, deterministic tests.";

/** What a depth means for one lesson. Standard is the lesson rules as they stand, so it adds nothing. */
const LESSON_DEPTH: Record<Depth, string | false> = {
  overview: 'Depth: an overview. Teach only what the learner needs to use the idea: two or three steps and one mistake, in about a three-minute read. This length replaces the five-minute one above.',
  standard: false,
  'in-depth': 'Depth: in depth. Go past the essentials: add steps for the edge cases and for why it works, and show two mistakes corrected, in about an eight-minute read. This length replaces the five-minute one above, and a lesson this long does not mean the concept is too big.',
};

/** What a depth means for one exercise or quiz. The difficulty still comes from code-learn. */
const ACTIVITY_DEPTH: Record<Depth, string | false> = {
  overview: "Depth: an overview. Practise the idea's main use: keep the rules short and leave rare edge cases out.",
  standard: false,
  'in-depth': "Depth: in depth. Bring in the edge cases the lesson taught: name them in the statement, and cover them in the hidden tests or the quiz's questions.",
};

/** What the research brief says about the practice choice: quiz and lessons only have no track, and both needs one. */
const STYLE: Record<Practice, string | false> = {
  code: false,
  quiz: 'Save style: quiz and no track.',
  none: 'Save style: none and no track.',
  both: 'Save style: both and a track.',
};

/** A topic of a lesson run: its concept, and what the learner asked for when rebuilding it, if anything. */
export interface LessonTopic {
  concept: string;
  title: string;
  instructions?: string;
  depth?: Depth;
}

export function briefsFrom(base: Record<JobKind, string>, platform: NodeJS.Platform = process.platform) {
  const room = platform === 'win32' ? WINDOWS_ROOM : ROOM;
  const brief = (kind: JobKind, ...details: (string | false | undefined)[]) => [base[kind], ...details.filter(Boolean)].join('\n\n');
  return {
    research: (course: string, topic: string, known: string, depth: Depth, practice: Practice = 'code', instructions = '') =>
      brief(
        'research',
        `Course id: ${course}`,
        `The learner wants to learn: ${topic}`,
        known ? `They already know: ${known}` : 'They know nothing about it yet.',
        `Depth: ${DEPTH[depth]}. Each topic is one skill.`,
        STYLE[practice],
        instructions && `The learner's instructions for the course: ${instructions}`,
      ),
    /** The reviewer adds missing skills, so it is told the size to keep. */
    review: (depth: Depth) => brief('review', `Depth: ${DEPTH[depth]}. Keep the course at about that many topics: to add a missing core skill, fold it into a topic or put it in place of a less central one.`),
    roadmap: (request: string) => brief('roadmap', `The learner asks: ${request}`),
    easier: (concept: string, title: string) => brief('roadmap', `Make "${title}" (${concept}) easier: add one smaller topic that it requires.`),
    /** `concepts`: the course's concept titles, so the track caches every dependency the course will use. */
    setup: (track: string, style: string, problem?: string, concepts: string[] = []) => {
      const [id, version] = track.split('@');
      return brief(
        'setup',
        `Propose exactly the track \`${track}\`: id \`${id}\`, version ${version}, offering style \`${style}\`.`,
        concepts.length > 0 && `The course covers: ${concepts.join('; ')}.`.slice(0, room.problem),
        problem && `The last proposal failed its checks: ${problem.slice(0, room.problem)}`,
      );
    },
    /** `instructions`: what the learner asked for when rebuilding this topic, if anything. `depth`: the topic's, when one was chosen. */
    lesson: (concept: string, title: string, instructions = '', depth: Depth = 'standard') =>
      brief('lesson', `Concept: ${concept} (${title})`, LESSON_DEPTH[depth], instructions && `The learner's instructions for this topic: ${instructions}`),
    /**
     * One run that writes a lesson for each topic, in order: the agent starts once, and neighbouring lessons match
     * because one agent writes them together. One topic is `lesson`'s brief.
     */
    lessons(topics: LessonTopic[]): string {
      if (topics.length === 1) return this.lesson(topics[0].concept, topics[0].title, topics[0].instructions, topics[0].depth);
      const lines = topics.map((t) => {
        const details = [LESSON_DEPTH[t.depth ?? 'standard'], t.instructions && `The learner's instructions for this topic: ${t.instructions}`].filter(Boolean);
        return details.length > 0 ? `- ${t.concept} (${t.title}). ${details.join(' ')}` : `- ${t.concept} (${t.title})`;
      });
      return brief(
        'lesson',
        `Concepts, one lesson each, in this order:\n${lines.join('\n')}`,
        'Follow every step above for each concept. Save each one with `save_lesson` before you start the next, so a finished lesson is kept if a later one fails.',
      );
    },
    author: (instructions = '', depth: Depth = 'standard') =>
      brief('author', ACTIVITY_DEPTH[depth], instructions && `The learner's instructions for this topic: ${instructions}`),
    tutor: (place: string, question: string, files?: Record<string, string>) => {
      const code = files && Object.entries(files).map(([path, text]) => `${path}:\n\`\`\`\n${text}\n\`\`\``).join('\n\n').slice(0, room.code);
      return brief('tutor', `The learner is on ${place}.`, code && `Their code:\n\n${code}`, `They ask: ${question}`);
    },
  };
}

export type Briefs = ReturnType<typeof briefsFrom>;

/** A new course id for a topic, in core's id format. `n` keeps it unique. */
export function courseId(topic: string, n: number): string {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return `${slug || 'course'}-${n.toString(36)}`;
}
