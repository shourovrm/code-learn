import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMock, type MockOptions } from '../../../main/mock';
import { mockWithCourse, renderApp } from '../../test-utils';

const welcome = { to: 'welcome' } as const;

function open(options: MockOptions) {
  const user = userEvent.setup();
  renderApp({ to: 'computer', then: welcome }, createMock(options));
  return user;
}

const INSTALL_COMMAND = 'sudo pacman -S bubblewrap';

describe('check this computer', () => {
  it('moves on by itself when the first check after Connect finds the computer ready', async () => {
    renderApp({ to: 'computer', then: { to: 'goal' }, fromConnect: true });
    expect(await screen.findByRole('heading', { name: 'What do you want to learn?' })).toBeInTheDocument();
  });

  it('an explicit Check this computer that finds it ready says so, and waits for Continue', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'computer', then: { to: 'goal' } });
    expect(await screen.findByText('This computer is ready.')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('heading', { name: 'Check this computer' })).toBeInTheDocument();
    for (const name of ['Sandbox', 'Isolation']) {
      expect(within(screen.getByRole('listitem', { name })).getByText('Ready')).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'What do you want to learn?' })).toBeInTheDocument();
  });

  it('names no Docker, WSL, Windows or macOS step', async () => {
    open({ sandbox: 'no-bwrap' });
    await screen.findByRole('listitem', { name: 'Sandbox' });
    expect(document.body).not.toHaveTextContent(/docker|wasi|wsl|windows|macos/i);
  });

  it('shows the install command when bubblewrap is missing, and copies it', async () => {
    const user = open({ sandbox: 'no-bwrap' });
    const sandbox = await screen.findByRole('listitem', { name: 'Sandbox' });
    expect(within(sandbox).getByText('Needs a step')).toBeInTheDocument();
    // Core's message, which already ends with what to do.
    expect(sandbox).toHaveTextContent("bubblewrap (bwrap) isn't installed.");
    expect(within(sandbox).getByText(INSTALL_COMMAND)).toBeInTheDocument();
    // The isolation test can't run before the sandbox exists.
    expect(within(screen.getByRole('listitem', { name: 'Isolation' })).getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent("The sandbox isn't ready yet. Checking again every few seconds.");

    await user.click(within(sandbox).getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe(INSTALL_COMMAND);
    expect(within(sandbox).getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('offers no install, open or restart button: code-learn runs nothing as root', async () => {
    open({ sandbox: 'no-bwrap' });
    await screen.findByRole('listitem', { name: 'Sandbox' });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Copy', 'Check again', 'Later']);
  });

  it('shows core\'s message without a command on a distribution code-learn does not know', async () => {
    open({ sandbox: 'no-bwrap-unknown' });
    const sandbox = await screen.findByRole('listitem', { name: 'Sandbox' });
    expect(sandbox).toHaveTextContent('Install bubblewrap 0.9 or later from your distribution');
    expect(within(sandbox).queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
    expect(within(sandbox).queryByText(/^sudo /)).not.toBeInTheDocument();
  });

  it('says what to do when there is no systemd user session', async () => {
    open({ sandbox: 'no-session' });
    const sandbox = await screen.findByRole('listitem', { name: 'Sandbox' });
    expect(sandbox).toHaveTextContent("The systemd user session isn't reachable.");
    expect(within(sandbox).queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });

  it('says on the Isolation row that the self-test failed after the sandbox passed', async () => {
    open({ sandbox: 'isolation-failed' });
    const isolation = await screen.findByRole('listitem', { name: 'Isolation' });
    expect(within(screen.getByRole('listitem', { name: 'Sandbox' })).getByText('Ready')).toBeInTheDocument();
    expect(within(isolation).getByText('Needs a step')).toBeInTheDocument();
    expect(isolation).toHaveTextContent("these rules didn't hold: no network but loopback");
    expect(screen.getByRole('status')).toHaveTextContent("The isolation test didn't pass yet. Checking again every few seconds.");
  });

  it('keeps the command selectable and says so when copying fails', async () => {
    const user = open({ sandbox: 'no-bwrap' });
    const sandbox = await screen.findByRole('listitem', { name: 'Sandbox' });
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    await user.click(within(sandbox).getByRole('button', { name: 'Copy' }));
    expect(await within(sandbox).findByText("Couldn't copy it. Select the command and copy it yourself.")).toBeInTheDocument();
    expect(within(sandbox).getByText(INSTALL_COMMAND)).toBeInTheDocument();
  });

  it('re-checks until the computer is ready, then waits for Continue', async () => {
    const options: MockOptions = { sandbox: 'no-bwrap' };
    const user = open(options);
    await screen.findByRole('listitem', { name: 'Sandbox' });
    options.sandbox = 'ready';
    expect(await screen.findByText('This computer is ready.')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Sandbox' })).getByText('Ready')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Learn anything.' })).toBeInTheDocument();
  });

  it('Check again looks at once, after the learner ran the command', async () => {
    const options: MockOptions = { sandbox: 'no-bwrap' };
    const user = open(options);
    await screen.findByRole('listitem', { name: 'Sandbox' });
    options.sandbox = 'isolation-failed';
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await within(await screen.findByRole('listitem', { name: 'Isolation' })).findByText('Needs a step')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Sandbox' })).getByText('Ready')).toBeInTheDocument();
  });

  it('keeps focus when the focused step goes away', async () => {
    const options: MockOptions = { sandbox: 'no-bwrap' };
    open(options);
    const copy = await screen.findByRole('button', { name: 'Copy' });
    copy.focus();
    options.sandbox = 'isolation-failed';
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' })).toHaveFocus());
  });

  it('lets the learner carry on later', async () => {
    const user = open({ sandbox: 'no-session' });
    await user.click(await screen.findByRole('button', { name: 'Later' }));
    expect(await screen.findByRole('heading', { name: 'Learn anything.' })).toBeInTheDocument();
  });

  it('opens from a check that was not counted, then goes back to the activity', async () => {
    const user = userEvent.setup();
    const { api, course } = await mockWithCourse({ read: true, sandbox: 'no-session' });
    renderApp({ to: 'practice', concept: course.topics[0].id }, api);
    await user.click(await screen.findByRole('button', { name: 'Check' }));
    const results = screen.getByRole('region', { name: 'Results' });
    await user.click(await within(results).findByRole('button', { name: 'Check this computer' }));
    expect(await screen.findByRole('heading', { name: 'Check this computer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(await screen.findByRole('heading', { name: 'Click Counter' })).toBeInTheDocument();
  });
});

describe('re-checking', () => {
  it('runs one check at a time, even when the window regains focus', async () => {
    const api = createMock({ sandbox: 'no-session' });
    let calls = 0;
    let finish = () => {};
    const computer = api.computer;
    api.computer = () => {
      calls++;
      return calls === 1 ? computer() : new Promise((done) => (finish = () => done(computer())));
    };
    renderApp({ to: 'computer', then: { to: 'welcome' } }, api);
    await screen.findByRole('listitem', { name: 'Sandbox' });
    await waitFor(() => expect(calls).toBe(2));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(2);
    finish();
  });
});

describe('a look that fails after one worked', () => {
  it('keeps the checks on screen when a later check fails, says so, and Try again checks again', async () => {
    const user = userEvent.setup();
    const api = createMock({ sandbox: 'no-bwrap' });
    const computer = api.computer.bind(api);
    let failing = false;
    api.computer = () => (failing ? Promise.reject(new Error('code-learn:offline')) : computer());
    renderApp({ to: 'computer', then: welcome }, api);
    expect(await screen.findByRole('listitem', { name: 'Sandbox' })).toBeInTheDocument();
    failing = true;
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText(/code-learn couldn't refresh this/)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('listitem', { name: 'Sandbox' })).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/code-learn couldn't refresh this/)).not.toBeInTheDocument());
  });
});
