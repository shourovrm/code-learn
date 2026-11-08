import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMock, scenario } from '../../../main/mock';
import { renderApp } from '../../test-utils';

// The mock offers agent installs only where its `platform` option says the installer exists; the option's value
// doesn't matter to these screens, which no longer branch on the computer.
const installable = (name: string) => createMock({ ...scenario(name), platform: 'windows' });

describe('install what is missing', () => {
  it('offers one action on Welcome when no agent is installed', async () => {
    renderApp({ to: 'welcome' }, installable('nothing-installed'));
    expect(await screen.findByRole('button', { name: "Install what's missing" })).toBeInTheDocument();
  });

  it("installs the chosen agent, shows it, then goes on once it is signed in", async () => {
    const user = userEvent.setup();
    renderApp({ to: 'welcome' }, installable('nothing-installed'));
    await user.click(await screen.findByRole('button', { name: "Install what's missing" }));
    const agent = await screen.findByRole('listitem', { name: 'Agent' });
    expect(within(agent).getByRole('radio', { name: 'Claude Code' })).toBeChecked();
    expect(within(agent).getByRole('link', { name: 'Read them' })).toHaveAttribute('href', 'https://www.anthropic.com/legal/consumer-terms');
    // Nothing downloads until the learner says so.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Docker Desktop' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Install what's missing" }));
    expect(await within(agent).findByRole('progressbar')).toBeInTheDocument();
    await user.click(await within(agent).findByRole('button', { name: 'Sign in' }, { timeout: 4000 }));
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByRole('heading', { name: 'What do you want to learn?' }, { timeout: 4000 })).toBeInTheDocument();
  });

  it('does not ask about the sandbox: a computer without bubblewrap installs an agent all the same', async () => {
    renderApp({ to: 'setup' }, installable('nothing-installed'));
    expect(await screen.findByRole('listitem', { name: 'Agent' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('Welcome and Setup see an agent installed elsewhere within seconds, with no focus event', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const options = { ...scenario('nothing-installed'), platform: 'windows' as const };
      const api = createMock(options);
      const view = renderApp({ to: 'welcome' }, api);
      expect(await screen.findByRole('button', { name: "Install what's missing" })).toBeInTheDocument();
      // Installed in a terminal.
      options.agents = {};
      await act(() => vi.advanceTimersByTimeAsync(3000));
      await waitFor(() => expect(screen.queryByRole('button', { name: "Install what's missing" })).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Connect an agent' })).toBeInTheDocument();
      view.unmount();
      options.agents = { claude: 'missing', codex: 'missing', cursor: 'missing' };
      renderApp({ to: 'setup' }, api);
      expect(await screen.findByRole('listitem', { name: 'Agent' })).toBeInTheDocument();
      options.agents = {};
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(await screen.findByRole('heading', { name: 'Connect an agent' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('goes on to Connect once nothing is left to install, so an agent installed elsewhere gets connected', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const options = { ...scenario('no-agent'), platform: 'windows' as const };
      renderApp({ to: 'setup' }, createMock(options));
      expect(await screen.findByRole('listitem', { name: 'Agent' })).toBeInTheDocument();
      options.agents = {};
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(await screen.findByRole('heading', { name: 'Connect an agent' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('installs the agent the learner picks', async () => {
    const user = userEvent.setup();
    const api = installable('nothing-installed');
    renderApp({ to: 'setup' }, api);
    // The choice is named by the label it shows (WCAG 2.5.3).
    const choice = await screen.findByRole('radiogroup', { name: 'Your agent' });
    await user.click(within(choice).getByRole('radio', { name: 'Codex' }));
    expect(within(screen.getByRole('listitem', { name: 'Agent' })).getByRole('link', { name: 'Read them' })).toHaveAttribute('href', 'https://openai.com/policies/');
    await user.click(screen.getByRole('button', { name: "Install what's missing" }));
    await screen.findAllByRole('progressbar');
    const agents = await api.agents();
    expect(agents.find((a) => a.id === 'codex')!.install).toBeDefined();
    expect(agents.find((a) => a.id === 'claude')!.install).toBeUndefined();
  });

  it('offers only supported agents: Cursor is experimental, so it installs from Connect, not here', async () => {
    renderApp({ to: 'setup' }, installable('nothing-installed'));
    const choice = await screen.findByRole('radiogroup', { name: 'Your agent' });
    expect(within(choice).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['claude', 'codex']);
  });

  it('keeps the usual way in when nothing is missing', async () => {
    renderApp({ to: 'welcome' }, createMock({ platform: 'windows' }));
    expect(await screen.findByRole('button', { name: 'Connect an agent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Install what's missing" })).not.toBeInTheDocument();
  });

  it('says why the agent install stopped, with Try again', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'setup' }, installable('nothing-installed-offline'));
    await user.click(await screen.findByRole('button', { name: "Install what's missing" }));
    const agent = screen.getByRole('listitem', { name: 'Agent' });
    expect(await within(agent).findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent("You're offline. Connect to the internet, then try again.");
    expect(within(agent).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('a look that fails after one worked', () => {
  it('keeps what is missing on screen when a later look fails, says so, and Try again looks again', async () => {
    const user = userEvent.setup();
    const api = installable('nothing-installed');
    const agents = api.agents.bind(api);
    let failing = false;
    api.agents = () => (failing ? Promise.reject(new Error('code-learn:offline')) : agents());
    renderApp({ to: 'setup' }, api);
    expect(await screen.findByRole('listitem', { name: 'Agent' })).toBeInTheDocument();
    failing = true;
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText(/code-learn couldn't refresh this/)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('listitem', { name: 'Agent' })).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/code-learn couldn't refresh this/)).not.toBeInTheDocument());
  });
});
