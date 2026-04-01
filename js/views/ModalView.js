/**
 * ModalView.js — manages the value-editor modal dialog DOM.
 * Depends on: Constants, Component
 */

class ModalView {
  constructor() {
    this.bg          = document.getElementById('val-modal-bg');
    this.titleEl     = document.getElementById('val-modal-title');
    this.input       = document.getElementById('val-input');
    this.prefixSel   = document.getElementById('prefix-select');
    this.unitEl      = document.getElementById('val-unit');
    this.prefixBtns  = document.getElementById('val-prefixes');
    this.computed    = document.getElementById('val-computed');
    this.okBtn       = document.getElementById('val-ok');
    this.cancelBtn   = document.getElementById('val-cancel');
  }

  get isOpen() {
    return this.bg.classList.contains('show');
  }

  /**
   * Open the modal pre-populated for the given component.
   * @param {object}   comp          - the component to edit
   * @param {function} onApply       - called with (rawValue: number) when Apply clicked
   * @param {function} onCancel      - called when Cancel or backdrop clicked
   */
  open(comp, onApply, onCancel) {
    const meta   = Constants.COMP_META[comp.type];
    if (!meta) return;

    const rawVal = comp[meta.prop] != null ? comp[meta.prop] : meta.defaultVal;
    const bestP  = this._bestPrefix(rawVal);

    this._currentPrefix = bestP.value;
    this._onApply       = onApply;
    this._onCancel      = onCancel;
    this._unit          = meta.unit;

    this.titleEl.textContent    = `Edit ${meta.label}`;
    this.unitEl.textContent     = meta.unit;
    this.input.value            = parseFloat((rawVal / bestP.value).toPrecision(6));
    this.prefixSel.value        = String(bestP.value);

    this._renderPrefixButtons();
    this._updateComputed();

    this.bg.classList.add('show');
    this.bg.setAttribute('aria-hidden', 'false');
    setTimeout(() => this.input.select(), 40);
  }

  close() {
    this.bg.classList.remove('show');
    this.bg.setAttribute('aria-hidden', 'true');
  }

  /** Wire up all internal events. Call once during app init. */
  bindEvents() {
    this.input.addEventListener('input', () => this._updateComputed());

    this.prefixSel.addEventListener('change', e => {
      this._currentPrefix = parseFloat(e.target.value);
      this._renderPrefixButtons();
      this._updateComputed();
    });

    this.okBtn.addEventListener('click', () => {
      const raw = (parseFloat(this.input.value) || 0) * this._currentPrefix;
      this.close();
      if (typeof this._onApply === 'function') this._onApply(raw);
    });

    this.cancelBtn.addEventListener('click', () => {
      this.close();
      if (typeof this._onCancel === 'function') this._onCancel();
    });

    // Click outside modal body → cancel
    this.bg.addEventListener('click', e => {
      if (e.target === this.bg) {
        this.close();
        if (typeof this._onCancel === 'function') this._onCancel();
      }
    });
  }

  // ── Private ────────────────────────────────────────────────────────────

  _bestPrefix(rawVal) {
    const abs = Math.abs(rawVal);
    let best  = Constants.PREFIXES[3]; // base
    for (const p of Constants.PREFIXES) {
      if (abs / p.value >= 0.9999 && abs / p.value < 1000) best = p;
    }
    return best;
  }

  _renderPrefixButtons() {
    this.prefixBtns.innerHTML = '';
    for (const p of Constants.PREFIXES) {
      const btn = document.createElement('button');
      btn.className   = 'px-btn' + (this._currentPrefix === p.value ? ' active' : '');
      btn.textContent = p.label === '—' ? 'base' : p.label;
      btn.title       = `${p.name} (×${p.value})`;
      btn.addEventListener('click', () => {
        this._currentPrefix   = p.value;
        this.prefixSel.value  = String(p.value);
        this._renderPrefixButtons();
        this._updateComputed();
      });
      this.prefixBtns.appendChild(btn);
    }
  }

  _updateComputed() {
    const n   = parseFloat(this.input.value) || 0;
    const raw = n * this._currentPrefix;
    this.computed.textContent = `= ${Component.formatValue(raw, this._unit || '')}`;
  }
}
