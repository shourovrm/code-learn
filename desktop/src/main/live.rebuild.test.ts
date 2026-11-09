// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { live, practising, settle } from './testing/fakes';

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

  it('keeps the old lessons when replace is off', async () => {
    const t = live();
    await practising(t);
    await t.api.rebuildTopics(['values'], false);
    expect(t.c.rebuilt).toEqual([expect.objectContaining({ concepts: ['values'], replace: false })]);
    expect(t.c.lessons.some((l) => l.concept === 'values')).toBe(true);
  });
});
