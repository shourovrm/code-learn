// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { computerCheck, installCommand, type Probe } from './computer';

const OS_RELEASES = {
  arch: 'NAME="Arch Linux"\nID=arch\n',
  cachyos: 'NAME="CachyOS Linux"\nID=cachyos\nID_LIKE=arch\n',
  ubuntu: 'NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\n',
  // Not named anywhere in the table: the ID_LIKE list decides.
  elementary: 'NAME="elementary OS"\nID=elementary\nID_LIKE="ubuntu debian"\n',
  fedora: 'NAME="Fedora Linux"\nID=fedora\n',
  opensuse: 'NAME="openSUSE Tumbleweed"\nID="opensuse-tumbleweed"\nID_LIKE="opensuse suse"\n',
  unknown: 'NAME="Plan 9"\nID=plan9\n',
};

/** A computer where everything works, with the parts a test changes replaced. */
function probe(over: Partial<Probe> = {}): Probe & { sandbox: ReturnType<typeof vi.fn>; isolation: ReturnType<typeof vi.fn> } {
  return {
    sandbox: vi.fn(async () => undefined),
    isolation: vi.fn(async () => ({ ok: true, detail: 'sandbox isolation holds' })),
    osRelease: () => OS_RELEASES.arch,
    ...over,
  } as never;
}

describe('the command that installs bubblewrap', () => {
  it.each([
    ['Arch', OS_RELEASES.arch, 'sudo pacman -S bubblewrap'],
    ['CachyOS', OS_RELEASES.cachyos, 'sudo pacman -S bubblewrap'],
    ['Ubuntu', OS_RELEASES.ubuntu, 'sudo apt install bubblewrap'],
    ['a Debian derivative named only in ID_LIKE', OS_RELEASES.elementary, 'sudo apt install bubblewrap'],
    ['Fedora', OS_RELEASES.fedora, 'sudo dnf install bubblewrap'],
    ['openSUSE', OS_RELEASES.opensuse, 'sudo zypper install bubblewrap'],
  ])('is known for %s', (_name, osRelease, command) => {
    expect(installCommand(osRelease)).toBe(command);
  });

  it("is none for a distribution code-learn doesn't know, or when os-release can't be read", () => {
    expect(installCommand(OS_RELEASES.unknown)).toBeUndefined();
    expect(installCommand(undefined)).toBeUndefined();
  });
});

describe('check this computer (§6.1, core §4.6)', () => {
  it('passes when the sandbox works and the isolation self-test holds', async () => {
    const check = computerCheck(probe());
    expect(await check()).toEqual({
      checks: [
        { id: 'sandbox', state: 'ok' },
        { id: 'isolation', state: 'ok' },
      ],
      ready: true,
    });
  });

  it("fails the first row with core's message and this distribution's install command, and nothing after it runs", async () => {
    const down = { code: 'no-sandbox', message: "bubblewrap (bwrap) isn't installed. Install bubblewrap 0.9 or later." };
    const computer = probe({ sandbox: vi.fn(async () => down), osRelease: () => OS_RELEASES.ubuntu });
    expect(await computerCheck(computer)()).toEqual({
      checks: [
        { id: 'sandbox', state: 'problem', reason: down.message, installCommand: 'sudo apt install bubblewrap' },
        { id: 'isolation', state: 'waiting' },
      ],
      ready: false,
    });
    expect(computer.isolation).not.toHaveBeenCalled();
  });

  it('gives no install command for bubblewrap on a distribution it does not know', async () => {
    const down = { code: 'no-sandbox', message: "bubblewrap (bwrap) isn't installed." };
    const result = await computerCheck(probe({ sandbox: vi.fn(async () => down), osRelease: () => OS_RELEASES.unknown }))();
    expect(result.checks[0]).toEqual({ id: 'sandbox', state: 'problem', reason: down.message });
  });

  it.each(['no-user-session', 'sandbox-blocked', 'sandbox-root', 'sandbox-failed'])('gives no install command for %s: installing bubblewrap would not help', async (code) => {
    const down = { code, message: 'Something about the session.' };
    const result = await computerCheck(probe({ sandbox: vi.fn(async () => down) }))();
    expect(result.checks[0]).toEqual({ id: 'sandbox', state: 'problem', reason: 'Something about the session.' });
  });

  it("fails the isolation row with the self-test's finding once the sandbox works", async () => {
    const computer = probe({ isolation: vi.fn(async () => ({ ok: false, detail: 'the sandbox still has a network' })) });
    expect(await computerCheck(computer)()).toEqual({
      checks: [
        { id: 'sandbox', state: 'ok' },
        { id: 'isolation', state: 'problem', reason: 'the sandbox still has a network' },
      ],
      ready: false,
    });
  });

  it('runs the isolation self-test once it passes, not on every re-check', async () => {
    const computer = probe();
    const check = computerCheck(computer);
    await check();
    await check();
    expect(computer.isolation).toHaveBeenCalledTimes(1);
    // The sandbox itself is asked every time: a learner can break it between checks.
    expect(computer.sandbox).toHaveBeenCalledTimes(2);
  });

  it('asks the self-test again after it failed, and notices a sandbox that went away', async () => {
    const isolation = vi.fn().mockResolvedValueOnce({ ok: false, detail: 'no' }).mockResolvedValue({ ok: true, detail: 'yes' });
    const sandbox = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValue({ code: 'no-user-session', message: 'No session.' });
    const check = computerCheck(probe({ isolation, sandbox }));
    expect((await check()).ready).toBe(false);
    expect((await check()).ready).toBe(true);
    expect((await check()).checks[0]).toMatchObject({ state: 'problem', reason: 'No session.' });
  });

  it('logs why the check failed once per reason, and nothing when it passes', async () => {
    const log = vi.fn();
    const down = vi.fn().mockResolvedValue({ code: 'no-user-session', message: 'No session.' });
    const check = computerCheck(probe({ sandbox: down }), log);
    await check();
    await check();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('computer', { reason: 'No session.' });

    const quiet = vi.fn();
    await computerCheck(probe(), quiet)();
    expect(quiet).not.toHaveBeenCalled();
  });
});
