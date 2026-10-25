/**
 * How much 3D this visitor gets. The page reads fully without it, so the scene is an extra: it is
 * left out for people who ask for less motion or have no WebGL, and trimmed on phones and
 * low-end machines, where it would cost battery and frame rate for little gain.
 */
export type SceneMode = 'off' | 'lite' | 'full';

export interface SceneEnvironment {
  readonly reducedMotion: boolean;
  readonly webgl: boolean;
  readonly width: number;
  /** navigator.hardwareConcurrency; undefined when the browser does not say */
  readonly cores?: number;
  /** navigator.deviceMemory in GB; undefined outside Chromium */
  readonly memory?: number;
  /** navigator.connection.saveData: the visitor asked to save data */
  readonly saveData?: boolean;
}

export function decideSceneMode(env: SceneEnvironment): SceneMode {
  if (env.reducedMotion || !env.webgl || env.saveData) return 'off';
  const small = env.width < 768;
  const weak = (env.cores !== undefined && env.cores <= 4) || (env.memory !== undefined && env.memory <= 4);
  return small || weak ? 'lite' : 'full';
}

/** Whether this browser can create a WebGL context (some block it, or run without a GPU) */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function readSceneEnvironment(): SceneEnvironment {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    webgl: hasWebGL(),
    width: window.innerWidth,
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    saveData: nav.connection?.saveData,
  };
}
