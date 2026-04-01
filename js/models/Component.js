/**
 * Component.js — factory and helpers for individual circuit components.
 * Depends on: Constants
 */

const Component = (() => {

  /**
   * Create a new component object with sensible defaults.
   * @param {string} type  - one of the known component types
   * @param {number} x1,y1 - first endpoint (snapped grid coords)
   * @param {number} x2,y2 - second endpoint
   * @param {number} rotation - 0-3 (multiples of 90°)
   */
  function create(type, x1, y1, x2, y2, rotation = 0) {
    const base = { type, x1, y1, x2, y2, rotation };

    // Apply editable-value defaults from COMP_META
    const meta = Constants.COMP_META[type];
    if (meta) base[meta.prop] = meta.defaultVal;

    // Type-specific extra state
    switch (type) {
      case 'capacitor':
        return { ...base, charge: 0, _chargeStart: null, _dischargeStart: null, _dischargeInitial: null };
      case 'led':
        return { ...base, on: false, brightness: 0, color: '#ff9955' };
      case 'switch':
        return { ...base, closed: false };
      case 'vsource':
        return { ...base, _simV: 0 };
      default:
        return base;
    }
  }

  /**
   * Format a raw SI value into a human-readable string.
   * e.g.  0.001 Ω → "1 mΩ",  4700 Ω → "4.7 kΩ"
   */
  function formatValue(v, unit) {
    if (v === 0) return `0 ${unit}`;
    const abs = Math.abs(v);
    let best = Constants.PREFIXES[3]; // base
    for (const p of Constants.PREFIXES) {
      if (abs / p.value >= 0.9999 && abs / p.value < 1000) best = p;
    }
    const sym = best.label === '—' ? '' : best.label;
    return `${parseFloat((v / best.value).toPrecision(4))} ${sym}${unit}`;
  }

  /**
   * Return the display label for a component's editable value,
   * or null if the type has no editable value.
   */
  function getLabel(comp) {
    const meta = Constants.COMP_META[comp.type];
    if (!meta) return null;
    const raw = comp[meta.prop] != null ? comp[meta.prop] : meta.defaultVal;
    return formatValue(raw, meta.unit);
  }

  /**
   * Distance from point (px, py) to line segment (x1,y1)-(x2,y2).
   */
  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /**
   * Find the component closest to (x, y) within `thresh` pixels.
   */
  function nearest(components, x, y, thresh = 16) {
    let best = null, bd = Infinity;
    for (const c of components) {
      const d = distToSegment(x, y, c.x1, c.y1, c.x2, c.y2);
      if (d < bd && d < thresh) { bd = d; best = c; }
    }
    return best;
  }

  /**
   * Rotate a placed component 90° CCW around its midpoint.
   */
  function rotate(comp) {
    const mx = (comp.x1 + comp.x2) / 2;
    const my = (comp.y1 + comp.y2) / 2;
    const dx = comp.x2 - comp.x1;
    const dy = comp.y2 - comp.y1;
    comp.x1 = mx + dy / 2;
    comp.y1 = my - dx / 2;
    comp.x2 = mx - dy / 2;
    comp.y2 = my + dx / 2;
    comp.rotation = ((comp.rotation || 0) + 1) % 4;
  }

  return { create, formatValue, getLabel, distToSegment, nearest, rotate };
})();
