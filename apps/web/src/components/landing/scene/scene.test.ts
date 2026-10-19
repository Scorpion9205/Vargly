import { describe, expect, it } from 'vitest';
import { resolveKeys, samplePose, smoothstep, type NamedKey } from './keyframes';
import { decideSceneMode, type SceneEnvironment } from './scene-mode';

const key = (at: NamedKey['at'], x: number, scale = 1): NamedKey => ({ at, pos: [x, 0, 0], scale });

describe('samplePose', () => {
  const keys = resolveKeys([key(0, -1, 1), key(0.5, 1, 2), key(1, 0, 4)], {});

  it('holds the first pose before it and the last after it', () => {
    expect(samplePose(keys, -0.3).pos[0]).toBe(-1);
    expect(samplePose(keys, 1.4).pos[0]).toBe(0);
  });

  it('is exactly a key at the key', () => {
    expect(samplePose(keys, 0.5)).toMatchObject({ pos: [1, 0, 0], scale: 2 });
  });

  it('eases between keys: slow at each end, fast in the middle', () => {
    const quarter = samplePose(keys, 0.125).pos[0]; // a quarter of the way from -1 to 1
    const half = samplePose(keys, 0.25).pos[0];
    expect(half).toBeCloseTo(0, 5);
    expect(quarter).toBeGreaterThan(-1);
    expect(quarter).toBeLessThan(-0.5); // smoothstep(0.25) = 0.156, so it has barely left
  });

  it('does not divide by zero when two keys share a time', () => {
    const pose = samplePose(resolveKeys([key(0.4, -1), key(0.4, 1), key(0.9, 0)], {}), 0.4);
    expect(Number.isFinite(pose.pos[0])).toBe(true);
  });

  it('copes with no keys at all', () => {
    expect(samplePose([], 0.5)).toEqual({ pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 });
  });
});

describe('resolveKeys', () => {
  const stops = { hero: 0.02, features: 0.4, 'story:start': 0.1, 'story:end': 0.3 };

  it('turns section names into measured scroll positions, in order', () => {
    const keys = resolveKeys([key('features', 1), key('hero', 0), key('story:end', 2), key('story:start', 3)], stops);
    expect(keys.map((k) => k.at)).toEqual([0.02, 0.1, 0.3, 0.4]);
    expect(keys.map((k) => k.pos[0])).toEqual([0, 3, 2, 1]);
  });

  it('skips keys for sections that are not on the page, and keeps plain numbers', () => {
    const keys = resolveKeys([key('pricing', 5), key(1, 9), key('hero', 0)], stops);
    expect(keys.map((k) => k.at)).toEqual([0.02, 1]);
  });
});

describe('smoothstep', () => {
  it('stays within 0 and 1', () => {
    expect(smoothstep(-5)).toBe(0);
    expect(smoothstep(7)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
  });
});

describe('decideSceneMode', () => {
  const capable: SceneEnvironment = { reducedMotion: false, webgl: true, width: 1440, cores: 8, memory: 8 };

  it('gives a capable desktop the full scene', () => {
    expect(decideSceneMode(capable)).toBe('full');
  });

  it('leaves the scene out for people who ask for less motion, or have no WebGL, or want to save data', () => {
    expect(decideSceneMode({ ...capable, reducedMotion: true })).toBe('off');
    expect(decideSceneMode({ ...capable, webgl: false })).toBe('off');
    expect(decideSceneMode({ ...capable, saveData: true })).toBe('off');
  });

  it('trims it on phones and weak machines', () => {
    expect(decideSceneMode({ ...capable, width: 390 })).toBe('lite');
    expect(decideSceneMode({ ...capable, cores: 4 })).toBe('lite');
    expect(decideSceneMode({ ...capable, memory: 2 })).toBe('lite');
  });

  it('does not penalise a browser that does not report its hardware', () => {
    expect(decideSceneMode({ reducedMotion: false, webgl: true, width: 1280 })).toBe('full');
  });
});
