// js/core/pipeline.js
// Central pipeline: blur simulation + deblur dispatch.
// Connects UI parameters → transforms → filter → metrics.

import { cartesianToPolar, polarToCartesian, wrapPolar, unwrapPolar } from './polarTransform.js';
import { buildKernel, kernelSizeFromParams }                          from './kernel.js';
import { computeAll }                                                  from './metrics.js';
import { applyInverseFilter }                                          from '../filters/inverseFilter.js';
import { applyRichardsonLucy }                                         from '../filters/richardsonLucy.js';
import { applyTotalVariation, applyKalmanSmoother, applyBlindDeconv } from '../filters/advancedFilters.js';

/**
 * Simulate rotational motion blur on a grayscale image.
 *
 * @param {Float32Array} pixels  - grayscale [0,255] row-major
 * @param {number} width
 * @param {number} height
 * @param {object} params        - { omega, exposure, kernelType, fov? }
 * @returns {{ blurred: Float32Array, polar: object }}
 */
export function simulateBlur(pixels, width, height, params) {
  const { omega, exposure, kernelType, fov = 60 } = params;

  const kSize  = Math.max(3, kernelSizeFromParams(omega, exposure, fov, width));
  const kernel = buildKernel(kSize, kernelType);

  // Forward polar transform
  const pol = cartesianToPolar(pixels, width, height);
  const { data: polarData, pW, pH, cx, cy, angularStep } = pol;

  // Wrap → blur → unwrap
  const { padded, padH, wrapRows } = wrapPolar(polarData, pW, pH, kSize);
  const blurredPolar = _applyAngularBlur(padded, pW, padH, kernel);
  const unwrapped    = unwrapPolar(blurredPolar, pW, pH, wrapRows);

  // Back to Cartesian
  const blurred = polarToCartesian(unwrapped, pW, pH, width, height, cx, cy, angularStep);

  return {
    blurred,
    polarMeta: { pW, pH, cx, cy, angularStep },
    kernel,
    kSize,
  };
}

/**
 * Run a deblur filter on a blurred image.
 *
 * @param {Float32Array} blurredPixels
 * @param {number} width
 * @param {number} height
 * @param {Float32Array} originalPixels  - for metric computation
 * @param {string} filterKey             - 'inverse'|'wiener'|'tikhonov'|'rl'|'tv'|'kalman'|'blind'
 * @param {object} params                - { eps, omega, exposure, kernelType, iterations, fov? }
 * @returns {{ restored: Float32Array, metrics: object, elapsedMs: number }}
 */
export async function runDeblur(blurredPixels, width, height, originalPixels, filterKey, params) {
  const { eps = 5e-4, omega, exposure, kernelType, iterations = 20, fov = 60 } = params;

  const kSize  = Math.max(3, kernelSizeFromParams(omega, exposure, fov, width));
  const kernel = buildKernel(kSize, kernelType);

  // Polar transform of the blurred image
  const pol = cartesianToPolar(blurredPixels, width, height);
  const { data: polarData, pW, pH, cx, cy, angularStep } = pol;

  const { padded, padH, wrapRows } = wrapPolar(polarData, pW, pH, kSize);

  const t0 = performance.now();

  let deblurredPolar;
  let estimatedKernel = null;

  switch (filterKey) {
    case 'inverse':
    case 'tikhonov':
    case 'wiener':
      deblurredPolar = applyInverseFilter(padded, pW, padH, kernel, eps);
      break;

    case 'rl':
      deblurredPolar = applyRichardsonLucy(padded, pW, padH, kernel, iterations);
      break;

    case 'tv':
      deblurredPolar = applyTotalVariation(padded, pW, padH, kernel, eps * 200, iterations);
      break;

    case 'kalman':
      deblurredPolar = applyKalmanSmoother(padded, pW, padH, kernel, 0.5, eps * 4000);
      break;

    case 'blind': {
      const result = applyBlindDeconv(padded, pW, padH, kSize, eps, eps * 200, iterations);
      deblurredPolar   = result.deblurred;
      estimatedKernel  = result.estimatedKernel;
      break;
    }

    default:
      deblurredPolar = applyInverseFilter(padded, pW, padH, kernel, eps);
  }

  const elapsedMs = performance.now() - t0;

  const unwrapped = unwrapPolar(deblurredPolar, pW, pH, wrapRows);
  const restored  = polarToCartesian(unwrapped, pW, pH, width, height, cx, cy, angularStep);

  // Clip to [0,255]
  for (let i = 0; i < restored.length; i++) {
    restored[i] = Math.max(0, Math.min(255, restored[i]));
  }

  const metrics = computeAll(originalPixels, restored);

  return { restored, metrics, elapsedMs, estimatedKernel };
}

/**
 * Run all 7 filters sequentially and return an array of results.
 * Used by the "Compare all" mode.
 */
export async function runAllFilters(blurredPixels, width, height, originalPixels, params) {
  const keys = ['inverse', 'wiener', 'tikhonov', 'rl', 'tv', 'kalman', 'blind'];
  const results = [];

  for (const key of keys) {
    const iterParams = { ...params };
    if (key === 'blind') iterParams.iterations = Math.min(params.iterations, 8); // limit blind for speed
    const r = await runDeblur(blurredPixels, width, height, originalPixels, key, iterParams);
    results.push({ key, ...r });
    // Yield to browser between filters to avoid blocking the UI thread
    await _yield();
  }

  return results;
}

// ── Private helpers ───────────────────────────────

function _applyAngularBlur(polar, pW, pH, kernel) {
  const out  = new Float32Array(polar.length);
  const half = Math.floor(kernel.length / 2);

  for (let ri = 0; ri < pW; ri++) {
    for (let ti = 0; ti < pH; ti++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) {
        const si = ((ti - k + half) % pH + pH) % pH;
        sum += polar[si * pW + ri] * kernel[k];
      }
      out[ti * pW + ri] = sum;
    }
  }

  return out;
}

function _yield() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
