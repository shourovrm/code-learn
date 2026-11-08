import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../src/app.js";
import { readFileMap } from "../src/files.js";
import * as store from "../src/store.js";
import { fakeMicromamba } from "./fake-micromamba.js";
import { installFixtureTrack } from "./installed-track.js";
import { sandboxReady } from "./sandbox-ready.js";
import { tempDir } from "./temp.js";

const fixtures = join(import.meta.dirname, "fixtures");
const OFFLINE = 'echo "critical libmamba Could not resolve host: conda.anaconda.org" >&2; exit 1';

beforeEach(() => vi.stubEnv("CODE_LEARN_HOME", tempDir("code-learn-home-")));
afterEach(() => vi.unstubAllEnvs());

/** A workspace with a shell course on the installed shell-io track and one saved exercise, checked in the real sandbox. */
async function courseWithExercise(style: "io" | "none" = "io"): Promise<void> {
  const ws = tempDir("code-learn-ws-");
  installFixtureTrack("shell-io");
  await app.saveRoadmap(ws, "shell", readFileSync(join(fixtures, "roadmaps", "shell-io.yaml"), "utf8"));
  await app.saveExercise(ws, readFileMap(join(fixtures, "exercises", "io-max")));
  // Activities off keeps the track and its exercises (DESIGN §5).
  if (style === "none") await app.saveRoadmap(ws, "shell", readFileSync(join(fixtures, "roadmaps", "shell-io.yaml"), "utf8").replace("style: io", "style: none"));
}

/** Marks the installed toolchain, so a test can tell whether it was replaced. */
const markInstalledToolchain = () => writeFileSync(join(store.envDir("shell-io@1"), "env", "installed-marker"), "old");
const installedMarkerExists = () => existsSync(join(store.envDir("shell-io@1"), "env", "installed-marker"));
const leftoverFolders = () => readdirSync(store.envsDir()).filter((name) => name.startsWith("."));

describe.runIf(sandboxReady())("rebuilding a track", () => {
  it("replaces the toolchain and records what was installed, after every exercise gives the same results", async () => {
    await courseWithExercise();
    markInstalledToolchain();
    fakeMicromamba();
    await expect(app.rebuildTrack("shell-io@1")).resolves.toEqual({ rebuilt: "shell-io@1", exercises: 1 });
    expect(installedMarkerExists()).toBe(false);
    expect(existsSync(join(store.envDir("shell-io@1"), "env", "bin", "fake-tool"))).toBe(true);
    expect(store.readTrack("shell-io@1")?.toolchain.resolved).toEqual(["coreutils-1.0-0"]);
    expect(leftoverFolders()).toEqual([]);
  });

  it("re-checks a lessons-only course's exercises in their own style, so its retained track still rebuilds", async () => {
    await courseWithExercise("none");
    fakeMicromamba();
    await expect(app.rebuildTrack("shell-io@1")).resolves.toEqual({ rebuilt: "shell-io@1", exercises: 1 });
  });

  it("leaves the installed toolchain untouched when an exercise's results differ on the new one", async () => {
    await courseWithExercise();
    // A stored expected output the reference no longer produces, as a changed tool would cause.
    const stored = store.readExercise("shell", "max-of-line");
    const changed = { ...stored.record, expected: { ...stored.record.expected, "hidden/01": "not-the-max\n" } };
    rmSync(store.exerciseDir("shell", "max-of-line"), { recursive: true });
    store.commitFolder(store.exerciseDir("shell", "max-of-line"), stored.files, { "exercise.json": changed });
    markInstalledToolchain();
    fakeMicromamba();
    const rebuild = app.rebuildTrack("shell-io@1");
    await expect(rebuild).rejects.toThrow(/behaves differently, so it wasn't accepted:\nshell\/max-of-line: results changed/);
    expect(installedMarkerExists()).toBe(true);
    expect(store.readTrack("shell-io@1")?.toolchain.resolved).toEqual(["fake-1.0-0"]);
    expect(leftoverFolders()).toEqual([]);
  });

  it("passes on this computer's failure, with its kind, instead of calling it changed behaviour", async () => {
    await courseWithExercise();
    markInstalledToolchain();
    fakeMicromamba(OFFLINE);
    const rebuild = app.rebuildTrack("shell-io@1");
    await expect(rebuild).rejects.toMatchObject({ kind: "offline" });
    await expect(rebuild).rejects.not.toThrow(/behaves differently/);
    expect(installedMarkerExists()).toBe(true);
    expect(store.readTrack("shell-io@1")?.toolchain.resolved).toEqual(["fake-1.0-0"]);
  });
});
