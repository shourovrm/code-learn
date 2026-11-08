import { spawnSync } from "node:child_process";

/**
 * Whether this computer can run real sandboxes: bubblewrap and a systemd user session. Tests that need one skip
 * without it, unless CODE_LEARN_REQUIRE_SANDBOX=1, which turns a missing sandbox into a failure.
 */
export function sandboxReady(): boolean {
  const ready =
    spawnSync("bwrap", ["--version"], { stdio: "ignore" }).status === 0 &&
    spawnSync("systemd-run", ["--user", "--scope", "--quiet", "--collect", "true"], { stdio: "ignore" }).status === 0;
  if (!ready && process.env.CODE_LEARN_REQUIRE_SANDBOX === "1") throw new Error("CODE_LEARN_REQUIRE_SANDBOX=1, but bubblewrap or the systemd user session is missing.");
  return ready;
}
