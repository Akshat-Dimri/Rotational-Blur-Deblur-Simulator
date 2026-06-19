// js/filters/inverseFilter.js
// Inverse filter and Tikhonov/Wiener (same formula, different parameter name).
// Applied per radial slice in the polar domain via 1D FFT.

import { realFFT, realIFFT } from '../core/fft.js';
import { padKernelForFFT }   from '../core/kernel.js';

/**
 * Apply a frequency-domain regularised inverse filter to every radial column
 * of a polar image.
 *
 * Both the classic inverse filter (ε = small constant) and the
 * Tikhonov / Wiener filter (ε = λ or NSR) use the same formula:
 *
 *   F̂(u) = H*(u) · G(u) / (|H(u)|² + ε)
 *
 * @param {Float32Array} polar   - polar image buffer (pH rows × pW cols)
 * @param {number}       pW      - polar width  (radial bins)
 * @param {number}       pH      - polar height (angular bins)
 * @param {Float32Array} kernel  - 1D PSF kernel
 * @param {number}       eps     - regularisation parameter ε
 * @returns {Float32Array}       - deblurred polar buffer
 */
export function applyInverseFilter(polar, pW, pH, kernel, eps = 5e-4) {
  const out = new Float32Array(polar.length);

  for (let ri = 0; ri < pW; ri++) {
    // Extract angular column (one radial ring)
    const col = new Float32Array(pH);
    for (let ti = 0; ti < pH; ti++) col[ti] = polar[ti * pW + ri];

    const deblurred = _inverseFilterColumn(col, kernel, eps);

    for (let ti = 0; ti < pH; ti++) {
      out[ti * pW + ri] = Math.max(0, Math.min(255, deblurred[ti]));
    }
  }

  return out;
}

function _inverseFilterColumn(col, kernel, eps) {
  const { re: gRe, im: gIm, n } = realFFT(col);

  // Pad kernel to same FFT length
  const kBuf = padKernelForFFT(kernel, n, 'causal');
  const hRe  = new Float64Array(n);
  const hIm  = new Float64Array(n);
  for (let i = 0; i < n; i++) hRe[i] = kBuf[i];

  // FFT of kernel
  const { fft } = _getFFT();
  fft(hRe, hIm);

  // F̂ = H* · G / (|H|² + ε)
  const fRe = new Float64Array(n);
  const fIm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const mag2 = hRe[i] * hRe[i] + hIm[i] * hIm[i];
    const denom = mag2 + eps;
    // H* · G
    fRe[i] = (hRe[i] * gRe[i] + hIm[i] * gIm[i]) / denom;
    fIm[i] = (hRe[i] * gIm[i] - hIm[i] * gRe[i]) / denom;
  }

  return realIFFT(fRe, fIm, col.length);
}

// Lazy import to avoid circular dep with fft.js at module parse time
let _fftCache = null;
function _getFFT() {
  if (!_fftCache) {
    // Dynamic import not needed — fft.js is already in scope via static import
    // We re-export fft from fft.js here as a convenience wrapper
    _fftCache = { fft: _rawFFT };
  }
  return _fftCache;
}

// Inline Cooley-Tukey — avoids a second dynamic import
function _rawFFT(re, im) {
  const n = re.length;
  // bit-reverse permute
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
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const wRe  = Math.cos(-2 * Math.PI / len);
    const wIm  = Math.sin(-2 * Math.PI / len);
    for (let i = 0; i < n; i += len) {
      let uRe = 1, uIm = 0;
      for (let jj = 0; jj < half; jj++) {
        const eRe = re[i+jj], eIm = im[i+jj];
        const oRe = re[i+jj+half]*uRe - im[i+jj+half]*uIm;
        const oIm = re[i+jj+half]*uIm + im[i+jj+half]*uRe;
        re[i+jj] = eRe+oRe; im[i+jj] = eIm+oIm;
        re[i+jj+half] = eRe-oRe; im[i+jj+half] = eIm-oIm;
        const nr = uRe*wRe - uIm*wIm; uIm = uRe*wIm + uIm*wRe; uRe = nr;
      }
    }
  }
}
