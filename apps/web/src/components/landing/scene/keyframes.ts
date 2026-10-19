/**
 * Where a 3D object sits as the page scrolls. Positions are fractions of the visible area
 * (x and y from -1 to 1, so they hold on every screen size); depth is in world units.
 * Between two keys the object eases (smoothstep) from one to the other.
 *
 * A key says *when* either as a scroll progress (0 to 1) or as a named page section, whose real
 * position is measured from the page, so the choreography follows the content when it changes.
 */
export const STOP_NAMES = ['hero', 'story', 'features', 'papers', 'steps', 'pricing', 'faq', 'cta'] as const;
export type StopName = (typeof STOP_NAMES)[number];
/** A section's middle ("story"), or the scroll positions where its top ("story:start") or bottom ("story:end") meets the screen's */
export type StopKey = StopName | `${StopName}:start` | `${StopName}:end`;
export type Stops = Partial<Record<StopKey, number>>;

export type Vec3 = readonly [number, number, number];

export interface NamedKey {
  readonly at: number | StopKey;
  readonly pos: Vec3;
  readonly rot?: Vec3;
  readonly scale?: number;
}

export interface Key extends Omit<NamedKey, 'at'> {
  readonly at: number;
}

export interface Pose {
  pos: [number, number, number];
  rot: [number, number, number];
  scale: number;
}

/** Keys with their times resolved to scroll progress, in order. Keys for sections that are not on the page are skipped. */
export function resolveKeys(keys: readonly NamedKey[], stops: Stops): Key[] {
  const resolved: Key[] = [];
  for (const key of keys) {
    const at = typeof key.at === 'number' ? key.at : stops[key.at];
    if (at === undefined) continue;
    resolved.push({ ...key, at });
  }
  return resolved.sort((a, b) => a.at - b.at);
}

export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const poseOf = (key: Key): Pose => ({
  pos: [key.pos[0], key.pos[1], key.pos[2]],
  rot: [key.rot?.[0] ?? 0, key.rot?.[1] ?? 0, key.rot?.[2] ?? 0],
  scale: key.scale ?? 1,
});

/** The pose at scroll progress `t`: held before the first key and after the last, eased between */
export function samplePose(keys: readonly Key[], t: number): Pose {
  if (keys.length === 0) return { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 };
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (t <= first.at) return poseOf(first);
  if (t >= last.at) return poseOf(last);

  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].at) i += 1;
  const a = poseOf(keys[i]);
  const b = poseOf(keys[i + 1]);
  const span = keys[i + 1].at - keys[i].at;
  const k = span > 0 ? smoothstep((t - keys[i].at) / span) : 1;

  return {
    pos: [lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k)],
    rot: [lerp(a.rot[0], b.rot[0], k), lerp(a.rot[1], b.rot[1], k), lerp(a.rot[2], b.rot[2], k)],
    scale: lerp(a.scale, b.scale, k),
  };
}
