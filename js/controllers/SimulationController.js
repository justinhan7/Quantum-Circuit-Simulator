/**
 * SimulationController.js — owns the requestAnimationFrame loop.
 * Drives CircuitModel.tick(), EntropyModel, ScopeModel sampling,
 * and triggers view re-renders.
 * Depends on: Constants, CircuitModel, ScopeModel, EntropyModel
 */

class SimulationController {
  /**
   * @param {CircuitModel}    circuitModel
   * @param {ScopeModel}      scopeModel
   * @param {EntropyModel}    entropyModel
   * @param {object}          callbacks
   *   .onTick()       — called each animation frame (for view redraws)
   *   .onLog(msg)     — sim log
   *   .onEntropyUpdate() — entropy bar refresh
   */
  constructor(circuitModel, scopeModel, entropyModel, callbacks) {
    this.circuit  = circuitModel;
    this.scope    = scopeModel;
    this.entropy  = entropyModel;
    this.cb       = callbacks;

    this.running      = false;
    this._animFrame   = null;
    this._lastTs      = 0;

    // DOM refs
    this._runBtn   = document.getElementById('run-btn');
    this._dot      = document.getElementById('sim-dot');
    this._label    = document.getElementById('sim-label');

    this._bindEvents();
  }

  // ── Public ─────────────────────────────────────────────────────────────

  get isRunning() { return this.running; }

  // ── Private ────────────────────────────────────────────────────────────

  _bindEvents() {
    this._runBtn.addEventListener('click', () => {
      if (this.running) this._stop(); else this._start();
    });
  }

  async _start() {
    this.running = true;
    this._runBtn.textContent = 'Stop simulation';
    this._runBtn.classList.add('running');
    this._dot.classList.add('running');
    this._label.textContent = 'Running';

    // Pre-fill entropy buffer
    if (this.entropy.buffered < 10) {
      const msg = await this.entropy.fetch();
      this.cb.onLog(msg);
      this.cb.onEntropyUpdate();
    }

    // Reset sim state
    this.circuit.simTime = 0;
    this.circuit.resetCapacitorTimers();
    this.scope.reset();
    this._lastTs = 0;

    this.cb.onLog('Simulation started');
    this._animFrame = requestAnimationFrame(ts => this._loop(ts));
  }

  _stop() {
    this.running = false;
    cancelAnimationFrame(this._animFrame);
    this._lastTs = 0;

    this._runBtn.textContent = 'Run simulation';
    this._runBtn.classList.remove('running');
    this._dot.classList.remove('running');
    this._label.textContent = 'Stopped';
    this.cb.onLog('Simulation stopped');
  }

  _loop(ts) {
    if (!this.running) return;

    const dtMs = this._lastTs ? ts - this._lastTs : 0;
    this._lastTs = ts;
    const dt = dtMs / 1000;

    // Advance physics
    this.circuit.tick(dt, () => this.entropy.get());

    // Sample oscilloscope probes
    const { probeA, probeB } = this.scope;
    const va  = this.circuit.nodeVoltage(probeA);
    const vb  = this.circuit.nodeVoltage(probeB);
    const qn  = (this.entropy.get() - 0.5) * this.circuit.noiseLevel * 0.08;
    this.scope.maybeSample(this.circuit.simTime, va, vb, qn);

    // Entropy refill (every ~2 sim seconds)
    if (this.entropy.buffered < 32 && this.circuit.simTime % 2 < dt + 0.002) {
      this.entropy.fetch().then(msg => {
        this.cb.onLog(msg);
        this.cb.onEntropyUpdate();
      });
    }

    // Notify views
    this.cb.onTick();

    this._animFrame = requestAnimationFrame(ts => this._loop(ts));
  }
}
