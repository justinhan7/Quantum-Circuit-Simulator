/**
 * SimulationController.js — owns the requestAnimationFrame loop.
 * Drives CircuitModel.tick(), EntropyModel, ScopeModel sampling,
 * and triggers view re-renders.
 * Depends on: Constants, CircuitModel, ScopeModel, EntropyModel
 *
 * v2 fixes:
 *  • Physics + scope sampling now run on a FIXED sub-step of
 *    1/SAMPLE_RATE seconds (accumulator pattern), so:
 *      – the scope genuinely samples at 500 Sa/s (old code: ~60 Sa/s),
 *      – RC / RL transients integrate accurately regardless of frame rate.
 *  • Frame dt is clamped so a backgrounded tab doesn't produce a huge
 *    catch-up burst or an unstable step.
 *  • Entropy refills on a real wall-clock throttle instead of the fragile
 *    `simTime % 2 < dt` trick, and repeated fallback messages don't spam
 *    the log.
 */

class SimulationController {
  /**
   * @param {CircuitModel}    circuitModel
   * @param {ScopeModel}      scopeModel
   * @param {EntropyModel}    entropyModel
   * @param {object}          callbacks
   *   .onTick()          — called each animation frame (for view redraws)
   *   .onLog(msg)        — sim log
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
    this._accumulator = 0;      // un-simulated real time (s)
    this._lastFetchAt = 0;      // wall-clock ms of last entropy fetch
    this._fetchInFlight = false;
    this._wasFallback = null;   // for de-duplicating log messages

    // DOM refs
    this._runBtn = document.getElementById('run-btn');
    this._dot    = document.getElementById('sim-dot');
    this._label  = document.getElementById('sim-label');

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
      this._wasFallback = this.entropy.usingFallback;
      this._lastFetchAt = performance.now();
    }

    // Reset sim state
    this.circuit.simTime = 0;
    this.circuit.resetDynamicState();
    this.scope.reset();
    this._lastTs = 0;
    this._accumulator = 0;

    this.cb.onLog('Simulation started');
    this._animFrame = requestAnimationFrame(ts => this._loop(ts));
  }

  _stop() {
    this.running = false;
    cancelAnimationFrame(this._animFrame);
    this._lastTs = 0;
    this._accumulator = 0;

    this._runBtn.textContent = 'Run simulation';
    this._runBtn.classList.remove('running');
    this._dot.classList.remove('running');
    this._label.textContent = 'Stopped';
    this.cb.onLog('Simulation stopped');
  }

  _loop(ts) {
    if (!this.running) return;

    let dtMs = this._lastTs ? ts - this._lastTs : 0;
    this._lastTs = ts;

    // Clamp: if the tab was hidden, don't try to catch up a giant gap
    dtMs = Math.min(dtMs, 100);
    this._accumulator += dtMs / 1000;

    const STEP = 1 / Constants.SAMPLE_RATE;
    const MAX_STEPS_PER_FRAME = 60; // safety valve against a death spiral
    let steps = 0;

    while (this._accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
      this._accumulator -= STEP;
      steps++;

      // Advance physics one fixed sub-step (real MNA solve inside)
      this.circuit.tick(STEP, () => this.entropy.get());

      // One scope sample per sub-step → true SAMPLE_RATE
      const { probeA, probeB } = this.scope;
      if ((probeA || probeB) && !this.scope.paused) {
        const va = this.circuit.nodeVoltage(probeA);
        const vb = this.circuit.nodeVoltage(probeB);
        const qn = (this.entropy.get() - 0.5) * this.circuit.noiseLevel * 0.08;
        this.scope.addSample(this.circuit.simTime, va, vb, qn);
      }
    }
    if (steps === MAX_STEPS_PER_FRAME) this._accumulator = 0; // drop backlog

    // Entropy refill: at most one in-flight fetch, every 3 s wall-clock
    const now = performance.now();
    if (!this._fetchInFlight && this.entropy.buffered < 128 && now - this._lastFetchAt > 3000) {
      this._fetchInFlight = true;
      this._lastFetchAt = now;
      this.entropy.fetch().then(msg => {
        this._fetchInFlight = false;
        // Only log when the source status changes (avoids log spam)
        if (this._wasFallback !== this.entropy.usingFallback) {
          this.cb.onLog(msg);
          this._wasFallback = this.entropy.usingFallback;
        }
        this.cb.onEntropyUpdate();
      }).catch(() => { this._fetchInFlight = false; });
    }

    // Notify views once per frame
    this.cb.onTick();

    this._animFrame = requestAnimationFrame(t => this._loop(t));
  }
}
