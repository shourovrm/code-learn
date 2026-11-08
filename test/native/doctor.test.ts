import { spawn, spawnSync } from "node:child_process";
import { readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctor, isolation } from "../../src/doctor.js";
import { ownedScopes } from "../../src/sandbox.js";
import { fakeMicromamba } from "../fake-micromamba.js";
import { sandboxReady } from "../sandbox-ready.js";
import { tempDir } from "../temp.js";

describe.runIf(sandboxReady())("doctor (native sandbox)", () => {
  let home: string;
  const startedUnits: string[] = [];

  beforeEach(() => {
    home = tempDir("code-learn-home-");
    vi.stubEnv("CODE_LEARN_HOME", home);
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => {
    for (const unit of startedUnits) spawnSync("systemctl", ["--user", "stop", unit], { stdio: "ignore" });
  });

  it("proves from inside a sandbox that the network, the home folder, code-learn's data and read-only mounts are shut off", async () => {
    const check = await isolation();
    expect(check).toMatchObject({ name: "sandbox isolation", ok: true });
    expect(check.detail).toContain("no network but loopback");
  });

  it("leaves no run folder behind", async () => {
    await isolation();
    expect(readdirSync(join(realpathSync.native(home), "runs"))).toEqual([]);
  });

  it("passes every check on a working computer, in order", async () => {
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

  it("fails the package manager check, as a sandbox problem, when micromamba is missing", async () => {
    vi.stubEnv("CODE_LEARN_MICROMAMBA", "/nowhere/micromamba");
    const checks = await doctor(false);
    expect(checks.find((c) => c.name === "package manager")).toMatchObject({ ok: false, kind: "sandbox" });
  });

  it("reports an abandoned sandbox, and stops it only with --fix", async () => {
    fakeMicromamba();
    const gone = spawnSync("true").pid;
    const unit = `code-learn-${gone}-bbbb01.scope`;
    startedUnits.push(unit);
    spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${unit}`, "sleep", "120"], { stdio: "ignore", detached: true }).unref();
    await vi.waitUntil(() => ownedScopes().some((scope) => scope.unit === unit), { timeout: 10_000 });

    const found = (await doctor(false)).find((c) => c.name === "leftover sandboxes");
    expect(found).toMatchObject({ ok: false, detail: expect.stringMatching(/abandoned; run code-learn doctor --fix/) });
    expect(ownedScopes().some((scope) => scope.unit === unit)).toBe(true);

    const fixed = (await doctor(true)).find((c) => c.name === "leftover sandboxes");
    expect(fixed).toMatchObject({ ok: true, detail: expect.stringMatching(/^stopped \d+/) });
    expect(ownedScopes().some((scope) => scope.unit === unit)).toBe(false);
  });
});
