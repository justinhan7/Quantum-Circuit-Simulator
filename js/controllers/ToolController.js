/**
 * ToolController.js — manages which tool is active and keeps the
 * toolbar buttons in sync with that state.
 * Depends on: Constants
 */

class ToolController {
  /**
   * @param {function} onChange - called with (toolName: string) when tool changes
   */
  constructor(onChange) {
    this._tool      = 'wire';
    this._onChange  = onChange;
    this._buttons   = document.querySelectorAll('.comp-btn[data-type]');
    this._bindEvents();
  }

  get current() { return this._tool; }

  /** Switch to a different tool programmatically. */
  set(toolName) {
    this._tool = toolName;
    this._syncButtons();
    this._onChange(toolName);
  }

  // ── Private ────────────────────────────────────────────────────────────

  _bindEvents() {
    this._buttons.forEach(btn => {
      btn.addEventListener('click', () => this.set(btn.dataset.type));
    });
  }

  _syncButtons() {
    this._buttons.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === this._tool);
    });
  }
}
