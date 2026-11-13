import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TextSizeMenu, TextSizeSwitch } from './TextSizeControls';
import { initTextSize, useTextSizeShortcuts } from './textSize';

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

const scale = () => document.documentElement.style.getPropertyValue('--text-scale');

function Shortcuts() {
  useTextSizeShortcuts();
  return <TextSizeMenu />;
}

beforeEach(() => Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true }));

describe('the text size', () => {
  it('starts at 100%, or at the default chosen in Settings', () => {
    initTextSize();
    expect(scale()).toBe('1');
    window.localStorage.setItem('code-learn.text-size', '130');
    initTextSize();
    expect(scale()).toBe('1.3');
  });

  it('falls back to 100% when the stored default is unknown', () => {
    window.localStorage.setItem('code-learn.text-size', '37');
    initTextSize();
    expect(scale()).toBe('1');
  });

  it('offers the sizes in Settings, and the one chosen becomes the default next time', async () => {
    initTextSize();
    render(<TextSizeSwitch />);
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['90%', '100%', '115%', '130%', '150%']);
    expect(screen.getByRole('radio', { name: '100%' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: '115%' }));
    expect(scale()).toBe('1.15');
    initTextSize();
    expect(scale()).toBe('1.15');
  });

  it('opens a bar from one button, and closes it with Escape, a click outside or the button again', async () => {
    initTextSize();
    render(<><TextSizeMenu /><p>Outside</p></>);
    const toggle = screen.getByRole('button', { name: 'Text size' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Larger text' })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Larger text' })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByText('Outside'));
    expect(screen.queryByRole('button', { name: 'Larger text' })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(screen.queryByRole('button', { name: 'Larger text' })).not.toBeInTheDocument();
  });

  it('Reset in the bar goes back to the starting size', async () => {
    window.localStorage.setItem('code-learn.text-size', '115');
    initTextSize();
    render(<TextSizeMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Text size' }));
    await userEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(scale()).toBe('1.3');
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(scale()).toBe('1.15');
  });

  it('steps with A− and A+ for this session only, and stops at the ends', async () => {
    initTextSize();
    render(<TextSizeMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Text size' }));
    await userEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(scale()).toBe('1.15');
    expect(screen.getByText('115%')).toBeInTheDocument();
    for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole('button', { name: 'Smaller text' }));
    expect(scale()).toBe('0.9');
    initTextSize();
    expect(scale()).toBe('1');
  });

  it('steps with Ctrl+= and Ctrl+-, and Ctrl+0 goes back to the default', () => {
    window.localStorage.setItem('code-learn.text-size', '115');
    initTextSize();
    render(<Shortcuts />);
    fireEvent.keyDown(window, { key: '=', ctrlKey: true });
    expect(scale()).toBe('1.3');
    fireEvent.keyDown(window, { key: '+', ctrlKey: true, shiftKey: true });
    expect(scale()).toBe('1.5');
    fireEvent.keyDown(window, { key: '-', ctrlKey: true });
    expect(scale()).toBe('1.3');
    fireEvent.keyDown(window, { key: '0', ctrlKey: true });
    expect(scale()).toBe('1.15');
  });

  it('keeps the browser from zooming the whole page on those keys', () => {
    initTextSize();
    render(<Shortcuts />);
    const zoom = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true });
    window.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true);
  });
});
