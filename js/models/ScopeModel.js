/**
 * ScopeModel.js — manages the oscilloscope's sample ring-buffer,
 * probe positions, zoom state, and pause flag.
 * No DOM access.
 * Depends on: Constants
 *
 * v2 fixes:
 *  • Samples are pushed once per simulation sub-step (true 500 Sa/s) instead
 *    of at most once per animation frame (~60 Sa/s in the old code).
 *  • Buffer stores A and B channel voltages alongside the A−B difference so
 *    the view can draw all three traces.
 *  • Stats are computed over the VISIBLE window with a loop (the old code
 *    spread up to 25 000 elements into Math.min/max over the whole run).
 *  • Resuming after a pause no longer draws a bogus flat connector across
 *    the gap — the view uses sample-time gaps to break the trace.
 */

class ScopeModel {
  constructor() {
    /** @type {Array<{t:number, a:number, b:number, diff:number}>} ring-buffer */
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

  vDivDown() { this.vDivIdx = Math.max(0, this.vDivIdx - 1); }
  vDivUp()   { this.vDivIdx = Math.min(Constants.VDIV_STEPS.length - 1, this.vDivIdx + 1); }
  sDivDown() { this.sDivIdx = Math.max(0, this.sDivIdx - 1); }
  sDivUp()   { this.sDivIdx = Math.min(Constants.SDIV_STEPS.length - 1, this.sDivIdx + 1); }

  resetZoom() {
    this.vDivIdx = Constants.VDIV_STEPS.indexOf(Constants.DEFAULT_VDIV);
    this.sDivIdx = Constants.SDIV_STEPS.indexOf(Constants.DEFAULT_SDIV);
  }

  /**
   * Auto-fit V/div so the visible trace fills ~70 % of the screen height,
   * never clipping. Uses the visible window's data.
   */
  autoFitV() {
    const win = this._windowSamples();
    if (win.length < 2) return;
    let maxAbs = 0;
    for (const s of win) {
      maxAbs = Math.max(maxAbs, Math.abs(s.diff), Math.abs(s.a), Math.abs(s.b));
    }
    if (maxAbs < 1e-4) maxAbs = 0.01;
    const halfRows = Constants.SCOPE_ROWS / 2;
    for (let i = 0; i < Constants.VDIV_STEPS.length; i++) {
      if (maxAbs <= Constants.VDIV_STEPS[i] * halfRows * 0.9) {
        this.vDivIdx = i;
        return;
      }
    }
    this.vDivIdx = Constants.VDIV_STEPS.length - 1;
  }

  // ── Sampling ───────────────────────────────────────────────────────────

  /**
   * Push one sample. Called once per fixed simulation sub-step, so the
   * effective rate really is Constants.SAMPLE_RATE.
   * @param {number} simTime
   * @param {number} va - voltage at probe A (0 if unplaced → ground ref)
   * @param {number} vb - voltage at probe B (0 if unplaced → ground ref)
   * @param {number} qnoise - small quantum measurement-noise offset
   */
  addSample(simTime, va, vb, qnoise) {
    if (this.paused) return;
    this.buffer.push({ t: simTime, a: va, b: vb, diff: (va - vb) + qnoise });

    // Hard cap — prevents memory growth beyond the widest possible window
    const excess = this.buffer.length - Constants.MAX_SCOPE_SAMPLES;
    if (excess > 0) this.buffer.splice(0, excess);
  }

  /** Clear buffer (called on simulation restart or Clear button). */
  reset() {
    this.buffer = [];
  }

  // ── Statistics ─────────────────────────────────────────────────────────

  /** Samples inside the currently visible time window. */
  _windowSamples() {
    if (this.buffer.length === 0) return [];
    const now = this.buffer[this.buffer.length - 1].t;
    const start = now - this.windowSeconds;
    // Buffer is time-ordered: binary search for the window start
    let lo = 0, hi = this.buffer.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.buffer[mid].t < start) lo = mid + 1; else hi = mid;
    }
    return this.buffer.slice(lo);
  }

  /**
   * Summary stats over the visible window.
   * Returns null if there are fewer than 2 samples.
   */
  computeStats() {
    const win = this._windowSamples();
    if (win.length < 2) return null;
    let vmin = Infinity, vmax = -Infinity;
    for (const s of win) {
      if (s.diff < vmin) vmin = s.diff;
      if (s.diff > vmax) vmax = s.diff;
    }
    const last = win[win.length - 1];
    return {
      current: last.diff,
      currentA: last.a,
      currentB: last.b,
      vpp:     vmax - vmin,
      vmin,
      vmax,
      samples: win.length,
    };
  }
}
