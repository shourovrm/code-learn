import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Growth } from './Growth';

describe('Growth', () => {
  it('draws each stage as a hidden picture, named by its class', () => {
    for (const stage of ['seed', 'shoot', 'sprout'] as const) {
      const { container, unmount } = render(<Growth stage={stage} />);
      const svg = container.querySelector('svg')!;
      expect(svg).toHaveClass('growth', stage);
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });
});
