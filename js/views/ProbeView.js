/**
 * ProbeView.js — draws oscilloscope probe markers on the sim canvas.
 * Depends on: Constants
 */

class ProbeView {
  /** @param {CanvasRenderingContext2D} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * Draw a crosshair probe marker.
   * @param {{x,y}} pt
   * @param {string} color - CSS colour
   * @param {string} label - 'A' or 'B'
   * @param {number} alpha - opacity (0-1)
   */
  drawMarker(pt, color, label, alpha = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha   = alpha;
    ctx.strokeStyle   = color;
    ctx.fillStyle     = color;
    ctx.lineWidth     = 1.5;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y - 10); ctx.lineTo(pt.x, pt.y + 10); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pt.x - 10, pt.y); ctx.lineTo(pt.x + 10, pt.y); ctx.stroke();
    ctx.font      = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, pt.x + 10, pt.y - 4);
    ctx.restore();
  }

  /**
   * Draw both placed probes and the ghost probe (while placing).
   */
  drawAll(probeA, probeB, placingProbe, mouseSnap) {
    if (probeA) this.drawMarker(probeA, '#7ab8f5', 'A');
    if (probeB) this.drawMarker(probeB, '#f5a855', 'B');
    if (placingProbe && mouseSnap) {
      const col = placingProbe === 'a' ? 'rgba(122,184,245,0.5)' : 'rgba(245,168,85,0.5)';
      this.drawMarker(mouseSnap, col, placingProbe.toUpperCase());
    }
  }
}
