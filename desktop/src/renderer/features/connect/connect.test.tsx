import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMock, scenario, type MockOptions } from '../../../main/mock';
import { mockWithCourse, renderApp } from '../../test-utils';

describe('connect journey', () => {
  it('reaches the goal in four clicks: connect an agent, continue to its models, then continue past a ready computer', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Learn anything.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Connect an agent' }));

    expect(await screen.findByRole('heading', { name: 'Connect an agent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    // No promise about billing: code-learn can't tell a plan from an API key.
    expect(screen.getByText('code-learn uses your agent and your account.')).toBeInTheDocument();
    const claude = screen.getByRole('listitem', { name: 'Claude Code' });
    await user.click(within(claude).getByRole('button', { name: 'Connect' }));
    expect(await within(claude).findByText('Connected')).toBeInTheDocument();
    // Read once: "Connected", not "Passed, Connected".
    expect(within(claude).queryByRole('img', { name: 'Passed' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Choose a model for each job' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'What do you want to learn?' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Claude Code');
  });

  it('shows the window at once while code-learn still looks for the agents, then the way in', async () => {
    const api = createMock();
    let found!: () => void;
    const agents = api.agents;
    api.agents = () => new Promise((done) => (found = () => done(agents())));
    renderApp({ to: 'welcome' }, api);
    // Not a blank window: code-learn says what it is doing, beside Sprig asleep.
    expect(screen.getByText('code-learn is starting')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect an agent' })).not.toBeInTheDocument();
    found();
    expect(await screen.findByRole('button', { name: 'Connect an agent' })).toBeInTheDocument();
    expect(screen.queryByText('code-learn is starting')).not.toBeInTheDocument();
  });

  it('goes straight back to the course on a relaunch with one approved and the agent connected', async () => {
    const { api } = await mockWithCourse();
    renderApp({ to: 'welcome' }, api);
    expect(await screen.findByRole('list', { name: 'Topics' })).toBeInTheDocument();
    expect(screen.queryByText('Ready when you are.')).not.toBeInTheDocument();
  });

  it('connects one agent at a time', async () => {
    const user = userEvent.setup();
    const api = createMock();
    let finish = () => {};
    const connect = api.connect;
    api.connect = (id) => new Promise((done) => (finish = () => done(connect(id))));
    renderApp({ to: 'connect' }, api);
    const claude = await screen.findByRole('listitem', { name: 'Claude Code' });
    await user.click(within(claude).getByRole('button', { name: 'Connect' }));
    const codex = screen.getByRole('listitem', { name: 'Codex' });
    expect(within(codex).getByRole('button', { name: 'Connect' })).toBeDisabled();
    finish();
    expect(await within(claude).findByText('Connected')).toBeInTheDocument();
    expect(within(codex).getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('names agents only, with no model on it; marks Cursor experimental, and warns about untested versions', async () => {
    renderApp({ to: 'connect' }, createMock(scenario('untested-version')));
    const codex = await screen.findByRole('listitem', { name: 'Codex' });
    expect(screen.queryByText(/Recommended:/)).not.toBeInTheDocument();
    expect(within(codex).getByText('Untested version. It may still work.')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Cursor' })).getByText('Experimental')).toBeInTheDocument();
  });

  it('goes from Connect to a model for each kind of job, the recommended one preselected, then to the computer check', async () => {
    const user = userEvent.setup();
    const api = createMock();
    renderApp({ to: 'connect' }, api);
    const claude = await screen.findByRole('listitem', { name: 'Claude Code' });
    await user.click(within(claude).getByRole('button', { name: 'Connect' }));
    await within(claude).findByText('Connected');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Choose a model for each job' })).toBeInTheDocument();
    expect(screen.getByText('Claude Code offers these models. Each job starts on the recommended one.')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').map((c) => c.getAttribute('id'))).toEqual(['model-planning', 'model-lessons', 'model-exercises', 'model-tutor']);
    const lessons = screen.getByRole('combobox', { name: /^Lessons/ });
    expect(within(lessons).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sonnet (recommended)', 'Opus', 'Fable', 'Haiku']);
    expect(lessons).toHaveValue('sonnet');
    await user.selectOptions(lessons, 'haiku');
    await vi.waitFor(async () => expect((await api.agents()).find((a) => a.id === 'claude')?.jobModels).toEqual({ planning: 'sonnet', lessons: 'haiku', exercises: 'sonnet', tutor: 'sonnet' }));
    expect(lessons).toHaveValue('haiku');
    expect(screen.getByRole('combobox', { name: /^Tutor/ })).toHaveValue('sonnet');
  });

  it('goes back from the model step to Connect', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'models', then: { to: 'goal' } }, createMock({ connected: 'claude' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Connect an agent' })).toBeInTheDocument();
  });

  it('opens Connect from the model step when no agent is connected', async () => {
    renderApp({ to: 'models', then: { to: 'goal' } }, createMock());
    expect(await screen.findByRole('heading', { name: 'Connect an agent' })).toBeInTheDocument();
  });

  it('asks the learner to sign in to an agent, never for credentials', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'connect' }, createMock(scenario('signed-out')));
    const codex = await screen.findByRole('listitem', { name: 'Codex' });
    await user.click(within(codex).getByRole('button', { name: 'Connect' }));
    expect(await within(codex).findByText('Sign in to Codex, then try again.')).toBeInTheDocument();
    expect(within(codex).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('offers Sign in, not a terminal command, and connects once the learner signed in and came back', async () => {
    const user = userEvent.setup();
    const options = scenario('signed-out');
    renderApp({ to: 'connect' }, createMock(options));
    const codex = await screen.findByRole('listitem', { name: 'Codex' });
    await user.click(within(codex).getByRole('button', { name: 'Connect' }));
    expect(await within(codex).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(codex).not.toHaveTextContent(/terminal|codex login/);
    // Signed in from a terminal; coming back to code-learn checks again.
    options.agents = {};
    window.dispatchEvent(new Event('focus'));
    expect(await within(codex).findByText('Connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('links to each agent\'s install page when none is installed', async () => {
    // Linux: code-learn doesn't install agents there.
    renderApp({ to: 'connect' }, createMock({ ...scenario('no-agent'), platform: 'linux' }));
    const claude = await screen.findByRole('listitem', { name: 'Claude Code' });
    expect(within(claude).getByText('Not installed')).toBeInTheDocument();
    expect(within(claude).getByRole('link', { name: 'Get Claude Code' })).toHaveAttribute('href', 'https://code.claude.com/docs/en/setup');
    expect(within(screen.getByRole('listitem', { name: 'Codex' })).getByRole('link', { name: 'Get Codex' })).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Cursor' })).getByRole('link', { name: 'Get Cursor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('the only agent', () => {
  it('connects the only installed agent by itself, so Continue is the one click left', async () => {
    renderApp({ to: 'connect' }, createMock({ agents: { codex: 'missing', cursor: 'missing' } }));
    const claude = await screen.findByRole('listitem', { name: 'Claude Code' });
    expect(await within(claude).findByText('Connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('lets the learner choose when more than one agent is installed', async () => {
    renderApp({ to: 'connect' }, createMock({ agents: { cursor: 'missing' } }));
    await screen.findByRole('listitem', { name: 'Claude Code' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  });
});

describe('changing the agent', () => {
  it('switches to another installed agent: it shows connected, and Continue goes to its models, then back', async () => {
    const user = userEvent.setup();
    const api = createMock({ connected: 'claude' });
    renderApp({ to: 'connect', then: { to: 'tracks' } }, api);
    const claude = await screen.findByRole('listitem', { name: 'Claude Code' });
    expect(within(claude).getByText('Connected')).toBeInTheDocument();
    const codex = screen.getByRole('listitem', { name: 'Codex' });
    await user.click(within(codex).getByRole('button', { name: 'Connect' }));
    expect(await within(codex).findByText('Connected')).toBeInTheDocument();
    // One agent is connected at a time: the one before offers Connect again, at once.
    expect(within(claude).queryByText('Connected')).not.toBeInTheDocument();
    expect(within(claude).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(claude).getByRole('button', { name: 'Connect' })).toBeEnabled();
    expect((await api.agents()).filter((a) => a.state === 'connected').map((a) => a.id)).toEqual(['codex']);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Codex offers these models. Each job starts on the recommended one.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Planning/ })).toHaveValue('gpt-6-luna');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Toolchains' })).toBeInTheDocument();
  });

  it('asks to sign in to a signed-out agent and keeps the one before connected, so the course goes on', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'connect', then: { to: 'tracks' } }, createMock({ connected: 'claude', agents: { codex: 'signed-out' } }));
    const codex = await screen.findByRole('listitem', { name: 'Codex' });
    await user.click(within(codex).getByRole('button', { name: 'Connect' }));
    expect(await within(codex).findByText('Sign in to Codex, then try again.')).toBeInTheDocument();
    expect(within(codex).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Claude Code' })).getByText('Connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it("never connects the only installed agent by itself while another one is connected", async () => {
    // Cursor is experimental, so Claude Code is the only supported agent installed.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = createMock({ agents: { codex: 'missing' }, connected: 'cursor' });
      const connect = vi.spyOn(api, 'connect');
      const looks = vi.spyOn(api, 'agents');
      renderApp({ to: 'connect' }, api);
      expect(await within(await screen.findByRole('listitem', { name: 'Cursor' })).findByText('Connected')).toBeInTheDocument();
      // The screen keeps looking: none of those looks connects it either.
      for (let i = 0; i < 2; i++) await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(looks.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(connect).not.toHaveBeenCalled();
      expect(within(screen.getByRole('listitem', { name: 'Claude Code' })).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a sign-out that stopped background work', () => {
  it('ends once the agent shows connected again, so Continue stays on the course', async () => {
    const user = userEvent.setup();
    const options: MockOptions = {};
    const { api } = await mockWithCourse(options);
    options.stalled = 'signed-out';
    renderApp({ to: 'learn' }, api);
    // The course map sends a sign-out to connect; the agent was signed in again elsewhere meanwhile.
    expect(await screen.findByRole('heading', { name: 'Connect an agent' })).toBeInTheDocument();
    expect(await within(screen.getByRole('listitem', { name: 'Claude Code' })).findByText('Connected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // The course map's sign-out redirect would run in the same render as its topics.
    expect(await screen.findByRole('list', { name: 'Topics' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connect an agent' })).not.toBeInTheDocument();
  });
});

describe('looking again while the screen is open', () => {
  it('sees an agent installed elsewhere, then signed in, within seconds and with no focus event', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // Linux: no Install button, so the learner installs it themselves, in a terminal.
      const options = { ...scenario('no-agent'), platform: 'linux' as const };
      renderApp({ to: 'connect' }, createMock(options));
      const claude = await screen.findByRole('listitem', { name: 'Claude Code' });
      expect(within(claude).getByText('Not installed')).toBeInTheDocument();
      // Installed, not signed in yet: the only agent installed is checked at once.
      options.agents = { claude: 'signed-out', codex: 'missing', cursor: 'missing' };
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(await within(claude).findByText('Sign in to Claude Code, then try again.')).toBeInTheDocument();
      // Signed in from the terminal.
      options.agents = { codex: 'missing', cursor: 'missing' };
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(await within(claude).findByText('Connected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sees an agent removed meanwhile', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const options = { agents: {}, platform: 'linux' as const };
      renderApp({ to: 'connect' }, createMock(options));
      const codex = await screen.findByRole('listitem', { name: 'Codex' });
      expect(within(codex).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
      options.agents = { codex: 'missing' };
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(await within(codex).findByText('Not installed')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('installing an agent', () => {
  it('installs a missing agent with progress, then signs in with its own login, and continues once signed in', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'connect', then: { to: 'goal' } }, createMock({ ...scenario('no-agent'), platform: 'mac' }));
    const claude = await screen.findByRole('listitem', { name: 'Claude Code' });
    expect(within(claude).getByRole('link', { name: 'Get it myself' })).toHaveAttribute('href', 'https://code.claude.com/docs/en/setup');
    expect(within(screen.getByRole('listitem', { name: 'Cursor' })).getByRole('button', { name: 'Install' })).toBeInTheDocument();
    await user.click(within(claude).getByRole('button', { name: 'Install' }));
    expect(await within(claude).findByRole('progressbar', { name: 'Downloading Claude Code' })).toBeInTheDocument();
    await user.click(await within(claude).findByRole('button', { name: 'Sign in' }, { timeout: 4000 }));
    // Signed in in the agent's own window; coming back to code-learn checks, then moves on as Continue does.
    window.dispatchEvent(new Event('focus'));
    // Once signed in, code-learn moves on by itself: to the agent's models.
    expect(await screen.findByRole('heading', { name: 'Choose a model for each job' })).toBeInTheDocument();
  });

  it('says why an install stopped, with Try again and a way to do it by hand', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'connect' }, createMock({ ...scenario('agent-install-offline'), platform: 'mac' }));
    const codex = await screen.findByRole('listitem', { name: 'Codex' });
    await user.click(within(codex).getByRole('button', { name: 'Install' }));
    expect(await within(codex).findByText("You're offline. Connect to the internet, then try again.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(within(codex).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(within(codex).getByRole('link', { name: 'Get it myself' })).toBeInTheDocument();
  });
});

describe('an install code-learn could not verify', () => {
  it('says so and offers Try again, claiming nothing about what ran', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'connect' }, createMock({ ...scenario('agent-install-offline'), agentInstallProblem: 'unverified', platform: 'mac' }));
    const codex = await screen.findByRole('listitem', { name: 'Codex' });
    await user.click(within(codex).getByRole('button', { name: 'Install' }));
    expect(await within(codex).findByText("code-learn couldn't verify the installation. Try again.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(codex).not.toHaveTextContent(/signature|didn't use/);
    expect(within(codex).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('a relaunch', () => {
  it('opens on Welcome with the agent connected, read once: "Connected", not "Passed, Connected"', async () => {
    renderApp({ to: 'welcome' }, createMock(scenario('relaunch')));
    expect(await screen.findByRole('heading', { name: 'Ready when you are.' })).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Passed' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Claude Code');
  });
});

describe('a look that fails after one worked', () => {
  it('keeps the agents on screen when a later look fails, says so, and Try again looks again', async () => {
    const user = userEvent.setup();
    const api = createMock();
    const agents = api.agents.bind(api);
    let failing = false;
    api.agents = () => (failing ? Promise.reject(new Error('code-learn:offline')) : agents());
    renderApp({ to: 'connect' }, api);
    expect(await screen.findByRole('listitem', { name: 'Claude Code' })).toBeInTheDocument();
    failing = true;
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText(/code-learn couldn't refresh this/)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('listitem', { name: 'Claude Code' })).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/code-learn couldn't refresh this/)).not.toBeInTheDocument());
  });
});
