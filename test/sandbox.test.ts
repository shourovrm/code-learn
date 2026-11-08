import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeLearnHome } from "../src/store.js";
import { assertRuntime, type HostLayout, runSandboxed, sandboxArgs, type SandboxRun, sandboxIssue } from "../src/sandbox.js";
import { sandboxReady } from "./sandbox-ready.js";
import { tempDir } from "./temp.js";

const LAYOUT: HostLayout = {
  links: [["usr/bin", "/bin"], ["usr/lib", "/lib"]],
  dirs: ["/lib64"],
  etc: ["/etc/ld.so.cache"],
  generatedEtc: "/home/me/.code-learn/sandbox/etc",
  networkEtc: ["/etc/resolv.conf", "/etc/ssl"],
  expandFlag: true,
};

const run = (over: Partial<SandboxRun> = {}): SandboxRun => ({
  command: ["/bin/sh", "-c", "echo hi"],
  env: { A: "1" },
  mounts: [{ host: "/h/src", container: "/work/src" }],
  memoryMb: 128,
  deadlineMs: 1000,
  ...over,
});

describe("sandboxArgs", () => {
  const args = sandboxArgs(run(), "code-learn-1-abc", LAYOUT);
  const joined = args.join(" ");
  const bwrapAt = args.indexOf("bwrap");

  it("puts the sandbox in its own user scope with the memory, process and CPU limits", () => {
    expect(args.slice(0, bwrapAt)).toEqual([
      "--user", "--scope", "--quiet", "--collect", "--unit=code-learn-1-abc", "--slice=app.slice", "--expand-environment=no",
      "-p", "MemoryMax=128M", "-p", "MemorySwapMax=0", "-p", "TasksMax=256", "-p", "CPUQuota=200%", "-p", "OOMPolicy=continue",
      "--",
    ]);
  });

  it.each([
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--as-pid-1",
    "--clearenv",
    "--ro-bind /usr /usr",
    "--symlink usr/bin /bin",
    "--symlink usr/lib /lib",
    "--ro-bind /lib64 /lib64",
    "--ro-bind /etc/ld.so.cache /etc/ld.so.cache",
    "--ro-bind /home/me/.code-learn/sandbox/etc/passwd /etc/passwd",
    "--ro-bind /home/me/.code-learn/sandbox/etc/group /etc/group",
    "--ro-bind /home/me/.code-learn/sandbox/etc/hosts /etc/hosts",
    "--proc /proc",
    "--dev /dev",
    "--size 268435456 --tmpfs /tmp",
    "--chdir /work/src",
    "--setenv HOME /tmp",
    "--setenv PATH /opt/env/bin:/usr/bin:/bin",
    "--setenv TRACK /opt/track",
    "--setenv LANG C.UTF-8",
    "--setenv A 1",
  ])("has %s", (flag) => {
    expect(joined).toContain(flag);
  });

  it("mounts inputs read-only and runs the command last", () => {
    expect(joined).toContain("--ro-bind /h/src /work/src");
    expect(args.slice(-3)).toEqual(["/bin/sh", "-c", "echo hi"]);
  });

  it("leaves out --expand-environment where systemd-run doesn't know it (it doesn't expand there)", () => {
    expect(sandboxArgs(run(), "u", { ...LAYOUT, expandFlag: false })).not.toContain("--expand-environment=no");
  });

  it("has no network and no host resolver files unless asked", () => {
    expect(args).not.toContain("--share-net");
    expect(joined).not.toContain("/etc/resolv.conf");
  });

  it("shares the network, the resolver files and writable folders only for an install", () => {
    const install = sandboxArgs(run({ network: true, tasks: 1024, memoryMb: 4096, mounts: [{ host: "/stage/env", container: "/opt/env", writable: true }] }), "u", LAYOUT).join(" ");
    expect(install).toContain("--share-net");
    expect(install).toContain("--ro-bind /etc/resolv.conf /etc/resolv.conf");
    expect(install).toContain("--ro-bind /etc/ssl /etc/ssl");
    expect(install).toContain("--bind /stage/env /opt/env");
    expect(install).toContain("TasksMax=1024");
    expect(install).toContain("MemoryMax=4096M");
  });

  it("puts the track's variables after the sandbox's own, so the schema's reserved names stay the sandbox's", () => {
    const at = (name: string) => args.findIndex((a, i) => a === name && args[i - 1] === "--setenv");
    expect(at("A")).toBeGreaterThan(at("PATH"));
  });
});

