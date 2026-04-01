/**
 * ScopeController.js — manages the oscilloscope panel UI:
 * open/close, pause, zoom controls, probe placement buttons,
 * and updating the stats display.
 * Depends on: Constants, Component, ScopeModel, ScopeView
 */

class ScopeController {
  /**
   * @param {ScopeModel}       scopeModel
   * @param {ScopeView}        scopeView
   * @param {CanvasController} canvasCtrl
   * @param {function}         onLog
   */
  constructor(scopeModel, scopeView, canvasCtrl, onLog) {
    this.model      = scopeModel;
    this.view       = scopeView;
    this.canvasCtrl = canvasCtrl;
    this.log        = onLog;

    this._panel     = document.getElementById('inline-scope');
    this._toggleBtn = document.getElementById('scope-toggle-btn');
    this._pauseBtn  = document.getElementById('scope-pause-btn');
    this._probeABtn = document.getElementById('probe-a-btn');
    this._probeBBtn = document.getElementById('probe-b-btn');
    this._probeABadge = document.getElementById('probe-a-badge');
    this._probeBBadge = document.getElementById('probe-b-badge');
    this._probeALoc   = document.getElementById('probe-a-loc');
    this._probeBLoc   = document.getElementById('probe-b-loc');

    // Stats elements
    this._statCh1     = document.getElementById('stat-ch1');
    this._statVpp     = document.getElementById('stat-vpp');
    this._statVmin    = document.getElementById('stat-vmin');
    this._statVmax    = document.getElementById('stat-vmax');
    this._statSamples = document.getElementById('stat-samples');

    this._bindEvents();
    this._resizeCanvas();
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
    this.render();
  }

  // ── Private ────────────────────────────────────────────────────────────

  _bindEvents() {
    // Open / close panel
    this._toggleBtn.addEventListener('click', () => {
      this.model.open = !this.model.open;
      this._panel.classList.toggle('open', this.model.open);
      this._toggleBtn.classList.toggle('open', this.model.open);
      if (this.model.open) {
        setTimeout(() => { this._resizeCanvas(); this.render(); }, 210);
      }
    });

    // Pause / resume
    this._pauseBtn.addEventListener('click', () => {
      this.model.paused = !this.model.paused;
      this._pauseBtn.textContent = this.model.paused ? 'Resume' : 'Pause';
      this._pauseBtn.classList.toggle('paused', this.model.paused);
      this.log(this.model.paused ? 'Scope paused' : 'Scope resumed');
      if (!this.model.paused) this.render();
    });

    // Probe A button
    this._probeABtn.addEventListener('click', () => {
      const placing = this.canvasCtrl.placingProbe === 'a' ? null : 'a';
      this._setPlacingProbe(placing);
    });

    // Probe B button
    this._probeBBtn.addEventListener('click', () => {
      const placing = this.canvasCtrl.placingProbe === 'b' ? null : 'b';
      this._setPlacingProbe(placing);
    });

    // Observe probe placements so we can update badges
    // (CanvasController mutates scopeModel.probeA/B directly; we poll via render)
  }

  _setPlacingProbe(which) {
    this.canvasCtrl.startPlacingProbe(which);
    this._probeABtn.classList.toggle('active-probe', which === 'a');
    this._probeBBtn.classList.toggle('active-probe', which === 'b');
    if (which) this.log(`Click circuit to place Probe ${which.toUpperCase()}`);
    this.canvasCtrl.redraw();
  }

  /** Called by CanvasController (via app.js callback) once a probe is placed. */
  clearPlacingUI() {
    this._probeABtn.classList.remove('active-probe');
    this._probeBBtn.classList.remove('active-probe');
  }

  _resizeCanvas() {
    const body   = document.getElementById('scope-body');
    const stats  = document.getElementById('scope-stats');
    const w      = Math.max((body.offsetWidth  || 400) - (stats.offsetWidth || 115), 80);
    const h      = Math.max(body.offsetHeight  || 120, 60);
    this.view.resize(w, h);
  }

  _updateStats() {
    // Keep probe badges in sync with model
    this._syncProbeBadge('a', this.model.probeA, this._probeABadge, this._probeALoc);
    this._syncProbeBadge('b', this.model.probeB, this._probeBBadge, this._probeBLoc);

    const stats = this.model.computeStats();
    if (!stats) {
      [this._statCh1, this._statVpp, this._statVmin, this._statVmax, this._statSamples]
        .forEach(el => { if (el) el.textContent = '—'; });
      return;
    }
    const fmt = v => v.toFixed(3) + 'V';
    if (this._statCh1)     this._statCh1.textContent     = fmt(stats.current);
    if (this._statVpp)     this._statVpp.textContent     = fmt(stats.vpp);
    if (this._statVmin)    this._statVmin.textContent    = fmt(stats.vmin);
    if (this._statVmax)    this._statVmax.textContent    = fmt(stats.vmax);
    if (this._statSamples) this._statSamples.textContent = stats.samples;
  }

  _syncProbeBadge(which, probe, badge, locEl) {
    if (!badge || !locEl) return;
    badge.classList.toggle(`placed-${which}`, !!probe);
    locEl.textContent = probe ? `(${probe.x}, ${probe.y})` : '—';
  }
}
