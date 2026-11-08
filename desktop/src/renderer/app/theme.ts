// The color theme: the learner's choice (System, Light or Dark, System by default) and the theme it resolves to, set
// on <html data-theme> for styles/tokens.css. System follows the desktop's light or dark preference as it changes.
import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
/** Kept in this profile's local storage: the theme is the renderer's alone, and needs no round trip to main. */
const STORAGE_KEY = 'code-learn.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const listeners = new Set<() => void>();

function storedChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return THEME_CHOICES.includes(stored as ThemeChoice) ? (stored as ThemeChoice) : 'system';
  } catch {
    // Storage that can't be read (a locked-down profile) leaves the default.
    return 'system';
  }
}

const systemIsDark = () => typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;

let choice: ThemeChoice = 'system';

/** The theme a choice shows now: System asks the desktop. */
export const resolvedTheme = (chosen: ThemeChoice = choice): Theme => (chosen === 'system' ? (systemIsDark() ? 'dark' : 'light') : chosen);

function apply() {
  document.documentElement.dataset.theme = resolvedTheme();
  for (const listener of listeners) listener();
}

/** Reads the stored choice and applies it, and follows the desktop's preference. Call once, before the first render. */
export function initTheme(): void {
  choice = storedChoice();
  apply();
  if (typeof window.matchMedia === 'function') {
    window.matchMedia(DARK_QUERY).addEventListener('change', () => {
      if (choice === 'system') apply();
    });
  }
}

/** Stores and applies the learner's choice. */
export function chooseTheme(next: ThemeChoice): void {
  choice = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still holds until the app closes.
  }
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The learner's choice, for the switch. */
export const useThemeChoice = () => useSyncExternalStore(subscribe, () => choice);
/** The theme on screen, for what CSS can't color (an image's source). */
export const useTheme = () => useSyncExternalStore(subscribe, () => resolvedTheme());
