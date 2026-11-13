// The text size: scales the type (styles/tokens.css, --text-scale) and not the layout. The starting size is the learner's
// choice in Settings, kept in this profile's local storage; A−/A+ and the keys change it for this session only.
import { useEffect, useSyncExternalStore } from 'react';

export const TEXT_SIZES = [90, 100, 115, 130, 150] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const DEFAULT_SIZE: TextSize = 100;
/** Kept with the theme in local storage: the renderer's alone, and needs no round trip to main. */
const STORAGE_KEY = 'code-learn.text-size';

const listeners = new Set<() => void>();
let defaultSize: TextSize = DEFAULT_SIZE;
let size: TextSize = DEFAULT_SIZE;

function storedDefault(): TextSize {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return TEXT_SIZES.find((option) => String(option) === stored) ?? DEFAULT_SIZE;
  } catch {
    // Storage that can't be read (a locked-down profile) leaves the default.
    return DEFAULT_SIZE;
  }
}

function apply() {
  document.documentElement.style.setProperty('--text-scale', String(size / 100));
  for (const listener of listeners) listener();
}

/** Reads the starting size and applies it. Call once, before the first render. */
export function initTextSize(): void {
  defaultSize = storedDefault();
  size = defaultSize;
  apply();
}

/** Stores the starting size in Settings, and applies it now. */
export function chooseDefaultTextSize(next: TextSize): void {
  defaultSize = next;
  size = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // The size still holds until the app closes.
  }
  apply();
}

/** One step larger (1) or smaller (-1), stopping at the ends. Not stored. */
export function stepTextSize(direction: 1 | -1): void {
  const next = TEXT_SIZES.indexOf(size) + direction;
  if (next < 0 || next >= TEXT_SIZES.length) return;
  size = TEXT_SIZES[next]!;
  apply();
}

/** Back to the starting size chosen in Settings. Not stored. */
export function resetTextSize(): void {
  size = defaultSize;
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The size on screen, for the A−/A+ buttons. */
export const useTextSize = () => useSyncExternalStore(subscribe, () => size);
/** The starting size, for the switch in Settings. */
export const useTextSizeDefault = () => useSyncExternalStore(subscribe, () => defaultSize);

/** Ctrl+= (or Ctrl+Shift+=, which types +) larger, Ctrl+- smaller, Ctrl+0 the starting size. The browser's own zoom is stopped. */
export function useTextSizeShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === '=' || event.key === '+') stepTextSize(1);
      else if (event.key === '-') stepTextSize(-1);
      else if (event.key === '0') resetTextSize();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
