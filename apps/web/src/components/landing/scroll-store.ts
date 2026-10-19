import { STOP_NAMES, type Stops } from './scene/keyframes';

/**
 * Scroll state shared by the smooth scroller, the 3D scene and the parallax layers. Plain mutable
 * values, not React state: they change every frame, and the readers (animation loops) poll them,
 * so nothing re-renders.
 */
export const scrollState = {
  /** 0 at the top of the page, 1 at the bottom */
  progress: 0,
  /** Pixels per frame, signed; the scroll speed that makes motion feel alive */
  velocity: 0,
  /** Scroll progress at the middle of each named section (elements with data-stop) */
  stops: {} as Stops,
  /** Bumped whenever the stops are measured again, so readers know to refresh what they derived */
  stopsVersion: 0,
};

export function setScroll(scroll: number, limit: number, velocity = 0): void {
  scrollState.progress = limit > 0 ? Math.min(1, Math.max(0, scroll / limit)) : 0;
  scrollState.velocity = velocity;
}

/**
 * Finds where each named section sits in the page, as the scroll progress at which its middle is
 * in the middle of the screen. Called after layout and whenever the page changes size.
 */
export function measureStops(): void {
  const limit = document.documentElement.scrollHeight - window.innerHeight;
  if (limit <= 0) return;
  const stops: Stops = {};
  for (const name of STOP_NAMES) {
    const element = document.querySelector<HTMLElement>(`[data-stop="${name}"]`);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const progress = (scroll: number) => Math.min(1, Math.max(0, scroll / limit));
    stops[name] = progress(top + rect.height / 2 - window.innerHeight / 2);
    // Where its top reaches the top of the screen, and where its bottom reaches the bottom
    stops[`${name}:start`] = progress(top);
    stops[`${name}:end`] = progress(top + rect.height - window.innerHeight);
  }
  scrollState.stops = stops;
  scrollState.stopsVersion += 1;
}
