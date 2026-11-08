import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ownedScopes, removeAbandoned } from "../../src/sandbox.js";
import { envsDir } from "../../src/store.js";
import { removeAbandonedStaging } from "../../src/toolchain.js";
import { sandboxReady } from "../sandbox-ready.js";
import { tempDir } from "../temp.js";

/** The PID of a process that has already exited, so nothing owns what is named after it. */
const deadPid = () => spawnSync("true").pid;

describe.runIf(sandboxReady())("leftover cleanup", () => {
  const started: string[] = [];
  afterAll(() => {
    for (const unit of started) spawnSync("systemctl", ["--user", "stop", unit], { stdio: "ignore" });
  });

  /** A scope named as code-learn names its own, holding a `sleep` that outlives the test unless it is stopped. */
  async function startScope(pid: number, suffix: string): Promise<string> {
    const unit = `code-learn-${pid}-${suffix}.scope`;
    started.push(unit);
    spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${unit}`, "sleep", "120"], { stdio: "ignore", detached: true }).unref();
    await vi.waitUntil(() => ownedScopes().some((scope) => scope.unit === unit), { timeout: 10_000 });
    return unit;
  }

  describe("abandoned scopes", () => {
    it("stops the scope of a process that is gone and leaves the scope of a live process", async () => {
      const abandoned = await startScope(deadPid()!, "aaaa01");
      const live = await startScope(process.pid, "aaaa02");
      expect(ownedScopes()).toEqual(expect.arrayContaining([{ unit: abandoned, pid: expect.any(Number) }, { unit: live, pid: process.pid }]));

      const removed = await removeAbandoned();
      expect(removed.abandoned).toBeGreaterThanOrEqual(1);
      expect(removed.left).toBe(0);
      const remaining = ownedScopes().map((scope) => scope.unit);
      expect(remaining).not.toContain(abandoned);
      expect(remaining).toContain(live);
    });
  });

  describe("abandoned staging folders", () => {
    beforeEach(() => vi.stubEnv("CODE_LEARN_HOME", tempDir("code-learn-home-")));

    it("removes staging and discard folders of a process that is gone, and nothing else", () => {
      const dead = deadPid();
      mkdirSync(envsDir(), { recursive: true });
      const abandonedFolders = [`.staging-${dead}-abc123`, `.discard-${dead}-abc123`];
      const kept = [`.staging-${process.pid}-abc123`, "python@3", `.staging-${dead}-too-long-a-name`];
      for (const name of [...abandonedFolders, ...kept]) mkdirSync(join(envsDir(), name));
      writeFileSync(join(envsDir(), `.staging-${dead}-file123`), "a file with a staging name isn't a staging folder");

      expect(removeAbandonedStaging()).toBe(2);
      for (const name of abandonedFolders) expect(existsSync(join(envsDir(), name))).toBe(false);
      for (const name of [...kept, `.staging-${dead}-file123`]) expect(existsSync(join(envsDir(), name))).toBe(true);
    });

    it("finds nothing when no toolchain was ever installed", () => {
      expect(removeAbandonedStaging()).toBe(0);
    });
  });
});
