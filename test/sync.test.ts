import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../src/app.js";
import * as store from "../src/store.js";
import { isSynced, mergeLog, mergeNotes } from "../src/sync.js";
import { tempDir } from "./temp.js";

const event = (at: string, exercise = "e") => JSON.stringify({ format_version: 1, kind: "read", at, lesson: exercise, concept: "a" });
const log = (...lines: string[]) => lines.map((l) => `${l}\n`).join("");

describe("isSynced", () => {
  it.each([
    ["home", "courses/c/course.json"],
    ["home", "courses/c/events.jsonl"],
    ["home", "courses/c/lessons/l1/notes.md"],
    ["home", "courses/c/exercises/greet/tests/hidden/1.in"],
    ["home", "tracks/c@1/track.json"],
    ["workspace", "code-learn.json"],
    ["workspace", "exercises/c/greet/main.c"],
  ] as const)("syncs %s %s", (root, path) => expect(isSynced(root, path)).toBe(true));

  it.each([
    ["home", "envs/c@1/env/bin/gcc"],
    ["home", "pkgs/x.tar.bz2"],
    ["home", "runs/1-ab/main.c"],
    ["home", "sandbox/etc/passwd"],
    ["home", "locks/ws-0123.lock"],
    ["home", "proposals/c@1/abc/track.yaml"],
    ["home", "courses/c/.lock"],
    ["home", "courses/c/.lock.reclaim"],
    ["home", "tracks/.c.lock"],
    ["home", "courses/c/.code-learn-1-ab.tmp"],
    ["home", "courses/.staging-ab/course.json"],
    ["home", "courses/c/events.jsonl.bak-2026"],
    ["workspace", ".mcp.json"],
    ["workspace", ".claude/settings.json"],
    ["workspace", "AGENTS.md"],
  ] as const)("leaves out %s %s", (root, path) => expect(isSynced(root, path)).toBe(false));
});

describe("mergeLog", () => {
  const base = log(event("2026-11-10T08:00:00.000Z"));

  it("keeps the shared lines, then both sides' new lines in time order", () => {
    const ours = base + log(event("2026-11-10T09:00:00.000Z", "mine"), event("2026-11-10T11:00:00.000Z", "mine2"));
    const theirs = base + log(event("2026-11-10T10:00:00.000Z", "theirs"));
    expect(mergeLog(base, ours, theirs)).toBe(base + log(event("2026-11-10T09:00:00.000Z", "mine"), event("2026-11-10T10:00:00.000Z", "theirs"), event("2026-11-10T11:00:00.000Z", "mine2")));
  });

  it("keeps a line both sides added only once", () => {
    const both = base + log(event("2026-11-10T09:00:00.000Z"));
    expect(mergeLog(base, both, both)).toBe(both);
  });

  it("keeps every line of both when they no longer share the old log", () => {
    const ours = log(event("2026-11-10T09:00:00.000Z", "mine"));
    const theirs = log(event("2026-11-10T08:30:00.000Z", "theirs"));
    expect(mergeLog(base, ours, theirs)).toBe(log(event("2026-11-10T08:30:00.000Z", "theirs"), event("2026-11-10T09:00:00.000Z", "mine")));
  });
});

describe("mergeNotes", () => {
  it("keeps this computer's notes, then the other's under its name", () => {
    expect(mergeNotes("Mine.\n", "Theirs.\n", "laptop")).toBe("Mine.\n\n---\n\nFrom laptop:\n\nTheirs.\n");
  });
});

describe("exportForSync and importFromSync", () => {
  let ws: string;
  let home: string;
  beforeEach(async () => {
    home = tempDir();
    vi.stubEnv("CODE_LEARN_HOME", home);
    ws = tempDir();
    await app.saveRoadmap(ws, "quiz", JSON.stringify({ goal: "Judgment", style: "quiz", concepts: [{ id: "a", title: "A" }] }));
  });
  afterEach(() => vi.unstubAllEnvs());

  const put = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };

  it("copies what syncs from the home and the workspace, and nothing else", async () => {
    put(join(home, "envs", "x@1", "env", "bin", "tool"), "binary");
    put(join(ws, "exercises", "judgment", "q1", "answers.yaml"), "a: 1\n");
    put(join(ws, ".mcp.json"), "{}");
    const dest = tempDir();
    await app.exportForSync(ws, dest);
    const course = store.readWorkspace(ws).course!;
    expect(existsSync(join(dest, "home", "courses", course, "course.json"))).toBe(true);
    expect(readFileSync(join(dest, "workspace", "exercises", "judgment", "q1", "answers.yaml"), "utf8")).toBe("a: 1\n");
    expect(existsSync(join(dest, "workspace", "code-learn.json"))).toBe(true);
    expect(existsSync(join(dest, "home", "envs"))).toBe(false);
    expect(existsSync(join(dest, "workspace", ".mcp.json"))).toBe(false);
    expect(existsSync(join(dest, "home", "courses", course, ".lock"))).toBe(false);
  });

  it("writes and deletes the files a sync brought in, and refuses a path that doesn't sync", async () => {
    put(join(ws, "exercises", "judgment", "old", "answers.yaml"), "old\n");
    await app.importFromSync(ws, [
      { path: "workspace/exercises/judgment/q1/answers.yaml", text: "from the laptop\n" },
      { path: "workspace/exercises/judgment/old/answers.yaml" },
    ]);
    expect(readFileSync(join(ws, "exercises", "judgment", "q1", "answers.yaml"), "utf8")).toBe("from the laptop\n");
    expect(existsSync(join(ws, "exercises", "judgment", "old", "answers.yaml"))).toBe(false);
    await expect(app.importFromSync(ws, [{ path: "home/envs/x@1/env/bin/tool", text: "x" }])).rejects.toThrow(/doesn't sync/);
    await expect(app.importFromSync(ws, [{ path: "home/courses/../../escape", text: "x" }])).rejects.toThrow(/doesn't sync/);
  });

  it("keeps the events appended here while the sync ran", async () => {
    const course = store.readWorkspace(ws).course!;
    const file = join(home, "courses", course, "events.jsonl");
    const exported = log(event("2026-11-10T08:00:00.000Z"));
    const merged = exported + log(event("2026-11-10T09:00:00.000Z", "theirs"));
    put(file, exported + log(event("2026-11-10T10:00:00.000Z", "meanwhile")));
    await app.importFromSync(ws, [{ path: `home/courses/${course}/events.jsonl`, text: merged, was: exported }]);
    expect(readFileSync(file, "utf8")).toBe(merged + log(event("2026-11-10T10:00:00.000Z", "meanwhile")));
  });
});
