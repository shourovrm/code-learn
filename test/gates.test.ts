import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileMap } from "../src/files.js";
import { checkTrackFiles, comparedEarlier, GateError, probeFastMs, toolchainFiles, unitReferenceFailure, verifyExercise } from "../src/gates.js";
import type { UnitRun } from "../src/grading.js";
import { type CourseRecord, parseRoadmapYaml, type TrackRecord } from "../src/schemas.js";


describe("comparedEarlier", () => {
  const e = (slug: string, concepts: string[], day: number, style: "io" | "unit" = "io") =>
    ({ slug, style, concepts, createdAt: new Date(Date.UTC(2026, 0, day)).toISOString(), solution: {} });

  it("compares at most 3 earlier exercises on a shared concept and the 3 most recent others, newest first, same style only", () => {
    const pool = [
      e("a1", ["a"], 1), e("a2", ["a"], 2), e("a3", ["a", "b"], 3), e("a4", ["a"], 4),
      e("b1", ["b"], 5), e("c1", ["c"], 6), e("c2", ["c"], 7), e("c3", ["c"], 8), e("u1", ["a"], 9, "unit"),
    ];
    expect(comparedEarlier(pool, "io", ["a"]).map((x) => x.slug)).toEqual(["a4", "a3", "a2", "c3", "c2", "c1"]);
  });
});

describe("probeFastMs", () => {
  it("gives a new track's pass probe a sixth of time_ms, so every reference (a third) has twice its time", () => {
    expect(probeFastMs({ time_ms: 2000 })).toBe(333);
  });

  it("keeps a third at the ceiling, where time_ms can't be raised, so heavy toolchains still install", () => {
    expect(probeFastMs({ time_ms: 120_000 })).toBe(40_000);
  });

  it("keeps a third on a rebuild: an installed track's files can't change, and its course can't change track", () => {
    expect(probeFastMs({ time_ms: 2000 }, { rebuild: true })).toBe(666);
  });
});

describe("unitReferenceFailure", () => {
  const noReport = [
    { set: "visible" as const, name: "visible/report", status: "error" as const, message: "Traceback: SECRET_REFERENCE_LINE" },
    { set: "hidden" as const, name: "hidden/report", status: "error" as const, message: "SECRET_REFERENCE_LINE" },
  ];
  const run = (over: Partial<UnitRun> = {}, report: Partial<UnitRun["report"]> = {}): UnitRun => ({ report: { exit: 1, body: "", log: "SECRET", ...report }, flooded: false, ...over });

  it("says the runner failed before any test when the reference's report is missing, and what to check, without its output", () => {
    // Recorded with Codex on a Django track: three saves got only "visible/report: error" and repeated the same mistake.
    const message = unitReferenceFailure(noReport, run());
    expect(message).toMatch(/The test runner stopped before reporting any test/);
    expect(message).toMatch(/contract\.examples/);
    expect(message).not.toMatch(/SECRET_REFERENCE_LINE/);
  });

  it.each([
    ["the time limit", run({}, { timedOut: true })],
    ["the memory limit", run({ outOfMemory: true })],
    ["the output limit", run({ flooded: true })],
  ])("says the runner was stopped at %s, not that the tests didn't load", (_, stopped) => {
    const message = unitReferenceFailure(noReport, stopped);
    expect(message).toMatch(/stopped at a time, memory or output limit/);
    expect(message).not.toMatch(/didn't load/);
    expect(message).not.toMatch(/SECRET/);
  });

  it("gives no advice when the runner did report, even a test named report", () => {
    const message = unitReferenceFailure([{ set: "visible", name: "visible/report", status: "error" }, { set: "visible", name: "visible/x", status: "pass" }], run({}, { exit: 0, body: "{}" }));
    expect(message).not.toMatch(/stopped/);
  });

  it("lists statuses only when the runner reported tests", () => {
    const message = unitReferenceFailure([
      { set: "visible", name: "visible/test_a", status: "fail", message: "SECRET" },
      { set: "hidden", name: "hidden/test_b", status: "pass" },
    ], run({}, { exit: 0, body: "{}" }));
    expect(message).toBe("the reference must pass every test:\n  visible/test_a: fail\n  hidden #1: pass");
  });
});

describe("checkTrackFiles", () => {
  const track = () => readFileMap(join(import.meta.dirname, "fixtures", "tracks", "custom-unit"));

  it("accepts a track whose probe is small enough to show authors as an example", () => {
    expect(checkTrackFiles(track()).spec.id).toBe("custom-unit");
  });

  it("refuses a probe example over 64 KB, since every author receives it", () => {
    const big = { ...track(), "probe/unit/tests/sums.check": `${"# padding\n".repeat(7_000)}2 3 => 5\n` };
    expect(() => checkTrackFiles(big)).toThrow(/64 KB/);
  });

  it("refuses a Dockerfile, saying to write a toolchain block instead", () => {
    const docker = { ...track(), Dockerfile: "FROM alpine\n" };
    expect(() => checkTrackFiles(docker)).toThrow(GateError);
    expect(() => checkTrackFiles(docker)).toThrow(/no Docker[\s\S]*toolchain block/);
  });

  it("refuses a track.yaml without a toolchain block", () => {
    const files = track();
    const bare = { ...files, "track.yaml": files["track.yaml"]!.replace(/^toolchain:.*$/m, "") };
    expect(() => checkTrackFiles(bare)).toThrow(/toolchain/);
  });
});

describe("toolchainFiles", () => {
  it("gives /opt/track every file but track.yaml, the probes included, so setup can build the pass probe once", () => {
    const files = { "track.yaml": "id: x", "run-checks": "sh", "probe/unit/pass/a": "1", "lib/x.txt": "2" };
    expect(toolchainFiles(files)).toEqual({ "run-checks": "sh", "probe/unit/pass/a": "1", "lib/x.txt": "2" });
  });
});

describe("verifyExercise's io test files", () => {
  const fixtures = join(import.meta.dirname, "fixtures");
  const track: TrackRecord = {
    format_version: 1, id: "shell-io", version: 1, styles: ["io"], files: ["main.sh"], run: "sh main.sh",
    limits: { time_ms: 2000, memory_mb: 128 }, toolchain: { packages: ["coreutils"], env: {}, resolved: [] }, installedAt: "now",
  };
  const course: CourseRecord = { format_version: 1, course: "demo", ...parseRoadmapYaml(readFileSync(join(fixtures, "roadmaps", "shell-io.yaml"), "utf8")) };
  const files = () => readFileMap(join(fixtures, "exercises", "io-max"));
  // These are refused before anything runs, so no sandbox is needed.
  const verify = (extra: Record<string, string>) => verifyExercise(track, course, { ...files(), ...extra }, new Set());

  it("refuses an expected output or any other file beside the NN.in inputs and NN.gen generators", async () => {
    await expect(verify({ "tests/visible/02.out": "3\n" })).rejects.toThrow(/may only hold NN.in inputs and NN.gen input generators[\s\S]*Remove: 02.out/);
    await expect(verify({ "tests/hidden/gen.sh": "echo 1\n" })).rejects.toThrow(/Remove: 1 file\(s\)/);
  });

  it("refuses an input given both ways, without naming a hidden one", async () => {
    await expect(verify({ "tests/visible/01.gen": "echo 1 2 3\n" })).rejects.toThrow(/both NN.in and NN.gen for 01\./);
    const hidden = verify({ "tests/hidden/02.gen": "echo 1 2 3\n" });
    await expect(hidden).rejects.toThrow(/both NN.in and NN.gen for 1 test\(s\)/);
    await expect(hidden).rejects.not.toThrow(/02/);
  });
});
