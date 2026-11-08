import { mkdirSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type JudgeTrack, runIo, runUnit } from "../../src/judge.js";
import { runProgram } from "../../src/program.js";
import { sandboxReady } from "../sandbox-ready.js";
import { tempDir } from "../temp.js";
import { fixtureTrackFiles, installedJudgeTrack, subMap } from "./helpers.js";

/** Where a check's files are staged (DESIGN §4.3): under code-learn's home, named by the owning process. */
describe.runIf(sandboxReady())("run folders (native sandbox)", () => {
  let ioTrack: JudgeTrack;
  let unitTrack: JudgeTrack;
  let home: string;

  beforeAll(() => {
    ioTrack = installedJudgeTrack("shell-io");
    unitTrack = installedJudgeTrack("shell-unit");
  });
  beforeEach(() => {
    home = tempDir("code-learn-home-");
    vi.stubEnv("CODE_LEARN_HOME", home);
  });
  afterEach(() => vi.unstubAllEnvs());

  const runsIn = () => join(realpathSync.native(home), "runs");
  const stagedNow = () => readdirSync(runsIn());

  it("a check stages its folder under CODE_LEARN_HOME, named after this process, and removes it", async () => {
    const running = runIo(ioTrack, "visible", { "main.sh": "read x\nsleep 1\necho \"got $x\"\n" }, { "01.in": "a\n" });
    await expect.poll(stagedNow, { timeout: 10_000 }).toHaveLength(1);
    expect(stagedNow()[0]!.startsWith(`${process.pid}-`)).toBe(true);
    expect((await running).cases[0]?.stdout).toBe("got a\n");
    expect(stagedNow()).toEqual([]);
  });

  it("unit checks and Run stage their folders the same way", async () => {
    const unit = fixtureTrackFiles("shell-unit");
    const report = await runUnit(unitTrack, { "lib.sh": unit["probe/unit/pass/lib.sh"]! }, subMap(unit, "probe/unit/tests"));
    expect(report.report.exit).toBe(0);
    expect(stagedNow()).toEqual([]);

    const run = runProgram(ioTrack, { "main.sh": "sleep 1\n" }, () => undefined);
    await expect.poll(stagedNow, { timeout: 10_000 }).toHaveLength(1);
    expect(await run.done).toMatchObject({ exit: 0, stage: "run" });
    expect(stagedNow()).toEqual([]);
  });

  it("removes the folder of a crashed process before staging a new one, and leaves a live process's folder alone", async () => {
    mkdirSync(runsIn(), { recursive: true });
    mkdirSync(join(runsIn(), "99999999-abcdef"));
    mkdirSync(join(runsIn(), `${process.pid}-live00`));
    const io = await runIo(ioTrack, "visible", { "main.sh": "read x\necho \"got $x\"\n" }, { "01.in": "a\n" });
    expect(io.cases[0]?.stdout).toBe("got a\n");
    expect(stagedNow()).toEqual([`${process.pid}-live00`]);
  });
});
