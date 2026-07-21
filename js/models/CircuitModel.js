/**
 * CircuitModel.js — owns all circuit state and physics simulation.
 * Pure data + computation. No DOM access.
 * Depends on: Constants, Component
 *
 * v2 REWRITE: the old nodeVoltage() walked wires with a BFS and then returned
 * the first hard-coded guess it found (supplyV, supplyV*0.5, …), which made
 * oscilloscope reads order-dependent and wrong for most circuits.
 *
 * This version builds a real netlist every tick and solves it with Modified
 * Nodal Analysis (MNA):
 *   • wires / closed switches      → node merges (union-find)
 *   • ground                       → 0 V reference
 *   • resistors                    → conductance stamps
 *   • voltage sources              → ideal sources (extra current unknown)
 *   • capacitors                   → backward-Euler companion model (real RC
 *                                    charge AND discharge curves)
 *   • inductors                    → backward-Euler companion model
 *   • LEDs                         → piecewise-linear diode (Vf + Rs when on),
 *                                    solved with a small on/off iteration
 *
 * Probes therefore read the true node voltage of whatever net they sit on,
 * for any circuit topology. Quantum entropy perturbs the source each step so
 * the noise you see on the scope is physically propagated, not painted on.
 */

class CircuitModel {
  constructor() {
    /** @type {Array<object>} list of placed components */
    this.components = [];

    /** Simulation wall-clock time (seconds since last run start) */
    this.simTime = 0;

    /** Noise level 0-1 controlled by the UI slider */
    this.noiseLevel = 0.30;

    /** Solved state from the most recent step (used by nodeVoltage) */
    this._solution = null;   // { netOf: Map<key,netId>, voltages: Float64Array, wires: [...] }
  }

  // ── Component management ───────────────────────────────────────────────

  addComponent(comp) {
    this.components.push(comp);
    this._solution = null; // topology changed — stale solve must not be read
  }

  removeComponent(comp) {
    this.components = this.components.filter(c => c !== comp);
    this._solution = null;
  }

  // ── Circuit state queries ──────────────────────────────────────────────

  get hasSource() {
    return this.components.some(c => c.type === 'vsource');
  }

  get switchOpen() {
    return this.components.some(c => c.type === 'switch' && !c.closed);
  }

  get circuitActive() {
    return this.hasSource && !this.switchOpen;
  }

  get nominalVoltage() {
    const vsrc = this.components.find(c => c.type === 'vsource');
    return vsrc ? (vsrc.voltage || 5) : 5;
  }

  // ── Dynamic-state reset (called when a run starts) ─────────────────────

  resetDynamicState() {
    for (const c of this.components) {
      if (c.type === 'capacitor') { c._vPrev = 0; c.charge = 0; }
      if (c.type === 'inductor')  { c._iPrev = 0; }
      if (c.type === 'led')       { c.on = false; c.brightness = 0; }
    }
    this._solution = null;
  }

  /** Back-compat alias (older controllers called this on switch toggles).
   *  With the real solver, switch transients are handled physically, so a
   *  toggle no longer needs to reset anything. */
  resetCapacitorTimers() {}

  // ── Physics step ───────────────────────────────────────────────────────

  /**
   * Advance simulation by `dt` seconds, consuming entropy from `getEntropy`.
   * Call with small fixed dt (SimulationController sub-steps at the scope
   * sample rate) for accurate RC/RL curves.
   * @param {number} dt - elapsed seconds
   * @param {function} getEntropy - returns a float in [0,1]
   */
  tick(dt, getEntropy) {
    this.simTime += dt;
    dt = Math.max(dt, 1e-6);

    const noise = () => (getEntropy() - 0.5) * 2 * this.noiseLevel;

    // Per-step noisy source voltage (quantum entropy physically drives this)
    for (const c of this.components) {
      if (c.type === 'vsource') {
        c._simV = (c.voltage || 5) + noise() * 0.5;
      }
      c.noiseHighlight = false;
    }

    const sol = this._solve(dt);
    this._solution = sol;

    // ── Update component display state from the real solution ──
    for (const c of this.components) {
      const va = sol ? sol.voltAt(c.x1, c.y1) : 0;
      const vb = sol ? sol.voltAt(c.x2, c.y2) : 0;
      const vAcross = va - vb;

      switch (c.type) {
        case 'resistor': {
          c.voltageDisplay = Math.abs(vAcross).toFixed(2);
          const i = Math.abs(vAcross) / Math.max(c.resistance || 1000, 1e-3);
          c.noiseHighlight = i > 1e-6 && Math.abs(noise()) > this.noiseLevel * 0.7 && this.noiseLevel > 0.05;
          break;
        }

        case 'capacitor': {
          // _vPrev was updated inside _solve; charge is a 0-1 display fraction
          const ref = Math.max(Math.abs(this.nominalVoltage), 0.001);
          c.charge = Math.min(1, Math.abs(c._vPrev || 0) / ref);
          break;
        }

        case 'led': {
          // on/off + current were decided by the diode iteration in _solve
          const i = c._iLed || 0;
          c.on = i > 1e-5;
          c.brightness = c.on ? Math.min(1, i / 0.02) : 0; // 20 mA = full brightness
          break;
        }

        case 'inductor':
          c.noiseHighlight = Math.abs(c._iPrev || 0) > 1e-6 &&
                             this.noiseLevel > 0.4 && Math.abs(noise()) > 0.6;
          break;
      }
    }
  }

