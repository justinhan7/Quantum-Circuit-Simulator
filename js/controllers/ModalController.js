/**
 * ModalController.js — wires the value-editor modal to the circuit model.
 * Listens for double-click events from CanvasController, opens ModalView,
 * and writes the result back into the component.
 * Depends on: Constants, Component, ModalView
 */

class ModalController {
  /**
   * @param {ModalView}     modalView
   * @param {function}      onApplied  - called after a value is applied (for view refresh)
   * @param {function}      onLog
   */
  constructor(modalView, onApplied, onLog) {
    this.view      = modalView;
    this._onApplied = onApplied;
    this._onLog     = onLog;

    // Wire up the modal's own internal events (buttons, backdrop, etc.)
    this.view.bindEvents();

    // Global keyboard shortcut: Enter / Escape inside modal
    document.addEventListener('keydown', e => {
      if (!this.view.isOpen) return;
      if (e.key === 'Enter')  document.getElementById('val-ok').click();
      if (e.key === 'Escape') document.getElementById('val-cancel').click();
    });
  }

  /**
   * Open the editor for a component.
   * Called by CanvasController when a double-click is detected.
   * @param {object} comp
   */
  open(comp) {
    const meta = Constants.COMP_META[comp.type];
    if (!meta) return;

    this.view.open(
      comp,
      // onApply
      rawValue => {
        comp[meta.prop] = rawValue;
        this._onLog(`${comp.type} ${meta.label} set to ${Component.formatValue(rawValue, meta.unit)}`);
        this._onApplied(comp);
      },
      // onCancel — nothing to do
      null,
    );
  }
}
