import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { ChatStory } from './chat-story';

// The motion library reads this preference once, so it is set before anything renders: a file of its own
class NoopObserver {
  public observe() {}
  public unobserve() {}
  public disconnect() {}
  public takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', NoopObserver);
  vi.stubGlobal('IntersectionObserver', NoopObserver);
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

describe('ChatStory with reduced motion', () => {
  it('shows the whole conversation at once, with nothing pinned to the screen', () => {
    renderWithIntl(<ChatStory />);
    for (const text of [/Aarav was marked absent/, /Fee reminder from Sharma Classes/, /New homework from Sharma Classes/, /^fees\?/, /Fee details for Aarav/]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(document.querySelector('section')?.className).not.toContain('h-[440vh]');
  });
});
