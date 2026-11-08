import type { CheckId } from '../../../shared/api';

export const CHECK_NAMES: Record<CheckId, string> = {
  sandbox: 'Sandbox',
  isolation: 'Isolation',
};

/** What each check looks at, so a learner who has never heard of bubblewrap knows what the row is about. */
export const CHECK_ABOUT: Record<CheckId, string> = {
  sandbox: 'Needs bubblewrap and your systemd user session.',
  isolation: 'A test, run inside the sandbox, that it keeps your code off the network and out of your files.',
};

/** Said while a check needs a step. Never the learner's fault. */
export const NOT_YET: Record<CheckId, string> = {
  sandbox: "The sandbox isn't ready yet.",
  isolation: "The isolation test didn't pass yet.",
};
