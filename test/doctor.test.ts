import { chmodSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctor, isolation } from "../src/doctor.js";
import { fakeMicromamba } from "./fake-micromamba.js";
import { sandboxReady } from "./sandbox-ready.js";
import { tempDir } from "./temp.js";

/** `code-learn doctor` (DESIGN §4.6): the requirements, the isolation self-test and leftovers, each as one check. */

beforeEach(() => vi.stubEnv("CODE_LEARN_HOME", tempDir("code-learn-home-")));
afterEach(() => vi.unstubAllEnvs());

describe.runIf(sandboxReady())("doctor on this computer", () => {
  it("passes every check when the sandbox and micromamba are here", async () => {
    fakeMicromamba();
    const checks = await doctor(false);
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      ["sandbox", true],
      ["package manager", true],
      ["code-learn home", true],
      ["sandbox isolation", true],
      ["leftover sandboxes", true],
    ]);
    expect(checks[1]!.detail).toContain("micromamba 2.9.0");
  });

  it("fails only the package manager check when micromamba is missing, as this computer's problem", async () => {
    vi.stubEnv("CODE_LEARN_MICROMAMBA", "/nowhere/micromamba");
    const checks = await doctor(false);
    expect(checks.find((c) => c.name === "package manager")).toMatchObject({ ok: false, kind: "sandbox", detail: expect.stringContaining("micromamba isn't installed") });
    expect(checks.filter((c) => !c.ok)).toHaveLength(1);
  });

  it("proves each isolation rule from inside a sandbox", async () => {
    const check = await isolation();
    expect(check).toMatchObject({ ok: true });
    expect(check.detail).toBe("no network but loopback; the home folder is hidden; code-learn's data is hidden; mounted files are read-only; /usr is read-only");
  });

  // Root writes anywhere, so a read-only folder can't stand in for one it may not write.
  it.runIf(process.getuid?.() !== 0)("calls a home it can't write a disk problem", async () => {
    fakeMicromamba();
    const home = tempDir("code-learn-locked-");
    vi.stubEnv("CODE_LEARN_HOME", home);
    chmodSync(home, 0o555);
    try {
      const checks = await doctor(false);
      expect(checks.find((c) => c.name === "code-learn home")).toMatchObject({ ok: false, kind: "disk" });
    } finally {
      chmodSync(home, 0o755);
    }
  });
});

describe("doctor without a sandbox", () => {
  it("stops after the requirements when bubblewrap isn't there, naming what to install", async () => {
    // An empty PATH hides bwrap and systemd-run; micromamba is found by its configured path.
    fakeMicromamba();
    vi.stubEnv("PATH", tempDir("code-learn-empty-path-"));
    const checks = await doctor(false);
    expect(checks.map((c) => c.name)).toEqual(["sandbox", "package manager", "code-learn home"]);
    expect(checks[0]).toMatchObject({ ok: false, kind: "sandbox", detail: expect.stringContaining("Install bubblewrap") });
  });
});
