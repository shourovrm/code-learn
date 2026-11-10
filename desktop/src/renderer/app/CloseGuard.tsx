// Closing code-learn while it syncs with GitHub asks first (DESIGN "Sync"): what GitHub doesn't have yet can go
// before the window does, so the learner's other computers have it.
import { useEffect, useRef, useState } from 'react';
import type { SyncView } from '../../shared/api';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { useApi } from './api';

// Whether a repository is connected. The close event can't wait for a call to main, so Settings keeps this current.
let syncing = false;

/** Settings tells the guard when syncing starts or stops. */
export function noteSync(view: SyncView): void {
  syncing = view.repo !== undefined;
}

export function CloseGuard() {
  const api = useApi();
  const [shown, setShown] = useState<'asking' | 'sending'>();
  const chosen = useRef(false);
  useEffect(() => {
    api.syncView().then(noteSync).catch(() => undefined);
  }, [api]);
  useEffect(() => {
    function ask(e: BeforeUnloadEvent) {
      if (!syncing || chosen.current) return;
      // Either stops the window closing: preventDefault in Chromium, returnValue in Electron.
      e.preventDefault();
      e.returnValue = false;
      setShown('asking');
    }
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, []);
  if (!shown) return null;

  function close(sync: boolean) {
    chosen.current = true;
    if (sync) setShown('sending');
    void api.quit(sync);
  }
  if (shown === 'sending') {
    return (
      <Dialog title="Syncing before closing…" text="Sending your work to GitHub. If GitHub can't be reached, code-learn closes within 10 seconds and syncs the next time it opens." onClose={() => undefined}>
        <span role="status" className="quiet-text">Sending…</span>
      </Dialog>
    );
  }
  return (
    <Dialog title="Close code-learn?" text="Your work since the last sync goes to GitHub first, so your other computers have it." onClose={() => setShown(undefined)}>
      <Button variant="ghost" onClick={() => setShown(undefined)}>Cancel</Button>
      <Button variant="ghost" onClick={() => close(false)}>Close without syncing</Button>
      <Button onClick={() => close(true)}>Sync and close</Button>
    </Dialog>
  );
}
