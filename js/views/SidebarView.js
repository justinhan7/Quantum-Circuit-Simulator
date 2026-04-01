/**
 * SidebarView.js — updates sidebar DOM elements.
 * No canvas access. Pure DOM manipulation.
 * Depends on: Constants, Component
 */

class SidebarView {
  constructor() {
    this.propsPanel    = document.getElementById('props-panel');
    this.noiseSlider   = document.getElementById('noise-slider');
    this.noiseVal      = document.getElementById('noise-val');
    this.entropyFill   = document.getElementById('entropy-fill');
    this.entropyStatus = document.getElementById('entropy-status');
    this.entropyCount  = document.getElementById('entropy-count');
    this.simLog        = document.getElementById('sim-log');
    this.compCount     = document.getElementById('comp-count');
  }

  // ── Properties panel ──────────────────────────────────────────────────

  /**
   * Render component properties into the sidebar panel.
   * @param {object|null} comp - selected component, or null
   */
  renderProps(comp) {
    if (!comp) {
      this.propsPanel.innerHTML = '<span class="no-selection">Select a component</span>';
      return;
    }

    const rot  = ['0°', '90°', '180°', '270°'][(comp.rotation || 0) % 4];
    const rows = [
      ['Type',     comp.type],
      ['Rotation', rot],
    ];

    const meta = Constants.COMP_META[comp.type];
    if (meta) {
      const raw = comp[meta.prop] != null ? comp[meta.prop] : meta.defaultVal;
      rows.push([meta.label, Component.formatValue(raw, meta.unit)]);
    }

    if (comp.type === 'switch')  rows.push(['State', comp.closed ? 'Closed (ON)' : 'Open (OFF)']);
    if (comp.type === 'ground')  rows.push(['Potential', '0V reference']);

    const html = rows
      .map(([l, v]) => `
        <div class="prop-row">
          <span class="prop-label">${l}</span>
          <span class="prop-val">${v}</span>
        </div>`)
      .join('');

    const hint = meta
      ? '<p class="prop-edit-hint">Double-click to edit value</p>'
      : '';

    this.propsPanel.innerHTML = html + hint;
  }

  // ── Noise slider ──────────────────────────────────────────────────────

  /** Update the noise level label next to the slider. */
  renderNoise(value) {
    this.noiseVal.textContent = `${Math.round(value * 100)}%`;
  }

  // ── Entropy buffer ────────────────────────────────────────────────────

  /**
   * @param {number} fillFraction - 0 to 1
   * @param {string} statusText
   * @param {number} totalConsumed
   */
  renderEntropy(fillFraction, statusText, totalConsumed) {
    this.entropyFill.style.width   = `${Math.min(100, fillFraction * 100)}%`;
    this.entropyStatus.textContent = statusText;
    this.entropyCount.textContent  = totalConsumed.toLocaleString();
  }

  // ── Component count ───────────────────────────────────────────────────

  renderCompCount(n) {
    this.compCount.textContent = n;
  }

  // ── Sim log ───────────────────────────────────────────────────────────

  /**
   * Prepend a timestamped message to the log.
   * @param {string} msg
   */
  log(msg) {
    const t   = new Date().toLocaleTimeString('en', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const div = document.createElement('div');
    div.textContent = `${t} ${msg}`;
    this.simLog.prepend(div);
    // Cap log at 25 entries
    while (this.simLog.children.length > 25) {
      this.simLog.removeChild(this.simLog.lastChild);
    }
  }
}
