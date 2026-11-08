// What the desktop main process loads from the core, in-process (DESIGN §2):
// the `app` use cases, plus Check this computer's sandbox requirements and isolation self-test, the
// workspace read, the job briefs, and doctor --fix's leftover-scope rule for after a cancel or crash.
import { infraError } from '../../src/errors';
import { removeAbandoned } from '../../src/sandbox';

export * from '../../src/app';
export { isolation } from '../../src/doctor';
export { sandboxDown } from '../../src/sandbox';
export { readWorkspace } from '../../src/store';
export { JOB_BRIEFS } from '../../src/templates';

/**
 * Stops only sandbox scopes whose owning code-learn process is gone, and fails if any of them is still running, since
 * its processes may still hold the learner's files.
 */
export async function cleanupLeftovers(): Promise<void> {
  const { left } = await removeAbandoned();
  if (left > 0) throw infraError(`${left} abandoned sandbox${left === 1 ? '' : 'es'} couldn't be stopped.`, 'scope-stop');
}
