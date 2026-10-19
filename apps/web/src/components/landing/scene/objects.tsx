'use client';

import { RoundedBox } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { scrollState } from '../scroll-store';
import { type Key, type NamedKey, resolveKeys, samplePose } from './keyframes';

// Brand: black, white and orange, with WhatsApp's own green and blue for the chat details
export const COLORS = {
  orange: '#f26b3a',
  deepOrange: '#c2410c',
  cream: '#fff1e8',
  ink: '#141414',
  gold: '#ffb347',
  green: '#25d366',
  blue: '#34b7f1',
  pink: '#ff9fb0',
} as const;

// ------------------------------------------------------------------ choreography

/**
 * Moves its children along a scroll-keyed path. The target comes from the page's scroll progress
 * and the object eases toward it every frame, so a fast scroll never makes it jump. Scroll speed
 * adds a little spin, which is what makes the page feel physical.
 */
export function Choreo({
  keys,
  portraitKeys,
  children,
  follow = 4,
  spin = 1,
}: {
  keys: readonly NamedKey[];
  /** Used instead of `keys` on a tall, narrow screen, where the hero's text sits above the scene */
  portraitKeys?: readonly NamedKey[];
  children: ReactNode;
  /** Higher follows the scroll more tightly */
  follow?: number;
  /** How strongly scroll speed spins the object */
  spin?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const viewport = useThree((state) => state.viewport);
  const kick = useRef(0);
  // Keys are tied to sections whose positions are measured from the page; refresh when they are
  const resolved = useRef<{ version: number; portrait: boolean; keys: Key[] }>({ version: -1, portrait: false, keys: [] });

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    // On a tall, narrow screen (a phone) the sides are close, so objects stay nearer the middle
    const portrait = viewport.width < viewport.height * 0.9;
    if (resolved.current.version !== scrollState.stopsVersion || resolved.current.portrait !== portrait) {
      resolved.current = {
        version: scrollState.stopsVersion,
        portrait,
        keys: resolveKeys(portrait && portraitKeys ? portraitKeys : keys, scrollState.stops),
      };
    }
    const pose = samplePose(resolved.current.keys, scrollState.progress);
    const halfW = (viewport.width / 2) * (portrait ? 0.7 : 1);
    const halfH = viewport.height / 2;
    // Objects shrink with the screen so the scene keeps its composition
    const unit = THREE.MathUtils.clamp(viewport.width / 10, 0.5, 1.3);

    const k = 1 - Math.exp(-delta * follow);
    g.position.x += (pose.pos[0] * halfW - g.position.x) * k;
    g.position.y += (pose.pos[1] * halfH - g.position.y) * k;
    g.position.z += (pose.pos[2] - g.position.z) * k;

    // Scroll speed turns into a spin that settles again
    kick.current += (scrollState.velocity * 0.0009 * spin - kick.current) * Math.min(1, delta * 6);
    g.rotation.x += (pose.rot[0] - g.rotation.x) * k;
    g.rotation.y += (pose.rot[1] - g.rotation.y) * k + kick.current;
    g.rotation.z += (pose.rot[2] - g.rotation.z) * k;

    const scale = pose.scale * unit;
    g.scale.setScalar(g.scale.x + (scale - g.scale.x) * k);
  });

  return <group ref={group}>{children}</group>;
}

/** Leans the whole scene toward the pointer, a little more for what is nearer the camera */
export function PointerRig({ children, strength = 0.18 }: { children: ReactNode; strength?: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ pointer }, delta) => {
    const g = group.current;
    if (!g) return;
    const k = 1 - Math.exp(-delta * 3);
    g.rotation.y += (pointer.x * strength - g.rotation.y) * k;
    g.rotation.x += (-pointer.y * strength * 0.7 - g.rotation.x) * k;
    g.position.x += (pointer.x * 0.35 - g.position.x) * k;
    g.position.y += (pointer.y * 0.25 - g.position.y) * k;
  });
  return <group ref={group}>{children}</group>;
}

// ------------------------------------------------------------------ materials

function glossy(color: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.28,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    ...extra,
  });
}

