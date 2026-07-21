/**
 * GridView.js — draws the static dot-grid background onto the grid canvas.
 * Depends on: Constants
 */

class GridView {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
  }

  /** Resize canvases to fill their container, then redraw. */
  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this._w = width;
    this._h = height;
    this.canvas.width  = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width  = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this._w || this.canvas.width;
    const h = this._h || this.canvas.height;
    const CELL = Constants.CELL;

    ctx.clearRect(0, 0, w, h);

    // Faint grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5;
    for (let x = 0; x < w; x += CELL) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += CELL) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Dot at each grid intersection
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0; x < w; x += CELL) {
      for (let y = 0; y < h; y += CELL) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
