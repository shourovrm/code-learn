import { quizFiles, quizRoadmap } from "./quiz-fixture.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../src/app.js";
import { readFileMap } from "../src/files.js";
import { createServer, parseToolList, type ServerOptions, TOOL_NAMES } from "../src/mcp.js";
import * as store from "../src/store.js";
import { fixtureTrackFiles, installFixtureTrack, installTrack } from "./installed-track.js";
import { sandboxReady } from "./sandbox-ready.js";
import { tempDir } from "./temp.js";
import { LESSON_FRAME, lessonFields } from "./lesson-fixture.js";

/** The per-job server: `code-learn mcp --tools`, `--course` and `--desktop`. */

let ws: string;
let client: Client | undefined;
beforeEach(() => {
  vi.stubEnv("CODE_LEARN_HOME", tempDir("code-learn-home-"));
  ws = tempDir("code-learn-ws-");
});
afterEach(async () => {
  await client?.close();
  client = undefined;
  vi.unstubAllEnvs();
});

async function connect(options: ServerOptions = {}) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(ws, "test", options).connect(a);
  client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client!.callTool({ name, arguments: args });
    const text = (r.content as { text: string }[])[0]!.text;
    if (r.isError) throw new Error(text);
    return JSON.parse(text);
  };
  return { client, call };
}

const roadmap = (goal: string) => `goal: ${goal}\ntrack: shell-io@1\nstyle: io\nconcepts:\n  - { id: sh.basics, title: Basics, requires: [] }\n`;

