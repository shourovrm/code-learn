// @vitest-environment node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coursesOf, desktopState, withoutCourse, workspaceOf, type DesktopState } from './state';
import { tempDir } from './testing/temp';

const dir = () => tempDir('code-learn-state-');

describe('desktop.json (§2)', () => {
  it('forgets a deleted course: off the list, its session, name and activity style go, and the one left on screen is the newest', () => {
    const state: DesktopState = {
      format_version: 1,
      sessions: { 'react-1|claude': 'a', 'react-10|claude': 'keep', 'python-2|claude': 'b' },
      approved: 'react-1',
      courses: ['python-2', 'react-1'],
      names: { 'react-1': 'React', 'python-2': 'Python' },
      activityStyles: { 'react-1': 'quiz' },
    };
    expect(withoutCourse(state, 'react-1')).toEqual({
      format_version: 1,
      sessions: { 'react-10|claude': 'keep', 'python-2|claude': 'b' },
      approved: 'python-2',
      courses: ['python-2'],
      names: { 'python-2': 'Python' },
      activityStyles: {},
    });
  });

  it('keeps the course on screen when another course is deleted, and has none left after the last', () => {
    const state: DesktopState = { format_version: 1, sessions: {}, approved: 'react-1', courses: ['react-1', 'python-2'] };
    expect(withoutCourse(state, 'python-2')).toMatchObject({ approved: 'react-1', courses: ['react-1'] });
    expect(withoutCourse(withoutCourse(state, 'python-2'), 'react-1')).toMatchObject({ approved: undefined, courses: [] });
  });

  it('starts empty, then remembers the agent and tutor sessions', () => {
    const d = dir();
    const state = desktopState(d);
    expect(state.read()).toEqual({ format_version: 1, sessions: {} });
    state.update((s) => ({ ...s, agent: 'codex', sessions: { 'react|codex': 'thread-1' } }));
    expect(desktopState(d).read()).toEqual({ format_version: 1, agent: 'codex', sessions: { 'react|codex': 'thread-1' } });
  });

  it('keeps the workspace in ~/code-learn unless desktop.json names another folder (O5)', () => {
    expect(workspaceOf({ format_version: 1, sessions: {} }, '/Users/me')).toBe(join('/Users/me', 'code-learn'));
    expect(workspaceOf({ format_version: 1, sessions: {}, workspace: '/Volumes/School/code-learn' }, '/Users/me')).toBe('/Volumes/School/code-learn');
  });

  it('lists the approved courses, oldest first; a file from before several courses lists its approved one (§4.13)', () => {
    expect(coursesOf({ format_version: 1, sessions: {} })).toEqual([]);
    expect(coursesOf({ format_version: 1, sessions: {}, approved: 'react-1' })).toEqual(['react-1']);
    expect(coursesOf({ format_version: 1, sessions: {}, approved: 'react-1', courses: ['python-2', 'react-1'] })).toEqual(['python-2', 'react-1']);
  });

  it('writes atomically, leaving no temp files', () => {
    const d = dir();
    desktopState(d).update((s) => ({ ...s, agent: 'claude' }));
    expect(readdirSync(d)).toEqual(['desktop.json']);
    expect(JSON.parse(readFileSync(join(d, 'desktop.json'), 'utf8')).format_version).toBe(1);
  });

  it('refuses a file from an unknown format version rather than guessing', () => {
    const d = dir();
    writeFileSync(join(d, 'desktop.json'), JSON.stringify({ format_version: 2 }));
    expect(() => desktopState(d).read()).toThrow('desktop.json');
  });
});
