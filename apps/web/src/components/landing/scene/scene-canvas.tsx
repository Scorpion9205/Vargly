'use client';

import { Environment, Float, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import type { NamedKey, StopKey, Vec3 } from './keyframes';
import { Books, ChatBubble, Choreo, Coin, GradCap, Pencil, PointerRig, Rings, Ticks } from './objects';

/** A key written compactly: when, where (screen fractions + depth), scale and tilt */
const key = (at: StopKey | number, x: number, y: number, z: number, scale: number, rot: Vec3 = [0, 0, 0]): NamedKey => ({
  at,
  pos: [x, y, z],
  scale,
  rot,
});

// Where the page has words, the objects keep to the edges, half cropped by the screen. They come
// forward where it is quiet (the top and the closing call to action) and, at the very end, rise
// out of view so they never sit behind the footer. Depth below zero pushes an object back.
const OUT = 1.7; // above the screen
const BUBBLE: NamedKey[] = [
  key('hero', 0.5, 0.0, 0, 0.95, [0.12, -0.45, 0.04]),
  key('story:start', 0.2, 0.1, -1, 0.55, [0.2, -0.5, 0.1]),
  key('story:end', 0.2, 0.1, -1, 0.55, [0.2, 0.5, 0.1]),
  key('features', -1.0, 0.45, -1.5, 0.75, [0.2, 0.9, -0.2]),
  key('papers', 1.02, -0.45, -1.5, 0.7, [-0.2, -0.6, 0.1]),
  key('steps', -1.02, -0.4, -1.5, 0.7, [0.1, 0.7, 0.2]),
  key('pricing', 1.02, 0.4, -2, 0.65, [0.2, -0.8, -0.1]),
  key('faq', -1.02, 0.3, -1.5, 0.7, [0.1, 0.8, 0.1]),
  key('cta', -0.84, 0.2, 0, 0.85, [0.1, 0.55, 0]),
  key(1, -0.84, OUT, 0, 0.85, [0.1, 0.55, 0]),
];
// On a phone the headline and buttons fill the screen, so the hero's objects sit in the space below them
const BUBBLE_PORTRAIT: NamedKey[] = [key('hero', 0.0, -0.88, 0, 0.6, [0.12, -0.35, 0.04]), ...BUBBLE.slice(1)];

const COIN: NamedKey[] = [
  key('hero', 0.93, 0.12, 0.6, 0.5, [0.4, 0.2, 0.3]),
  key('story:start', 0.26, -0.55, -0.5, 0.5, [0.5, 1.2, 0.2]),
  key('story:end', 0.26, -0.55, -0.5, 0.5, [0.5, 4.4, 0.2]),
  key('features', 1.0, 0.5, -1.2, 0.7, [0.3, 2.2, -0.3]),
  key('papers', -1.0, 0.45, -1.2, 0.7, [0.6, 3.1, 0.2]),
  key('steps', 1.0, -0.4, -1.2, 0.7, [0.2, 4.0, 0.1]),
  key('pricing', -1.0, 0.35, -2, 0.6, [0.5, 5.0, 0.2]),
  key('faq', 1.0, -0.2, -1.2, 0.7, [0.3, 6.0, 0.1]),
  key('cta', 0.84, 0.45, 0, 0.75, [0.35, 7.0, 0.25]),
  key(1, 0.84, OUT, 0, 0.75, [0.35, 7.5, 0.25]),
];
const COIN_PORTRAIT: NamedKey[] = [key('hero', 0.85, -0.82, 0.3, 0.42, [0.4, 0.2, 0.3]), ...COIN.slice(1)];

const BOOKS: NamedKey[] = [
  key('hero', 0.78, -0.55, -0.5, 0.6, [0.35, -0.6, 0.1]),
  key('story:start', 1.7, -0.5, -2, 0.45, [0.2, 0.3, 0.1]),
  key('story:end', 1.7, -0.5, -2, 0.45, [0.2, 0.3, 0.1]),
  key('features', -1.0, -0.5, -1.5, 0.7, [0.3, -0.5, -0.1]),
  key('papers', 1.0, 0.5, -1.5, 0.75, [0.25, 0.8, 0.1]),
  key('steps', 1.0, 0.45, -1.5, 0.7, [0.3, -0.3, 0.2]),
  key('pricing', -1.0, -0.45, -2, 0.65, [0.3, 0.6, 0]),
  key('faq', -1.0, -0.55, -1.5, 0.7, [0.3, 1.0, 0.1]),
  key('cta', 0.8, -0.5, 0, 0.75, [0.3, -0.5, 0.1]),
  key(1, 0.8, OUT, 0, 0.75, [0.3, -0.5, 0.1]),
];
const BOOKS_PORTRAIT: NamedKey[] = [key('hero', -0.88, -0.84, 0, 0.5, [0.35, -0.6, 0.1]), ...BOOKS.slice(1)];

// Tall screens (a phone, a tablet upright) keep the hero's smaller objects along the bottom edge, clear of the words
const CAP_PORTRAIT_HERO = key('hero', 0.78, -0.92, -1, 0.4, [0.35, 0.5, -0.25]);
const PENCIL_PORTRAIT_HERO = key('hero', -0.82, -0.95, -1, 0.4, [0, 0, -0.5]);
const TICKS_PORTRAIT_HERO = key('hero', 0.42, -0.86, 0.3, 0.4, [0, -0.3, 0.1]);

const CAP: NamedKey[] = [
  key('hero', 0.16, 0.8, -2.5, 0.5, [0.35, 0.5, -0.25]),
  key('story:start', 0.3, 0.78, -2, 0.4, [0.3, 0.9, 0.1]),
  key('story:end', 0.3, 0.78, -2, 0.4, [0.3, 0.9, 0.1]),
  key('features', 1.0, -0.55, -1.5, 0.65, [0.3, -0.9, 0.2]),
  key('papers', -1.0, -0.5, -1.5, 0.7, [0.3, 0.5, 0.1]),
  key('steps', 1.0, 0.55, -1.5, 0.65, [0.4, -0.6, -0.2]),
  key('pricing', 1.0, -0.55, -2, 0.6, [0.3, 0.7, 0.1]),
  key('faq', 1.0, 0.5, -1.5, 0.65, [0.3, -0.4, 0.1]),
  key('cta', -0.8, -0.5, 0, 0.7, [0.3, 0.6, -0.1]),
  key(1, -0.8, OUT, 0, 0.7, [0.3, 0.6, -0.1]),
];

const CAP_PORTRAIT: NamedKey[] = [CAP_PORTRAIT_HERO, ...CAP.slice(1)];

const PENCIL: NamedKey[] = [
  key('hero', 0.12, -0.82, -2, 0.6, [0, 0, -0.5]),
  key('story:start', 0.1, -0.78, -1, 0.45, [0, 0.4, -0.6]),
  key('story:end', 0.1, -0.78, -1, 0.45, [0, 0.4, -0.6]),
  key('features', -1.0, 0.0, -2, 0.6, [0, -0.5, 0.8]),
  key('papers', 1.0, -0.05, -2, 0.6, [0, 0.4, -0.6]),
  key('pricing', -1.0, -0.1, -2.5, 0.55, [0, 0.3, 0.6]),
  key('faq', -1.0, 0.05, -2, 0.6, [0, -0.4, 0.5]),
  key('cta', 0.95, -0.05, -1, 0.65, [0, 0.2, -0.7]),
  key(1, 0.95, OUT, -1, 0.65, [0, 0.2, -0.7]),
];

const PENCIL_PORTRAIT: NamedKey[] = [PENCIL_PORTRAIT_HERO, ...PENCIL.slice(1)];

const TICKS: NamedKey[] = [
  key('hero', 0.66, -0.3, 1, 0.5, [0, -0.3, 0.1]),
  key('story:start', 0.22, 0.52, 0, 0.5, [0, 0.3, 0]),
  key('story:end', 0.22, 0.52, 0, 0.5, [0, 0.3, 0]),
  key('papers', -0.95, 0.05, -1.5, 0.6, [0, -0.3, 0]),
  key('steps', 0.95, 0, -1.5, 0.6, [0, 0.3, 0]),
  key('faq', 0.95, 0.0, -1.5, 0.6, [0, -0.3, 0]),
  key('cta', -0.35, -0.78, 0.5, 0.7, [0, -0.2, 0.1]),
  key(1, -0.35, OUT, 0.5, 0.7, [0, -0.2, 0.1]),
];

const TICKS_PORTRAIT: NamedKey[] = [TICKS_PORTRAIT_HERO, ...TICKS.slice(1)];

/**
 * The page's 3D scene: one fixed canvas behind the content. Objects drift between the page's
 * sections as it scrolls and lean toward the pointer. Lighting comes from a made-up studio (a few
 * bright panels), so nothing is downloaded: no environment map, no models.
 */
export default function SceneCanvas({ lite }: { lite: boolean }) {
  const [dpr, setDpr] = useState<[number, number]>(lite ? [1, 1] : [1, 1.75]);

  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 0, 10], fov: 32 }}
      gl={{ antialias: !lite, alpha: true, powerPreference: 'high-performance' }}
      // The canvas lets every click through to the page, but still reads the pointer for the parallax
      eventSource={typeof document === 'undefined' ? undefined : document.documentElement}
      eventPrefix="client"
      style={{ position: 'absolute', inset: 0 }}
    >
      {/* If the machine struggles, drop the resolution rather than the frame rate */}
      <PerformanceMonitor onDecline={() => setDpr([1, 1])} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 7]} intensity={2.4} color="#fff1e8" />
      <pointLight position={[-7, -2, 4]} intensity={60} color="#f26b3a" distance={26} />
      <pointLight position={[7, 3, -3]} intensity={36} color="#7aa2ff" distance={26} />

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3.2} color="#fff4ec" position={[0, 6, 6]} scale={[16, 3, 1]} />
        <Lightformer form="rect" intensity={2.4} color="#ff9a6b" position={[-8, 0, 2]} rotation-y={Math.PI / 2} scale={[2, 10, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#9db4ff" position={[8, 2, -2]} rotation-y={-Math.PI / 2} scale={[2, 8, 1]} />
        <Lightformer form="ring" intensity={4} color="#ffffff" position={[0, -3, 5]} scale={5} />
      </Environment>

      <PointerRig>
        <Choreo keys={BUBBLE} portraitKeys={BUBBLE_PORTRAIT} follow={3.4}>
          <Float speed={1.6} rotationIntensity={0.35} floatIntensity={0.9}>
            <ChatBubble />
            {!lite && <Rings />}
          </Float>
        </Choreo>

        <Choreo keys={COIN} portraitKeys={COIN_PORTRAIT} follow={3.8}>
          <Float speed={2} rotationIntensity={0.6} floatIntensity={1.1}>
            <Coin />
          </Float>
        </Choreo>

        <Choreo keys={BOOKS} portraitKeys={BOOKS_PORTRAIT} follow={3.2}>
          <Float speed={1.3} rotationIntensity={0.3} floatIntensity={0.7}>
            <Books />
          </Float>
        </Choreo>

        <Choreo keys={CAP} portraitKeys={CAP_PORTRAIT} follow={3.6}>
          <Float speed={1.8} rotationIntensity={0.5} floatIntensity={1}>
            <GradCap />
          </Float>
        </Choreo>

        {!lite && (
          <>
            <Choreo keys={PENCIL} portraitKeys={PENCIL_PORTRAIT} follow={4.2}>
              <Float speed={2.2} rotationIntensity={0.7} floatIntensity={1.2}>
                <Pencil />
              </Float>
            </Choreo>
            <Choreo keys={TICKS} portraitKeys={TICKS_PORTRAIT} follow={4.5}>
              <Float speed={2.4} rotationIntensity={0.4} floatIntensity={1}>
                <Ticks />
              </Float>
            </Choreo>
          </>
        )}
      </PointerRig>

      <Sparkles count={lite ? 24 : 70} scale={[20, 11, 8]} size={3.2} speed={0.25} opacity={0.65} color="#ffb899" />
    </Canvas>
  );
}
