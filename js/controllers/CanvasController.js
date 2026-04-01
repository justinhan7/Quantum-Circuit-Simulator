/**
 * CanvasController.js — handles all mouse events on the circuit canvas.
 * Translates raw events into model mutations and view redraws.
 * Depends on: Constants, Component, CircuitModel, ComponentView, ProbeView, GridView
 */

class CanvasController {
  /**
   * @param {HTMLCanvasElement}  simCanvas
   * @param {CircuitModel}       circuitModel
   * @param {ComponentView}      componentView
   * @param {ProbeView}          probeView
   * @param {GridView}           gridView
   * @param {ScopeModel}         scopeModel
   * @param {object}             callbacks
   *   .onSelectionChange(comp)
   *   .onComponentAdded()
   *   .onComponentRemoved()
   *   .onSwitchToggled(comp)
   *   .onDoubleClick(comp)
   *   .onLog(msg)
   */
  constructor(simCanvas, circuitModel, componentView, probeView, gridView, scopeModel, callbacks) {
    this.canvas         = simCanvas;
    this.circuit        = circuitModel;
    this.compView       = componentView;
    this.probeView      = probeView;
    this.gridView       = gridView;
    this.scopeModel     = scopeModel;
    this.cb             = callbacks;

    /** Currently active tool name (set by ToolController). */
    this.tool           = 'wire';

    /** Ghost rotation (0-3) for placement preview. */
    this.ghostRotation  = 0;

    /** Snapped mouse position for ghost rendering. */
    this.mousePos       = { x: 0, y: 0 };

    /** Currently selected component. */
    this.selected       = null;

    /** Wire drag state. */
    this._wireDrag      = null;

    /** Which probe is being placed ('a' | 'b' | null). */
    this.placingProbe   = null;

    /** Double-click detection. */
    this._lastClick     = { comp: null, time: 0 };

    this._bindEvents();
  }

  // ── Tool / cursor management ───────────────────────────────────────────

  setTool(toolName) {
    this.tool          = toolName;
    this.ghostRotation = 0;
    this._wireDrag     = null;
    this.placingProbe  = null;
    this._updateCursor();
    this.redraw();
  }

  rotateGhost() {
    this.ghostRotation = (this.ghostRotation + 1) % 4;
    this.redraw();
  }

  rotateSelected() {
    if (!this.selected) return;
    Component.rotate(this.selected);
    this.cb.onSelectionChange(this.selected);
    this.redraw();
  }

  deleteSelected() {
    if (!this.selected) return;
    this.circuit.removeComponent(this.selected);
    this.selected = null;
    this.cb.onSelectionChange(null);
    this.cb.onComponentRemoved();
    this.redraw();
    this.cb.onLog('Deleted component');
  }

  startPlacingProbe(which) {
    this.placingProbe = which;
    this._updateCursor();
    this.redraw();
  }

  cancelProbe() {
    this.placingProbe = null;
    this._updateCursor();
    this.redraw();
  }

  // ── Resize ─────────────────────────────────────────────────────────────

