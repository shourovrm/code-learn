// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as core from '../../scripts/core-entry';
import { createSync } from './sync';
import { tempDir } from './testing/temp';

const event = (at: string, lesson: string) => `${JSON.stringify({ format_version: 1, kind: 'read', at, lesson, concept: 'a' })}\n`;

/** One computer: its own code-learn home, workspace and sync folder, all syncing to `remote`. */
function computer(name: string, remote: string) {
  const home = tempDir('code-learn-home-');
  const ws = tempDir('code-learn-ws-');
  // Core reads its home from the environment, so each computer's calls run with its own.
  const inHome = async <T>(work: () => Promise<T>): Promise<T> => {
    const before = process.env.CODE_LEARN_HOME;
    process.env.CODE_LEARN_HOME = home;
    try {
      return await work();
    } finally {
      process.env.CODE_LEARN_HOME = before;
    }
  };
  const sync = createSync({
    git: 'git', dir: tempDir('code-learn-sync-'), ws, machine: name,
    core: {
      exportForSync: (w, dest) => inHome(() => core.exportForSync(w, dest)),
      importFromSync: (w, changes) => inHome(() => core.importFromSync(w, changes)),
      mergeLog: core.mergeLog,
      mergeNotes: core.mergeNotes,
    },
  });
  const put = (root: 'home' | 'ws', rel: string, text: string) => {
    const path = join(root === 'home' ? home : ws, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const read = (root: 'home' | 'ws', rel: string) => readFileSync(join(root === 'home' ? home : ws, rel), 'utf8');
  const has = (root: 'home' | 'ws', rel: string) => existsSync(join(root === 'home' ? home : ws, rel));
  const remove = (root: 'home' | 'ws', rel: string) => rmSync(join(root === 'home' ? home : ws, rel), { recursive: true });
  return { sync, put, read, has, remove, repo: { remote } };
}

function remoteRepo() {
  const remote = tempDir('code-learn-remote-');
  execFileSync('git', ['init', '--bare', '-q', '-b', 'main', remote]);
  return remote;
}

describe('GitHub sync', () => {
  it("sends one computer's courses and code to the other, and leaves toolchains behind", async () => {
    const remote = remoteRepo();
    const desk = computer('desk', remote);
    const laptop = computer('laptop', remote);
    desk.put('home', 'courses/c/course.json', '{"course":"c"}\n');
    desk.put('home', 'courses/c/events.jsonl', event('2026-11-10T08:00:00.000Z', 'l1'));
    desk.put('home', 'envs/c@1/env/bin/gcc', 'binary');
    desk.put('ws', 'exercises/c/greet/main.c', 'int main(void) { return 0; }\n');
    expect(await desk.sync.syncNow(desk.repo)).toMatchObject({ state: 'synced', clashes: [] });
    expect(await laptop.sync.syncNow(laptop.repo)).toMatchObject({ state: 'synced' });
    expect(laptop.read('home', 'courses/c/course.json')).toBe('{"course":"c"}\n');
    expect(laptop.read('ws', 'exercises/c/greet/main.c')).toBe('int main(void) { return 0; }\n');
    expect(laptop.has('home', 'envs')).toBe(false);
  });

  it('merges progress made on both computers, and keeps both versions of code changed on both', async () => {
    const remote = remoteRepo();
    const desk = computer('desk', remote);
    const laptop = computer('laptop', remote);
    const first = event('2026-11-10T08:00:00.000Z', 'l1');
    desk.put('home', 'courses/c/events.jsonl', first);
    desk.put('ws', 'exercises/c/greet/main.c', 'start\n');
    await desk.sync.syncNow(desk.repo);
    await laptop.sync.syncNow(laptop.repo);

    desk.put('home', 'courses/c/events.jsonl', first + event('2026-11-10T09:00:00.000Z', 'desk'));
    desk.put('ws', 'exercises/c/greet/main.c', 'desk\n');
    await desk.sync.syncNow(desk.repo);
    laptop.put('home', 'courses/c/events.jsonl', first + event('2026-11-10T10:00:00.000Z', 'laptop'));
    laptop.put('ws', 'exercises/c/greet/main.c', 'laptop\n');
    const merged = await laptop.sync.syncNow(laptop.repo);

    expect(merged.clashes).toEqual(['workspace/exercises/c/greet/main.c']);
    expect(laptop.read('home', 'courses/c/events.jsonl')).toBe(first + event('2026-11-10T09:00:00.000Z', 'desk') + event('2026-11-10T10:00:00.000Z', 'laptop'));
    expect(laptop.read('ws', 'exercises/c/greet/main.c')).toBe('laptop\n');
    expect(laptop.read('ws', 'exercises/c/greet/main.c.from-desk')).toBe('desk\n');

    await desk.sync.syncNow(desk.repo);
    expect(desk.read('home', 'courses/c/events.jsonl')).toBe(laptop.read('home', 'courses/c/events.jsonl'));
    expect(desk.read('ws', 'exercises/c/greet/main.c.from-desk')).toBe('desk\n');
  });

  it('keeps both computers\' notes on one lesson', async () => {
    const remote = remoteRepo();
    const desk = computer('desk', remote);
    const laptop = computer('laptop', remote);
    desk.put('home', 'courses/c/lessons/l1/notes.md', '');
    await desk.sync.syncNow(desk.repo);
    await laptop.sync.syncNow(laptop.repo);
    desk.put('home', 'courses/c/lessons/l1/notes.md', 'Desk note.\n');
    await desk.sync.syncNow(desk.repo);
    laptop.put('home', 'courses/c/lessons/l1/notes.md', 'Laptop note.\n');
    await laptop.sync.syncNow(laptop.repo);
    expect(laptop.read('home', 'courses/c/lessons/l1/notes.md')).toBe('Laptop note.\n\n---\n\nFrom desk:\n\nDesk note.\n');
  });

  it('deletes on the other computer what a rebuild deleted here', async () => {
    const remote = remoteRepo();
    const desk = computer('desk', remote);
    const laptop = computer('laptop', remote);
    desk.put('home', 'courses/c/lessons/l1/lesson.md', '# Old\n');
    await desk.sync.syncNow(desk.repo);
    await laptop.sync.syncNow(laptop.repo);
    expect(laptop.has('home', 'courses/c/lessons/l1/lesson.md')).toBe(true);
    desk.put('home', 'courses/c/lessons/l2/lesson.md', '# New\n');
    desk.remove('home', 'courses/c/lessons/l1');
    await desk.sync.syncNow(desk.repo);
    await laptop.sync.syncNow(laptop.repo);
    expect(laptop.has('home', 'courses/c/lessons/l2/lesson.md')).toBe(true);
    expect(laptop.has('home', 'courses/c/lessons/l1')).toBe(false);
  });

  it('says it is offline when the repository cannot be reached, and sends the work next time', async () => {
    const remote = remoteRepo();
    const desk = computer('desk', remote);
    desk.put('ws', 'code-learn.json', '{}\n');
    expect(await desk.sync.syncNow({ remote: 'https://code-learn.invalid/none.git' })).toMatchObject({ state: 'offline' });
    expect(await desk.sync.pending(desk.repo)).toBe(true);
    expect(await desk.sync.syncNow(desk.repo)).toMatchObject({ state: 'synced' });
    expect(await desk.sync.pending(desk.repo)).toBe(false);
  });
});
