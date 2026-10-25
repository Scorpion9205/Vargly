'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { decideSceneMode, readSceneEnvironment, type SceneMode } from './scene-mode';
import { sceneStatus } from './scene-status';

// Three.js is large, so it is its own download, and only for visitors who get the scene
const loadScene = () => import('./scene-canvas');
const SceneCanvas = dynamic(loadScene, { ssr: false, loading: () => null });

/** If the GPU or the context gives out, the page simply carries on without the scene */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  public state = { failed: false };
  public static getDerivedStateFromError() {
    return { failed: true };
  }
  public render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Decided once, in the browser: it depends on the device, which the server cannot know
let decided: SceneMode | null = null;
const readMode = (): SceneMode => (decided ??= decideSceneMode(readSceneEnvironment()));
const never = () => () => undefined;

// The download starts as soon as this file runs, while the page is still hydrating, instead of
// after it: by the time React gets to the scene its code is usually already here. (The same
// import is reused by the dynamic component above, so nothing is fetched twice.)
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && readMode() !== 'off') {
  void loadScene().catch(() => undefined);
}

export function SceneLoader() {
  // "off" on the server and during hydration, then the real answer: no flash, no mismatch
  const mode = useSyncExternalStore(never, readMode, () => 'off' as SceneMode);
  // The scene fades in once its shaders are ready, so it arrives smoothly instead of popping in
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => {
    setReady(true);
    sceneStatus.setReady(true);
  }, []);

  // A visitor who gets no scene has nothing to wait for. (readMode, not `mode`: that is still the
  // server's answer while the page hydrates.)
  useEffect(() => {
    if (readMode() === 'off') sceneStatus.setReady(true);
  }, []);

  if (mode === 'off') return null;
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-[1] transition-opacity duration-[1400ms] ease-out ${ready ? 'opacity-100' : 'opacity-0'}`}
      data-scene={mode}
      data-ready={ready}
    >
      <SceneBoundary>
        <SceneCanvas lite={mode === 'lite'} onReady={markReady} />
      </SceneBoundary>
    </div>
  );
}
