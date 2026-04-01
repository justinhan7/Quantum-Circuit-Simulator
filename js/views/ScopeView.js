/**
 * ScopeView.js — renders the oscilloscope waveform onto its canvas.
 * Depends on: Constants
 */

class ScopeView {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
  }

  resize(width, height) {
    this.canvas.width  = width;
    this.canvas.height = height;
  }

  /**
   * Render the full scope display.
   * @param {ScopeModel} model
   */
  render(model) {
    const { ctx, canvas: { width: w, height: h } } = this;
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
      ctx.fillStyle  = 'rgba(100,160,100,0.4)';
      ctx.font       = '11px monospace';
      ctx.textAlign  = 'center';
      ctx.fillText('Place probes A & B on the circuit, then run', w / 2, h / 2);
      return;
    }

    this._drawTrace(ctx, w, h, model.buffer, tFull, vFull);

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
      const dec = (v < 1 && v > -1) ? 2 : 1;
      ctx.textAlign = 'left';
      ctx.fillText(v.toFixed(dec) + 'V', 2, i / rows * h + 9);
    }
    // Time axis labels
    for (let i = 0; i <= cols; i++) {
      const tl = -(cols - i) * sdiv;
      const str = Math.abs(tl) < 0.001 ? '0' :
        tl.toFixed(Math.abs(tl) < 0.1 ? 3 : Math.abs(tl) < 1 ? 2 : 1) + 's';
      ctx.textAlign = 'center';
      ctx.fillText(str, i / cols * w, h - 3);
    }
  }

  _drawTrace(ctx, w, h, buffer, tFull, vFull) {
    const now         = buffer[buffer.length - 1].t;
    const windowStart = now - tFull;

    ctx.beginPath();
    ctx.strokeStyle = '#4de84d';
    ctx.lineWidth   = 1.5;
    let first = true;
    for (const s of buffer) {
      if (s.t < windowStart) continue;
      const tx = (s.t - windowStart) / tFull * w;
      const ty = h / 2 - (s.diff / (vFull / 2)) * (h / 2);
      first ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
      first = false;
    }
    ctx.stroke();
  }
}
