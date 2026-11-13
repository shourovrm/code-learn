import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMock } from '../../main/mock';
import { jobAt, jobBus, mockWithCourse, mockWithRoadmap, renderApp } from '../test-utils';

const sidebar = () => screen.getByRole('navigation', { name: 'Main' });

describe('update notice', () => {
  it('an unsigned build says a new version is out, with a link to its release', async () => {
    const api = createMock({ update: { kind: 'available', version: '1.2.0', url: 'https://github.com/shourovrm/code-learn/releases/tag/v1.2.0' } });
    renderApp({ to: 'tracks' }, api);
    expect(await within(sidebar()).findByText('A new version is available.')).toBeInTheDocument();
    // The version is in the link, not in the words.
    const link = within(sidebar()).getByRole('link', { name: 'Get it' });
    expect(link).toHaveAttribute('href', 'https://github.com/shourovrm/code-learn/releases/tag/v1.2.0');
    expect(link).toHaveAttribute('target', '_blank');
    expect(sidebar()).not.toHaveTextContent('1.2.0');
  });

  it('a signed build offers Restart to update once the new version is downloaded', async () => {
    const api = createMock({ update: { kind: 'ready', version: '1.2.0' } });
    const restart = vi.spyOn(api, 'restartToUpdate');
    renderApp({ to: 'tracks' }, api);
    await userEvent.setup().click(await within(sidebar()).findByRole('button', { name: 'Restart to update' }));
    expect(within(sidebar()).getByText('A new version is ready.')).toBeInTheDocument();
    expect(sidebar()).not.toHaveTextContent('1.2.0');
    expect(restart).toHaveBeenCalled();
  });

  it('shows an update found later, without navigating, and announces it as a status', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = createMock();
      let status: Awaited<ReturnType<typeof api.update>> = { kind: 'none' };
      api.update = async () => status;
      renderApp({ to: 'tracks' }, api);
      const region = await within(sidebar()).findByRole('status', { name: 'code-learn updates' });
      expect(region).toBeEmptyDOMElement();
      status = { kind: 'downloading', version: '1.2.0' };
      await vi.advanceTimersByTimeAsync(31_000);
      status = { kind: 'ready', version: '1.2.0' };
      await vi.advanceTimersByTimeAsync(31_000);
      await vi.waitFor(() => expect(region).toHaveTextContent('A new version is ready.'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('says nothing while nothing is new, or while a signed build is still downloading', async () => {
    for (const update of [{ kind: 'none' as const }, { kind: 'downloading' as const, version: '1.2.0' }]) {
      const view = renderApp({ to: 'tracks' }, createMock({ update }));
      await screen.findByRole('heading', { name: /toolchains/i });
      expect(within(sidebar()).queryByText(/version|ready/)).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

/** A narrow window from here on, until `wide()`. */
function narrowWindow() {
  let narrow = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === '(max-width: 768px)' && narrow;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
  return () => {
    narrow = false;
    act(() => listeners.forEach((l) => l()));
  };
}

describe('narrow windows', () => {
  it('slims the sidebar below 768 px (a narrow window, or 200% zoom), so the screen keeps its room', async () => {
    const wide = narrowWindow();
    try {
      renderApp({ to: 'tracks' });
      expect(await screen.findByRole('navigation', { name: 'Main' })).toHaveClass('slim');
      // Its logo is Sprig, the mascot: there is no room for the wordmark.
      expect(sidebar().querySelector('.lg .sprig')).not.toBeNull();
      expect(within(sidebar()).getByRole('button', { name: 'Toolchains' })).not.toHaveTextContent('Toolchains');
      // Wider again: the full sidebar comes back.
      wide();
      expect(sidebar()).toHaveClass('side');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('names each icon in a tooltip on hover and on keyboard focus, beside the slim sidebar', async () => {
    narrowWindow();
    try {
      const user = userEvent.setup();
      const { api } = await mockWithCourse();
      renderApp({ to: 'tracks' }, api);
      await screen.findByRole('heading', { name: 'Toolchains' });
      for (const name of ['Learn', 'Toolchains', 'Settings', 'New course']) {
        const button = within(sidebar()).getByRole('button', { name });
        await user.hover(button);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(name);
        await user.unhover(button);
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      }
      // A course's badge is named by its title.
      await user.hover(await within(sidebar()).findByRole('button', { name: 'React' }));
      expect(await screen.findByRole('tooltip')).toHaveTextContent('React');
      await user.unhover(within(sidebar()).getByRole('button', { name: 'React' }));
      // Keyboard focus shows it too, and Escape hides it (WCAG 1.4.13).
      within(sidebar()).getByRole('button', { name: 'Learn' }).focus();
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Learn');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a new version in reach in the slim sidebar: Update links to the release', async () => {
    narrowWindow();
    try {
      renderApp({ to: 'tracks' }, createMock({ update: { kind: 'available', version: '1.2.0', url: 'https://github.com/shourovrm/code-learn/releases/tag/v1.2.0' } }));
      const region = await within(sidebar()).findByRole('status', { name: 'code-learn updates' });
      await vi.waitFor(() => expect(region).toHaveTextContent('A new version is available.'));
      expect(within(region).getByRole('link', { name: 'Update' })).toHaveAttribute('href', 'https://github.com/shourovrm/code-learn/releases/tag/v1.2.0');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a running job in reach in the slim sidebar: Sprig alone, named for what it is and its stage', async () => {
    const wide = narrowWindow();
    try {
      const api = createMock();
      const tell = jobBus(api);
      renderApp({ to: 'tracks' }, api);
      await screen.findByRole('heading', { name: 'Toolchains' });
      act(() => tell(jobAt('s1', 'rebuild', { track: 'React', stage: 0, thinking: false })));
      const job = await within(sidebar()).findByRole('button', { name: 'Rebuilding React, Building and checking' });
      expect(job).not.toHaveTextContent('Rebuilding');
      await userEvent.setup().hover(job);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Rebuilding React, Building and checking');
      // Wider again: the words come back.
      wide();
      expect(await within(sidebar()).findByText('Rebuilding React')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('and Restart once a signed build has it', async () => {
    narrowWindow();
    try {
      const api = createMock({ update: { kind: 'ready', version: '1.2.0' } });
      const restart = vi.spyOn(api, 'restartToUpdate');
      renderApp({ to: 'tracks' }, api);
      const region = await within(sidebar()).findByRole('status', { name: 'code-learn updates' });
      await userEvent.setup().click(await within(region).findByRole('button', { name: 'Restart' }));
      expect(region).toHaveTextContent('A new version is ready.');
      expect(restart).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Settings in the sidebar', () => {
  // Opening Settings, and changing the agent from it, are in features/settings.
  it('is in the slim sidebar too, named in its tooltip', async () => {
    narrowWindow();
    try {
      const user = userEvent.setup();
      renderApp({ to: 'tracks' }, createMock({ connected: 'claude' }));
      const settings = await within(sidebar()).findByRole('button', { name: 'Settings' });
      await user.hover(settings);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Settings');
      expect(settings).not.toHaveTextContent('Settings');
      await user.click(settings);
      expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/** A mock with two approved courses, React then Python; Python is on screen. */
async function twoCourses() {
  const { api, roadmap } = await mockWithRoadmap();
  await api.approve(roadmap.concepts);
  const goal = { topic: 'Python', known: '', depth: 'standard' as const, practice: 'code' as const };
  let r = await api.research(goal);
  while (r.state === 'running') r = await api.research(goal);
  await api.approve(r.roadmap!.concepts);
  return api;
}

describe('courses (§4.13)', () => {
  it('lists the courses at the foot, the one on screen marked, and opens another', async () => {
    renderApp({ to: 'learn' }, await twoCourses());
    const python = await within(sidebar()).findByRole('button', { name: 'Python' });
    expect(python).toHaveAttribute('aria-current', 'true');
    expect(within(sidebar()).getByRole('button', { name: 'React' })).not.toHaveAttribute('aria-current');
    expect(await screen.findByRole('heading', { level: 1, name: 'Python' })).toBeInTheDocument();
    await userEvent.setup().click(within(sidebar()).getByRole('button', { name: 'React' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'React' })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('button', { name: 'React' })).toHaveAttribute('aria-current', 'true');
  });

  it('names two courses with the same words by their goals', async () => {
    const api = await twoCourses();
    api.courses = async () => [
      { id: 'python-1', title: 'Python', goal: 'Python basics, briefly', track: 'python', current: true, practice: 'code' },
      { id: 'python-2', title: 'Python', goal: 'Python in depth', track: 'python', current: false, practice: 'code' },
    ];
    renderApp({ to: 'tracks' }, api);
    expect(await within(sidebar()).findByRole('button', { name: 'Python basics, briefly' })).toHaveAttribute('aria-current', 'true');
    expect(within(sidebar()).getByRole('button', { name: 'Python in depth' })).toBeInTheDocument();
  });

  it('opens the goal screen from New course', async () => {
    renderApp({ to: 'learn' }, await twoCourses());
    await userEvent.setup().click(await within(sidebar()).findByRole('button', { name: 'New course' }));
    expect(await screen.findByRole('heading', { name: 'What do you want to learn?' })).toBeInTheDocument();
  });

  it('shows one course as before, with New course; none says so', async () => {
    const { api, roadmap } = await mockWithRoadmap();
    const view = renderApp({ to: 'tracks' }, api);
    expect(await within(sidebar()).findByText('No course yet')).toBeInTheDocument();
    expect(within(sidebar()).queryByRole('button', { name: 'New course' })).not.toBeInTheDocument();
    view.unmount();
    await api.approve(roadmap.concepts);
    renderApp({ to: 'tracks' }, api);
    expect(await within(sidebar()).findByRole('button', { name: 'React' })).toHaveAttribute('aria-current', 'true');
    expect(within(sidebar()).getByRole('button', { name: 'New course' })).toBeInTheDocument();
  });

  it("doesn't say there is no course while the first one's roadmap or research is open, and offers New course", async () => {
    const { api, roadmap } = await mockWithRoadmap();
    const view = renderApp({ to: 'course', roadmap }, api);
    expect(await within(sidebar()).findByRole('button', { name: 'New course' })).toBeInTheDocument();
    expect(within(sidebar()).queryByText('No course yet')).not.toBeInTheDocument();
    view.unmount();
    renderApp({ to: 'research', goal: { topic: 'React', known: '', depth: 'standard', practice: 'code' } }, api);
    expect(await within(sidebar()).findByRole('button', { name: 'New course' })).toBeInTheDocument();
    expect(within(sidebar()).queryByText('No course yet')).not.toBeInTheDocument();
  });

  it("marks a course's badge with its title's first character, capitalized when that stays one letter, and an emoji whole", async () => {
    narrowWindow();
    try {
      const api = await twoCourses();
      api.courses = async () => [
        { id: 'a', title: 'springboot?', goal: 'A', track: 'a', current: true, practice: 'code' },
        { id: 'b', title: '🇵🇭 Cooking', goal: 'B', track: 'b', current: false, practice: 'code' },
        { id: 'c', title: '👩‍💻 Code', goal: 'C', track: 'c', current: false, practice: 'code' },
        { id: 'd', title: 'ßtraße', goal: 'D', track: 'd', current: false, practice: 'code' },
      ];
      renderApp({ to: 'tracks' }, api);
      expect(await within(sidebar()).findByRole('button', { name: 'springboot?' })).toHaveTextContent(/^S$/);
      expect(within(sidebar()).getByRole('button', { name: '🇵🇭 Cooking' })).toHaveTextContent(/^🇵🇭$/u);
      expect(within(sidebar()).getByRole('button', { name: '👩‍💻 Code' })).toHaveTextContent(/^👩‍💻$/u);
      expect(within(sidebar()).getByRole('button', { name: 'ßtraße' })).toHaveTextContent(/^ß$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows each course as its badge in the slim sidebar, named by its goal', async () => {
    narrowWindow();
    try {
      renderApp({ to: 'tracks' }, await twoCourses());
      const react = await within(sidebar()).findByRole('button', { name: 'React' });
      expect(react).toHaveTextContent('R');
      expect(within(sidebar()).getByRole('button', { name: 'Python' })).toHaveAttribute('aria-current', 'true');
      await userEvent.setup().click(react);
      expect(await screen.findByRole('heading', { level: 1, name: 'React' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('back', () => {
  it('goes back to the screen before, one step at a time, by button, Alt+Left or the mouse back button', async () => {
    const user = userEvent.setup();
    const { api, course } = await mockWithCourse();
    const topic = course.topics[0];
    renderApp({ to: 'learn' }, api);
    await screen.findByRole('list', { name: 'Topics' });
    // Nothing to go back to on the first screen.
    expect(within(sidebar()).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: topic.title }));
    await screen.findByRole('heading', { name: topic.title, level: 1 });
    await user.click(within(sidebar()).getByRole('button', { name: 'Toolchains' }));
    await screen.findByRole('heading', { name: 'Toolchains' });
    await user.click(within(sidebar()).getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: topic.title, level: 1 })).toBeInTheDocument();
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(await screen.findByRole('list', { name: 'Topics' })).toBeInTheDocument();
    expect(within(sidebar()).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    // The mouse's back button (button 3) goes back too.
    await user.click(within(sidebar()).getByRole('button', { name: 'Toolchains' }));
    await screen.findByRole('heading', { name: 'Toolchains' });
    act(() => void window.dispatchEvent(new MouseEvent('mouseup', { button: 3 })));
    expect(await screen.findByRole('list', { name: 'Topics' })).toBeInTheDocument();
  });

  it('never goes back into a step of the course setup, such as research', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    renderApp({ to: 'goal' }, api);
    await screen.findByRole('heading', { name: 'What do you want to learn?' });
    await user.click(within(sidebar()).getByRole('button', { name: 'Toolchains' }));
    await screen.findByRole('heading', { name: 'Toolchains' });
    expect(within(sidebar()).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('text size in the sidebar', () => {
  it('offers smaller and larger text from one button on every page, the slim sidebar too', async () => {
    const user = userEvent.setup();
    renderApp({ to: 'tracks' }, createMock({ connected: 'claude' }));
    await screen.findByRole('heading', { name: 'Toolchains' });
    expect(within(sidebar()).queryByRole('button', { name: 'Larger text' })).not.toBeInTheDocument();
    await user.click(within(sidebar()).getByRole('button', { name: 'Text size' }));
    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeInTheDocument();
    const { api, course } = await mockWithCourse();
    renderApp({ to: 'lesson', lessonId: course.topics[0].lessons[0].id }, api);
    await screen.findAllByRole('button', { name: 'Text size' });
  });
});

describe('a draft in the sidebar', () => {
  it('lists the draft under the courses, marked Draft, and opens it from any page', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithRoadmap();
    renderApp({ to: 'tracks' }, api);
    await user.click(await within(sidebar()).findByRole('button', { name: 'React (draft)' }));
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('lists no draft once the roadmap is approved', async () => {
    const { api } = await mockWithCourse();
    renderApp({ to: 'tracks' }, api);
    await screen.findByRole('heading', { name: 'Toolchains' });
    await new Promise((r) => setTimeout(r, 20));
    expect(within(sidebar()).queryByRole('button', { name: /\(draft\)/ })).not.toBeInTheDocument();
  });
});
