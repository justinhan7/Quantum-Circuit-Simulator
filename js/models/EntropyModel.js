/**
 * EntropyModel.js — manages the quantum entropy pool sourced from CURBy.
 * Falls back to Math.random() if the API is unreachable.
 * No DOM access (fires callbacks for UI updates).
 * Depends on: nothing
 */

class EntropyModel {
  constructor() {
    /** @type {number[]} normalised entropy values in [0, 1] */
    this._buffer = [];

    /** Total number of samples consumed since page load */
    this.totalConsumed = 0;

    /** Whether the last fetch used the CURBy API or the PRNG fallback */
    this.usingFallback = false;

    /** Callbacks fired when buffer state changes */
    this._onChange = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Register a listener for buffer level changes. */
  onChange(fn) { this._onChange = fn; }

  /** Fraction of the max buffer that is filled (0–1). */
  get fillLevel() { return Math.min(1, this._buffer.length / 512); }

  /** Number of samples currently buffered. */
  get buffered() { return this._buffer.length; }

  /**
   * Consume one entropy value from the buffer.
   * Returns a float in [0, 1].
   */
  get() {
    this.totalConsumed++;
    return this._buffer.length > 0 ? this._buffer.pop() : Math.random();
  }

  /**
   * Fetch 64 bytes from CURBy and push them into the buffer.
   * Silently falls back to Math.random() if unavailable.
   * @returns {Promise<string>} status message for the sim log
   */
  async fetch() {
    try {
      const res = await fetch('https://random.colorado.edu/api/uint8?length=64');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = new Uint8Array(await res.arrayBuffer());
      for (const v of arr) this._buffer.push(v / 255);
      // Keep buffer bounded at 512 samples
      if (this._buffer.length > 512) {
        this._buffer.splice(0, this._buffer.length - 512);
      }
      this.usingFallback = false;
      this._notify();
      return `Fetched ${arr.length} quantum entropy bytes from CURBy`;
    } catch {
      // PRNG fallback
      for (let i = 0; i < 64; i++) this._buffer.push(Math.random());
      this.usingFallback = true;
      this._notify();
      return 'CURBy unreachable — using PRNG fallback';
    }
  }

  // ── Private ────────────────────────────────────────────────────────────

  _notify() {
    if (typeof this._onChange === 'function') this._onChange();
  }
}
