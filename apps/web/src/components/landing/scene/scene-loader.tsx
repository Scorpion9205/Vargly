'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode, useSyncExternalStore } from 'react';
import { decideSceneMode, readSceneEnvironment, type SceneMode } from './scene-mode';

// Three.js is large: it is fetched after the page is interactive, and only for visitors who get the scene
const SceneCanvas = dynamic(() => import('./scene-canvas'), { ssr: false, loading: () => null });

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

export function SceneLoader() {
  // "off" on the server and during hydration, then the real answer: no flash, no mismatch
  const mode = useSyncExternalStore(never, readMode, () => 'off' as SceneMode);

  if (mode === 'off') return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[1]" data-scene={mode}>
      <SceneBoundary>
        <SceneCanvas lite={mode === 'lite'} />
      </SceneBoundary>
    </div>
  );
}
