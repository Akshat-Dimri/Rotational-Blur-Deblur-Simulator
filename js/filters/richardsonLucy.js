// js/filters/richardsonLucy.js
// Richardson-Lucy iterative deconvolution.
// Assumes Poisson (photon-counting) noise. Applied per radial slice.

/**
 * Richardson-Lucy deconvolution on every radial column of a polar image.
 *
 *   f_{n+1} = f_n · [ h^T * (g / (h * f_n)) ]
 *
 * @param {Float32Array} polar    - polar image buffer (pH rows × pW cols)
 * @param {number}       pW
 * @param {number}       pH
 * @param {Float32Array} kernel   - 1D PSF kernel (forward)
 * @param {number}       iters    - number of iterations (10–50)
 * @returns {Float32Array}
 */
export function applyRichardsonLucy(polar, pW, pH, kernel, iters = 20) {
  const out = new Float32Array(polar.length);
  const kernelFlip = _flipKernel(kernel);

  for (let ri = 0; ri < pW; ri++) {
    const col = new Float32Array(pH);
    for (let ti = 0; ti < pH; ti++) col[ti] = polar[ti * pW + ri];

    const deblurred = _rlColumn(col, kernel, kernelFlip, iters);

    for (let ti = 0; ti < pH; ti++) {
      out[ti * pW + ri] = Math.max(0, Math.min(255, deblurred[ti]));
    }
  }

  return out;
}

function _rlColumn(g, h, hFlip, iters) {
  const n = g.length;
  // Initialise estimate as the blurred observation
  let f = g.slice();

  for (let iter = 0; iter < iters; iter++) {
    // u = h * f  (forward convolution)
    const u = _convolveCircular(f, h, n);

    // ratio = g / u  (element-wise, floor to avoid div-by-zero)
    const ratio = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ratio[i] = u[i] > 1e-6 ? g[i] / u[i] : 0;
    }

    // correction = h^T * ratio  (back-projection)
    const correction = _convolveCircular(ratio, hFlip, n);

    // f_{n+1} = f_n · correction
    for (let i = 0; i < n; i++) {
      f[i] = Math.max(0, f[i] * correction[i]);
    }
  }

  return f;
}

/** Circular 1D convolution of signal s with kernel k. */
function _convolveCircular(s, k, n) {
  const out  = new Float32Array(n);
  const half = Math.floor(k.length / 2);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < k.length; j++) {
      const idx = ((i - j + half) % n + n) % n;
      sum += s[idx] * k[j];
    }
    out[i] = sum;
  }
  return out;
}

/** Flip a kernel (for transpose / back-projection). */
function _flipKernel(k) {
  const f = new Float32Array(k.length);
  for (let i = 0; i < k.length; i++) f[i] = k[k.length - 1 - i];
  return f;
}
