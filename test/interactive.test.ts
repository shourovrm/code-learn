import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../src/app.js";
import { readFileMap } from "../src/files.js";
import { learnerPathStream, runMarkers, runProgram } from "../src/program.js";
import { runsDir } from "../src/runs.js";
import { hostLayout, sandboxArgs } from "../src/sandbox.js";
import * as store from "../src/store.js";
import { installFixtureTrack } from "./installed-track.js";
import { sandboxReady } from "./sandbox-ready.js";
import { tempDir } from "./temp.js";

/** Run: the learner's io program, interactively, in the sandbox. Never recorded. */

const fixtures = join(import.meta.dirname, "fixtures");

/** A program that runs out of memory: its string doubles until the sandbox's memory limit kills it. */
const MEMORY_HOG = `awk 'BEGIN { s = "x"; while (1) s = s s }'\n`;

beforeEach(() => {
  vi.stubEnv("CODE_LEARN_HOME", tempDir("code-learn-home-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("interactive run: the sandbox", () => {
  it("keeps every isolation flag, and an open stdin changes none of them", () => {
    const base = { command: ["true"], env: {}, mounts: [], memoryMb: 128, deadlineMs: 1000 };
    const plain = sandboxArgs(base, "unit", hostLayout());
    const interactive = sandboxArgs({ ...base, stdin: true }, "unit", hostLayout());
    // Typed input is a pipe to the sandbox's process, not a bubblewrap option.
    expect(interactive).toEqual(plain);
    expect(interactive).toEqual(expect.arrayContaining(["--unshare-all", "--die-with-parent", "--new-session", "--as-pid-1", "--clearenv"]));
    expect(interactive).not.toContain("--share-net");
  });
});

describe.runIf(sandboxReady())("interactive run", () => {
  it("sends typed lines to the program and streams what it prints, recording nothing", async () => {
    const ws = await installedExercise(`printf 'name? '; read -r name; echo "hello $name"; echo "a warning" >&2\n`);
    const out = { stdout: "", stderr: "" };
    const run = await app.runInteractive(ws, undefined, undefined, (text, stream) => (out[stream] += text));
    run.write("Ada\n");
    expect(await run.done).toMatchObject({ exit: 0, timedOut: false, flooded: false });
    expect(out).toEqual({ stdout: "name? hello Ada\n", stderr: "a warning\n" });
    expect(store.readEvents("shell")).toEqual([]);
  });

  it("ends the program's input when asked, so one that reads until the end finishes", async () => {
    const ws = await installedExercise(`n=0; while read -r line; do n=$((n+1)); done; echo "read $n lines"\n`);
    let stdout = "";
    const run = await app.runInteractive(ws, undefined, undefined, (text, stream) => (stream === "stdout" ? (stdout += text) : undefined));
    run.write("3\n");
    run.write("4\n");
    run.end();
    run.end(); // again: nothing happens
    expect(await run.done).toMatchObject({ exit: 0, timedOut: false });
    expect(stdout).toBe("read 2 lines\n");
    expect(run.write("5\n")).toBe(false);
  });

  it("says when each stage starts, with its time limit", async () => {
    const ws = await installedExercise("echo done\n");
    const starts: string[] = [];
    const run = await app.runInteractive(ws, undefined, undefined, () => undefined, { limitMs: 5_000, onStart: (stage, limitMs) => starts.push(`${stage} ${limitMs}`) });
    await run.done;
    // The fixture track builds first, with the default build limit of 60 s.
    expect(starts).toEqual(["build 60000", "run 5000"]);
    const slowBuildStarts: string[] = [];
    useBuild("sleep 5");
    await (await app.runInteractive(ws, undefined, undefined, () => undefined, { buildLimitMs: 500, onStart: (stage, limitMs) => slowBuildStarts.push(`${stage} ${limitMs}`) })).done;
    expect(slowBuildStarts).toEqual(["build 500"]);
  });

  it("names the run command for an io exercise, so the app can show it", async () => {
    const ws = await installedExercise();
    expect(await app.getExercise(ws, "max-of-line")).toMatchObject({ style: "io", run: "sh main.sh" });
  });

  it("stops the program when asked", async () => {
    const ws = await installedExercise("sleep 30\n");
    const run = await app.runInteractive(ws, undefined, undefined, () => undefined);
    run.kill();
    expect(await run.done).toMatchObject({ stopped: true, timedOut: false });
  });

  it("stops a program that runs past the time limit", async () => {
    const ws = await installedExercise("sleep 30\n");
    const run = await app.runInteractive(ws, undefined, undefined, () => undefined, { limitMs: 300 });
    expect(await run.done).toMatchObject({ timedOut: true });
  });

  it("knows a timeout from the driver's deadline marker, not from timing or an exit code: build or run", async () => {
    const ws = await installedExercise();
    const result = async (program: string, options: { limitMs?: number; buildLimitMs?: number } = {}) => {
      writeProgram(ws, program);
      return (await app.runInteractive(ws, undefined, undefined, () => undefined, options)).done;
    };
    // A program that kills itself, or exits 138, ends like a timeout would, but the driver never said time was up.
    expect(await result("kill -9 $$\n")).toMatchObject({ exit: 137, stage: "run", timedOut: false });
    expect(await result("exit 138\n")).toMatchObject({ exit: 138, stage: "run", timedOut: false });
    expect(await result("sleep 30\n", { limitMs: 300 })).toMatchObject({ stage: "run", timedOut: true });
    useBuild("sleep 30");
    expect(await result("echo hi\n", { buildLimitMs: 300 })).toMatchObject({ stage: "build", timedOut: true });
  });

  it("says the program ran out of memory when the runtime killed it for memory, though the driver went on", async () => {
    const ws = await installedExercise(MEMORY_HOG);
    useMemoryLimit(64);
    const run = await app.runInteractive(ws, undefined, undefined, () => undefined);
    expect(await run.done).toMatchObject({ exit: 137, outOfMemory: true, timedOut: false });
  });

  it("reports what the program printed and its exit code as its own, even when they look like the runtime's", async () => {
    const ws = await installedExercise(`echo "error waiting for container: unexpected EOF" >&2; exit 125\n`);
    let err = "";
    const run = await app.runInteractive(ws, undefined, undefined, (text, stream) => stream === "stderr" && (err += text));
    expect(await run.done).toMatchObject({ exit: 125, timedOut: false });
    expect(err).toBe("error waiting for container: unexpected EOF\n");
  });

  it("reports a program's own exit 124 as its exit, not a timeout", async () => {
    const ws = await installedExercise("exit 124\n");
    const run = await app.runInteractive(ws, undefined, undefined, () => undefined);
    expect(await run.done).toMatchObject({ exit: 124, timedOut: false });
  });

  it("bounds typed input a program isn't reading, instead of buffering it without limit", async () => {
    const ws = await installedExercise("sleep 30\n");
    const run = await app.runInteractive(ws, undefined, undefined, () => undefined);
    const line = "x".repeat(1023) + "\n";
    let accepted = 0;
    for (let i = 0; i < 4096; i++) if (run.write(line)) accepted++;
    expect(accepted).toBeLessThan(4096);
    expect(run.write("y".repeat(100_000))).toBe(false); // one write is bounded too
    run.kill();
    await run.done;
    expect(run.write("after\n")).toBe(false);
  });

  it("keeps characters split across output chunks whole", async () => {
    // The euro sign is three bytes; the program prints its first byte, pauses, then the other two.
    const ws = await installedExercise(`printf '\\342'; sleep 0.2; printf '\\202\\254\\n'\n`);
    let out = "";
    const run = await app.runInteractive(ws, undefined, undefined, (text) => (out += text));
    await run.done;
    expect(out).toBe("€\n");
  });

  it("leaves no run folder behind, whatever happens", async () => {
    const ws = await installedExercise(`read -r x; echo "hello $x"\n`);
    // This test's own code-learn home (stubbed above), so other test runs on the machine can't add folders.
    const runs = () => readdirSync(runsDir());
    const ok = await app.runInteractive(ws, undefined, undefined, () => undefined);
    ok.write("Ada\n");
    await ok.done;
    const stopped = await app.runInteractive(ws, undefined, undefined, () => undefined);
    stopped.kill();
    await stopped.done;
    // Files the sandbox can't be given: the run folder is staged first, and goes again when staging fails.
    const track = store.judgeTrack(store.readTrack("shell-io@1")!);
    expect(() => runProgram(track, { "../escape.sh": "" }, () => undefined)).toThrow();
    expect(runs()).toEqual([]);
  });

  it("isn't offered for a track with no run command", async () => {
    const ws = await installedExercise();
    const track = store.readTrack("shell-io@1")!;
    store.writeTrackRecord("shell-io@1", { ...track, run: undefined, styles: ["unit"], test: "true" } as never);
    await expect(app.runInteractive(ws, undefined, undefined, () => undefined)).rejects.toThrow(/no run command/);
  });
});

/** Where the learner's program is in a workspace made by installedExercise. */
const programPath = (workspace: string) => join(workspace, "exercises", "shell", "max-of-line", "main.sh");
const writeProgram = (workspace: string, program: string) => writeFileSync(programPath(workspace), program);

/** Gives the installed io track a different build command. */
function useBuild(build: string) {
  store.writeTrackRecord("shell-io@1", { ...store.readTrack("shell-io@1")!, build });
}

/** Gives the installed io track a different memory limit. */
function useMemoryLimit(memoryMb: number) {
  const track = store.readTrack("shell-io@1")!;
  store.writeTrackRecord("shell-io@1", { ...track, limits: { ...track.limits, memory_mb: memoryMb } });
}

/** A workspace whose io exercise is installed (with its toolchain folder) and whose main.sh holds `program`. */
async function installedExercise(program = "read -r x; echo $x\n"): Promise<string> {
  const ws = tempDir("code-learn-ws-");
  installFixtureTrack("shell-io");
  await app.saveRoadmap(ws, "shell", readFileSync(join(fixtures, "roadmaps", "shell-io.yaml"), "utf8"));
  store.commitFolder(store.exerciseDir("shell", "max-of-line"), readFileMap(join(fixtures, "exercises", "io-max")), {
    "exercise.json": {
      format_version: 1, slug: "max-of-line", style: "io", concepts: ["sh.loops"], difficulty: 1, track: "shell-io@1",
      createdAt: new Date().toISOString(), expected: { "visible/01": "3\n", "hidden/01": "5\n", "hidden/02": "-1\n", "hidden/03": "7\n" },
    },
  });
  const { path } = await app.getExercise(ws, "max-of-line");
  writeFileSync(join(path, "main.sh"), program);
  return ws;
}

describe.runIf(sandboxReady())("live lesson examples", () => {
  /** Writes a lesson whose examples were already checked, as save_lesson stores it. */
  const lesson = (examples: Record<string, string>[], style: "io" | "unit" = "io") =>
    store.writeLesson("shell", { format_version: 1, id: "echo", concept: "sh.basics", title: "Echo", created: new Date().toISOString(), examples: examples.length, track: "shell-io@1", style }, "```example\n1\n```\n", examples);

  it("runs an io example live with the learner's input, and records nothing", async () => {
    const ws = await installedExercise();
    lesson([{ "main.sh": `read -r x; echo "hello $x"\n` }]);
    // The reader learns its examples run as programs, so Run can take typed input.
    expect(app.getLesson(ws, "echo")).toMatchObject({ style: "io" });
    const out = { stdout: "", stderr: "" };
    const run = await app.runExampleLive(ws, "echo", 1, undefined, (text, stream) => (out[stream] += text));
    run.write("Ada\n");
    expect(await run.done).toMatchObject({ exit: 0, timedOut: false });
    expect(out.stdout).toContain("hello Ada");
    expect(store.readEvents("shell")).toEqual([]);
  });

  it("refuses a missing example, a unit example (which runs as tests), and files that no longer fit the track", async () => {
    const ws = await installedExercise();
    lesson([{ "main.sh": "echo 1\n" }], "unit");
    await expect(app.runExampleLive(ws, "echo", 2, undefined, () => undefined)).rejects.toThrow(/no example 2/);
    await expect(app.runExampleLive(ws, "echo", 1, undefined, () => undefined)).rejects.toThrow(/runs as tests/);
    rmSync(store.lessonDir("shell", "echo"), { recursive: true });
    lesson([{ "other.sh": "echo 1\n" }]);
    await expect(app.runExampleLive(ws, "echo", 1, undefined, () => undefined)).rejects.toThrow(/exactly the track's learner files/);
  });
});

describe("Run's driver markers", () => {
  const feed = (chunks: string[]) => {
    let text = "";
    const marks: string[] = [];
    const f = runMarkers((t) => (text += t), (m) => marks.push(m.join(" ")));
    for (const c of chunks) f.write(c);
    f.end();
    return { text, marks };
  };
  // What the driver adds is exactly "\n@@code-learn-run <fields>\n"; the rest is the program's own stderr.
  const stream = "warn\n" + "\n@@code-learn-run start run\n" + "oops: no newline" + "\n@@code-learn-run end run 3\n";

  it("passes the program's stderr through and takes out the driver's markers, however it's split", () => {
    const want = { text: "warn\noops: no newline", marks: ["start run", "end run 3"] };
    expect(feed([stream])).toEqual(want);
    for (let at = 1; at < stream.length; at++) expect(feed([stream.slice(0, at), stream.slice(at)])).toEqual(want);
  });

  it("holds back only what could still become a marker, and lets it go at the end", () => {
    expect(feed(["prompt> \n@@code-learn"]).text).toBe("prompt> \n@@code-learn");
    expect(feed(["a", "\n", "@", "b"]).text).toBe("a\n@b");
  });
});

describe("learnerPathStream", () => {
  it("names the learner's files by their own names in streamed errors, however the text is split", () => {
    const text = 'Traceback:\n  File "/work/src/solution.py", line 7\n  /work/tests/t.py and /work/srcx and a/\n';
    const want = 'Traceback:\n  File "solution.py", line 7\n  tests/t.py and /work/srcx and a/\n';
    for (let size = 1; size <= text.length; size++) {
      let out = "";
      const s = learnerPathStream((t) => (out += t));
      for (let at = 0; at < text.length; at += size) s.write(text.slice(at, at + size));
      s.end();
      expect(out).toBe(want);
    }
  });

  it("passes text through at once unless its end could start a path", () => {
    const seen: string[] = [];
    const s = learnerPathStream((t) => seen.push(t));
    s.write("Enter a number: ");
    s.write("oops /wor");
    expect(seen).toEqual(["Enter a number: ", "oops "]);
    s.end();
    expect(seen.join("")).toBe("Enter a number: oops /wor");
  });
});
