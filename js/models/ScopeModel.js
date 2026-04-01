/**
 * ScopeModel.js — manages the oscilloscope's sample ring-buffer,
 * probe positions, zoom state, and pause flag.
 * No DOM access.
 * Depends on: Constants
 */

class ScopeModel {
  constructor() {
    /** @type {Array<{t:number, diff:number}>} circular sample ring-buffer */
    this.buffer = [];

    /** Probe grid positions, or null if not yet placed */
    this.probeA = null; // {x, y}
    this.probeB = null; // {x, y}

    /** Scope open/paused flags */
    this.open   = false;
    this.paused = false;

    /** Zoom indices into Constants.VDIV_STEPS / SDIV_STEPS */
    this.vDivIdx = Constants.VDIV_STEPS.indexOf(Constants.DEFAULT_VDIV);
    this.sDivIdx = Constants.SDIV_STEPS.indexOf(Constants.DEFAULT_SDIV);

    /** Sim-time of the last sample taken */
    this._lastSampleTime = 0;
  }

  // ── Accessors ──────────────────────────────────────────────────────────

  get vDiv() {
    const idx = Math.max(0, Math.min(Constants.VDIV_STEPS.length - 1, this.vDivIdx));
    return Constants.VDIV_STEPS[idx];
  }

  get sDiv() {
    const idx = Math.max(0, Math.min(Constants.SDIV_STEPS.length - 1, this.sDivIdx));
    return Constants.SDIV_STEPS[idx];
  }

  /** Total seconds visible in one scope window */
  get windowSeconds() {
    return this.sDiv * Constants.SCOPE_COLS;
  }

  // ── Zoom controls ──────────────────────────────────────────────────────

  zoomVIn()  { this.vDivIdx = Math.max(0, this.vDivIdx - 1); }
  zoomVOut() { this.vDivIdx = Math.min(Constants.VDIV_STEPS.length - 1, this.vDivIdx + 1); }
  zoomHIn()  { this.sDivIdx = Math.max(0, this.sDivIdx - 1); }
  zoomHOut() { this.sDivIdx = Math.min(Constants.SDIV_STEPS.length - 1, this.sDivIdx + 1); }

  resetZoom() {
    this.vDivIdx = Constants.VDIV_STEPS.indexOf(Constants.DEFAULT_VDIV);
    this.sDivIdx = Constants.SDIV_STEPS.indexOf(Constants.DEFAULT_SDIV);
  }

  // ── Sampling ───────────────────────────────────────────────────────────

  /**
   * Called each simulation tick. Appends a sample if enough time has elapsed.
   * @param {number} simTime
   * @param {number} va - voltage at probe A
   * @param {number} vb - voltage at probe B
   * @param {number} qnoise - small quantum noise offset
   */
  maybeSample(simTime, va, vb, qnoise) {
    if (this.paused) return;
    if (simTime - this._lastSampleTime < 1 / Constants.SAMPLE_RATE) return;

    this._lastSampleTime = simTime;
    this.buffer.push({ t: simTime, diff: (va - vb) + qnoise });

    // Hard cap — prevents memory growth beyond the widest possible window
    while (this.buffer.length > Constants.MAX_SCOPE_SAMPLES) {
      this.buffer.shift();
    }
  }

  /** Clear buffer and reset sample timer (called on simulation restart). */
  reset() {
    this.buffer = [];
    this._lastSampleTime = 0;
  }

  // ── Statistics ─────────────────────────────────────────────────────────

  /**
   * Compute summary stats over the current buffer.
   * Returns null if there are fewer than 2 samples.
   */
  computeStats() {
    if (this.buffer.length < 2) return null;
    const diffs = this.buffer.map(s => s.diff);
    const last  = this.buffer[this.buffer.length - 1];
    const vmin  = Math.min(...diffs);
    const vmax  = Math.max(...diffs);
    return {
      current: last.diff,
      vpp:     vmax - vmin,
      vmin,
      vmax,
      samples: this.buffer.length,
    };
  }
}
