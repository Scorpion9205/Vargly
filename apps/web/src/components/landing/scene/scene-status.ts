/**
 * Whether the page's 3D scene has nothing left to wait for: it is drawing, or this visitor does
 * not get one. The opening splash waits for this, so the page is revealed with its scene in place.
 */
let ready = false;
const listeners = new Set<() => void>();

export const sceneStatus = {
  isReady: (): boolean => ready,
  setReady(value: boolean): void {
    if (ready === value) return;
    ready = value;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