  /**
   * Voltage at a snapped grid point, from the latest solve.
   * Reads the true net voltage anywhere on a wire or terminal.
   * Returns 0 for floating / unconnected points.
   * @param {{x:number, y:number}|null} pt
   * @returns {number} volts
   */
  nodeVoltage(pt) {
    if (!pt || !this._solution) return 0;
    return this._solution.voltAtPoint(pt.x, pt.y);
  }

  // ── Private: netlist construction + MNA solve ──────────────────────────

  _key(x, y) {
    const CELL = Constants.CELL;
    return `${Math.round(x / CELL)},${Math.round(y / CELL)}`;
  }

  _solve(dt) {
    const comps = this.components;
    if (comps.length === 0) return null;

    // ── 1. Collect terminal nodes (union-find over snapped grid keys) ──
    const parent = new Map();
    const find = k => {
      let r = k;
      while (parent.get(r) !== r) r = parent.get(r);
      // path compression
      let c = k;
      while (parent.get(c) !== c) { const n = parent.get(c); parent.set(c, r); c = n; }
      return r;
    };
    const addNode = k => { if (!parent.has(k)) parent.set(k, k); };
    const union = (a, b) => { addNode(a); addNode(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

    for (const c of comps) {
      const k1 = this._key(c.x1, c.y1);
      const k2 = this._key(c.x2, c.y2);
      addNode(k1); addNode(k2);
      if (c.type === 'wire') union(k1, k2);
      if (c.type === 'switch' && c.closed) union(k1, k2);
      if (c.type === 'ground') union(k1, k2); // whole symbol is the 0 V rail
    }

    // Points that lie on the BODY of a wire also join that wire's net —
    // probes and terminals dropped mid-wire must read correctly.
    const wires = comps.filter(c => c.type === 'wire');
    const T = Constants.CELL * 0.55;
    const allKeys = Array.from(new Set(Array.from(parent.keys())));
    for (const k of allKeys) {
      const [gx, gy] = k.split(',').map(Number);
      const px = gx * Constants.CELL, py = gy * Constants.CELL;
      for (const w of wires) {
        if (Component.distToSegment(px, py, w.x1, w.y1, w.x2, w.y2) < T) {
          union(k, this._key(w.x1, w.y1));
        }
      }
    }

    // ── 2. Assign net ids; pick the reference (0 V) net ──
    const netOf = new Map();  // root key → net id
    let refRoot = null;

    for (const c of comps) {
      if (c.type === 'ground') { refRoot = find(this._key(c.x1, c.y1)); break; }
    }
    if (refRoot === null) {
      // No ground symbol: use the first source's − terminal as reference so
      // simple loops without an explicit ground still read intuitively.
      const v = comps.find(c => c.type === 'vsource');
      if (v) refRoot = find(this._key(v.x1, v.y1));
    }

    let nNets = 0;
    for (const k of parent.keys()) {
      const r = find(k);
      if (netOf.has(r)) continue;
      if (r === refRoot) netOf.set(r, -1);
      else netOf.set(r, nNets++);
    }

    const netAtKey = k => {
      const r = find(k);
      return netOf.has(r) ? netOf.get(r) : null;
    };

    const vsources  = comps.filter(c => c.type === 'vsource');
    const nUnknowns = nNets + vsources.length;
    if (nUnknowns === 0) return this._emptySolution(netAtKey, wires, new Float64Array(0));

    // ── 3. Assemble + solve MNA (iterate for LED on/off states) ──
    const leds = comps.filter(c => c.type === 'led');
    for (const l of leds) if (l._ledOn === undefined) l._ledOn = false;

    const VF = 1.9, RS = 15, G_OFF = 1e-9, G_LEAK = 1e-9;
    let x = null;

    for (let iter = 0; iter < 8; iter++) {
      const A = Array.from({ length: nUnknowns }, () => new Float64Array(nUnknowns));
      const b = new Float64Array(nUnknowns);

      const stampG = (na, nb, g) => {
        if (na >= 0) A[na][na] += g;
        if (nb >= 0) A[nb][nb] += g;
        if (na >= 0 && nb >= 0) { A[na][nb] -= g; A[nb][na] -= g; }
      };
      const stampI = (na, nb, i) => { // current i injected into na, out of nb
        if (na >= 0) b[na] += i;
        if (nb >= 0) b[nb] -= i;
      };

      // Tiny leak to reference keeps floating nets well-defined (≈0 V)
      for (let n = 0; n < nNets; n++) A[n][n] += G_LEAK;

      let vsIdx = 0;
      for (const c of comps) {
        const na = netAtKey(this._key(c.x1, c.y1));
        const nb = netAtKey(this._key(c.x2, c.y2));
        if (na === null || nb === null) continue;

        switch (c.type) {
          case 'resistor':
            stampG(na, nb, 1 / Math.max(c.resistance || 1000, 1e-3));
            break;

          case 'capacitor': {
            const C = Math.max(c.capacitance || 100e-6, 1e-15);
            const g = C / dt;
            stampG(na, nb, g);
            stampI(na, nb, g * (c._vPrev || 0)); // Norton companion
            break;
          }

          case 'inductor': {
            const L = Math.max(c.inductance || 10e-3, 1e-12);
            const g = dt / L;
            stampG(na, nb, g);
            stampI(nb, na, c._iPrev || 0); // prior current keeps flowing a→b
            break;
          }

          case 'led': {
            if (c._ledOn) {
              const g = 1 / RS;
              stampG(na, nb, g);
              stampI(na, nb, g * VF); // series Vf drop, anode(x1)→cathode(x2)
            } else {
              stampG(na, nb, G_OFF);
            }
            break;
          }

          case 'vsource': {
            const k = nNets + vsIdx++;
            // Constraint: V(x2) − V(x1) = simV   (x2 is the + terminal)
            if (nb >= 0) { A[nb][k] += 1; A[k][nb] += 1; }
            if (na >= 0) { A[na][k] -= 1; A[k][na] -= 1; }
            b[k] = c._simV != null ? c._simV : (c.voltage || 5);
            break;
          }
        }
      }

      x = this._gauss(A, b, nUnknowns);
      if (!x) return null;

      // Re-evaluate LED on/off states; stop when stable
      let changed = false;
      for (const l of leds) {
        const na = netAtKey(this._key(l.x1, l.y1));
        const nb = netAtKey(this._key(l.x2, l.y2));
        if (na === null || nb === null) continue;
        const va = na >= 0 ? x[na] : 0;
        const vb = nb >= 0 ? x[nb] : 0;
        const vAcross = va - vb;
        if (!l._ledOn && vAcross > VF + 0.01) { l._ledOn = true;  changed = true; }
        else if (l._ledOn) {
          const i = (vAcross - VF) / RS;
          if (i < 0) { l._ledOn = false; changed = true; }
        }
      }
      if (!changed) break;
    }

    // ── 4. Commit dynamic state from the converged solution ──
    const voltAtNet = n => (n === -1 ? 0 : (n !== null && n >= 0 ? x[n] : 0));

    for (const c of comps) {
      const na = netAtKey(this._key(c.x1, c.y1));
      const nb = netAtKey(this._key(c.x2, c.y2));
      const va = voltAtNet(na), vb = voltAtNet(nb);
      const vAcross = (na === null || nb === null) ? 0 : va - vb;

      if (c.type === 'capacitor') c._vPrev = vAcross;
      if (c.type === 'inductor') {
        const L = Math.max(c.inductance || 10e-3, 1e-12);
        c._iPrev = (c._iPrev || 0) + (dt / L) * vAcross;
      }
      if (c.type === 'led') {
        c._iLed = c._ledOn ? Math.max(0, (vAcross - VF) / RS) : 0;
      }
    }

    // ── 5. Build the probe-lookup solution object ──
    const model = this;
    return {
      voltAt(px, py) {
        const n = netAtKey(model._key(px, py));
        return voltAtNet(n);
      },
      voltAtPoint(px, py) {
        // Exact grid node first
        const n = netAtKey(model._key(px, py));
        if (n !== null) return voltAtNet(n);
        // Otherwise: point resting on a wire body reads that wire's net
        for (const w of wires) {
          if (Component.distToSegment(px, py, w.x1, w.y1, w.x2, w.y2) < T) {
            return voltAtNet(netAtKey(model._key(w.x1, w.y1)));
          }
        }
        return 0;
      },
    };
  }

  _emptySolution() {
    return { voltAt: () => 0, voltAtPoint: () => 0 };
  }

  /** Gaussian elimination with partial pivoting. Returns solution or null. */
  _gauss(A, b, n) {
    for (let col = 0; col < n; col++) {
      // pivot
      let piv = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      }
      if (Math.abs(A[piv][col]) < 1e-14) continue; // singular column → leave 0
      if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; const tb = b[piv]; b[piv] = b[col]; b[col] = tb; }
      // eliminate
      for (let r = col + 1; r < n; r++) {
        const f = A[r][col] / A[col][col];
        if (f === 0) continue;
        for (let cc = col; cc < n; cc++) A[r][cc] -= f * A[col][cc];
        b[r] -= f * b[col];
      }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let cc = r + 1; cc < n; cc++) s -= A[r][cc] * x[cc];
      x[r] = Math.abs(A[r][r]) < 1e-14 ? 0 : s / A[r][r];
      if (!isFinite(x[r])) x[r] = 0;
    }
    return x;
  }
}
