/**
 * CircuitModel.js — owns all circuit state and physics simulation.
 * Pure data + computation. No DOM access.
 * Depends on: Constants, Component
 */

class CircuitModel {
  constructor() {
    /** @type {Array<object>} list of placed components */
    this.components = [];

    /** Simulation wall-clock time (seconds since last run start) */
    this.simTime = 0;

    /** Noise level 0-1 controlled by the UI slider */
    this.noiseLevel = 0.30;
  }

  // ── Component management ───────────────────────────────────────────────

  addComponent(comp) {
    this.components.push(comp);
  }

  removeComponent(comp) {
    this.components = this.components.filter(c => c !== comp);
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

  get supplyVoltage() {
    return this.circuitActive ? this.nominalVoltage : 0;
  }

  // ── Capacitor timer resets (called when switch toggles or run restarts) ─

  resetCapacitorTimers() {
    for (const c of this.components) {
      if (c.type === 'capacitor') {
        c._chargeStart = null;
        c._dischargeStart = null;
        c._dischargeInitial = null;
      }
    }
  }

  // ── Physics tick ───────────────────────────────────────────────────────

  /**
   * Advance simulation by `dt` real seconds, consuming entropy from `getEntropy`.
   * @param {number} dt - elapsed seconds since last tick
   * @param {function} getEntropy - returns a float in [0,1]
   */
  tick(dt, getEntropy) {
    this.simTime += dt;
    const { circuitActive, supplyVoltage: supplyV, noiseLevel } = this;

    const noise = () => (getEntropy() - 0.5) * 2 * noiseLevel;

    for (const c of this.components) {
      c.noiseHighlight = false;

      switch (c.type) {
        case 'vsource':
          // Store noisy instantaneous value separately — never mutate c.voltage
          c._simV = supplyV + noise() * 0.3;
          break;

        case 'resistor': {
          const vn = noise();
          c.voltageDisplay = circuitActive
            ? (supplyV * 0.5 + vn * 0.3).toFixed(2)
            : '0.00';
          if (circuitActive && Math.abs(vn) > noiseLevel * 0.7) c.noiseHighlight = true;
          break;
        }

        case 'capacitor': {
          const R = this._totalResistance();
          const C = c.capacitance || 100e-6;
          const tau = Math.max(R * C, 0.001);

          if (circuitActive) {
            if (c._chargeStart == null) c._chargeStart = this.simTime;
            const elapsed = this.simTime - c._chargeStart;
            const base = 1 - Math.exp(-elapsed / tau);
            c.charge = Math.min(1, Math.max(0, base + noise() * 0.005));
          } else {
            if (c._dischargeStart == null) {
              c._dischargeStart = this.simTime;
              c._dischargeInitial = c.charge || 0;
            }
            const elapsed = this.simTime - c._dischargeStart;
            c.charge = Math.max(0, (c._dischargeInitial || 0) * Math.exp(-elapsed / tau));
            if (c.charge < 0.0005) c.charge = 0;
          }
          break;
        }

        case 'led': {
          const ev = supplyV + noise() * 0.8;
          c.on = circuitActive && ev > 2.0;
          if (c.on) {
            c.brightness = Math.min(1, Math.max(0, (ev - 2) / 3 + noise() * 0.15));
            // Quantum flicker at high noise
            if (noiseLevel > 0.5 && Math.abs(noise()) > 0.6) c.on = !c.on;
          }
          break;
        }

        case 'inductor':
          c.noiseHighlight = circuitActive && noiseLevel > 0.4 && Math.random() < noiseLevel * 0.1;
          break;
      }
    }
  }

  /**
   * Return the voltage at a snapped grid point using a BFS node-graph traversal.
   *
   * Strategy:
   *  1. Collect every grid point (node) reachable from `pt` via wires.
   *  2. For each node in that connected set, inspect all component terminals
   *     that land on it and return the first definitive voltage found
   *     (ground → 0 V, vsource terminal → nominal V or 0, capacitor plate, etc.)
   *  3. If no definitive source is found on the connected set, return supplyV * 0.5
   *     as a floating-node estimate.
   *
   * This correctly handles probes placed anywhere on a wire net, not just
   * exactly on a component terminal.
   *
   * @param {{x:number, y:number}|null} pt
   * @returns {number} voltage in volts
   */
  nodeVoltage(pt) {
    if (!pt) return 0;
    const { circuitActive, supplyVoltage: supplyV } = this;

    // Snap threshold: half a cell — tight enough to avoid false matches,
    // loose enough to forgive sub-pixel rounding.
    const T = Constants.CELL * 0.6;

    // ── Step 1: BFS to collect all grid nodes connected to pt via wires ──
    const key     = p => `${p.x},${p.y}`;
    const visited = new Set();
    const queue   = [{ x: pt.x, y: pt.y }];
    visited.add(key(pt));

    while (queue.length) {
      const cur = queue.shift();
      for (const c of this.components) {
        if (c.type !== 'wire') continue;
        // If cur is near x1, add x2 (and vice-versa)
        const near1 = Math.hypot(cur.x - c.x1, cur.y - c.y1) < T;
        const near2 = Math.hypot(cur.x - c.x2, cur.y - c.y2) < T;
        if (near1) {
          const nk = key({ x: c.x2, y: c.y2 });
          if (!visited.has(nk)) { visited.add(nk); queue.push({ x: c.x2, y: c.y2 }); }
        }
        if (near2) {
          const nk = key({ x: c.x1, y: c.y1 });
          if (!visited.has(nk)) { visited.add(nk); queue.push({ x: c.x1, y: c.y1 }); }
        }
        // Also: if the probe snaps onto the wire body (not just its endpoints),
        // treat both endpoints as reachable.
        const dx = c.x2 - c.x1, dy = c.y2 - c.y1;
        const l2 = dx * dx + dy * dy;
        if (l2 > 0) {
          const tt = Math.max(0, Math.min(1, ((cur.x - c.x1) * dx + (cur.y - c.y1) * dy) / l2));
          const px = c.x1 + tt * dx, py = c.y1 + tt * dy;
          if (Math.hypot(cur.x - px, cur.y - py) < T) {
            for (const ep of [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }]) {
              const nk = key(ep);
              if (!visited.has(nk)) { visited.add(nk); queue.push(ep); }
            }
          }
        }
      }
    }

    // Convert visited set to array of {x,y}
    const nodes = Array.from(visited).map(k => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });

