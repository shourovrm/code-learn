import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeLearnError } from "../src/errors.js";
import { runSandboxed, toolchainMounts } from "../src/sandbox.js";
import { envDir, envsDir } from "../src/store.js";
import { commitToolchain, installProblem, micromamba, removeToolchain, stageToolchain } from "../src/toolchain.js";
import { fakeMicromamba } from "./fake-micromamba.js";
import { sandboxReady } from "./sandbox-ready.js";
import { tempDir } from "./temp.js";

const spec = (over = {}) => ({ packages: ["python=3.13", "pytest"], env: {}, ...over });

beforeEach(() => vi.stubEnv("CODE_LEARN_HOME", tempDir("code-learn-home-")));
afterEach(() => vi.unstubAllEnvs());

describe("micromamba", () => {
  it("is the configured one, at version 2 or later", () => {
    const bin = fakeMicromamba();
    expect(micromamba()).toEqual({ bin, version: "2.9.0" });
  });

  it("is an infrastructure error when it isn't there", () => {
    vi.stubEnv("CODE_LEARN_MICROMAMBA", "/nowhere/micromamba");
    expect(() => micromamba()).toThrow(expect.objectContaining({ code: "no-micromamba" }));
  });
});

describe("installProblem", () => {
  it("reads the network, certificates, rate limits and the disk as this computer's problems", () => {
    expect(installProblem("critical libmamba Could not resolve host: conda.anaconda.org")?.code).toBe("offline");
    expect(installProblem("error    libmamba Network is unreachable")?.code).toBe("offline");
    expect(installProblem("Timeout was reached")?.code).toBe("network-timeout");
    expect(installProblem("SSL certificate problem: unable to get local issuer certificate")?.code).toBe("tls");
    expect(installProblem("HTTP 429 Too Many Requests")?.code).toBe("rate-limit");
    expect(installProblem("error: No space left on device")?.code).toBe("host-disk");
  });

  it("leaves everything else to the track: a package that doesn't exist, or a failing setup", () => {
    expect(installProblem("critical libmamba Could not solve for environment specs\n - nothing provides requested pythonn")).toBeUndefined();
    expect(installProblem("npm ERR! code E404")).toBeUndefined();
  });
});

describe.runIf(sandboxReady())("installing a toolchain", () => {
  it("installs the packages into a staging folder, copies the track's files and records what was installed", async () => {
    fakeMicromamba();
    const steps: unknown[] = [];
    const staged = await stageToolchain(spec(), { "run.sh": "echo hi\n", "lib/helper.txt": "x" }, (s) => steps.push(s));
    expect(readFileSync(join(staged.folders.track, "run.sh"), "utf8")).toBe("echo hi\n");
    expect(readFileSync(join(staged.folders.track, "lib", "helper.txt"), "utf8")).toBe("x");
    expect(staged.resolved).toEqual(["pytest-1.0-0", "python-1.0-0"]);
    expect(steps).toEqual([{ done: 1, total: 1 }]);
    expect(staged.root.startsWith(join(envsDir(), ".staging-"))).toBe(true);
  });

  it("runs setup after the packages, in /opt/track, able to write the environment and the track's files", async () => {
    fakeMicromamba();
    const steps: unknown[] = [];
    const staged = await stageToolchain(spec({ setup: "pwd > made-here; echo ok > /opt/env/from-setup" }), {}, (s) => steps.push(s));
    expect(readFileSync(join(staged.folders.track, "made-here"), "utf8")).toBe("/opt/track\n");
    expect(readFileSync(join(staged.folders.env, "from-setup"), "utf8")).toBe("ok\n");
    expect(steps).toEqual([{ done: 1, total: 2 }, { done: 2, total: 2 }]);
  });

  it("runs the installed tools from /opt/env/bin in a check's sandbox, read-only", async () => {
    fakeMicromamba();
    const staged = await stageToolchain(spec(), {});
    const r = await runSandboxed({
      command: ["/bin/sh", "-c", "fake-tool works; touch /opt/env/x 2>/dev/null || echo env-ro"],
      env: {}, mounts: toolchainMounts(staged.folders), memoryMb: 128, deadlineMs: 20_000,
    });
    expect(r.stdout.toString()).toBe("fake-tool works\nenv-ro\n");
  });

  it("fails as the track's problem, with the end of the log, when micromamba can't solve the packages", async () => {
    fakeMicromamba('echo "critical libmamba Could not solve for environment specs" >&2; exit 1');
    const error = await stageToolchain(spec(), {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CodeLearnError);
    expect((error as CodeLearnError).code).toBeUndefined();
    expect((error as Error).message).toContain("Could not solve for environment specs");
    expect(readdirSync(envsDir()).filter((n) => n.startsWith(".staging-"))).toEqual([]);
  });

  it("fails as the track's problem when setup fails", async () => {
    fakeMicromamba();
    const error = await stageToolchain(spec({ setup: "echo 'npm ERR! 404' >&2; exit 1" }), {}).catch((e: unknown) => e);
    expect((error as CodeLearnError).code).toBeUndefined();
    expect((error as Error).message).toMatch(/setup.*npm ERR! 404/s);
  });

  it("fails as this computer's problem when the network is down, so the track isn't blamed", async () => {
    fakeMicromamba('echo "critical libmamba Could not resolve host: conda.anaconda.org" >&2; exit 1');
    await expect(stageToolchain(spec(), {})).rejects.toMatchObject({ code: "offline" });
  });

  it("removes staging folders a crashed install left, but never a live process's", async () => {
    fakeMicromamba();
    mkdirSync(join(envsDir(), ".staging-999999999-abcdef", "env"), { recursive: true });
    mkdirSync(join(envsDir(), `.staging-${process.pid}-keepme`), { recursive: true });
    await stageToolchain(spec(), {});
    expect(existsSync(join(envsDir(), ".staging-999999999-abcdef"))).toBe(false);
    expect(existsSync(join(envsDir(), `.staging-${process.pid}-keepme`))).toBe(true);
  });

  it("commits a staged toolchain into place, replaces an older one, and removes it on request", async () => {
    fakeMicromamba();
    const first = await stageToolchain(spec(), {});
    writeFileSync(join(first.folders.env, "marker"), "first");
    commitToolchain(first, "python@1");
    expect(readFileSync(join(envDir("python@1"), "env", "marker"), "utf8")).toBe("first");
    const second = await stageToolchain(spec(), {});
    commitToolchain(second, "python@1");
    expect(existsSync(join(envDir("python@1"), "env", "marker"))).toBe(false);
    expect(readdirSync(envsDir()).filter((n) => n.startsWith("."))).toEqual([]);
    removeToolchain("python@1");
    expect(existsSync(envDir("python@1"))).toBe(false);
  });

  it("removes its staging folder when asked, after a failed gate", async () => {
    fakeMicromamba();
    const staged = await stageToolchain(spec(), {});
    staged.remove();
    expect(existsSync(staged.root)).toBe(false);
  });
});
