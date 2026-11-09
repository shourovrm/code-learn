// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { REBUILD } from '../shared/api';
import { SafeError } from './errors';
import { asNotCounted, notCounted, rebuildFailure } from './notCounted';
import { coreError } from './testing/fakes';

describe('not counted (§5)', () => {
  it("names this computer's problem, or a rebuild, and nothing for any other error", () => {
    expect(notCounted(coreError('x', 'sandbox'))).toBe("code-learn's sandbox couldn't run that.");
    expect(notCounted(coreError('x', 'sandbox', 'no-user-session'))).toBe("code-learn's sandbox couldn't run that.");
    expect(notCounted(coreError('x', 'disk'))).toBe('This computer is out of disk space.');
    expect(notCounted(coreError('x', 'offline'))).toBe("code-learn couldn't reach the network.");
    // A check's own deadline: every case had its limit, so the computer was busy, not broken.
    expect(notCounted(coreError('x', 'sandbox', 'check-timeout'))).toBe('This computer was too busy to finish in time.');
    expect(notCounted(coreError('x', 'toolchain-missing'))).toBe(REBUILD);
    expect(notCounted(Object.assign(new Error('full'), { code: 'ENOSPC' }))).toBe('This computer is out of disk space.');
    expect(notCounted(coreError('x', 'damaged'))).toBeNull();
    expect(notCounted(new Error("bubblewrap isn't installed."))).toBeNull();
  });

  it('says it was not counted and logs which run, or rethrows anything else as it was', () => {
    const logged: unknown[] = [];
    const log = (event: string, fields?: unknown) => void logged.push([event, fields]);
    expect(asNotCounted(coreError('x', 'sandbox'), log, 'check', 'not-counted')).toEqual({ kind: 'not-counted', reason: "code-learn's sandbox couldn't run that." });
    expect(asNotCounted(coreError('x', 'disk', 'host-disk'), log, 'example', 'not-run')).toEqual({ kind: 'not-run', reason: 'This computer is out of disk space.' });
    expect(asNotCounted(coreError('The check took too long.', 'sandbox', 'check-timeout'), log, 'try', 'not-counted')).toEqual({ kind: 'not-counted', reason: 'This computer was too busy to finish in time.' });
    // Which failure it was goes to the log as a fixed label, never core's text.
    expect(logged).toEqual([
      ['not-counted', { run: 'check', reason: "code-learn's sandbox couldn't run that.", cause: 'other' }],
      ['not-counted', { run: 'example', reason: 'This computer is out of disk space.', cause: 'host-disk' }],
      ['not-counted', { run: 'try', reason: 'This computer was too busy to finish in time.', cause: 'check-timeout' }],
    ]);
    const other = new Error('boom');
    expect(() => asNotCounted(other, log, 'try', 'not-counted')).toThrow(other);
    expect(logged).toHaveLength(3);
  });

  it("says a failed rebuild in plain words: this computer's problem and its next step, or that nothing was accepted", () => {
    const say = (e: unknown) => (rebuildFailure(e) as Error).message;
    // Core's own messages carry commands and installer output: none reaches the learner.
    expect(say(coreError('bwrap: Creating new namespace failed: Operation not permitted', 'sandbox', 'sandbox-blocked'))).toBe("code-learn's sandbox couldn't run that. Check this computer, then try again.");
    expect(say(coreError('Could not resolve host conda.anaconda.org', 'offline'))).toBe("code-learn couldn't reach the network. Connect to the internet, then try again.");
    expect(say(Object.assign(new Error('full'), { code: 'ENOSPC' }))).toBe('This computer is out of disk space. Free some space, then try again.');
    expect(say(coreError('Gate "build" failed: the toolchain didn\'t install.'))).toBe("The rebuilt environment wasn't accepted, so nothing changed.");
    expect(say(coreError("The rebuilt toolchain behaves differently, so it wasn't accepted:\ndemo/ex-1: results changed"))).toBe("The rebuilt environment wasn't accepted, so nothing changed.");
    expect(rebuildFailure(new SafeError('code-learn is quitting.'))).toBeInstanceOf(SafeError);
    // Anything else, such as a damaged record, goes on as it was.
    const damaged = coreError('Course record is damaged.', 'damaged');
    expect(rebuildFailure(damaged)).toBe(damaged);
    const other = new Error('boom');
    expect(rebuildFailure(other)).toBe(other);
  });
});
