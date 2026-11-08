// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { INFRA, infraError, type InfraCode } from '../../../../src/errors';
import { infra, infraOf, needsRebuild } from './failures';

const told: Record<InfraCode, string> = {
  'no-sandbox': 'sandbox',
  'sandbox-blocked': 'sandbox',
  'no-user-session': 'sandbox',
  'sandbox-root': 'sandbox',
  'sandbox-failed': 'sandbox',
  'scope-stop': 'sandbox',
  'no-micromamba': 'sandbox',
  // Every case had its own limit: only a busy computer reaches this, and it is never told its sandbox is missing.
  'check-timeout': 'sandbox-busy',
  'host-disk': 'disk',
  offline: 'offline',
  'rate-limit': 'offline',
  tls: 'offline',
  'network-timeout': 'offline',
};

describe("core's failure codes (src/errors.ts INFRA)", () => {
  it.each(Object.keys(INFRA) as InfraCode[])('tells the learner what %s means, over MCP and in this process', (code) => {
    expect(infra(`code-learn:${code}\nSome wording.`)).toEqual({ cause: code, infra: told[code] });
    expect(infraOf(infraError('Some wording.', code))).toEqual({ cause: code, infra: told[code] });
  });

  it('reads the code after words an agent put before it on the first line', () => {
    expect(infra("Error: code-learn:check-timeout\nThe check didn't finish in time.")).toEqual({ cause: 'check-timeout', infra: 'sandbox-busy' });
    expect(infra('<tool_use_error>code-learn:host-disk\nThis computer is out of disk space.</tool_use_error>')).toEqual({ cause: 'host-disk', infra: 'disk' });
  });

  it("reads nothing but core's code: not its wording, and not output a message quotes", () => {
    // Core's wording without its code, a program's stderr in a lesson example, a runner's output in a gate failure.
    expect(infra("bubblewrap (bwrap) isn't installed. Install bubblewrap 0.9 or later.")).toBeNull();
    expect(infra('Example 1 didn\'t run cleanly (exit 1):\nconnect: Network is unreachable\ncode-learn:offline\n')).toBeNull();
    expect(infra('Gate "probe pass" failed: the io pass probe should pass every test:\nIt printed:\ncode-learn:no-sandbox\nbwrap: command not found')).toBeNull();
    expect(infra('code-learn:no-course\nNo course in this workspace yet.')).toBeNull();
    expect(infra('code-learn:made-up\nx')).toBeNull();
  });

  it('tells a track whose toolchain needs a rebuild', () => {
    expect(needsRebuild('code-learn:toolchain-missing\nThe toolchain for py@1 is missing or changed.')).toBe(true);
    expect(needsRebuild('The toolchain for py@1 is missing or changed.')).toBe(false);
    expect(needsRebuild('Gate "build" failed:\nIt printed:\ncode-learn:toolchain-missing')).toBe(false);
  });
});

describe('errors core threw in this process', () => {
  const core = (message: string, kind?: string) => Object.assign(new Error(message), { name: 'CodeLearnError', ...(kind ? { kind } : {}) });

  it("keeps a kind without a code, and reads a write that ran out of space as this computer's disk", () => {
    expect(infraOf(core('Some wording', 'sandbox'))).toEqual({ cause: 'other', infra: 'sandbox' });
    expect(infraOf(core('Some wording', 'disk'))).toEqual({ cause: 'other', infra: 'disk' });
    expect(infraOf(Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }))).toEqual({ cause: 'host-disk', infra: 'disk' });
  });

  it("is no infrastructure failure without core's kind or code, whatever it says", () => {
    expect(infraOf(core("bubblewrap isn't installed."))).toBeNull();
    expect(infraOf(core('Reload the file.', 'changed'))).toBeNull();
    expect(infraOf(new Error("bubblewrap isn't installed."))).toBeNull();
    expect(infraOf(Object.assign(new Error('x'), { code: 'no-sandbox' }))).toBeNull();
  });
});
