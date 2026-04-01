/**
 * app.js — application entry point.
 *
 * Instantiates every Model, View, and Controller then wires them together
 * through callbacks. No business logic lives here — only composition.
 *
 * Load order (guaranteed by index.html script tags):
 *   Models:      Constants → Component → CircuitModel → ScopeModel → EntropyModel
 *   Views:       GridView → ComponentView → ProbeView → ScopeView → SidebarView → ModalView
 *   Controllers: ToolController → CanvasController → ScopeController →
 *                SimulationController → ModalController → app.js
 */

(function () {
  'use strict';

  // ── 1. Models ────────────────────────────────────────────────────────────

  const circuitModel = new CircuitModel();
  const scopeModel   = new ScopeModel();
  const entropyModel = new EntropyModel();

  // Keep noise level in sync between slider and model
  circuitModel.noiseLevel = 0.30;

  // ── 2. Canvas elements ────────────────────────────────────────────────────

  const wrap      = document.getElementById('canvas-wrap');
  const gridCanvas = document.getElementById('grid-canvas');
  const simCanvas  = document.getElementById('sim-canvas');
  const scopeCanvas = document.getElementById('scope-canvas');

  // ── 3. Views ──────────────────────────────────────────────────────────────

  const gridView      = new GridView(gridCanvas);
  const componentView = new ComponentView(simCanvas);
  const probeView     = new ProbeView(componentView.ctx);
  const scopeView     = new ScopeView(scopeCanvas);
  const sidebarView   = new SidebarView();
  const modalView     = new ModalView();

  // ── 4. Controllers ─────────────────────────────────────────────────────────

  // Canvas controller (needs scope model for probe positions)
  const canvasCtrl = new CanvasController(
    simCanvas,
    circuitModel,
    componentView,
    probeView,
    gridView,
    scopeModel,
    {
      onSelectionChange: comp => {
        sidebarView.renderProps(comp);
      },
      onComponentAdded: () => {
        sidebarView.renderCompCount(circuitModel.components.length);
      },
      onComponentRemoved: () => {
        sidebarView.renderCompCount(circuitModel.components.length);
      },
      onSwitchToggled: () => {
        // resetCapacitorTimers is already called inside CanvasController
      },
      onDoubleClick: comp => {
        modalCtrl.open(comp);
      },
      onProbePlace: () => {
        scopeCtrl.clearPlacingUI();
      },
      onLog: msg => sidebarView.log(msg),
    },
  );

  // Tool controller
  const toolCtrl = new ToolController(toolName => {
    canvasCtrl.setTool(toolName);
  });

  // Scope controller
  const scopeCtrl = new ScopeController(scopeModel, scopeView, canvasCtrl, msg => sidebarView.log(msg));

  // Modal controller
  const modalCtrl = new ModalController(
    modalView,
    comp => {
      // Value applied — refresh sidebar and redraw
      sidebarView.renderProps(comp);
      canvasCtrl.redraw();
    },
    msg => sidebarView.log(msg),
  );

  // Simulation controller
  const simCtrl = new SimulationController(
    circuitModel,
    scopeModel,
    entropyModel,
    {
      onTick: () => {
        canvasCtrl.redraw();
        scopeCtrl.render();
        sidebarView.renderEntropy(
          entropyModel.fillLevel,
          entropyModel.usingFallback
            ? 'CURBy unavailable — PRNG fallback'
            : `Buffer: ${entropyModel.buffered} samples`,
          entropyModel.totalConsumed,
        );
      },
      onLog: msg => sidebarView.log(msg),
      onEntropyUpdate: () => {
        sidebarView.renderEntropy(
          entropyModel.fillLevel,
          entropyModel.usingFallback
            ? 'CURBy unavailable — PRNG fallback'
            : `Buffer: ${entropyModel.buffered} samples`,
          entropyModel.totalConsumed,
        );
      },
    },
  );

  // ── 5. Noise slider ───────────────────────────────────────────────────────

  const noiseSlider = document.getElementById('noise-slider');
  noiseSlider.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10) / 100;
    circuitModel.noiseLevel = val;
    sidebarView.renderNoise(val);
  });
  sidebarView.renderNoise(circuitModel.noiseLevel);

  // ── 6. Delete button ──────────────────────────────────────────────────────

  document.getElementById('delete-btn').addEventListener('click', () => {
    canvasCtrl.deleteSelected();
  });

  // ── 7. Global keyboard shortcuts ──────────────────────────────────────────

  document.addEventListener('keydown', e => {
    // Don't hijack input fields or the open modal
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (modalView.isOpen) return;

    switch (e.key) {
      case 'Escape':
        if (canvasCtrl.placingProbe) {
          canvasCtrl.cancelProbe();
          scopeCtrl.clearPlacingUI();
        } else if (toolCtrl.current !== 'select') {
          toolCtrl.set('select');
          sidebarView.log('Returned to Select');
        }
        break;

      case 'r':
      case 'R':
        if (toolCtrl.current !== 'select' && toolCtrl.current !== 'wire') {
          canvasCtrl.rotateGhost();
        } else if (toolCtrl.current === 'select') {
          canvasCtrl.rotateSelected();
          sidebarView.log('Component rotated');
        }
        break;

      case 'Delete':
      case 'Backspace':
        canvasCtrl.deleteSelected();
        break;
    }
  });

  // ── 8. Resize handler ─────────────────────────────────────────────────────

  function handleResize() {
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    canvasCtrl.resize(w, h);
    scopeCtrl.resize();
  }

  window.addEventListener('resize', handleResize);

  // ── 9. Initial render ─────────────────────────────────────────────────────

  handleResize();
  sidebarView.renderProps(null);
  sidebarView.renderCompCount(0);
  sidebarView.renderEntropy(0, 'Idle', 0);
  sidebarView.log('Simulator ready — powered by CURBy quantum entropy');

})();
