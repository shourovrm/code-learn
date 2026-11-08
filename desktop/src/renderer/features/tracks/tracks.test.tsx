import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OFFLINE, REPAIR } from '../../../shared/api';
import { mockWithCourse, renderApp } from '../../test-utils';

describe('tracks', () => {
  it('lists what code-learn has set up, rebuilds a track, and starts something new', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    renderApp({ to: 'tracks' }, api);
    const react = await screen.findByRole('listitem', { name: 'React' });
    await user.click(within(react).getByRole('button', { name: 'Rebuild' }));
    expect(await within(react).findByRole('button', { name: 'Rebuild' })).toBeEnabled();
    expect(within(react).getByRole('status')).toHaveTextContent('Rebuilt.');

    await user.type(screen.getByRole('textbox', { name: 'Learn something new' }), 'Rust');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('heading', { name: 'Researching Rust' })).toBeInTheDocument();
  });

  it('says on the card that a rebuild failed, and the same button tries again', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    const rebuild = api.rebuild.bind(api);
    api.rebuild = async () => {
      throw new Error('The rebuilt image behaves differently, so it wasn\'t accepted:\ndemo/ex-1: results changed');
    };
    renderApp({ to: 'tracks' }, api);
    const react = await screen.findByRole('listitem', { name: 'React' });
    await user.click(within(react).getByRole('button', { name: 'Rebuild' }));
    // The card says what happened, the first line of core's message and not the exercises it lists.
    expect(await within(react).findByText("Couldn't rebuild React. The rebuilt image behaves differently, so it wasn't accepted.")).toBeInTheDocument();
    expect(react).not.toHaveTextContent('ex-1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(react).getByRole('button', { name: 'Rebuild' })).toBeEnabled();

    // Core's own reason and next step come through; a failure main only calls generic stays short.
    api.rebuild = async () => {
      throw new Error("The sandbox isn't ready. Check this computer, then try again.");
    };
    await user.click(within(react).getByRole('button', { name: 'Rebuild' }));
    expect(await within(react).findByText("Couldn't rebuild React. The sandbox isn't ready. Check this computer, then try again.")).toBeInTheDocument();
    api.rebuild = async () => {
      throw new Error("That didn't work. Try again.");
    };
    await user.click(within(react).getByRole('button', { name: 'Rebuild' }));
    expect(await within(react).findByText("Couldn't rebuild React.")).toBeInTheDocument();

    api.rebuild = rebuild;
    await user.click(within(react).getByRole('button', { name: 'Rebuild' }));
    await waitFor(() => expect(within(react).getByRole('status')).toHaveTextContent('Rebuilt.'));
    expect(react).not.toHaveTextContent("Couldn't rebuild");
  });

  it("says when a rebuild failed because the computer is offline, and sends damaged records to the repair banner", async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    api.rebuild = async () => {
      throw new Error(OFFLINE);
    };
    renderApp({ to: 'tracks' }, api);
    const react = await screen.findByRole('listitem', { name: 'React' });
    await user.click(within(react).getByRole('button', { name: 'Rebuild' }));
    expect(await within(react).findByText("You're offline. Connect to the internet, then try again.")).toBeInTheDocument();

    api.rebuild = async () => {
      throw new Error(`${REPAIR}\nRestore the course folder.`);
    };
    await user.click(within(react).getByRole('button', { name: 'Rebuild' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("code-learn's records need a repair.");
  });

  it('says a rebuild failed on the banner when the learner has left the page by then', async () => {
    const user = userEvent.setup();
    const { api } = await mockWithCourse();
    let fail!: (error: Error) => void;
    api.rebuild = () => new Promise<void>((_, reject) => (fail = reject));
    renderApp({ to: 'tracks' }, api);
    const react = await screen.findByRole('listitem', { name: 'React' });
    await user.click(within(react).getByRole('button', { name: 'Rebuild' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Learn' }));
    await screen.findByRole('heading', { name: 'React' });
    act(() => fail(new Error("The sandbox isn't ready. Check this computer, then try again.")));
    expect(await screen.findByRole('alert')).toHaveTextContent("The sandbox isn't ready. Check this computer, then try again.");
  });

  describe('removing a track', () => {
    /** The mock's open course keeps React; a second, unused track is what can be removed. */
    async function withSecondTrack() {
      const { api } = await mockWithCourse();
      const tracks = api.tracks.bind(api);
      const removeTrack = api.removeTrack.bind(api);
      let secondInstalled = true;
      api.tracks = async () => [...(await tracks()), ...(secondInstalled ? [{ ref: 'python@1', name: 'Python' }] : [])];
      api.removeTrack = async (ref) => {
        if (ref !== 'python@1') return removeTrack(ref);
        secondInstalled = false;
      };
      return api;
    }

    it('asks first, saying it deletes the installed toolchain, and removes nothing on Cancel', async () => {
      const user = userEvent.setup();
      const api = await withSecondTrack();
      const removeTrack = vi.spyOn(api, 'removeTrack');
      renderApp({ to: 'tracks' }, api);
      const python = await screen.findByRole('listitem', { name: 'Python' });
      await user.click(within(python).getByRole('button', { name: 'Remove' }));
      const dialog = await screen.findByRole('dialog', { name: 'Remove Python?' });
      expect(dialog).toHaveTextContent('This deletes the Python toolchain that code-learn installed on this computer.');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(removeTrack).not.toHaveBeenCalled();
      expect(screen.getByRole('listitem', { name: 'Python' })).toBeInTheDocument();
    });

    it('removes the track on confirm and refreshes the list', async () => {
      const user = userEvent.setup();
      const api = await withSecondTrack();
      const removeTrack = vi.spyOn(api, 'removeTrack');
      renderApp({ to: 'tracks' }, api);
      const python = await screen.findByRole('listitem', { name: 'Python' });
      await user.click(within(python).getByRole('button', { name: 'Remove' }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Python' })).not.toBeInTheDocument());
      expect(removeTrack).toHaveBeenCalledWith('python@1');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('listitem', { name: 'React' })).toBeInTheDocument();
    });

    it("shows core's message on the card when a course still uses the track, and keeps the track", async () => {
      const user = userEvent.setup();
      const { api } = await mockWithCourse();
      // Core's wording; the mock's own refusal compares the track's name with its ref, so it never fires here.
      api.removeTrack = async (ref) => {
        throw new Error(`${ref} is used by course "react", so it can't be removed while they need it.`);
      };
      renderApp({ to: 'tracks' }, api);
      const react = await screen.findByRole('listitem', { name: 'React' });
      await user.click(within(react).getByRole('button', { name: 'Remove' }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
      expect(await within(react).findByText('react@1 is used by course "react", so it can\'t be removed while they need it.')).toHaveAttribute('role', 'status');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('listitem', { name: 'React' })).toBeInTheDocument();
    });
  });
});