/** Materials are made once and shared; they are released when the scene goes */
function useMaterials() {
  const materials = useMemo(
    () => ({
      orange: glossy(COLORS.orange),
      deepOrange: glossy(COLORS.deepOrange),
      cream: glossy(COLORS.cream, { roughness: 0.5, clearcoat: 0.3 }),
      ink: glossy(COLORS.ink, { roughness: 0.22, metalness: 0.25 }),
      white: glossy('#ffffff', { roughness: 0.35 }),
      green: glossy(COLORS.green),
      pages: glossy('#f5ede6', { roughness: 0.8, clearcoat: 0 }),
      gold: new THREE.MeshPhysicalMaterial({ color: COLORS.gold, roughness: 0.22, metalness: 0.95, clearcoat: 0.6 }),
      metal: new THREE.MeshPhysicalMaterial({ color: '#d9d9d9', roughness: 0.2, metalness: 1 }),
      pink: glossy(COLORS.pink, { roughness: 0.55, clearcoat: 0.2 }),
      tick: new THREE.MeshPhysicalMaterial({
        color: COLORS.blue,
        roughness: 0.25,
        clearcoat: 1,
        emissive: COLORS.blue,
        emissiveIntensity: 0.35,
      }),
      glow: new THREE.MeshBasicMaterial({ color: COLORS.orange, transparent: true, opacity: 0.4 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );
  return materials;
}

// ------------------------------------------------------------------ the objects

/** The product's centre: a chat bubble with the "typing" dots */
export function ChatBubble() {
  const m = useMaterials();
  const dots = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    dots.current?.children.forEach((dot, i) => {
      const s = 1 + 0.35 * Math.max(0, Math.sin(clock.elapsedTime * 3.2 - i * 0.7));
      dot.scale.setScalar(s);
    });
  });

  return (
    <group>
      <RoundedBox args={[2.5, 1.7, 0.95]} radius={0.5} smoothness={8} material={m.orange} />
      {/* the tail */}
      <mesh position={[-0.85, -1.05, 0]} rotation={[0, 0, Math.PI * 0.78]} material={m.orange}>
        <coneGeometry args={[0.36, 0.7, 32]} />
      </mesh>
      <group ref={dots} position={[0, 0.02, 0.5]}>
        {[-0.55, 0, 0.55].map((x) => (
          <mesh key={x} position={[x, 0, 0]} material={m.white}>
            <sphereGeometry args={[0.19, 32, 32]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A stack of three books, pages showing */
export function Books() {
  const m = useMaterials();
  const book = (y: number, rotation: number, cover: THREE.Material, width = 2.1) => (
    <group position={[0, y, 0]} rotation={[0, rotation, 0]}>
      <RoundedBox args={[width, 0.36, 1.5]} radius={0.06} smoothness={4} material={cover} />
      <mesh position={[0.07, 0, 0.02]} material={m.pages}>
        <boxGeometry args={[width - 0.14, 0.27, 1.42]} />
      </mesh>
      <RoundedBox args={[width, 0.36, 0.1]} radius={0.04} smoothness={3} position={[0, 0, -0.7]} material={cover} />
    </group>
  );
  return (
    <group>
      {book(-0.4, 0.1, m.ink)}
      {book(0, -0.18, m.cream, 1.9)}
      {book(0.4, 0.32, m.orange, 1.7)}
    </group>
  );
}

/** A rupee coin: gold, with the ₹ drawn on both faces */
export function Coin() {
  const m = useMaterials();
  const face = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(256, 220, 40, 256, 256, 256);
      gradient.addColorStop(0, '#ffd58a');
      gradient.addColorStop(1, '#e8922b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(122, 64, 8, 0.55)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(256, 256, 218, 0, Math.PI * 2);
      ctx.stroke();
      // The rupee sign is drawn as a shape, so it looks the same whatever fonts the device has
      ctx.strokeStyle = '#7a4008';
      ctx.lineWidth = 36;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(170, 150);
      ctx.lineTo(350, 150);
      ctx.moveTo(170, 215);
      ctx.lineTo(350, 215);
      ctx.moveTo(200, 150);
      ctx.lineTo(240, 150);
      ctx.bezierCurveTo(345, 150, 345, 275, 240, 275);
      ctx.lineTo(190, 275);
      ctx.lineTo(335, 395);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, []);
  useEffect(() => () => face.dispose(), [face]);

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh material={m.gold}>
        <cylinderGeometry args={[0.95, 0.95, 0.16, 72]} />
      </mesh>
      {/* The two faces lie flat on the coin's top and bottom (the coin's axis is Y), facing outward */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[0, side * 0.082, 0]} rotation={[(side * -Math.PI) / 2, 0, 0]}>
          <circleGeometry args={[0.84, 72]} />
          <meshStandardMaterial map={face} metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** A mortarboard: a graduation cap */
export function GradCap() {
  const m = useMaterials();
  return (
    <group rotation={[0.25, 0, 0]}>
      <mesh position={[0, -0.32, 0]} material={m.ink}>
        <cylinderGeometry args={[0.7, 0.82, 0.55, 40]} />
      </mesh>
      <group rotation={[0, Math.PI / 4, 0]}>
        <RoundedBox args={[2.5, 0.12, 2.5]} radius={0.04} smoothness={3} material={m.ink} />
      </group>
      {/* tassel */}
      <mesh position={[0.45, 0.07, 0.45]} rotation={[0, 0, 0]} material={m.gold}>
        <sphereGeometry args={[0.09, 20, 20]} />
      </mesh>
      <mesh position={[0.95, -0.15, 0.95]} rotation={[0.5, 0, -0.5]} material={m.orange}>
        <cylinderGeometry args={[0.025, 0.025, 1.0, 12]} />
      </mesh>
      <mesh position={[1.17, -0.62, 1.17]} material={m.orange}>
        <cylinderGeometry args={[0.1, 0.13, 0.3, 16]} />
      </mesh>
    </group>
  );
}

/** A pencil, hexagonal like the real thing */
export function Pencil() {
  const m = useMaterials();
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh material={m.gold}>
        <cylinderGeometry args={[0.2, 0.2, 2.6, 6]} />
      </mesh>
      <mesh position={[0, 1.55, 0]} material={m.cream}>
        <coneGeometry args={[0.2, 0.5, 6]} />
      </mesh>
      <mesh position={[0, 1.83, 0]} material={m.ink}>
        <coneGeometry args={[0.07, 0.14, 12]} />
      </mesh>
      <mesh position={[0, -1.4, 0]} material={m.metal}>
        <cylinderGeometry args={[0.21, 0.21, 0.28, 24]} />
      </mesh>
      <mesh position={[0, -1.66, 0]} material={m.pink}>
        <cylinderGeometry args={[0.19, 0.19, 0.3, 24]} />
      </mesh>
    </group>
  );
}

/** WhatsApp's double blue tick: "delivered and read" */
export function Ticks() {
  const m = useMaterials();
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(-0.62, 0.05, 0), new THREE.Vector3(-0.28, -0.38, 0), new THREE.Vector3(0.5, 0.52, 0)],
      false,
      'catmullrom',
      0.5,
    );
    return new THREE.TubeGeometry(curve, 48, 0.1, 16, false);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry} material={m.tick} />
      <mesh geometry={geometry} material={m.tick} position={[0.42, 0, 0]} />
    </group>
  );
}

/** Thin glowing rings that orbit the bubble */
export function Rings() {
  const m = useMaterials();
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (a.current) a.current.rotation.z += delta * 0.18;
    if (b.current) b.current.rotation.z -= delta * 0.12;
  });
  return (
    <group>
      <mesh ref={a} rotation={[1.15, 0.2, 0]} material={m.glow}>
        <torusGeometry args={[1.95, 0.012, 12, 160]} />
      </mesh>
      <mesh ref={b} rotation={[0.55, -0.6, 0.3]} material={m.glow} scale={1.22}>
        <torusGeometry args={[1.95, 0.008, 12, 160]} />
      </mesh>
    </group>
  );
}
