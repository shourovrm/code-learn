// @vitest-environment node
// Opt-in, after a vendor's real install (.github/workflows/agent-installs.yml): code-learn's lookup finds the agent
// with a GUI app's PATH, and the agent answers its version. No sign-in and no model calls.
// CODE_LEARN_REAL_INSTALL=claude|codex|cursor CODE_LEARN_INSTALL_PATH=<the PATH code-learn started with> npx vitest run src/main/agent/find.real.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentId } from '../../shared/api';
import { AGENT_CLIS } from './agents';
import { ask } from './bridge';
import { find, here } from './find';

const target = process.env.CODE_LEARN_REAL_INSTALL;
// The PATH a code-learn opened from Finder, or opened on Windows before the install, started with.
const env = { ...process.env, PATH: process.env.CODE_LEARN_INSTALL_PATH ?? process.env.PATH };

describe.skipIf(!target)('a real install (opt-in)', () => {
  it('finds the agent and reads its version', { timeout: 120_000 }, async () => {
    const cli = AGENT_CLIS[target as AgentId];
    expect(cli).toBeDefined();
    const exe = find(cli.bin, here(env));
    console.log('found', exe);
    expect(exe).not.toBeNull();
    // The agent starts with code-learn's environment, so with the same PATH.
    process.env.PATH = env.PATH;
    const version = await ask(exe!, cli.version.args, cli.version.read, { timeoutMs: 90_000 });
    console.log('version', version);
    expect(version).toMatch(/^\d/);
  });
});
