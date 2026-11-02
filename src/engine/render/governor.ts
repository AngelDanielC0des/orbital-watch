import type { WebGLRenderer } from "three";

/** Geometry/detail multipliers stepped through after the pixel ratio bottoms out (bundle `Kb`). */
export const DETAIL_LEVELS = [1, 0.7, 0.45] as const;
/** Seconds of frame samples per decision window (bundle `qb`). */
const WINDOW_SECONDS = 1;

/** Percentile of the first `count` samples; sorts that slice in place (bundle `Jb`). */
function percentile(samples: Float32Array, count: number, p: number): number {
  return samples.subarray(0, count).sort()[Math.min(count - 1, Math.floor(count * p))];
}

/** `EXT_disjoint_timer_query_webgl2` (not in lib.dom). */
interface DisjointTimerQueryExt {
  readonly TIME_ELAPSED_EXT: GLenum;
  readonly GPU_DISJOINT_EXT: GLenum;
}

export interface GovernorState {
  ratio: number;
  detail: number;
  lock30: boolean;
}

export interface FrameGovernorOptions {
  minRatio: number;
  maxRatio: number;
  lock30?: boolean;
  onChange: (state: GovernorState) => void;
}

/**
 * Adaptive quality: watches frame intervals (and GPU time when the timer query
 * extension exists) and trades pixel ratio, detail and a 30 fps cap (bundle `Yb`).
 */
export class FrameGovernor {
  gl: WebGL2RenderingContext;
  timer: DisjointTimerQueryExt | null;
  minRatio: number;
  maxRatio: number;
  ratio: number;
  detailIndex: number;
  forced30: boolean;
  lock30: boolean;
  onChange: (state: GovernorState) => void;
  intervals: Float32Array;
  gpu: Float32Array;
  intervalCount: number;
  gpuCount: number;
  windowLeft: number;
  calm: number;
  query: WebGLQuery | null;
  pending: WebGLQuery[];
  lastRenderAt: number;

  constructor(renderer: WebGLRenderer, { minRatio, maxRatio, lock30 = false, onChange }: FrameGovernorOptions) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.timer = this.gl.getExtension(`EXT_disjoint_timer_query_webgl2`) as DisjointTimerQueryExt | null;
    this.minRatio = minRatio;
    this.maxRatio = maxRatio;
    this.ratio = maxRatio;
    this.detailIndex = 0;
    this.forced30 = lock30;
    this.lock30 = lock30;
    this.onChange = onChange;
    this.intervals = new Float32Array(512);
    this.gpu = new Float32Array(512);
    this.intervalCount = 0;
    this.gpuCount = 0;
    this.windowLeft = WINDOW_SECONDS;
    this.calm = 0;
    this.query = null;
    this.pending = [];
    this.lastRenderAt = 0;
  }

  get detail(): number {
    return DETAIL_LEVELS[this.detailIndex];
  }

  setMaxRatio(maxRatio: number): void {
    this.maxRatio = maxRatio;
    if (this.ratio > maxRatio) {
      this.ratio = maxRatio;
      this.emit();
    }
  }

  shouldRender(now: number): boolean {
    return !this.lock30 || !(now - this.lastRenderAt < 1e3 / 30 - 2);
  }

  beginRender(now: number): void {
    this.lastRenderAt = now;
    if (!this.timer || this.query || this.pending.length > 3) return;
    this.query = this.gl.createQuery();
    this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.query);
  }

  endRender(): void {
    if (this.query && this.timer) {
      this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
      this.pending.push(this.query);
      this.query = null;
    }
  }

  collectQueries(): void {
    const gl = this.gl;
    const timer = this.timer;
    if (!timer) return;
    while (this.pending.length) {
      const query = this.pending[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT) && this.gpuCount < this.gpu.length)
        this.gpu[this.gpuCount++] = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
      gl.deleteQuery(query);
      this.pending.shift();
    }
  }

  tick(dt: number): void {
    if (this.timer) this.collectQueries();
    if (dt > 0.25) return;
    if (this.intervalCount < this.intervals.length) this.intervals[this.intervalCount++] = dt;
    this.windowLeft -= dt;
    if (this.windowLeft > 0) return;
    this.windowLeft = WINDOW_SECONDS;
    if (this.intervalCount >= 12) this.decide();
    this.intervalCount = 0;
    this.gpuCount = 0;
  }

  decide(): void {
    const frame = percentile(this.intervals, this.intervalCount, 0.9);
    const gpu = this.gpuCount >= 8 ? percentile(this.gpu, this.gpuCount, 0.9) : null;
    if (frame > (this.lock30 ? 1 / 27 : 1 / 50) || (gpu !== null && gpu > (this.lock30 ? 30 : 17))) {
      this.calm = 0;
      this.degrade(frame > 1 / 24 ? 2 : 1);
    } else if (gpu === null ? !this.lock30 && frame < 1 / 57 : gpu < (this.lock30 ? 7 : 8)) {
      if (++this.calm >= 4) {
        this.calm = 0;
        this.upgrade();
      }
    } else {
      this.calm = 0;
    }
  }

  degrade(steps: number): void {
    let changed = false;
    for (let k = 0; k < steps; k++) {
      if (this.ratio > this.minRatio + 0.001) this.ratio = Math.max(this.minRatio, this.ratio - 0.25);
      else if (this.detailIndex < DETAIL_LEVELS.length - 1) this.detailIndex++;
      else if (!this.lock30) this.lock30 = true;
      else break;
      changed = true;
    }
    if (changed) this.emit();
  }

  upgrade(): void {
    if (this.lock30 && !this.forced30) this.lock30 = false;
    else if (this.detailIndex > 0) this.detailIndex--;
    else if (this.ratio < this.maxRatio - 0.001) this.ratio = Math.min(this.maxRatio, this.ratio + 0.25);
    else return;
    this.emit();
  }

  emit(): void {
    this.onChange({
      ratio: this.ratio,
      detail: this.detail,
      lock30: this.lock30,
    });
  }

  dispose(): void {
    for (const query of this.pending) this.gl.deleteQuery(query);
    if (this.query) this.gl.deleteQuery(this.query);
    this.pending.length = 0;
  }
}
