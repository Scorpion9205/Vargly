import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sceneStatus } from './scene/scene-status';
import { Splash, SPLASH_MAX_MS, SPLASH_MIN_MS } from './splash';

beforeAll(() => {
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

// The page's own clock (time since navigation start) follows the fake timers, starting at 0
let navigationStart = 0;
beforeEach(() => {
  vi.useFakeTimers();
  navigationStart = Date.now();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - navigationStart);
  sceneStatus.setReady(false);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.documentElement.style.overflow = '';
});

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('Splash', () => {
  it('shows the wordmark as a status the moment the page loads, and holds the page still', () => {
    render(<Splash />);
    const splash = screen.getByRole('status', { name: 'Loading Vargly' });
    expect(splash).toHaveAttribute('data-leaving', 'false');
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  it('stays while the scene is not ready, even past the minimum time', () => {
    render(<Splash />);
    advance(SPLASH_MIN_MS + 500);
    expect(screen.getByRole('status')).toHaveAttribute('data-leaving', 'false');
  });

  it('does not leave before the minimum time, even if the scene is ready at once', () => {
    render(<Splash />);
    act(() => sceneStatus.setReady(true));
    advance(SPLASH_MIN_MS - 100);
    expect(screen.getByRole('status')).toHaveAttribute('data-leaving', 'false');
  });

  it('leaves once the minimum time has passed and the scene is ready, then frees the page', () => {
    render(<Splash />);
    advance(SPLASH_MIN_MS + 50);
    act(() => sceneStatus.setReady(true));
    expect(screen.getByRole('status')).toHaveAttribute('data-leaving', 'true');

    advance(800);
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('counts the wait from when the page started loading, not from when scripts began', () => {
    // The scripts only got going 5 seconds in (a slow phone): the maximum has already passed
    advance(5000);
    render(<Splash />);
    advance(10);
    expect(screen.getByRole('status')).toHaveAttribute('data-leaving', 'true');
  });

  it('never waits longer than the maximum, when the scene never comes', () => {
    render(<Splash />);
    advance(SPLASH_MAX_MS + 50);
    expect(screen.getByRole('status')).toHaveAttribute('data-leaving', 'true');
    advance(800);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
