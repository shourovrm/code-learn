// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { live, practising, settle, until } from './testing/fakes';

describe('rebuilding topics', () => {
  it('rebuilds the chosen topics in core, then starts a lesson job for each one', async () => {
    const t = live();
    await practising(t);
    const before = t.jobs.ran.length;
    await t.api.rebuildTopics(['values'], true);
    expect(t.c.rebuilt).toEqual([{ course: t.c.roadmap!.course, concepts: ['values'], replace: true }]);
    const lesson = await settle(async () => t.jobs.ran.slice(before).find((j) => j.kind === 'lesson'), Boolean, 'Lesson job');
    expect(lesson!.brief).toContain('Concept: values');
  });

  it("hands the rebuild's instructions to the topic's lesson job and keeps them for its exercise", async () => {
    const t = live();
    await practising(t);
    const before = t.jobs.ran.length;
    await t.api.rebuildTopics(['values'], true, 'Use Linux examples');
    const lesson = await settle(async () => t.jobs.ran.slice(before).find((j) => j.kind === 'lesson'), Boolean, 'Lesson job');
    expect(lesson!.brief).toContain("The learner's instructions for this topic: Use Linux examples");
    expect(t.state.read().rebuildNotes).toEqual({ [`${t.c.roadmap!.course}|values`]: 'Use Linux examples' });
  });

  it("rebuilds the chosen topics at a new depth, and keeps it for their exercises and later rebuilds", async () => {
    const t = live();
    await practising(t);
    const key = `${t.c.roadmap!.course}|values`;
    let before = t.jobs.ran.length;
    await t.api.rebuildTopics(['values'], true, '', 'in-depth');
    const lesson = await settle(async () => t.jobs.ran.slice(before).find((j) => j.kind === 'lesson'), Boolean, 'Lesson job');
    expect(lesson!.brief).toContain('Depth: in depth.');
    expect(t.state.read().topicDepths).toEqual({ [key]: 'in-depth' });
    // No depth chosen: the topic keeps the one it has.
    before = t.jobs.ran.length;
    await t.api.rebuildTopics(['values'], true);
    const again = await settle(async () => t.jobs.ran.slice(before).find((j) => j.kind === 'lesson'), Boolean, 'Lesson job');
    expect(again!.brief).toContain('Depth: in depth.');
  });

  it('forgets earlier instructions when a topic is rebuilt without any', async () => {
    const t = live();
    await practising(t);
    await t.api.rebuildTopics(['values'], true, 'Use Linux examples');
    await t.api.rebuildTopics(['values'], true);
    expect(t.state.read().rebuildNotes ?? {}).toEqual({});
  });

  it("writes the current topic's exercise while the other topics' lessons are still queued", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    const t = live({
      lesson: async (job, usual) => {
        if (job.brief.includes('Concept: state')) await held;
        return usual();
      },
    });
    await practising(t);
    const before = t.jobs.ran.length;
    await t.api.rebuildTopics(['values', 'state'], true);
    const course = await until(t.api, (c) => c.topics[0].lessons.some((l) => l.state === 'ready'));
    for (const l of course.topics[0].lessons) await t.api.markRead(l.id);
    await settle(async () => (await t.api.course(), t.jobs.ran.slice(before).find((j) => j.kind === 'author')), Boolean, 'Author job');
    release();
  });

  it('keeps the old lessons when replace is off', async () => {
    const t = live();
    await practising(t);
    await t.api.rebuildTopics(['values'], false);
    expect(t.c.rebuilt).toEqual([expect.objectContaining({ concepts: ['values'], replace: false })]);
    expect(t.c.lessons.some((l) => l.concept === 'values')).toBe(true);
  });
});

describe('writing a topic ahead of the path', () => {
  it("starts a lesson job for that topic, which isn't the current one", async () => {
    const t = live();
    await practising(t);
    const before = t.jobs.ran.length;
    await t.api.writeLesson('state');
    const lesson = await settle(async () => t.jobs.ran.slice(before).find((j) => j.kind === 'lesson'), Boolean, 'Lesson job');
    expect(lesson!.brief).toContain('Concept: state');
  });

  it('refuses a topic the course does not have', async () => {
    const t = live();
    await practising(t);
    await expect(t.api.writeLesson('nope')).rejects.toThrow(/isn’t in this course/);
  });
});