describe("--tools", () => {
  it("lists and accepts only the job's tools", async () => {
    const { client, call } = await connect({ tools: ["list_tracks", "get_roadmap"] });
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(["get_roadmap", "list_tracks"]);
    expect(await call("list_tracks")).toEqual([]);
    await expect(call("save_track", { files: {} })).rejects.toThrow(/save_track/);
  });

  it("serves every tool without the option", async () => {
    const { client } = await connect();
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("parses a comma-separated list and rejects unknown names", () => {
    expect(parseToolList("next_step, save_exercise")).toEqual(["next_step", "save_exercise"]);
    expect(() => parseToolList("next_step,rm_rf")).toThrow(/Unknown tool "rm_rf"/);
    expect(() => parseToolList(",")).toThrow(/at least one tool/);
  });
});

describe("--course", () => {
  it("scopes course tools to the job's course, even after the learner switches", async () => {
    await app.saveRoadmap(ws, "first", roadmap("First"));
    const { call } = await connect({ course: "first" });
    await app.saveRoadmap(ws, "second", roadmap("Second"));

    expect(await call("get_roadmap")).toMatchObject({ course: "first", goal: "First" });
    expect(await call("next_step")).toEqual({ kind: "setup", track: "shell-io@1" });
    expect((await call("get_roadmap")).lessons).toEqual([]);
    await call("save_lesson", { id: "intro", concept: "sh.basics", title: "Intro", ...lessonFields("Hello.") });
    // A lesson's writer finds the lessons its topic builds on here, and reads them with get_lesson.
    expect((await call("get_roadmap")).lessons).toEqual([{ id: "intro", concept: "sh.basics" }]);
    expect(app.listLessons(ws, "first").map((l) => l.id)).toEqual(["intro"]);
    expect(app.listLessons(ws)).toEqual([]);
    await call("mark_lesson_read", { id: "intro" });
    expect(app.listLessons(ws, "first")[0]!.read).toBe(true);
    await expect(call("save_roadmap", { course: "second", roadmap: roadmap("Changed") })).rejects.toThrow(/only course "first"/);
  });

  it.runIf(sandboxReady())("authors into the job's course while the learner has another course selected", async () => {
    // The job's course has an installed track; the selected one is a draft whose track isn't installed.
    installFixtureTrack("shell-io");
    await app.saveRoadmap(ws, "first", readFileSync(join(import.meta.dirname, "fixtures", "roadmaps", "shell-io.yaml"), "utf8"));
    await app.saveRoadmap(ws, "second", roadmap("Second").replace("shell-io@1", "other@1"));
    const { call } = await connect({ course: "first" });
    const files = readFileMap(join(import.meta.dirname, "fixtures", "exercises", "io-max"));
    // Bound to "first", the save checks the exercise on shell-io@1; unbound, it would stop at "other@1 is not installed".
    await call("save_exercise", { files });
    expect(app.listExercises(ws, "first").map((e) => e.exercise)).toEqual(["max-of-line"]);
    expect(app.listExercises(ws, "second")).toEqual([]);
  });

  it("rejects an invalid course id", () => {
    expect(() => createServer(ws, "test", { course: "../x" })).toThrow(/Invalid course/);
  });
});

describe("--progress", () => {
  it.runIf(sandboxReady())("writes which gate save_exercise runs to the job's progress file, by name only", async () => {
    const fixtures = join(import.meta.dirname, "fixtures");
    installFixtureTrack("shell-io");
    await app.saveRoadmap(ws, "shell", readFileSync(join(fixtures, "roadmaps", "shell-io.yaml"), "utf8"));
    const progress = join(tempDir("code-learn-progress-"), "job.json");
    const { call } = await connect({ course: "shell", progress });
    // A starter that already solves the exercise fails the "starter unsolved" gate.
    const files = readFileMap(join(fixtures, "exercises", "io-max"));
    files["starter/main.sh"] = files["solution/main.sh"]!;
    await expect(call("save_exercise", { files })).rejects.toThrow(/starter unsolved/);
    expect(JSON.parse(readFileSync(progress, "utf8"))).toEqual({ format_version: 1, gate: "starter" });
  });

  it("must be an absolute path", () => {
    expect(() => createServer(ws, "test", { progress: "job.json" })).toThrow(/absolute/);
  });
});

describe("--desktop", () => {
  it("makes save_track propose instead of install", async () => {
    const { call } = await connect({ desktop: true });
    const track = readFileMap(join(import.meta.dirname, "fixtures", "tracks", "shell-io"));
    expect(await call("save_track", { files: track })).toEqual({ proposed: "shell-io@1", note: "The learner decides in code-learn. End your turn." });
    expect(app.listTracks()).toEqual([]);
    expect(app.listProposals()).toHaveLength(1);
  });
});

describe("--desktop with --course", () => {
  const tracks = join(import.meta.dirname, "fixtures", "tracks");
  // shell-unit's files under the course's track id: the right id@version, but only the unit style.
  const unitOnly = () => {
    const t = readFileMap(join(tracks, "shell-unit"));
    return { ...t, "track.yaml": t["track.yaml"]!.replace("id: shell-unit", "id: shell-io") };
  };

  it("refuses a proposal for the course's track that lacks the course's style, as a save the agent can fix", async () => {
    await app.saveRoadmap(ws, "first", roadmap("First"));
    const { call } = await connect({ course: "first", desktop: true });
    await expect(call("save_track", { files: unitOnly() })).rejects.toThrow(/Course "first" needs style "io".*offers unit/);
    expect(app.listProposals()).toEqual([]);
    expect(await call("save_track", { files: readFileMap(join(tracks, "shell-io")) })).toMatchObject({ proposed: "shell-io@1" });
  });
});

describe("the save_lesson description", () => {
  it("asks for the goal and the self-check as fields, not as headings", async () => {
    const { client: c } = await connect({ tools: ["save_lesson"] });
    const { description } = (await c.listTools()).tools[0];
    expect(description).toMatch(/goal \(at most 300 characters\) is shown after the words "You will be able to:", so it is the phrase that completes them, starting with a verb/);
    expect(description).toMatch(/selfCheck holds 1 to 3 questions with their answers/);
    expect(description).toMatch(/shown after the lesson under "Check yourself"/);
    expect(description).toMatch(/code-learn shows the title, the goal, the self-check and the concept's sources around the Markdown/);
  });

  it("says a lesson may hold diagrams and charts, and when", async () => {
    const { client: c } = await connect({ tools: ["save_lesson"] });
    const { description } = (await c.listTools()).tools[0];
    expect(description).toMatch(/Diagrams and charts go in fenced blocks with info string mermaid/);
    expect(description).toMatch(/only when a picture teaches better than words/);
    expect(description).toMatch(/Node labels with symbols such as \/ \( \) \[ \] \{ \} : go in double quotes, e\.g\. C\["\/tmp\/main"\]/);
  });

  it("says an example runs with no input", async () => {
    const { client: c } = await connect({ tools: ["save_lesson"] });
    const { description } = (await c.listTools()).tools[0];
    expect(description).toMatch(/runs each in the sandbox with no input and it must exit 0/);
    expect(description).toMatch(/An example that needs input goes in a plain code block/);
  });
});

describe("lesson tools", () => {
  it("saves, reads and acknowledges a lesson; reading records nothing", async () => {
    await app.saveRoadmap(ws, "first", roadmap("First"));
    const { call } = await connect();
    expect(await call("save_lesson", { id: "intro", concept: "sh.basics", title: "Intro", ...lessonFields("Hello.") })).toEqual({ lesson: "intro" });
    expect(await call("get_lesson", { id: "intro" })).toEqual({ id: "intro", concept: "sh.basics", title: "Intro", markdown: "Hello.", ...LESSON_FRAME, sources: [], notes: "", examples: [] });
    expect(app.listLessons(ws)[0]!.read).toBe(false);
    await call("mark_lesson_read", { id: "intro" });
    expect(app.listLessons(ws)[0]!.read).toBe(true);
  });
});

describe.runIf(sandboxReady())("hidden data through the tools", () => {
  it("no tool's output carries a hidden input, expected output, solution or mutant", async () => {
    const fixtures = join(import.meta.dirname, "fixtures");
    installFixtureTrack("shell-io");
    await app.saveRoadmap(ws, "shell", readFileSync(join(fixtures, "roadmaps", "shell-io.yaml"), "utf8"));
    // Every hidden part of the exercise carries a canary.
    const files = readFileMap(join(fixtures, "exercises", "io-max"));
    for (const path of Object.keys(files)) if (/^(tests\/hidden|solution|mutants)\//.test(path)) files[path] = `CANARY ${path}\n`;
    store.commitFolder(store.exerciseDir("shell", "max-of-line"), files, {
      "exercise.json": {
        format_version: 1, slug: "max-of-line", style: "io", concepts: ["sh.loops"], difficulty: 1, track: "shell-io@1",
        createdAt: new Date().toISOString(), expected: { "visible/01": "3\n", "hidden/01": "CANARY one\n", "hidden/02": "CANARY two\n", "hidden/03": "CANARY three\n" },
      },
    });
    const { client, call } = await connect();
    const { path } = await call("get_exercise", { slug: "max-of-line" });
    // The program prints each case's input as its output and as its errors, so a hidden case's would carry its canary.
    writeFileSync(join(path, "main.sh"), "tee /dev/stderr\n");
    expect((await call("check", { slug: "max-of-line" })).tests).toHaveLength(4);
    // Whole responses, every content block and any structured content, not only the first text.
    const calls: [string, Record<string, unknown>][] = [["get_exercise", { slug: "max-of-line" }], ["check", { slug: "max-of-line" }], ["progress", {}], ["next_step", {}], ["get_roadmap", {}], ["list_tracks", {}]];
    const responses = [];
    for (const [name, args] of calls) responses.push(await client.callTool({ name, arguments: args }));
    const text = JSON.stringify(responses);
    expect(text).not.toContain("CANARY");
    expect(text).not.toMatch(/hidden\/0/);
  });
});

describe("failure output", () => {
  it("starts every failure with code-learn's own first line, so the agent's files can't put a code there", async () => {
    const { call } = await connect();
    const message = await call("save_roadmap", { course: "c", roadmap: "goal: *code-learn:sandbox-busy\n" }).then(() => "saved", (e: Error) => e.message);
    expect(message).toMatch(/^code-learn:error\n/);
    expect(message).not.toMatch(/^code-learn:sandbox-busy/);
  });
});

describe.runIf(sandboxReady())("reference-gate diagnostics through save_exercise", () => {
  const fixtures = join(import.meta.dirname, "fixtures");
  const install = async (kind: "io" | "unit", files = fixtureTrackFiles(`shell-${kind}`)) => {
    installTrack(files);
    await app.saveRoadmap(ws, "shell", `goal: Shell\ntrack: shell-${kind}@1\nstyle: ${kind}\nconcepts:\n  - { id: sh.basics, title: Basics, requires: [] }\n  - { id: sh.loops, title: Loops, requires: [sh.basics] }\n`);
  };
  /** The exercise with `solution` as every solution file, so a reference that prints its own source would show CANARY. */
  const withSolution = (exercise: string, solution: string) => {
    const files = readFileMap(join(fixtures, "exercises", exercise));
    for (const path of Object.keys(files)) if (path.startsWith("solution/")) files[path] = solution;
    return files;
  };
  const failure = async (call: (name: string, args: Record<string, unknown>) => Promise<unknown>, files: Record<string, string>) =>
    call("save_exercise", { files }).then(() => "saved", (e: Error) => e.message);

  it("an io reference that doesn't build is described without the build's output", async () => {
    // A build command that prints the source it was given, as a compiler error can.
    const track = fixtureTrackFiles("shell-io");
    track["track.yaml"] = track["track.yaml"]!.replace(/^build: .*$/m, `build: "cat main.sh >&2; exit 1"`);
    await install("io", track);
    const { call } = await connect();
    const message = await failure(call, withSolution("io-max", "# CANARY-SOLUTION-LINE\n"));
    expect(message).toMatch(/Gate "reference passes"/);
    expect(message).toMatch(/doesn't build/);
    expect(message).not.toContain("CANARY");
    // Actionable without the output: author jobs can't build anything themselves.
    expect(message).toMatch(/with the track's build command \(`cat main\.sh >&2; exit 1`\)/);
    expect(message).not.toMatch(/yourself/);
  });

  it("an io reference that fails its cases is described without its output", async () => {
    await install("io");
    const { call } = await connect();
    const message = await failure(call, withSolution("io-max", "# CANARY-SOLUTION-LINE\ncat main.sh >&2\nexit 1\n"));
    expect(message).toMatch(/Gate "reference passes"/);
    expect(message).toMatch(/run every input/);
    expect(message).not.toContain("CANARY");
  });

  it("a unit reference that fails is described by test and status, without its messages", async () => {
    // A test runner that reports each test's own output as its message, so a leak would show.
    const track = fixtureTrackFiles("shell-unit");
    track["test.sh"] = track["test.sh"]!.replace(
      `printf '{"name":"%s","status":"%s"}' "$name" "$status" >> "$OUT"`,
      `message=$(tr -d '"\\\n' < /tmp/test.log)\n  printf '{"name":"%s","status":"%s","message":"%s"}' "$name" "$status" "$message" >> "$OUT"`,
    );
    await install("unit", track);
    const { call } = await connect();
    const message = await failure(call, withSolution("unit-max", "maxof() { echo CANARY-SOLUTION-LINE >&2; false; }\n"));
    expect(message).toMatch(/Gate "reference passes"/);
    // Visible tests by name, so the agent knows which to fix; hidden ones only by number; no messages.
    expect(message).toMatch(/visible\/first_is_max: fail/);
    expect(message).toMatch(/hidden #1: fail/);
    expect(message).not.toContain("CANARY");
  });
});

describe.runIf(sandboxReady())("mutants in gate diagnostics", () => {
  const fixtures = join(import.meta.dirname, "fixtures");
  /** io-max with a mutant that behaves like the solution, in a folder whose name says what it would do. */
  const files = (extra: Record<string, string> = {}) => {
    const map = readFileMap(join(fixtures, "exercises", "io-max"));
    for (const path of Object.keys(map)) {
      if (path.startsWith("mutants/zero-start/")) delete map[path];
    }
    return { ...map, "mutants/CANARY-forgets-negatives/main.sh": map["solution/main.sh"]!, ...extra };
  };
  beforeEach(async () => {
    installFixtureTrack("shell-io");
    await app.saveRoadmap(ws, "shell", readFileSync(join(fixtures, "roadmaps", "shell-io.yaml"), "utf8"));
  });

  it("names a mutant that passes every hidden test by its number, never its folder", async () => {
    const { call } = await connect();
    const message = await call("save_exercise", { files: files() }).then(() => "saved", (e: Error) => e.message);
    expect(message).toMatch(/Gate "mutants caught" failed: mutant #1 /);
    expect(message).not.toContain("CANARY");
  });

  it("names a mutant whose folder doesn't fit by its number, and counts its other files", async () => {
    const { call } = await connect();
    const message = await call("save_exercise", { files: files({ "mutants/CANARY-forgets-negatives/CANARY-notes.txt": "x" }) }).then(() => "saved", (e: Error) => e.message);
    expect(message).toMatch(/mutant #1 may only contain the track's learner files \(main\.sh\); found 1 other file/);
    expect(message).not.toContain("CANARY");
  });
});

describe("file maps through the real MCP SDK", () => {
  it("rejects a non-text file value without naming a hidden file", async () => {
    const { client } = await connect();
    for (const path of ["tests/hidden/CANARY-SECRET-TEST-NAME.in", "mutants/CANARY-forgets-negatives/main.sh"]) {
      const r = await client.callTool({ name: "save_exercise", arguments: { files: { "exercise.yaml": "x", [path]: null } } });
      const text = (r.content as { text: string }[])[0]!.text;
      expect(r.isError).toBe(true);
      expect(text).toMatch(/must be text/);
      expect(text).not.toContain("CANARY");
    }
  });
});

it("returns learn and covered through MCP without a track", async () => {
  const { call } = await connect();
  await call("save_roadmap", { course: "reading", roadmap: "goal: Learn\nstyle: none\nconcepts: [{ id: a, title: A }]" });
  expect(await call("next_step")).toEqual({ kind: "learn", concept: "a", lesson: null });
  await call("save_lesson", { id: "intro", concept: "a", title: "Intro", ...lessonFields("Read this.") });
  expect(await call("next_step")).toEqual({ kind: "learn", concept: "a", lesson: "intro" });
  await call("mark_lesson_read", { id: "intro" });
  expect(await call("progress")).toMatchObject({ concepts: [{ covered: true }], next: { kind: "done" } });
});


it("saves and checks a quiz through MCP without a track", async () => {
  const { client, call } = await connect({ tools: ["save_roadmap", "next_step", "save_exercise", "get_exercise", "check"] });
  await call("save_roadmap", { course: "quiz", roadmap: quizRoadmap });
  expect(await call("next_step")).toMatchObject({ kind: "author", style: "quiz" });
  await call("save_exercise", { files: quizFiles() });
  const ex = await call("get_exercise");
  expect(JSON.stringify(ex)).not.toMatch(/correct|why/);
  const unanswered = await client.callTool({ name: "check", arguments: {} });
  expect((unanswered.content as { text: string }[])[0]!.text).toBe("code-learn:error\nAnswer every question, then check.");
  writeFileSync(join(ex.path, "answers.yaml"), "1: 1\n2: 1\n3: 1\n4: 1\n5: 1\n");
  expect(await call("check")).toMatchObject({ recorded: true, total: 5 });
  expect(await call("check")).toMatchObject({ recorded: false, total: 5 });
});
