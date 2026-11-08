import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../src/app.js";
import { doctor } from "../src/doctor.js";
import { readFileMap } from "../src/files.js";
import { ownedScopes } from "../src/sandbox.js";
import * as store from "../src/store.js";
import { fakeMicromamba } from "./fake-micromamba.js";
import { installFixtureTrack } from "./installed-track.js";
import { sandboxReady } from "./sandbox-ready.js";
import { tempDir } from "./temp.js";

/** The environment matrix: what learners see when micromamba is missing, the network is down, or the disk is full. */

const fixtures = join(import.meta.dirname, "fixtures");
const track = () => readFileMap(join(fixtures, "tracks", "shell-io"));
const unitTrack = () => readFileMap(join(fixtures, "tracks", "shell-unit"));

/** A program that grows a string until the sandbox's memory limit kills it. */
const MEMORY_HOG = `awk 'BEGIN { s = "x"; while (1) s = s s }'\n`;

const OFFLINE = 'echo "critical libmamba Could not resolve host: conda.anaconda.org" >&2; exit 1';

beforeEach(() => {
  vi.stubEnv("CODE_LEARN_HOME", tempDir("code-learn-home-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const missingMicromamba = () => vi.stubEnv("CODE_LEARN_MICROMAMBA", join(tempDir("code-learn-nowhere-"), "micromamba"));

describe("doctor", () => {
  it("says what to install when micromamba isn't installed, and still checks the rest", async () => {
    missingMicromamba();
    const checks = await doctor(false);
    expect(checks.find((c) => c.name === "package manager")).toMatchObject({ ok: false, kind: "sandbox", detail: expect.stringMatching(/micromamba isn't installed.*Install micromamba 2/s) });
    expect(checks.find((c) => c.name === "code-learn home")?.ok).toBe(true);
  });
});

describe("installing a track", () => {
  it("is an infrastructure failure when micromamba is missing, and installs nothing", async () => {
    missingMicromamba();
    const failure = app.saveTrack(track());
    await expect(failure).rejects.toMatchObject({ name: "CodeLearnError", kind: "sandbox", code: "no-micromamba" });
    await expect(failure).rejects.not.toThrow(/Gate/);
    expect(app.listTracks()).toEqual([]);
  });
});

describe.runIf(sandboxReady())("installing a track in the sandbox", () => {
  it.each([
    ["offline", OFFLINE, /couldn't reach the package server.*Check the internet connection/s, "offline"],
    ["out of disk", 'echo "write /opt/env/lib: no space left on device" >&2; exit 1', /The disk is full/, "disk"],
  ] as const)("is an infrastructure failure when this computer is %s, and installs nothing", async (_label, extra, message, kind) => {
    fakeMicromamba(extra);
    const failure = app.saveTrack(track());
    await expect(failure).rejects.toThrow(message);
    // The desktop tells these apart by kind, not by reading the English.
    await expect(failure).rejects.toMatchObject({ name: "CodeLearnError", kind });
    await expect(failure).rejects.not.toThrow(/Gate/);
    expect(app.listTracks()).toEqual([]);
  });

  it("blames the track, with the setup's own output, when its setup fails", async () => {
    fakeMicromamba();
    const files = track();
    files["track.yaml"] = files["track.yaml"]!.replace(/^toolchain:.*$/m, `toolchain: { packages: ["coreutils"], setup: "echo setup-went-wrong >&2; exit 1" }`);
    const failure = await app.saveTrack(files).then(() => ({ kind: "none", message: "" }), (e: { kind?: string; message: string }) => e);
    expect(failure.message).toMatch(/Gate "toolchain" failed: the setup command failed[\s\S]*setup-went-wrong/);
    expect(failure.kind).toBeUndefined();
    expect(app.listTracks()).toEqual([]);
  });

  /** The shell-unit track with `script` as its test runner, so a probe's own output can be chosen. */
  const unitTrackRunning = (script: string) => ({ ...unitTrack(), "test.sh": script });

  it("shows the end of a probe's own output, so the agent can see why its test runner found nothing", async () => {
    fakeMicromamba();
    const failure = app.saveTrack(unitTrackRunning("echo 'No test files found, exiting with code 1'\nexit 1\n"));
    await expect(failure).rejects.toThrow(/Gate "probe pass"[\s\S]*No test files found, exiting with code 1/);
    // Shown once, even when a test's message already carries the runner's output.
    const message = await failure.then(() => "", (e: Error) => e.message);
    expect(message.match(/No test files found/g)).toHaveLength(1);
  });

  it("blames the track, not this computer, when a probe's own output mentions a full disk", async () => {
    fakeMicromamba();
    const failure = await app.saveTrack(unitTrackRunning("echo 'write /tmp/cache: no space left on device'\nexit 1\n")).then(
      () => ({ kind: "none", message: "" }),
      (e: { kind?: string; message: string }) => e,
    );
    expect(failure.message).toMatch(/Gate "probe pass"[\s\S]*no space left on device/);
    expect(failure.kind).not.toBe("disk");
  });

  it("says a track's test runner ran out of memory, not just that it was killed", async () => {
    fakeMicromamba();
    const failure = app.saveTrack(unitTrackRunning(`exec ${MEMORY_HOG}`));
    await expect(failure).rejects.toThrow(/Gate "probe pass"[\s\S]*The test runner ran out of memory \(memory_mb 128\)/);
  });

  it("reports a setup's install steps, then its checks, as phases and counts only", async () => {
    fakeMicromamba();
    await app.proposeTrack(track());
    const { digest } = app.listProposals()[0]!;
    const seen: unknown[] = [];
    await app.installProposal("shell-io@1", digest, (p) => seen.push(p));
    expect(seen).toEqual([{ phase: "building", done: 1, total: 1 }, { phase: "checking" }]);
  });

  it("keeps a proposal when its install fails offline, so Try again needs no new consent", async () => {
    fakeMicromamba(OFFLINE);
    await app.proposeTrack(track());
    const { digest } = app.listProposals()[0]!;
    await expect(app.installProposal("shell-io@1", digest)).rejects.toThrow(/couldn't reach the package server/);
    expect(app.listTracks()).toEqual([]);
    expect(app.listProposals().map((p) => p.digest)).toEqual([digest]);
  });
});

describe.runIf(sandboxReady())("a check that loses its sandbox mid-run", () => {
  it("grades and records a program that the memory limit kills, instead of blaming the sandbox", async () => {
    const ws = await installedExercise(MEMORY_HOG);
    const r = await app.checkExercise(ws);
    expect(r).toMatchObject({ passed: 0, total: 4, recorded: true });
    expect(r.tests.every((t) => t.status === "error")).toBe(true);
    expect(r.tests[0]!.message).toMatch(/^It ran out of memory \(memory_mb 128\)/);
    expect(store.readEvents("shell")).toEqual([expect.objectContaining({ kind: "check", passed: 0, total: 4 })]);
  });

  it("records nothing and says it wasn't counted when the sandbox is stopped from outside", async () => {
    const ws = await installedExercise("sleep 30\n");
    const checking = app.checkExercise(ws);
    const ownScopes = () => ownedScopes().filter((scope) => scope.pid === process.pid);
    await vi.waitFor(() => expect(ownScopes()).not.toEqual([]), { timeout: 20_000, interval: 100 });
    // What a logout or the system would do to the learner's sandboxes.
    for (const scope of ownScopes()) spawnSync("systemctl", ["--user", "stop", scope.unit]);
    await expect(checking).rejects.toThrow(/wasn't counted/);
    expect(store.readEvents("shell")).toEqual([]);
  });
});

describe.runIf(sandboxReady())("a check whose program is killed", () => {
  it("says a program that never ends took longer than the time limit", async () => {
    const ws = await installedExercise("sleep 30\n");
    const r = await app.checkExercise(ws);
    expect(r.tests[0]).toMatchObject({ status: "error", message: expect.stringMatching(/^It took longer than 2000 ms/) });
    expect(r.recorded).toBe(true);
  });
});

/** A workspace whose exercise is installed on the shell-io fixture track and holds `program`, ready to check. */
async function installedExercise(program = "echo 3\n"): Promise<string> {
  const ws = tempDir("code-learn-ws-");
  installFixtureTrack("shell-io");
  await app.saveRoadmap(ws, "shell", readFileSync(join(fixtures, "roadmaps", "shell-io.yaml"), "utf8"));
  const exercise = readFileMap(join(fixtures, "exercises", "io-max"));
  store.commitFolder(store.exerciseDir("shell", "max-of-line"), exercise, {
    "exercise.json": {
      format_version: 1, slug: "max-of-line", style: "io", concepts: ["sh.loops"], difficulty: 1, track: "shell-io@1",
      createdAt: new Date().toISOString(), expected: { "visible/01": "3\n", "hidden/01": "5\n", "hidden/02": "-1\n", "hidden/03": "7\n" },
    },
  });
  const { path } = await app.getExercise(ws, "max-of-line");
  writeFileSync(join(path, "main.sh"), program);
  return ws;
}
