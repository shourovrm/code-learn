import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeSwitch } from './ThemeSwitch';
import { chooseTheme, initTheme } from './theme';

/** A desktop whose dark preference the test sets, and can change while the app runs. */
function desktop(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = { get matches() { return dark; }, addEventListener: (_: string, l: () => void) => listeners.add(l), removeEventListener: (_: string, l: () => void) => listeners.delete(l) };
  vi.stubGlobal('matchMedia', () => query);
  return { set(next: boolean) { dark = next; for (const l of listeners) l(); } };
}
const theme = () => document.documentElement.dataset.theme;

/** This test environment has no localStorage, so each test gets a fresh one kept in memory. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

beforeEach(() => Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true }));
afterEach(() => vi.unstubAllGlobals());

describe('the theme', () => {
  it('follows the desktop by default, and changes with it while code-learn runs', () => {
    const os = desktop(true);
    initTheme();
    expect(theme()).toBe('dark');
    os.set(false);
    expect(theme()).toBe('light');
  });

  it('keeps a chosen theme whatever the desktop does, and remembers it next time', () => {
    const os = desktop(false);
    initTheme();
    chooseTheme('dark');
    expect(theme()).toBe('dark');
    os.set(false);
    expect(theme()).toBe('dark');
    initTheme();
    expect(theme()).toBe('dark');
    chooseTheme('system');
    expect(theme()).toBe('light');
  });

  it('falls back to following the desktop when the stored choice is unknown', () => {
    desktop(true);
    window.localStorage.setItem('code-learn.theme', 'sepia');
    initTheme();
    expect(theme()).toBe('dark');
  });
});

describe('the theme switch', () => {
  it('offers System, Light and Dark, with System chosen at first', async () => {
    desktop(false);
    initTheme();
    render(<ThemeSwitch />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['System', 'Light', 'Dark']);
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(theme()).toBe('dark');
  });
});

describe('the dark tokens', () => {
  it('only override tokens the light theme defines', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'styles', 'tokens.css'), 'utf8');
    const names = (block: string) => [...block.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
    const [light, dark] = css.split(':root[data-theme="dark"]');
    const defined = new Set(names(light!));
    expect(names(dark!).filter((name) => !defined.has(name))).toEqual([]);
    expect(names(dark!).length).toBeGreaterThan(20);
  });
});
