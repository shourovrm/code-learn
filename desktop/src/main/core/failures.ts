// Core's infrastructure failures. They are this computer's problems: nothing is
// recorded, no agent retry is spent, and the learner can fix them (DESIGN §5, §6.1).

/**
 * What the learner is told: the sandbox can't run code here, or was too busy to finish in time; this computer's disk is
 * full; or the network failed.
 */
export type Infra = 'sandbox' | 'sandbox-busy' | 'disk' | 'offline';

/** core src/errors.ts INFRA: each of core's codes, and what the learner is told about it. */
const CODES = {
  'no-sandbox': 'sandbox',
  'sandbox-blocked': 'sandbox',
  'no-user-session': 'sandbox',
  'sandbox-root': 'sandbox',
  'sandbox-failed': 'sandbox',
  'scope-stop': 'sandbox',
  'no-micromamba': 'sandbox',
  'check-timeout': 'sandbox-busy',
  'host-disk': 'disk',
  offline: 'offline',
  'rate-limit': 'offline',
  tls: 'offline',
  'network-timeout': 'offline',
} as const satisfies Record<string, Infra>;

/** Which of core's failures it was, for the app log: core's code, or `other` for a kind without one. */
export type Cause = keyof typeof CODES | 'other';

export interface Failure {
  infra: Infra;
  cause: Cause;
}

/** core src/errors.ts ErrorKind: what kind of failure a CodeLearnError is. */
export type CoreErrorKind = 'no-course' | 'toolchain-missing' | 'damaged' | 'changed' | 'sandbox' | 'disk' | 'offline';

const fromCore = (e: unknown): (Error & { kind?: CoreErrorKind; code?: unknown }) | undefined =>
  e instanceof Error && e.name === 'CodeLearnError' ? e : undefined;

/** The kind core gave an error it threw in this process, if any. */
export const kindOf = (e: unknown): CoreErrorKind | undefined => fromCore(e)?.kind;

const failureOf = (code: unknown): Failure | null => (typeof code === 'string' && Object.hasOwn(CODES, code) ? { cause: code as keyof typeof CODES, infra: CODES[code as keyof typeof CODES] } : null);

/**
 * The code a tool result starts with: core's MCP server writes `code-learn:<code or kind>` as the first line of a failure
 * (src/mcp.ts), and nothing else can write there. An agent may put its own words before it on that line.
 */
const tagOf = (text: string) => /^[^\n]*?\bcode-learn:([a-z][a-z-]*)(?:\n|$)/.exec(text)?.[1];

/** This computer's problem, from a tool result's code: what an agent relays back over MCP carries no error object. */
export const infra = (text: string): Failure | null => failureOf(tagOf(text));

/** A tool result that says a track's toolchain needs a rebuild. */
export const needsRebuild = (text: string): boolean => tagOf(text) === 'toolchain-missing';

/** This computer's problem behind an error thrown in this process: core's code, or a write that ran out of space. */
export function infraOf(e: unknown): Failure | null {
  const core = fromCore(e);
  const coded = failureOf(core?.code);
  if (coded) return coded;
  // A kind without a code: a sandbox, disk or network failure core didn't name more closely.
  if (core?.kind === 'sandbox' || core?.kind === 'disk' || core?.kind === 'offline') return { infra: core.kind, cause: 'other' };
  return (e as NodeJS.ErrnoException | undefined)?.code === 'ENOSPC' ? { infra: 'disk', cause: 'host-disk' } : null;
}
