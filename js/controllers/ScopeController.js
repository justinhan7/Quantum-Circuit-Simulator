/**
 * ScopeController.js — manages the oscilloscope panel UI:
 * open/close, pause, zoom controls, probe placement buttons,
 * and updating the stats display.
 * Depends on: Constants, Component, ScopeModel, ScopeView
 *
 * v2 fixes:
 *  • V/div and s/div zoom controls actually exist now (the model always
 *    supported them but no UI was ever wired up — a 5 V signal at the fixed
 *    1 V/div default rendered off-screen).
 *  • "Auto" button fits the vertical scale to the visible signal.
 *  • "Clear" button empties the sample buffer.
 *  • The scope-meta readout reflects the live V/div and s/div settings.
 *  • Probe badges show grid coordinates (cells), not raw pixels.
 *  • Opening/closing the panel triggers a full app resize after the CSS
 *    transition so the circuit canvas doesn't get clipped underneath.
 */

class ScopeController {
  /**
   * @param {ScopeModel}       scopeModel
   * @param {ScopeView}        scopeView
   * @param {CanvasController} canvasCtrl
   * @param {function}         onLog
   * @param {function}         [onLayoutChange] - called after the panel
   *                           finishes opening/closing (for canvas resize)
   */
  constructor(scopeModel, scopeView, canvasCtrl, onLog, onLayoutChange) {
    this.model      = scopeModel;
    this.view       = scopeView;
    this.canvasCtrl = canvasCtrl;
    this.log        = onLog;
    this._onLayoutChange = onLayoutChange || (() => {});

    this._panel     = document.getElementById('inline-scope');
    this._toggleBtn = document.getElementById('scope-toggle-btn');
    this._pauseBtn  = document.getElementById('scope-pause-btn');
    this._probeABtn = document.getElementById('probe-a-btn');
    this._probeBBtn = document.getElementById('probe-b-btn');
    this._probeABadge = document.getElementById('probe-a-badge');
    this._probeBBadge = document.getElementById('probe-b-badge');
    this._probeALoc   = document.getElementById('probe-a-loc');
    this._probeBLoc   = document.getElementById('probe-b-loc');

    // Zoom / utility controls
    this._vdivMinus   = document.getElementById('vdiv-minus');
    this._vdivPlus    = document.getElementById('vdiv-plus');
    this._vdivReadout = document.getElementById('vdiv-readout');
    this._sdivMinus   = document.getElementById('sdiv-minus');
    this._sdivPlus    = document.getElementById('sdiv-plus');
    this._sdivReadout = document.getElementById('sdiv-readout');
    this._autoBtn     = document.getElementById('scope-auto-btn');
    this._clearBtn    = document.getElementById('scope-clear-btn');
    this._metaEl      = document.getElementById('scope-meta');

    // Stats elements
    this._statCh1     = document.getElementById('stat-ch1');
    this._statA       = document.getElementById('stat-a');
    this._statB       = document.getElementById('stat-b');
    this._statVpp     = document.getElementById('stat-vpp');
    this._statVmin    = document.getElementById('stat-vmin');
    this._statVmax    = document.getElementById('stat-vmax');
    this._statSamples = document.getElementById('stat-samples');

    this._bindEvents();
    this._resizeCanvas();
    this._updateZoomReadouts();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Render the scope (call each time new samples arrive). */
  render() {
    if (!this.model.open) return;
    this.view.render(this.model);
    this._updateStats();
  }

  /** Force a resize + re-render (e.g., after window resize). */
  resize() {
    this._resizeCanvas();
    if (this.model.open) {
      this.view.render(this.model);
      this._updateStats();
    }
  }

  /** Clear the "placing probe" button highlight.
   *  Called when a probe lands OR when placement is cancelled
   *  (Esc / tool switch). */
  clearPlacingUI() {
    this._probeABtn.classList.remove('active-probe');
    this._probeBBtn.classList.remove('active-probe');
  }

  // ── Private ────────────────────────────────────────────────────────────

  _bindEvents() {
    // Open / close panel
    this._toggleBtn.addEventListener('click', () => {
      this.model.open = !this.model.open;
      this._panel.classList.toggle('open', this.model.open);
      this._toggleBtn.classList.toggle('open', this.model.open);
      // After the 0.2 s height transition the circuit canvas area has a new
      // size — resize everything, not just the scope canvas.
      setTimeout(() => {
        this._onLayoutChange();
        this._resizeCanvas();
        this.render();
      }, 230);
    });

    // Pause / resume
    this._pauseBtn.addEventListener('click', () => {
      this.model.paused = !this.model.paused;
      this._pauseBtn.textContent = this.model.paused ? 'Resume' : 'Pause';
      this._pauseBtn.classList.toggle('paused', this.model.paused);
      this.log(this.model.paused ? 'Scope paused' : 'Scope resumed');
      this.render();
    });

    // Probe A / B buttons (click again to cancel)
    this._probeABtn.addEventListener('click', () => {
      const placing = this.canvasCtrl.placingProbe === 'a' ? null : 'a';
      this._setPlacingProbe(placing);
    });
    this._probeBBtn.addEventListener('click', () => {
      const placing = this.canvasCtrl.placingProbe === 'b' ? null : 'b';
      this._setPlacingProbe(placing);
    });

    // Zoom controls
    const rezoom = () => { this._updateZoomReadouts(); this.render(); };
    this._vdivMinus.addEventListener('click', () => { this.model.vDivDown(); rezoom(); });
    this._vdivPlus .addEventListener('click', () => { this.model.vDivUp();   rezoom(); });
    this._sdivMinus.addEventListener('click', () => { this.model.sDivDown(); rezoom(); });
    this._sdivPlus .addEventListener('click', () => { this.model.sDivUp();   rezoom(); });

    this._autoBtn.addEventListener('click', () => {
      this.model.autoFitV();
      this._updateZoomReadouts();
      this.render();
      this.log(`Scope auto-fit: ${this._fmtV(this.model.vDiv)}/div`);
    });

    this._clearBtn.addEventListener('click', () => {
      this.model.reset();
      this.render();
      this.log('Scope buffer cleared');
    });
  }

  _setPlacingProbe(which) {
    this.canvasCtrl.startPlacingProbe(which);
    this._probeABtn.classList.toggle('active-probe', which === 'a');
    this._probeBBtn.classList.toggle('active-probe', which === 'b');
    if (which) this.log(`Click the circuit to place Probe ${which.toUpperCase()} (Esc to cancel)`);
    this.canvasCtrl.redraw();
  }

  _resizeCanvas() {
    const body   = document.getElementById('scope-body');
    const stats  = document.getElementById('scope-stats');
    const w      = Math.max((body.offsetWidth  || 400) - (stats.offsetWidth || 115), 80);
    const h      = Math.max(body.offsetHeight  || 120, 60);
    this.view.resize(w, h);
  }

  _fmtV(v) {
    if (v >= 1)    return `${v} V`;
    if (v >= 1e-3) return `${parseFloat((v * 1e3).toPrecision(3))} mV`;
    return `${parseFloat((v * 1e6).toPrecision(3))} µV`;
  }

  _fmtS(s) {
    if (s >= 1)    return `${s} s`;
    return `${parseFloat((s * 1e3).toPrecision(3))} ms`;
  }

  _updateZoomReadouts() {
    this._vdivReadout.textContent = this._fmtV(this.model.vDiv);
    this._sdivReadout.textContent = this._fmtS(this.model.sDiv);
    if (this._metaEl) {
      this._metaEl.textContent =
        `${Constants.SAMPLE_RATE} Sa/s · ${this._fmtV(this.model.vDiv)}/div · ` +
        `${this._fmtS(this.model.sDiv)}/div · Ch1 = A−B`;
    }
  }

  _updateStats() {
    // Keep probe badges in sync with model
    this._syncProbeBadge('a', this.model.probeA, this._probeABadge, this._probeALoc);
    this._syncProbeBadge('b', this.model.probeB, this._probeBBadge, this._probeBLoc);

    const stats = this.model.computeStats();
    const all = [this._statCh1, this._statA, this._statB, this._statVpp,
                 this._statVmin, this._statVmax, this._statSamples];
    if (!stats) {
      all.forEach(el => { if (el) el.textContent = '—'; });
      return;
    }
    const fmt = v => v.toFixed(3) + 'V';
    if (this._statCh1)     this._statCh1.textContent     = fmt(stats.current);
    if (this._statA)       this._statA.textContent       = fmt(stats.currentA);
    if (this._statB)       this._statB.textContent       = fmt(stats.currentB);
    if (this._statVpp)     this._statVpp.textContent     = fmt(stats.vpp);
    if (this._statVmin)    this._statVmin.textContent    = fmt(stats.vmin);
    if (this._statVmax)    this._statVmax.textContent    = fmt(stats.vmax);
    if (this._statSamples) this._statSamples.textContent = stats.samples;
  }

  _syncProbeBadge(which, probe, badge, locEl) {
    if (!badge || !locEl) return;
    badge.classList.toggle(`placed-${which}`, !!probe);
    // Show grid-cell coordinates, not raw pixels
    locEl.textContent = probe
      ? `(${Math.round(probe.x / Constants.CELL)}, ${Math.round(probe.y / Constants.CELL)})`
      : '—';
  }
}