  resize(width, height) {
    this.compView.resize(width, height);
    this.gridView.resize(width, height);
    this.redraw();
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  redraw() {
    this.compView.clear();

    // Draw all placed components
    for (const c of this.circuit.components) {
      this.compView.draw(c, c === this.selected, false);
    }

    // Wire drag preview
    if (this._wireDrag) {
      const ctx = this.compView.ctx;
      ctx.save();
      ctx.strokeStyle = 'rgba(85,145,204,0.6)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this._wireDrag.x1, this._wireDrag.y1);
      ctx.lineTo(this._wireDrag.x2, this._wireDrag.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Probe markers
    const mouseSnap = this.placingProbe ? this.mousePos : null;
    this.probeView.drawAll(
      this.scopeModel.probeA,
      this.scopeModel.probeB,
      this.placingProbe,
      mouseSnap,
    );

    // Ghost component (placement preview)
    const ghost = this._makeGhost();
    if (ghost) this.compView.draw(ghost, false, true);
  }

  // ── Private: ghost ─────────────────────────────────────────────────────

  _makeGhost() {
    if (this.tool === 'select' || this.tool === 'wire' || this.placingProbe) return null;

    const { x: cx, y: cy } = this.mousePos;
    const rot  = (this.ghostRotation % 4 + 4) % 4;
    const span = Constants.CELL * 2;
    let dx = span, dy = 0;
    if (rot === 1) { dx = 0; dy = span; }
    else if (rot === 2) { dx = -span; dy = 0; }
    else if (rot === 3) { dx = 0; dy = -span; }

    return Component.create(this.tool, cx, cy, cx + dx, cy + dy, rot);
  }

  // ── Private: events ────────────────────────────────────────────────────

  _bindEvents() {
    const cv = this.canvas;
    cv.addEventListener('mousemove',  e => this._onMouseMove(e));
    cv.addEventListener('mousedown',  e => this._onMouseDown(e));
    cv.addEventListener('mouseup',    e => this._onMouseUp(e));
    cv.addEventListener('mouseleave', () => this._onMouseLeave());
  }

  _onMouseMove(e) {
    this.mousePos = this._snap(e);

    if (this._wireDrag) {
      this._wireDrag.x2 = this.mousePos.x;
      this._wireDrag.y2 = this.mousePos.y;
      this.redraw();
      return;
    }

    if (this.tool === 'select' && !this.placingProbe) {
      const hit = Component.nearest(this.circuit.components, this.mousePos.x, this.mousePos.y);
      this.canvas.className = hit?.type === 'switch' ? 'switch-hover' : 'select-mode';
    }

    this.redraw();
  }

  _onMouseDown(e) {
    const p = this._snap(e);

    // ── Probe placement ──
    if (this.placingProbe) {
      if (this.placingProbe === 'a') {
        this.scopeModel.probeA = { ...p };
        this.cb.onLog(`Probe A placed at (${p.x}, ${p.y})`);
      } else {
        this.scopeModel.probeB = { ...p };
        this.cb.onLog(`Probe B placed at (${p.x}, ${p.y})`);
      }
      const placed = this.placingProbe;
      this.placingProbe = null;
      this._updateCursor();
      if (typeof this.cb.onProbePlace === 'function') this.cb.onProbePlace(placed);
      this.redraw();
      return;
    }

    // ── Select mode ──
    if (this.tool === 'select') {
      const hit = Component.nearest(this.circuit.components, p.x, p.y);

      // Double-click detection
      const now = Date.now();
      if (hit && hit === this._lastClick.comp && now - this._lastClick.time < 400) {
        this._lastClick = { comp: null, time: 0 };
        if (Constants.COMP_META[hit.type]) {
          this.cb.onDoubleClick(hit);
        }
        return;
      }
      this._lastClick = { comp: hit, time: now };

      // Toggle switch
      if (hit?.type === 'switch') {
        hit.closed = !hit.closed;
        this.circuit.resetCapacitorTimers();
        this.cb.onSwitchToggled(hit);
        this.cb.onLog(`Switch ${hit.closed ? 'CLOSED' : 'OPEN'}`);
      }

      this.selected = hit;
      this.cb.onSelectionChange(hit);
      this.redraw();
      return;
    }

    // ── Wire drawing ──
    if (this.tool === 'wire') {
      this._wireDrag = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      return;
    }

    // ── Component placement ──
    const ghost = this._makeGhost();
    if (!ghost) return;
    this.circuit.addComponent(ghost);
    this.selected = ghost;
    this.cb.onSelectionChange(ghost);
    this.cb.onComponentAdded();
    this.redraw();
    this.cb.onLog(`Placed ${ghost.type}`);
  }

  _onMouseUp(e) {
    if (!this._wireDrag) return;
    const p = this._snap(e);
    if (Math.abs(p.x - this._wireDrag.x1) > 4 || Math.abs(p.y - this._wireDrag.y1) > 4) {
      const wire = Component.create('wire', this._wireDrag.x1, this._wireDrag.y1, p.x, p.y);
      this.circuit.addComponent(wire);
      this.selected = wire;
      this.cb.onSelectionChange(wire);
      this.cb.onComponentAdded();
      this.cb.onLog('Placed wire');
    }
    this._wireDrag = null;
    this.redraw();
  }

  _onMouseLeave() {
    this._wireDrag = null;
    this.redraw();
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  _snap(e) {
    const r    = this.canvas.getBoundingClientRect();
    const CELL = Constants.CELL;
    return {
      x: Math.round((e.clientX - r.left)  / CELL) * CELL,
      y: Math.round((e.clientY - r.top)   / CELL) * CELL,
    };
  }

  _updateCursor() {
    if (this.placingProbe) {
      this.canvas.className = 'probe-mode';
    } else if (this.tool === 'select') {
      this.canvas.className = 'select-mode';
    } else {
      this.canvas.className = '';
    }
  }
}