describe("sandboxIssue", () => {
  it("reads a missing user session, blocked namespaces and anything else as stable codes", () => {
    expect(sandboxIssue("Failed to connect to bus: No medium found")?.code).toBe("no-user-session");
    expect(sandboxIssue("bwrap: No permissions to create new namespace, likely because the kernel does not allow non-privileged user namespaces.")?.code).toBe("sandbox-blocked");
    expect(sandboxIssue("bwrap: setting up uid map: Permission denied")?.code).toBe("sandbox-blocked");
    expect(sandboxIssue("something odd")?.code).toBe("sandbox-failed");
  });
});

describe.runIf(sandboxReady())("the sandbox on this computer", () => {
  const folder = () => {
    const dir = tempDir();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "input.txt"), "hello\n");
    return join(dir, "src");
  };
  const sh = (script: string, over: Partial<SandboxRun> = {}) =>
    runSandboxed(run({ command: ["/bin/sh", "-c", script], mounts: [{ host: folder(), container: "/work/src" }], deadlineMs: 20_000, ...over }));

  it("passes the requirement check", async () => {
    await expect(assertRuntime()).resolves.toBeUndefined();
  });

  it("runs in /work/src as the learner, with the track's variables and nothing of the host's", async () => {
    const r = await sh('pwd; cat input.txt; id -un; echo "$A"; echo "${USER:-no-user}"');
    expect(r.exit).toBe(0);
    expect(r.stdout.toString()).toBe("/work/src\nhello\nlearner\n1\nno-user\n");
  });

  it("can't see the home folder or code-learn's data", async () => {
    const r = await sh(`ls ${JSON.stringify(homedir())} 2>/dev/null && echo home-visible; ls ${JSON.stringify(codeLearnHome())} 2>/dev/null && echo data-visible; echo done`);
    expect(r.stdout.toString()).toBe("done\n");
  });

  it("has no network but loopback", async () => {
    const r = await sh("tail -n +3 /proc/net/dev | cut -d: -f1 | tr -d ' '");
    expect(r.stdout.toString().trim()).toBe("lo");
  });

  it("can't write the mounted input or /usr, but can write /tmp up to its cap", async () => {
    const r = await sh("touch /work/src/x 2>/dev/null || echo src-ro; touch /usr/x 2>/dev/null || echo usr-ro; echo ok > /tmp/f && cat /tmp/f; head -c 300000000 /dev/zero > /tmp/big 2>/dev/null || echo capped", { memoryMb: 1024 });
    expect(r.stdout.toString()).toBe("src-ro\nusr-ro\nok\ncapped\n");
  });

  it("runs the command as process 1, which a program inside can't kill", async () => {
    const r = await sh('echo "pid $$"; sh -c "kill -9 1"; sleep 30 & kill -9 -1; wait; echo survived');
    expect(r.stdout.toString()).toBe("pid 1\nsurvived\n");
  });

  // The drivers wait a second after an unexplained 137 before they exit, so the scope is still there to be read (§4.2).
  it("kills a program over the memory limit while the driver goes on, and says the limit did it", async () => {
    const r = await sh("awk 'BEGIN { s = \"x\"; while (1) s = s s }' 2>/dev/null; echo \"exit $?\"; sleep 1; exit 3", { memoryMb: 64 });
    expect(r.stdout.toString()).toBe("exit 137\n");
    expect(r.exit).toBe(3);
    expect(r.oomKilled).toBe(true);
  });

  it("says nothing about memory for an ordinary failure", async () => {
    const r = await sh("exit 3");
    expect(r.exit).toBe(3);
    expect(r.oomKilled).toBe(false);
  });

  it("caps processes", async () => {
    const r = await sh("i=0; while [ $i -lt 400 ]; do (sleep 5) 2>/dev/null & i=$((i+1)); done 2>/dev/null; ls /proc | grep -c '^[0-9]'; kill -9 -1", { tasks: 64 });
    expect(Number(r.stdout.toString().trim())).toBeLessThanOrEqual(64);
  });

  it("stops a run at the host deadline", async () => {
    const started = Date.now();
    const r = await sh("sleep 60", { deadlineMs: 1500 });
    expect(r.timedOut).toBe(true);
    expect(r.cleanupFailed).toBe(false);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("stops a flood at the output cap", async () => {
    const r = await sh("yes", { outputCap: 100_000 });
    expect(r.flooded).toBe(true);
  });
});
