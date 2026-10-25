import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { HeaderBar } from '../marketing/header-bar';
import { ChatStory } from './chat-story';
import { Marquee } from './marquee';
import { PaperMock } from './paper-mock';
import { SceneLoader } from './scene/scene-loader';
import { setScroll, scrollState } from './scroll-store';

// jsdom has no layout, observers or media queries; the page's motion libraries expect them
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
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
describe('HeaderBar', () => {
  const links = [
    { key: 'features', href: '/#features', label: 'Features' },
    { key: 'howItWorks', href: '/#how-it-works', label: 'How it works' },
    { key: 'pricing', href: '/#pricing', label: 'Pricing' },
  ];

  it('lists the sections, with sign-in and the trial button', () => {
    renderWithIntl(<HeaderBar links={links} showPricing signIn="Sign in" startTrial="Start free trial" />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Features', 'How it works', 'Pricing']);
    expect(within(nav).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/#pricing');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Start free trial' })).toHaveAttribute('href', '/signup');
  });

  it('opens the menu on a phone', async () => {
    renderWithIntl(<HeaderBar links={links} showPricing signIn="Sign in" startTrial="Start free trial" />);
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('Marquee', () => {
  it('shows each item once to readers (the repeat that makes it endless is hidden)', () => {
    renderWithIntl(<Marquee />);
    expect(screen.getAllByText('Attendance')).toHaveLength(2);
    const lists = document.querySelectorAll('ul');
    expect(lists).toHaveLength(2);
    expect(lists[0]).not.toHaveAttribute('aria-hidden');
    expect(lists[1]).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ChatStory', () => {
  it('starts with the first message and its step lit', () => {
    renderWithIntl(<ChatStory />);
    expect(screen.getByText(/Aarav was marked absent on 18 Oct/)).toBeInTheDocument();
    expect(screen.queryByText(/Fee reminder from Sharma Classes/)).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Parents hear from you without opening an app');
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThanOrEqual(4);
  });
});

describe('PaperMock', () => {
  it('is described to screen readers as one picture, not read out as UI', () => {
    renderWithIntl(<PaperMock />);
    const picture = screen.getByRole('img');
    expect(picture).toHaveAccessibleName('3 of 4 selected · 6 marks');
    expect(picture.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('SceneLoader', () => {
  it('draws nothing where there is no WebGL (jsdom has none), so the page stands on its own', () => {
    const { container } = render(<SceneLoader />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('scroll state', () => {
  it('is a progress from 0 to 1, whatever the numbers it is given', () => {
    setScroll(500, 1000, 12);
    expect(scrollState).toMatchObject({ progress: 0.5, velocity: 12 });
    setScroll(2000, 1000);
    expect(scrollState.progress).toBe(1);
    setScroll(-40, 1000);
    expect(scrollState.progress).toBe(0);
    setScroll(10, 0);
    expect(scrollState.progress).toBe(0);
  });
});
