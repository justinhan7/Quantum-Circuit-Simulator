/**
 * ComponentView.js — renders circuit components onto the sim canvas.
 * Stateless: receives component data and draws it.
 * Depends on: Constants, Component
 */

class ComponentView {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
  }

  resize(width, height) {
    this.canvas.width  = width;
    this.canvas.height = height;
  }

  /** Clear the entire canvas. */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw a single component.
   * @param {object}  comp      - component data object
   * @param {boolean} highlight - true when this is the selected component
   * @param {boolean} ghost     - true for the semi-transparent placement preview
   */
  draw(comp, highlight = false, ghost = false) {
    const ctx  = this.ctx;
    const CELL = Constants.CELL;

    ctx.save();
    ctx.lineWidth   = ghost ? 1.5 : highlight ? 2.5 : 1.8;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    const baseColor = ghost
      ? 'rgba(85,145,204,0.5)'
      : comp.noiseHighlight
        ? '#e74'
        : Constants.COMP_COLORS[comp.type] || '#888';

    ctx.strokeStyle = baseColor;
    ctx.fillStyle   = baseColor;

    // ── Wire ──
    if (comp.type === 'wire') {
      ctx.beginPath();
      ctx.moveTo(comp.x1, comp.y1);
      ctx.lineTo(comp.x2, comp.y2);
      ctx.stroke();
      if (highlight && !ghost) {
        ctx.fillStyle = '#5591cc';
        [{ x: comp.x1, y: comp.y1 }, { x: comp.x2, y: comp.y2 }].forEach(p => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        });
      }
      ctx.restore();
      return;
    }

    // ── All non-wire components — translate to midpoint & rotate ──
    const mx     = (comp.x1 + comp.x2) / 2;
    const my     = (comp.y1 + comp.y2) / 2;
    const dx     = comp.x2 - comp.x1;
    const dy     = comp.y2 - comp.y1;
    const len    = Math.sqrt(dx * dx + dy * dy) || CELL * 2;
    const angle  = Math.atan2(dy, dx);
    const half   = len / 2;

    ctx.translate(mx, my);
    ctx.rotate(angle);

    // Ground symbol (special case — drawn relative to x1 endpoint)
    if (comp.type === 'ground') {
      this._drawGround(ctx, half, ghost);
      ctx.restore();
      return;
    }

    // Selection highlight halo
    if (highlight && !ghost) {
      ctx.save();
      ctx.strokeStyle = 'rgba(85,145,204,0.2)';
      ctx.lineWidth   = 10;
      ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(half, 0); ctx.stroke();
      ctx.restore();
    }

    // Value label above the component body
    if (!ghost) {
      const lbl = Component.getLabel(comp);
      if (lbl) {
        ctx.save();
        ctx.rotate(-angle);
        ctx.font        = '9px monospace';
        ctx.textAlign   = 'center';
        ctx.fillStyle   = baseColor;
        ctx.fillText(lbl, 0, -14);
        ctx.restore();
      }
    }

    // Draw the body
    switch (comp.type) {
      case 'resistor':  this._drawResistor(ctx, half, baseColor, comp, angle, ghost); break;
      case 'capacitor': this._drawCapacitor(ctx, half, baseColor, comp, angle, ghost); break;
      case 'led':       this._drawLed(ctx, half, baseColor, comp, ghost); break;
      case 'vsource':   this._drawVSource(ctx, half, baseColor, comp, angle, ghost); break;
      case 'inductor':  this._drawInductor(ctx, half); break;
      case 'switch':    this._drawSwitch(ctx, half, baseColor, comp, angle, ghost); break;
    }

    ctx.restore();
  }

  // ── Private shape drawers ──────────────────────────────────────────────

  _drawGround(ctx, half, ghost) {
    const pl = 12;
    ctx.beginPath(); ctx.moveTo(0, -half); ctx.lineTo(0, -half + pl); ctx.stroke();
    ctx.lineWidth = ghost ? 1.8 : 2.2;
    ctx.beginPath(); ctx.moveTo(-12, -half + pl); ctx.lineTo(12, -half + pl); ctx.stroke();
    ctx.lineWidth = ghost ? 1.4 : 1.8;
    ctx.beginPath(); ctx.moveTo(-8, -half + pl + 5); ctx.lineTo(8, -half + pl + 5); ctx.stroke();
    ctx.lineWidth = ghost ? 1.0 : 1.4;
    ctx.beginPath(); ctx.moveTo(-4, -half + pl + 10); ctx.lineTo(4, -half + pl + 10); ctx.stroke();
  }

  _drawResistor(ctx, half, col, comp, angle, ghost) {
    const bw = Math.min(24, half * 0.7), bh = 8;
    ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(-bw, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bw, 0); ctx.lineTo(half, 0); ctx.stroke();
    ctx.strokeRect(-bw, -bh / 2, bw * 2, bh);
  }

  _drawCapacitor(ctx, half, col, comp, angle, ghost) {
    const gap = 5;
    ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(-gap, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gap, 0); ctx.lineTo(half, 0); ctx.stroke();
    ctx.lineWidth = ghost ? 2 : 2.5;
    ctx.beginPath(); ctx.moveTo(-gap, -12); ctx.lineTo(-gap, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gap, -12); ctx.lineTo(gap, 12); ctx.stroke();
    if (!ghost && comp.charge != null) {
      ctx.save();
      ctx.rotate(-angle);
      ctx.lineWidth   = 1;
      ctx.font        = '9px monospace';
      ctx.textAlign   = 'center';
      ctx.fillStyle   = col;
      ctx.fillText(`${(comp.charge * 100).toFixed(0)}%`, 0, 18);
      ctx.restore();
    }
  }

  _drawLed(ctx, half, col, comp, ghost) {
    const tip = 10;
    ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(-tip, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tip, 0); ctx.lineTo(half, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-tip, -10); ctx.lineTo(-tip, 10); ctx.lineTo(tip, 0); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = ghost ? 2 : 2.5;
    ctx.beginPath(); ctx.moveTo(tip, -10); ctx.lineTo(tip, 10); ctx.stroke();
    if (!ghost && comp.on) {
      ctx.save();
      ctx.globalAlpha = 0.25 + (comp.brightness || 0) * 0.75;
      ctx.fillStyle   = comp.color || '#ff9';
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  _drawVSource(ctx, half, col, comp, angle, ghost) {
    const r = 12;
    ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(-r, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(half, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.rotate(-angle);
    ctx.font      = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = col;
    ctx.fillText('+', 5, 3);
    ctx.fillText('−', -5, 3);
    ctx.restore();
  }

  _drawInductor(ctx, half) {
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    const coils = 3, cw = 10;
    for (let i = 0; i < coils; i++) {
      ctx.arc(-coils * cw / 2 + i * cw + cw / 2, 0, cw / 2, Math.PI, 0, false);
    }
    ctx.lineTo(half, 0);
    ctx.stroke();
  }

  _drawSwitch(ctx, half, col, comp, angle, ghost) {
    const tl = 10;
    ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(-tl, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tl, 0); ctx.lineTo(half, 0); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(-tl, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(tl, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth   = ghost ? 1.8 : 2.2;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(-tl, 0);
    ctx.lineTo(tl + (comp.closed ? 0 : -2), comp.closed ? 0 : -12);
    ctx.stroke();
    if (!ghost) {
      ctx.save();
      ctx.rotate(-angle);
      ctx.font      = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = col;
      ctx.fillText(comp.closed ? 'ON' : 'OFF', 0, 26);
      ctx.restore();
    }
  }
}