    // ── Step 2: check ground first (highest priority) ──
    for (const node of nodes) {
      for (const c of this.components) {
        if (c.type !== 'ground') continue;
        if (Math.hypot(node.x - c.x1, node.y - c.y1) < T) return 0;
        if (Math.hypot(node.x - c.x2, node.y - c.y2) < T) return 0;
      }
    }

    // ── Step 3: scan component terminals on the connected node set ──
    //
    // IMPORTANT: capacitor voltage is read even when the circuit is inactive
    // (switch open / no source) so that discharge curves appear correctly on
    // the oscilloscope.  All other active-source-dependent voltages are gated
    // behind circuitActive below.
    for (const node of nodes) {
      for (const c of this.components) {
        const d1 = Math.hypot(node.x - c.x1, node.y - c.y1);
        const d2 = Math.hypot(node.x - c.x2, node.y - c.y2);
        const dist    = Math.min(d1, d2);
        const nearest = d1 <= d2 ? 'x1' : 'x2';
        if (dist >= T) continue;

        // Capacitor plates retain their charge whether or not the circuit
        // is currently active — read c.charge unconditionally.
        if (c.type === 'capacitor') {
          // c.charge is 0→1 fraction of supplyV at the time of last charge.
          // Use nominalVoltage (the user-set value) so discharge reads correctly
          // even when supplyV has dropped to 0 because the switch is open.
          const vcap = (c.charge || 0) * this.nominalVoltage;
          // x2 = high plate, x1 = low/ground plate
          return nearest === 'x2' ? vcap : 0;
        }

        // Everything else only makes sense when the source is driving the circuit
        if (!circuitActive) continue;

        switch (c.type) {
          case 'vsource':
            // x2 = + terminal, x1 = − terminal
            return nearest === 'x2' ? (c.voltage || supplyV) : 0;

          case 'resistor':
            // Series divider approximation: x1 = supply side, x2 = load side
            return nearest === 'x1' ? supplyV : supplyV * 0.5;

          case 'led':
            return c.on ? (c.brightness || 0) * 3 + 2 : 0;

          case 'inductor':
            return nearest === 'x1' ? supplyV : supplyV * 0.5;
        }
      }
    }

    // ── Step 4: no definitive source found ──
    // If the circuit is active return a floating-node mid-rail estimate;
    // if inactive (switch open, no source) the node is truly at 0 V.
    return circuitActive ? supplyV * 0.5 : 0;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /** Sum of all resistor values in the circuit (series approximation). */
  _totalResistance() {
    return this.components
      .filter(c => c.type === 'resistor')
      .reduce((sum, c) => sum + (c.resistance || 1000), 0) || 1000;
  }
}
