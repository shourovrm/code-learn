import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as app from "../../src/app.js";
import { runIo } from "../../src/judge.js";
import { judgeTrack, readTrack } from "../../src/store.js";
import { fakeMicromamba } from "../fake-micromamba.js";
import { sandboxReady } from "../sandbox-ready.js";
import { tempDir } from "../temp.js";
import { fixtureTrackFiles } from "./helpers.js";

/** Two code-learn homes on one computer, both installing the same id@version with different files. */
describe.runIf(sandboxReady())("two code-learn homes (native sandbox)", () => {
  afterAll(() => vi.unstubAllEnvs());

  const install = async (home: string, label: string) => {
    vi.stubEnv("CODE_LEARN_HOME", home);
    fakeMicromamba();
    const track = fixtureTrackFiles("shell-io");
    const files = { ...track, "track.yaml": track["track.yaml"]!.replace("id: shell-io", "id: shell-homes"), "label.txt": label };
    await app.saveTrack(files);
    return judgeTrack(readTrack("shell-homes@1")!);
  };

  it("keep their own toolchains, so neither home's track files are the other's", async () => {
    const homeA = tempDir("code-learn-home-");
    const homeB = tempDir("code-learn-home-");
    const a = await install(homeA, "home-a");
    const b = await install(homeB, "home-b");
    expect(a.folders.track).not.toBe(b.folders.track);
    expect(readFileSync(join(a.folders.track, "label.txt"), "utf8")).toBe("home-a");
    expect(readFileSync(join(b.folders.track, "label.txt"), "utf8")).toBe("home-b");
    // Each toolchain runs from its own home: /opt/track in the sandbox is that home's folder.
    for (const [track, label] of [[a, "home-a"], [b, "home-b"]] as const) {
      const run = await runIo(track, "visible", { "main.sh": "read x\ncat /opt/track/label.txt\n" }, { "01.in": "x\n" });
      expect(run.cases[0]?.stdout).toBe(label);
    }
  });
});
