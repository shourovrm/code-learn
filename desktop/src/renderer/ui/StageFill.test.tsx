import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StageFill } from './StageFill';

describe('StageFill (installs)', () => {
  it('fills Sprig one share per stage reached, the download filling its own share', () => {
    const { rerender } = render(<StageFill label="Downloading Claude Code" stages={4} stage={0} part={0.6} text="Downloading Claude Code 60%" />);
    const bar = screen.getByRole('progressbar', { name: 'Downloading Claude Code' });
    // Stage 0 of 4 reached, plus 0.6 of its share: (1 + 0.6) / 5.
    expect(bar).toHaveAttribute('aria-valuenow', '32');
    expect(bar).toHaveAttribute('aria-valuetext', 'Downloading Claude Code 60%');
    expect(screen.getByText('Downloading Claude Code 60%')).toBeInTheDocument();
    rerender(<StageFill label="Checking it's from Anthropic" stages={4} stage={1} text="Checking it's from Anthropic…" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('shows Sprig as decoration, and no elapsed time: an install has no start code-learn knows', () => {
    const { container } = render(<StageFill label="Installing" stages={3} stage={2} text="Installing Codex…" />);
    expect(container.querySelector('.sprig-fill')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.job-time')).toBeNull();
  });
});
