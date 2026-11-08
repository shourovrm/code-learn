// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CHANGED } from '../shared/api';
import { live, practising, until } from './testing/fakes';

describe('live CodeLearnApi: the activity: files, Try it, Check, Run and lesson examples (§4.5, §4.8, §4.10)', () => {
  it('forwards check progress to listeners, each visible test\'s result but nothing hidden, until they stop listening', async () => {
    const t = live();
    const { id } = await practising(t);
    const seen: unknown[] = [];
    const off = t.api.onCheckProgress((p) => seen.push(p));
    await t.api.tryIt(id, 'run-1');
    await t.api.check(id, 'run-2');
    const test = { name: 'visible/01', status: 'fail', message: 'Output differs from the expected output.', actual: '0\n' };
    expect(seen).toEqual([
      { run: 'run-1', phase: 'visible', done: 1, total: 1 },
      { run: 'run-1', phase: 'visible', done: 1, total: 1, test },
      { run: 'run-2', phase: 'visible', done: 1, total: 1 },
      { run: 'run-2', phase: 'hidden', done: 1, total: 2 },
    ]);
    expect(JSON.stringify(seen)).not.toContain('CANARY');
    off();
    await t.api.check(id, 'run-3');
    expect(seen).toHaveLength(4);
  });

  it('runs the program with typed input, sends what it prints tagged with the run, and records nothing', async () => {
    const t = live();
    const { id } = await practising(t);
    expect((await t.api.activity('values')).run).toBe('./main');
    const heard: unknown[] = [];
    t.api.onRunOutput((o) => heard.push(o));
    const ran = t.api.runProgram(id, 'run-1');
    await vi.waitFor(() => expect(heard).toHaveLength(2));
    expect(await t.api.sendRunInput('run-1', 'Ada\n')).toBe(true);
    expect(await ran).toEqual({ kind: 'ran', exit: 0, stage: 'run', timedOut: false, stopped: false, flooded: false, outOfMemory: false });
    expect(heard).toEqual([
      { run: 'run-1', started: 'run', limitMs: 120_000 },
      { run: 'run-1', stream: 'stdout', text: 'name? ' },
      { run: 'run-1', stream: 'stdout', text: 'hello Ada\n' },
      { run: 'run-1', stream: 'stderr', text: 'a warning\n' },
    ]);
    expect(t.c.checks).toEqual([]);
    // After the end, input goes nowhere.
    expect(await t.api.sendRunInput('run-1', 'late\n')).toBe(false);
  });

  it('stops a program when asked, even before it has started', async () => {
    const t = live();
    const { id } = await practising(t);
    const ran = t.api.runProgram(id, 'run-1');
    await t.api.stopRun('run-1');
    expect(await ran).toMatchObject({ kind: 'ran', stopped: true });
    // Stopped before it started, so it never reached core.
    expect(t.c.runs).toEqual([]);
    const again = t.api.runProgram(id, 'run-2');
    await vi.waitFor(() => expect(t.c.runs).toHaveLength(1));
    await t.api.stopRun('run-2');
    expect(await again).toMatchObject({ kind: 'ran', stopped: true });
  });

  it('quitting stops a running program and waits until it has ended', async () => {
    const t = live();
    const { id } = await practising(t);
    let finishKill: (() => void) | undefined;
    const start = t.app.runInteractive;
    t.app.runInteractive = async (ws, slug, bound, output, options) => {
      const program = await start(ws, slug, bound, output, options);
      return { ...program, kill: () => void (finishKill = () => program.kill()) };
    };
    const ran = t.api.runProgram(id, 'run-1');
    await vi.waitFor(() => expect(t.c.runs).toHaveLength(1));
    let quit = false;
    const stopping = t.api.stop().then(() => (quit = true));
    await vi.waitFor(() => expect(finishKill).toBeDefined());
    await new Promise((r) => setTimeout(r, 10));
    expect(quit).toBe(false);
    finishKill!();
    await stopping;
    expect(await ran).toMatchObject({ kind: 'ran', stopped: true });
  });

  it('says why a program couldn\'t run when the sandbox is down, and records nothing', async () => {
    const t = live();
    const { id } = await practising(t);
    t.c.down = true;
    expect(await t.api.runProgram(id, 'run-1')).toEqual({ kind: 'not-run', reason: expect.stringMatching(/sandbox/) });
  });

  it('says whether Come back later can move on: not when leaving the stuck topic opens nothing else', async () => {
    const t = live();
    const { id } = await practising(t);
    t.c.stuck = 'values';
    // State requires Values: leaving Values for later opens State (core §7).
    expect(await t.api.check(id, 'run-1')).toMatchObject({ stuck: true, later: true });
    t.c.roadmap!.concepts = t.c.roadmap!.concepts.filter((c) => c.id === 'values');
    expect(await t.api.check(id, 'run-2')).toMatchObject({ stuck: true, later: false });
    t.c.roadmap!.concepts.push({ id: 'forms', title: 'Forms', requires: [] });
    expect(await t.api.check(id, 'run-3')).toMatchObject({ stuck: true, later: true });
  });

  it('saves by digest, and maps a file changed outside code-learn to CHANGED', async () => {
    const t = live();
    const activity = await practising(t);
    const digest = await t.api.saveFile(activity.id, 'main.c', 'int main() { return count + 1; }', activity.files[0].digest);
    await expect(t.api.saveFile(activity.id, 'main.c', 'x', activity.files[0].digest)).rejects.toThrow(CHANGED);
    expect(digest).not.toBe(activity.files[0].digest);
  });

  it('Try it records nothing; Check grades with hidden results as statuses only', async () => {
    const t = live();
    const activity = await practising(t);
    expect(await t.api.tryIt(activity.id)).toMatchObject({ kind: 'ran', tests: [{ hidden: false, name: 'prints one' }] });
    expect(t.c.checks).toEqual([]);
    await t.api.saveFile(activity.id, 'main.c', 'count + 1', activity.files[0].digest);
    expect(await t.api.check(activity.id)).toMatchObject({ kind: 'graded', passed: 2, mastered: true, tests: [{ hidden: false }, { hidden: true, index: 1, status: 'pass' }] });
  });

  it('a sandbox failure is not counted, for Check and for Try it', async () => {
    const t = live();
    const activity = await practising(t);
    t.c.down = true;
    expect(await t.api.check(activity.id)).toEqual({ kind: 'not-counted', reason: "code-learn's sandbox couldn't run that." });
    expect(await t.api.tryIt(activity.id)).toEqual({ kind: 'not-counted', reason: "code-learn's sandbox couldn't run that." });
    expect(t.c.checks).toEqual([]);
  });

  it("shows a lesson's examples and runs one in core's sandbox; a stopped sandbox means it didn't run", async () => {
    const t = live();
    await practising(t);
    t.c.lessons.push({ id: 'ex', concept: 'values', title: 'Run it', markdown: 'See:\n\n```example\n1\n```\n', notes: '', examples: [{ 'main.c': 'int main(){}' }] });
    expect((await t.api.lesson('ex')).examples).toEqual([{ files: [{ path: 'main.c', text: 'int main(){}' }] }]);
    expect(await t.api.runExample('ex', 1)).toEqual({ kind: 'ran', exit: 0, output: 'ran main.c\n', errors: '' });
    t.c.down = true;
    expect(await t.api.runExample('ex', 1)).toEqual({ kind: 'not-run', reason: "code-learn's sandbox couldn't run that." });
  });

  it("runs a lesson's io example live with typed input, tagged with the run, and records nothing", async () => {
    const t = live();
    await practising(t);
    t.c.lessons.push({ id: 'ex', concept: 'values', title: 'Run it', markdown: 'See:\n\n```example\n1\n```\n', notes: '', examples: [{ 'main.c': 'int main(){}' }], style: 'io' });
    expect(await t.api.lesson('ex')).toMatchObject({ style: 'io' });
    const heard: unknown[] = [];
    t.api.onRunOutput((o) => heard.push(o));
    const ran = t.api.runExampleLive('ex', 1, 'run-1');
    await vi.waitFor(() => expect(heard).toHaveLength(2));
    expect(await t.api.sendRunInput('run-1', 'Ada\n')).toBe(true);
    expect(await ran).toEqual({ kind: 'ran', exit: 0, stage: 'run', timedOut: false, stopped: false, flooded: false, outOfMemory: false });
    expect(heard).toEqual([
      { run: 'run-1', started: 'run', limitMs: 120_000 },
      { run: 'run-1', stream: 'stdout', text: 'name? ' },
      { run: 'run-1', stream: 'stdout', text: 'hello Ada\n' },
      { run: 'run-1', stream: 'stderr', text: 'a warning\n' },
    ]);
    expect(t.c.runs).toEqual(['ex#1']);
    expect(t.c.checks).toEqual([]);
  });

  it("stops a lesson example's live Run when asked, and says why it couldn't run when the sandbox is down", async () => {
    const t = live();
    await practising(t);
    t.c.lessons.push({ id: 'ex', concept: 'values', title: 'Run it', markdown: '', notes: '', examples: [{ 'main.c': 'int main(){}' }], style: 'io' });
    const ran = t.api.runExampleLive('ex', 1, 'run-1');
    await t.api.stopRun('run-1');
    expect(await ran).toMatchObject({ kind: 'ran', stopped: true });
    t.c.down = true;
    expect(await t.api.runExampleLive('ex', 1, 'run-2')).toEqual({ kind: 'not-run', reason: expect.stringMatching(/sandbox/) });
  });

  it('keeps a stuck activity open beside the ways forward', async () => {
    const t = live();
    const activity = await practising(t);
    t.c.stuck = 'values';
    expect((await t.api.course())!.topics[0]).toMatchObject({ state: 'now', stuck: true, activity: 'open' });
    expect((await t.api.activity('values')).id).toBe(activity.id);
  });

  it('starts writing a review exercise when a review comes due while the app is open', async () => {
    const t = live();
    await practising(t);
    t.c.mastered.add('values');
    const authors = () => t.jobs.ran.filter((j) => j.kind === 'author').length;
    const before = authors();
    t.c.reviewWithout = 'values';
    expect((await t.api.course())!.topics[0]).toMatchObject({ review: 'writing' });
    await until(t.api, () => authors() === before + 1);
  });

  it('reopens a mastered topic for its due review, on the exercise core names', async () => {
    const t = live();
    const activity = await practising(t);
    t.c.mastered.add('values');
    t.c.review = { concept: 'values', exercise: activity.id };
    expect((await t.api.course())!.topics[0]).toMatchObject({ state: 'mastered', review: 'due', activity: 'open' });
    expect((await t.api.activity('values')).id).toBe(activity.id);
  });

  it('a Check started once quitting has begun never runs', async () => {
    const t = live();
    const activity = await practising(t);
    await t.api.stop();
    await expect(t.api.check(activity.id)).rejects.toThrow('code-learn is quitting.');
    expect(t.c.checks).toEqual([]);
  });
});
