// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TOOL_NAMES } from '../../../../src/mcp';
import { JOB_BRIEFS } from '../../../../src/templates';
import { LIMITS } from '../../shared/limits';
import { codeLearnServer } from '../server';
import { AGENT_CLIS } from './agents';
import { spawnable } from './bridge';
import { briefsFrom, courseId } from './briefs';
import { JOBS, type JobKind } from './jobs';

const briefs = briefsFrom(JOB_BRIEFS, 'darwin');

/** One argument on a Windows command line, quoted as Node quotes it (libuv's quote_cmd_arg). */
function windowsWord(arg: string): string {
  if (arg === '') return '""';
  if (!/[\s"]/.test(arg)) return arg;
  if (!/["\\]/.test(arg)) return `"${arg}"`;
  let out = '"';
  let slashes = 0;
  for (const c of arg) {
    if (c === '\\') slashes++;
    else {
      out += c === '"' ? '\\'.repeat(slashes * 2 + 1) + '"' : '\\'.repeat(slashes) + c;
      slashes = 0;
    }
  }
  return `${out}${'\\'.repeat(slashes * 2)}"`;
}

describe('job briefs', () => {
  it("start with core's brief for the job, then add only the job's details", () => {
    const research = briefs.research('react-1', 'React', 'HTML', 'in-depth');
    expect(research.startsWith(JOB_BRIEFS.research)).toBe(true);
    expect(research).toContain('Course id: react-1');
    expect(research).toContain('React');
    expect(research).toContain('They already know: HTML');
    // The learner chose how deep: the number of single-skill topics follows it.
    expect(research).toContain('Depth: in depth, about 25 to 30 topics');
    expect(briefs.research('r', 'React', '', 'overview')).toContain('Depth: an overview, about 8 topics');
    expect(briefs.research('r', 'React', '', 'standard')).toContain('Depth: standard, about 15 topics');
    expect(briefs.easier('state', 'State').startsWith(JOB_BRIEFS.roadmap)).toBe(true);
    expect(briefs.setup('react@1', 'io', 'no test runner')).toContain('no test runner');
    // The exact track: a proposal for another id or version doesn't set up this course.
    // Found in the macOS journey: a unit-only track for an io course left the course unable to go on.
    expect(briefs.setup('python@3', 'io')).toContain('Propose exactly the track `python@3`: id `python`, version 3, offering style `io`.');
    // The track caches what the whole course will use, so the setup agent hears the course's concepts.
    expect(briefs.setup('django@1', 'unit', undefined, ['Project structure', 'Models and migrations'])).toContain('The course covers: Project structure; Models and migrations.');
    expect(briefs.author()).toBe(JOB_BRIEFS.author);
  });

  // Depth reached only the roadmap's planner: the reviewer added topics back, and every lesson was written the same.
  it('tells the reviewer the depth, so it keeps the course at the size the learner chose', () => {
    const review = briefs.review('overview');
    expect(review.startsWith(JOB_BRIEFS.review)).toBe(true);
    expect(review).toContain('Depth: an overview, about 8 topics.');
    expect(review).toContain('Keep the course at about that many topics');
  });

  // One run for several topics: fewer starts of the agent, and neighbouring lessons that match.
  it('asks one lesson run for several topics in order, each saved before the next, with its own depth and instructions', () => {
    const brief = briefs.lessons([
      { concept: 'values', title: 'Values' },
      { concept: 'state', title: 'State', depth: 'in-depth', instructions: 'Use Linux examples' },
    ]);
    expect(brief.startsWith(JOB_BRIEFS.lesson)).toBe(true);
    expect(brief).toContain('- values (Values)\n- state (State). Depth: in depth.');
    expect(brief).toMatch(/- state \(State\)\. .* The learner's instructions for this topic: Use Linux examples/);
    expect(brief).toContain('Save each one with `save_lesson` before you start the next');
    // One topic is the brief as it always was.
    expect(briefs.lessons([{ concept: 'values', title: 'Values' }])).toBe(briefs.lesson('values', 'Values'));
  });

  it('gives a lesson and an exercise their own lines for an overview and for in depth, and none for standard', () => {
    expect(briefs.lesson('values', 'Values', '', 'overview')).toMatch(/Depth: an overview\. .*about a three-minute read/);
    expect(briefs.lesson('values', 'Values', '', 'in-depth')).toMatch(/Depth: in depth\. .*about an eight-minute read/);
    expect(briefs.author('', 'overview')).toMatch(/Depth: an overview\. .*main use/);
    expect(briefs.author('', 'in-depth')).toMatch(/Depth: in depth\. .*edge cases/);
    for (const brief of [briefs.lesson('values', 'Values', '', 'standard'), briefs.lesson('values', 'Values'), briefs.author('', 'standard'), briefs.author()]) {
      expect(brief).not.toContain('Depth:');
    }
  });

  it("adds a rebuilt topic's instructions to its lesson and exercise briefs, only when there are some", () => {
    expect(briefs.lesson('values', 'Values', 'Use Linux examples')).toContain("The learner's instructions for this topic: Use Linux examples");
    expect(briefs.author('Use Linux examples')).toContain("The learner's instructions for this topic: Use Linux examples");
    expect(briefs.lesson('values', 'Values', '')).not.toContain('instructions for this topic');
    expect(briefs.author('')).toBe(JOB_BRIEFS.author);
  });

  it("gives the tutor the learner's own code and question", () => {
    const tutor = briefs.tutor('the activity "count-1"', 'Why?', { 'main.c': 'int main() {}' });
    expect(tutor.startsWith(JOB_BRIEFS.tutor)).toBe(true);
    expect(tutor).toContain('main.c');
    expect(tutor).toContain('int main() {}');
    expect(tutor.endsWith('They ask: Why?')).toBe(true);
  });

  it("keeps every agent's tutor turn within Windows' command-line limit, whatever the learner's code (§3.1)", () => {
    // Windows takes at most 32,767 characters for a whole command line, and quoting can double a brief's.
    const files = { 'src/main.c': '"\\'.repeat(100_000) };
    const question = '"'.repeat(LIMITS.words);
    const brief = briefsFrom(JOB_BRIEFS, 'win32').tutor('the activity "count-1"', question, files);
    const home = 'C:\\Users\\Ann Lee\\AppData\\Local';
    const server = codeLearnServer({
      runtime: `${home}\\Programs\\code-learn\\code-learn.exe`,
      coreDir: `${home}\\Programs\\code-learn\\resources\\core`,
      ws: 'C:\\Users\\Ann Lee\\code-learn',
      // A long PATH, as on a computer with many tools installed.
      env: { PATH: Array.from({ length: 40 }, (_, i) => `C:\\Program Files\\Tool ${i}\\bin`).join(';'), CODE_LEARN_HOME: 'C:\\Users\\Ann Lee\\.code-learn' },
    })('a-course-0', JOBS.tutor.tools, `${home}\\Temp\\code-learn-progress\\job.json`);
    for (const [id, cli] of Object.entries(AGENT_CLIS)) {
      const { args } = cli.launch({ prompt: brief, server, tools: JOBS.tutor.tools, model: 'a-model', resume: '0b7d4c2e-9a1f-4e55-8a3e-2f6c1d9e7b10', web: false, toolTimeoutSec: 600 });
      for (const exe of [{ path: `${home}\\..\\..\\.local\\bin\\${cli.bin}.exe`, js: false }, { path: `${home}\\..\\Roaming\\npm\\node_modules\\${cli.bin}\\cli.js`, js: true }]) {
        const target = spawnable(exe, args, server.command);
        const line = [target.file, ...target.args].map(windowsWord).join(' ');
        expect([id, exe.js, line.length < 32_767]).toEqual([id, exe.js, true]);
      }
    }
  });

  it("keeps a setup brief within Windows' limit, whatever the failed proposal's problem and the course's concepts say", () => {
    const problem = '"'.repeat(100_000);
    const concepts = Array.from({ length: 200 }, () => '"'.repeat(60));
    expect(briefsFrom(JOB_BRIEFS, 'win32').setup('c@1', 'io', problem, concepts).length).toBeLessThan(JOB_BRIEFS.setup.length + 9000);
    expect(briefsFrom(JOB_BRIEFS, 'darwin').setup('c@1', 'io', problem, concepts).length).toBeLessThan(JOB_BRIEFS.setup.length + 33_000);
  });

  it('gives the tutor more code where the command line allows it', () => {
    const code = 'x'.repeat(40_000);
    expect(briefsFrom(JOB_BRIEFS, 'darwin').tutor('here', 'Why?', { 'a.c': code })).toContain(code);
    expect(briefsFrom(JOB_BRIEFS, 'win32').tutor('here', 'Why?', { 'a.c': code })).not.toContain(code);
  });

  it('makes a new course id that core accepts', () => {
    expect(courseId('C++ Pointers & Memory!', 0)).toBe('c-pointers-memory-0');
    expect(courseId('日本語', 35)).toBe('course-z');
    expect(courseId('x'.repeat(100), 1)).toMatch(/^[a-z0-9][a-z0-9._-]{0,63}$/);
  });
});

// JOBS is the one list of each job's code-learn tools (DESIGN §3.2); core's briefs must keep to it.
describe('each job\'s tools and its brief', () => {
  const kinds = Object.keys(JOBS) as JobKind[];
  // A tool is named in backticks: `check` is also the plain word in "runs every check in a sandbox".
  const named = (brief: string) => new Set([...brief.matchAll(new RegExp(`\`(${TOOL_NAMES.join('|')})\``, 'g'))].map((m) => m[1]!));

  it('has a core brief for exactly the desktop\'s jobs, so the two JobKinds agree', () => {
    expect(Object.keys(JOB_BRIEFS).sort()).toEqual([...kinds].sort());
  });

  it('gives each job only real code-learn tools', () => {
    for (const k of kinds) for (const t of JOBS[k].tools) expect([k, (TOOL_NAMES as readonly string[]).includes(t)]).toEqual([k, true]);
  });

  it.each(kinds)('the %s brief names only its own tools', (kind) => {
    expect([...named(JOB_BRIEFS[kind])].filter((t) => !JOBS[kind].tools.includes(t))).toEqual([]);
  });

  it('keeps the tutor away from saves', () => {
    expect(JOBS.tutor.tools.filter((t) => t.startsWith('save_'))).toEqual([]);
  });
});

it('carries the lessons-only choice as a research detail', () => {
  expect(briefs.research('course', 'History', '', 'standard', 'none')).toContain('Save style: none and no track.');
  // The shared rules name `style: none` for every course; only a lessons-only course is told to save it.
  expect(briefs.research('course', 'History', '', 'standard', 'code')).not.toContain('Save style: none');
});

// Only where Code is off, so a coding course's planner reads nothing about other subjects.
it('tells the planner of a quiz or lessons-only course what a topic and its practice are when the subject is not programming', () => {
  for (const practice of ['quiz', 'none'] as const) {
    const brief = briefs.research('course', 'English grammar', '', 'standard', practice);
    expect(brief).toContain("If the subject isn't programming");
    expect(brief).toContain('An example for a subject without code: "subject-verb agreement with collective nouns", not "grammar".');
    expect(brief).toContain('a decision the learner makes in a concrete case');
  }
  for (const practice of ['code', 'both'] as const) {
    expect(briefs.research('course', 'React', '', 'standard', practice)).not.toContain("If the subject isn't programming");
  }
});

it('carries quiz practice to the research brief without a track', () => {
  expect(briefs.research('judgment', 'Judgment', '', 'standard', 'quiz')).toContain('Save style: quiz and no track.');
});

it('carries code and quiz practice to the research brief as a mixed course that needs a track', () => {
  expect(briefs.research('mixed', 'Mixed', '', 'standard', 'both')).toContain('Save style: both and a track.');
  expect(briefs.research('mixed', 'Mixed', '', 'standard', 'both')).not.toContain('Save style: both and no track.');
});

it('adds the learner instructions to the research brief only when they are given', () => {
  const instructed = briefs.research('course', 'Shell', '', 'standard', 'code', 'Linux examples, short lessons');
  expect(instructed).toContain('The learner\'s instructions for the course: Linux examples, short lessons');
  expect(briefs.research('course', 'Shell', '', 'standard', 'code', '')).not.toContain('instructions');
  expect(briefs.research('course', 'Shell', '', 'standard')).not.toContain('instructions');
});
