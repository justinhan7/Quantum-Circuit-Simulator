/**
 * ScopeView.js — renders the oscilloscope waveform onto its canvas.
 * Depends on: Constants
 *
 * v2 fixes:
 *  • Draws all three channels: Probe A (blue), Probe B (orange) faintly,
 *    and Ch1 = A−B (green) prominently — matching the probe marker colours.
 *  • Breaks the trace across time gaps (e.g. after a pause/resume) instead
 *    of drawing a misleading flat connector line.
 *  • Supports devicePixelRatio for crisp rendering.
 *  • Clips traces to the plot area so an off-scale signal doesn't scribble
 *    over the axis labels.
 */

class ScopeView {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._w = 0;
    this._h = 0;
  }

  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this._w = width;
    this._h = height;
    this.canvas.width  = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width  = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Render the full scope display.
   * @param {ScopeModel} model
   */
  render(model) {
    const ctx = this.ctx;
    const w = this._w, h = this._h;
    if (w <= 0 || h <= 0) return;
    const { SCOPE_COLS: cols, SCOPE_ROWS: rows } = Constants;

    // Background
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    const vdiv  = model.vDiv;
    const sdiv  = model.sDiv;
    const vFull = vdiv * rows;
    const tFull = sdiv * cols;

    this._drawGrid(ctx, w, h, cols, rows, vdiv, sdiv);

    if (model.buffer.length < 2) {
      ctx.fillStyle  = 'rgba(100,160,100,0.45)';
      ctx.font       = '11px monospace';
      ctx.textAlign  = 'center';
      ctx.fillText('Place Probe A (and optionally B) on the circuit, then Run', w / 2, h / 2);
      return;
    }

    const gap = 4 / Constants.SAMPLE_RATE; // >4 missed samples → break trace

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // Faint per-probe channels (only when meaningful: probe actually placed)
    if (model.probeA) this._drawTrace(ctx, w, h, model.buffer, tFull, vFull, 'a',    'rgba(122,184,245,0.45)', 1, gap);
    if (model.probeB) this._drawTrace(ctx, w, h, model.buffer, tFull, vFull, 'b',    'rgba(245,168,85,0.45)',  1, gap);
    // Main channel: A − B
    this._drawTrace(ctx, w, h, model.buffer, tFull, vFull, 'diff', '#4de84d', 1.5, gap);

    ctx.restore();

    if (model.paused) {
      ctx.fillStyle = 'rgba(200,150,0,0.12)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle  = 'rgba(220,180,0,0.85)';
      ctx.font       = 'bold 12px monospace';
      ctx.textAlign  = 'center';
      ctx.fillText('PAUSED', w / 2, 16);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────

  _drawGrid(ctx, w, h, cols, rows, vdiv, sdiv) {
    // Minor gridlines
    ctx.strokeStyle = 'rgba(60,80,60,0.45)';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= cols; i++) {
      const x = i / cols * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      const y = i / rows * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Centre crosshairs
    ctx.strokeStyle = 'rgba(60,120,60,0.8)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();

    // Voltage axis labels
    ctx.fillStyle = 'rgba(100,150,100,0.75)';
    ctx.font      = '9px monospace';
    for (let i = 0; i <= rows; i++) {
      const v = (rows / 2 - i) * vdiv;
      const abs = Math.abs(v);
      const str = abs >= 1000 ? (v / 1000).toFixed(1) + 'kV'
                : abs < 1 && abs > 0 ? v.toFixed(2) + 'V'
                : v.toFixed(abs >= 10 ? 0 : 1) + 'V';
      ctx.textAlign = 'left';
      ctx.fillText(str, 2, Math.min(h - 2, Math.max(9, i / rows * h + 9)));
    }
    // Time axis labels
    for (let i = 0; i <= cols; i++) {
      const tl = -(cols - i) * sdiv;
      const str = Math.abs(tl) < 0.001 ? '0' :
        tl.toFixed(Math.abs(tl) < 0.1 ? 3 : Math.abs(tl) < 1 ? 2 : 1) + 's';
      ctx.textAlign = i === 0 ? 'left' : i === cols ? 'right' : 'center';
      ctx.fillText(str, i / cols * w, h - 3);
    }
  }

  _drawTrace(ctx, w, h, buffer, tFull, vFull, field, color, width, gap) {
    const now         = buffer[buffer.length - 1].t;
    const windowStart = now - tFull;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    let prevT = null;
    for (const s of buffer) {
      if (s.t < windowStart) continue;
      const tx = (s.t - windowStart) / tFull * w;
      const ty = h / 2 - (s[field] / (vFull / 2)) * (h / 2);
      if (prevT === null || s.t - prevT > gap) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty);
      prevT = s.t;
    }
    ctx.stroke();
  }
}
