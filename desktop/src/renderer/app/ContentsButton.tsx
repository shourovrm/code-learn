import { useEffect } from 'react';
import { Icon } from '../ui/Icon';

/** The slim sidebar's Contents button: shows or hides the topic's contents beside a lesson or an exercise. Ctrl+\ too. */
export function ContentsButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (!e.ctrlKey || e.key !== '\\') return;
      e.preventDefault();
      onToggle();
    }
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [onToggle]);
  return (
    <button type="button" className="nav" aria-label="Contents" aria-keyshortcuts="Control+\" aria-pressed={shown} onClick={onToggle}>
      <Icon name="list" color={shown ? 'var(--primary)' : 'var(--garden-text)'} />
    </button>
  );
}
