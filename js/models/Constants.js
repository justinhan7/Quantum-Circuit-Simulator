/**
 * Constants.js — shared immutable values used across the entire application.
 * No dependencies. Loaded first.
 */

const Constants = Object.freeze({
  /** Grid snap size in pixels */
  CELL: 28,

  /** Oscilloscope sampling rate (samples per second) */
  SAMPLE_RATE: 500,

  /** Number of horizontal grid divisions on the scope */
  SCOPE_COLS: 10,

  /** Number of vertical grid divisions on the scope */
  SCOPE_ROWS: 8,

  /** Default volts-per-division on the scope */
  DEFAULT_VDIV: 1.0,

  /** Default seconds-per-division on the scope */
  DEFAULT_SDIV: 0.2,

  /** Maximum samples kept in the scope ring-buffer.
   *  = widest window (5 s/div × 10 cols) × 500 Sa/s = 25,000.
   *  Hard cap prevents unbounded memory growth. */
  MAX_SCOPE_SAMPLES: 25000,

  /** SI prefix definitions, from nano to giga */
  PREFIXES: [
    { label: 'n', value: 1e-9, name: 'nano'  },
    { label: 'µ', value: 1e-6, name: 'micro' },
    { label: 'm', value: 1e-3, name: 'milli' },
    { label: '—', value: 1,    name: 'base'  },
    { label: 'k', value: 1e3,  name: 'kilo'  },
    { label: 'M', value: 1e6,  name: 'mega'  },
    { label: 'G', value: 1e9,  name: 'giga'  },
  ],

  /** V/div steps available on the scope */
  VDIV_STEPS: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20],

  /** s/div steps available on the scope */
  SDIV_STEPS: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],

  /** Per-type metadata: which property is editable, its unit, and default */
  COMP_META: {
    resistor:  { prop: 'resistance',  unit: 'Ω', defaultVal: 1000,   label: 'Resistance'  },
    capacitor: { prop: 'capacitance', unit: 'F', defaultVal: 100e-6, label: 'Capacitance' },
    inductor:  { prop: 'inductance',  unit: 'H', defaultVal: 10e-3,  label: 'Inductance'  },
    vsource:   { prop: 'voltage',     unit: 'V', defaultVal: 5,      label: 'Voltage'     },
  },

  /** Drawing colours per component type */
  COMP_COLORS: {
    wire:     '#5591cc',
    resistor: '#c47c2b',
    capacitor:'#4aabb0',
    led:      '#e07040',
    vsource:  '#5aaa55',
    inductor: '#a569bd',
    switch:   '#e8a020',
    ground:   '#888888',
  },
});
