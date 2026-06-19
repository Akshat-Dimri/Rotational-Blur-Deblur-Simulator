// js/core/fft.js
// Cooley-Tukey radix-2 in-place FFT / IFFT for 1D complex signals.
// Works on plain JS Float64Arrays — no dependencies.

/**
 * In-place FFT. Operates on interleaved [re, im, re, im, ...] Float64Array.
 * Length must be a power of 2.
 */
export function fft(re, im) {
  const n = re.length;
  _bitReversePermute(re, im, n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const wRe  = Math.cos(-2 * Math.PI / len);
    const wIm  = Math.sin(-2 * Math.PI / len);
    for (let i = 0; i < n; i += len) {
      let uRe = 1, uIm = 0;
      for (let j = 0; j < half; j++) {
        const eRe = re[i + j];
        const eIm = im[i + j];
        const oRe = re[i + j + half] * uRe - im[i + j + half] * uIm;
        const oIm = re[i + j + half] * uIm + im[i + j + half] * uRe;
        re[i + j]        = eRe + oRe;
        im[i + j]        = eIm + oIm;
        re[i + j + half] = eRe - oRe;
        im[i + j + half] = eIm - oIm;
        const nextUre = uRe * wRe - uIm * wIm;
        uIm = uRe * wIm + uIm * wRe;
        uRe = nextUre;
      }
    }
  }
}

/**
 * In-place IFFT. Conjugates, applies FFT, conjugates again, divides by n.
 */
export function ifft(re, im) {
  const n = re.length;
  // conjugate
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  // conjugate and scale
  for (let i = 0; i < n; i++) {
    re[i] /=  n;
    im[i] = -im[i] / n;
  }
}

/**
 * Compute the FFT of a real-valued Float32Array signal.
 * Pads to next power of 2.
 * @returns {{ re: Float64Array, im: Float64Array, n: number }}
 */
export function realFFT(signal) {
  const n   = nextPow2(signal.length);
  const re  = new Float64Array(n);
  const im  = new Float64Array(n);
  for (let i = 0; i < signal.length; i++) re[i] = signal[i];
  fft(re, im);
  return { re, im, n };
}

/**
 * IFFT back to a real signal of length `origLen`, trimming the power-of-2 pad.
 */
export function realIFFT(re, im, origLen) {
  ifft(re, im);
  const out = new Float32Array(origLen);
  for (let i = 0; i < origLen; i++) out[i] = re[i];
  return out;
}

// ── Helpers ───────────────────────────────────────

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function _bitReversePermute(re, im, n) {
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
}
