// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// The sandbox scopes' cleanup, simulated: what it found and left.
const scopes = vi.hoisted(() => ({ result: { abandoned: 0, left: 0 } }));
vi.mock('../../../src/sandbox', async (actual) => ({
  ...(await actual<typeof import('../../../src/sandbox')>()),
  removeAbandoned: async () => scopes.result,
}));

const { cleanupLeftovers } = await import('../../scripts/core-entry');

describe("the bundled core's leftover cleanup", () => {
  it('succeeds once every abandoned scope is stopped', async () => {
    scopes.result = { abandoned: 2, left: 0 };
    await expect(cleanupLeftovers()).resolves.toBeUndefined();
  });

  it('fails when an abandoned scope is still running', async () => {
    scopes.result = { abandoned: 2, left: 1 };
    await expect(cleanupLeftovers()).rejects.toMatchObject({ code: 'scope-stop' });
  });
});
