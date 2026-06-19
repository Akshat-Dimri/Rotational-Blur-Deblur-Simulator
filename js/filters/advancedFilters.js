// js/filters/advancedFilters.js
// Total variation, Kalman smoother, and blind deconvolution.
// Each exported as a standalone function with the same polar-buffer interface.

import { applyInverseFilter } from './inverseFilter.js';

//  Total Variation (gradient descent, split approach)

/**
 * TV-regularised deconvolution via gradient descent.
 *   min  ||h*f - g||²  +  λ·TV(f)
 *
 * @param {Float32Array} polar
 * @param {number} pW
 * @param {number} pH
 * @param {Float32Array} kernel
 * @param {number} lambda    - TV weight (0.01–0.5)
 * @param {number} iters     - gradient steps (20–60)
 * @param {number} stepSize  - α (0.001–0.01)
 * @returns {Float32Array}
 */
export function applyTotalVariation(polar, pW, pH, kernel, lambda = 0.1, iters = 40, stepSize = 0.005) {
  const out = new Float32Array(polar.length);

  for (let ri = 0; ri < pW; ri++) {
    const col = new Float32Array(pH);
    for (let ti = 0; ti < pH; ti++) col[ti] = polar[ti * pW + ri];

    const result = _tvColumn(col, kernel, lambda, iters, stepSize);

    for (let ti = 0; ti < pH; ti++) {
      out[ti * pW + ri] = Math.max(0, Math.min(255, result[ti]));
    }
  }

  return out;
}

function _tvColumn(g, h, lambda, iters, alpha) {
  const n    = g.length;
  const hFlip = _flip(h);
  let f       = g.slice();
  const eps   = 1e-6; // avoid div-by-zero in TV gradient

  for (let iter = 0; iter < iters; iter++) {
    // Data fidelity gradient: h^T * (h*f - g)
    const hf       = _convolveCircular(f, h, n);
    const residual = new Float32Array(n);
    for (let i = 0; i < n; i++) residual[i] = hf[i] - g[i];
    const dataGrad = _convolveCircular(residual, hFlip, n);

    // TV gradient: -div( ∇f / |∇f| )
    const tvGrad = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const fwd  = f[((i + 1) % n + n) % n] - f[i];
      const bwd  = f[i] - f[((i - 1) % n + n) % n];
      tvGrad[i]  = fwd / (Math.abs(fwd) + eps) - bwd / (Math.abs(bwd) + eps);
    }

    // Update
    for (let i = 0; i < n; i++) {
      f[i] -= alpha * (dataGrad[i] + lambda * tvGrad[i]);
      f[i]  = Math.max(0, f[i]);
    }
  }

  return f;
}

//  Kalman smoother (RTS)

/**
 * 1D Kalman filter + RTS backward smoother per radial column.
 * Models blur as an IIR state-space process.
 *
 * @param {Float32Array} polar
 * @param {number} pW
 * @param {number} pH
 * @param {Float32Array} kernel
 * @param {number} q   - process noise variance
 * @param {number} r   - measurement noise variance
 * @returns {Float32Array}
 */
export function applyKalmanSmoother(polar, pW, pH, kernel, q = 0.5, r = 2.0) {
  const out = new Float32Array(polar.length);

  for (let ri = 0; ri < pW; ri++) {
    const col = new Float32Array(pH);
    for (let ti = 0; ti < pH; ti++) col[ti] = polar[ti * pW + ri];

    const result = _kalmanColumn(col, kernel, q, r);

    for (let ti = 0; ti < pH; ti++) {
      out[ti * pW + ri] = Math.max(0, Math.min(255, result[ti]));
    }
  }

  return out;
}

function _kalmanColumn(y, kernel, q, r) {
  const n  = y.length;
  const h  = kernel[0]; // simplified: use first kernel tap as scalar obs gain

  // Forward pass
  const xf = new Float32Array(n);
  const pf = new Float32Array(n);
  let xPrior = y[0], pPrior = 1.0;

  for (let i = 0; i < n; i++) {
    // Predict
    const xPred = xPrior;
    const pPred = pPrior + q;

    // Update
    const K    = pPred * h / (h * h * pPred + r);
    xf[i]      = xPred + K * (y[i] - h * xPred);
    pf[i]      = (1 - K * h) * pPred;
    xPrior     = xf[i];
    pPrior     = pf[i];
  }

  // Backward RTS smoother
  const xs = xf.slice();
  for (let i = n - 2; i >= 0; i--) {
    const G = pf[i] / (pf[i] + q);
    xs[i]   = xf[i] + G * (xs[i + 1] - xf[i]);
  }

  return xs;
}

//  Blind deconvolution (alternating minimisation)

/**
 * Simultaneous estimation of kernel h and sharp image f.
 * Uses alternating: fix h → update f (Tikhonov), fix f → update h (sparse).
 *
 * @param {Float32Array} polar
 * @param {number} pW
 * @param {number} pH
 * @param {number} kernelSize  - initial kernel size estimate
 * @param {number} lambda1     - image sparsity weight
 * @param {number} lambda2     - kernel sparsity weight
 * @param {number} outerIters  - alternating steps
 * @returns {{ deblurred: Float32Array, estimatedKernel: Float32Array }}
 */
export function applyBlindDeconv(polar, pW, pH, kernelSize, lambda1 = 0.01, lambda2 = 0.1, outerIters = 10) {
  const out = new Float32Array(polar.length);

  // Start with a uniform kernel guess
  let hEst = new Float32Array(kernelSize).fill(1 / kernelSize);

  for (let outer = 0; outer < outerIters; outer++) {
    // Step 1: update f given current h — use Tikhonov
    const fEst = applyInverseFilter(polar, pW, pH, hEst, lambda1);

    // Step 2: update h given current f — project gradient
    hEst = _updateKernel(polar, fEst, pW, pH, hEst, lambda2);

    // Use updated f in next iteration (last pass is the result)
    if (outer === outerIters - 1) {
      out.set(fEst);
    }
  }

  return { deblurred: out, estimatedKernel: hEst };
}

function _updateKernel(g, f, pW, pH, hCur, lambda) {
  const n   = hCur.length;
  const hNew = hCur.slice();

  // Average gradient step across all radial columns
  let grad = new Float32Array(n);
  let count = 0;

  for (let ri = 0; ri < Math.min(pW, 64); ri++) { // sample subset for speed
    const gCol = new Float32Array(pH);
    const fCol = new Float32Array(pH);
    for (let ti = 0; ti < pH; ti++) {
      gCol[ti] = g[ti * pW + ri];
      fCol[ti] = f[ti * pW + ri];
    }
    const hf  = _convolveCircular(fCol, hCur, pH);
    const res = new Float32Array(pH);
    for (let i = 0; i < pH; i++) res[i] = hf[i] - gCol[i];

    for (let k = 0; k < n; k++) {
      let corr = 0;
      for (let i = 0; i < pH; i++) corr += res[i] * fCol[((i - k) % pH + pH) % pH];
      grad[k] += corr / pH;
    }
    count++;
  }

  // Gradient descent + non-negativity + normalise
  let sum = 0;
  for (let k = 0; k < n; k++) {
    hNew[k] -= (0.001 / count) * grad[k];
    hNew[k]  = Math.max(0, hNew[k]);
    sum     += hNew[k];
  }
  if (sum > 0) for (let k = 0; k < n; k++) hNew[k] /= sum;

  return hNew;
}

// Shared helpers

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

function _flip(k) {
  const f = new Float32Array(k.length);
  for (let i = 0; i < k.length; i++) f[i] = k[k.length - 1 - i];
  return f;
}
