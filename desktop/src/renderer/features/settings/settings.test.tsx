import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMock } from '../../../main/mock';
import { renderApp } from '../../test-utils';

const sidebar = () => screen.getByRole('navigation', { name: 'Main' });
const section = (name: string) => screen.getByRole('region', { name });

describe('Settings', () => {
  it('opens from the gear in the sidebar, which replaces Agent and the theme switch', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'tracks' }, createMock({ connected: 'claude' }));
    await screen.findByRole('heading', { name: 'Toolchains' });
    expect(within(sidebar()).queryByRole('button', { name: 'Agent' })).not.toBeInTheDocument();
    expect(within(sidebar()).queryByRole('radiogroup', { name: 'Theme' })).not.toBeInTheDocument();
    await user.click(within(sidebar()).getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(within(section('Theme')).getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
  });

  it('names the connected agent, and Change agent comes back to Settings', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'settings' }, createMock({ connected: 'claude' }));
    const agent = await screen.findByRole('region', { name: 'Agent' });
    expect(await within(agent).findByText('Claude Code')).toBeInTheDocument();
    await user.click(within(agent).getByRole('button', { name: 'Change agent' }));
    expect(await screen.findByRole('heading', { name: 'Connect an agent' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });

  it('goes Back from Settings to the screen it was opened from, even after changing the agent', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'tracks' }, createMock({ connected: 'claude' }));
    await screen.findByRole('heading', { name: 'Toolchains' });
    await user.click(within(sidebar()).getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'Change agent' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    await user.click(within(sidebar()).getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Toolchains' })).toBeInTheDocument();
  });

  it('syncs with a private repository picked through gh; a public one cannot be picked', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'settings' }, createMock({ connected: 'claude' }));
    const sync = await screen.findByRole('region', { name: 'Sync with GitHub' });
    expect(await within(sync).findByText(/Signed in to gh as me/)).toBeInTheDocument();
    expect(await within(sync).findByRole('radio', { name: /me\/site/ })).toBeDisabled();
    await user.click(within(sync).getByRole('radio', { name: /me\/code-learn-sync/ }));
    await user.click(within(sync).getByRole('button', { name: 'Connect' }));
    expect(await within(sync).findByText(/Synced/)).toBeInTheDocument();
    expect(within(sync).getByText('me/code-learn-sync')).toBeInTheDocument();
    await user.click(within(sync).getByRole('button', { name: 'Sync now' }));
    await user.click(within(sync).getByRole('button', { name: 'Disconnect' }));
    expect(await within(sync).findByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('creates a private repository through gh', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'settings' }, createMock({ connected: 'claude' }));
    const sync = await screen.findByRole('region', { name: 'Sync with GitHub' });
    await user.click(await within(sync).findByRole('button', { name: 'Create a private repository' }));
    expect(await within(sync).findByText('me/code-learn-sync')).toBeInTheDocument();
  });

  it('without gh, syncs with an address once the learner says the repository is private', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'settings' }, createMock({ connected: 'claude', gh: 'missing' }));
    const sync = await screen.findByRole('region', { name: 'Sync with GitHub' });
    expect(await within(sync).findByText(/gh isn't installed/)).toBeInTheDocument();
    await user.type(within(sync).getByRole('textbox', { name: 'Repository address' }), 'git@github.com:me/code-learn-sync.git');
    const connect = within(sync).getByRole('button', { name: 'Connect' });
    expect(connect).toBeDisabled();
    await user.click(within(sync).getByRole('checkbox', { name: /This repository is private/ }));
    await user.click(connect);
    expect(await within(sync).findByText('git@github.com:me/code-learn-sync.git')).toBeInTheDocument();
  });

  it('asks before closing while syncing, and sends to GitHub first when the learner says so', async () => {
    const user = userEvent.setup();
    const api = createMock({ connected: 'claude' });
    await api.connectSync({ via: 'gh', name: 'me/code-learn-sync' });
    const quit = vi.spyOn(api, 'quit');
    renderApp({ to: 'settings' }, api);
    await screen.findByText('me/code-learn-sync');
    const close = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(close);
    expect(close.defaultPrevented).toBe(true);
    const dialog = await screen.findByRole('dialog', { name: 'Close code-learn?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sync and close' }));
    await waitFor(() => expect(quit).toHaveBeenCalledWith(true));
    // Once the learner chose, closing goes ahead.
    const again = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);
  });
});
