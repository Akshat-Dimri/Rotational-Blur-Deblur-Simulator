// js/core/metrics.js
// Image quality metrics: MSE, PSNR, SSIM, standard-deviation delta.
// All inputs are Float32Array pixel buffers in the range [0, 255].

/**
 * Mean Squared Error between two same-size pixel buffers.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}
 */
export function mse(a, b) {
  const n = a.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / n;
}

/**
 * Peak Signal-to-Noise Ratio (dB).
 * MAX = 255 for uint8-range data.
 * @param {Float32Array} original
 * @param {Float32Array} restored
 * @returns {number}
 */
export function psnr(original, restored) {
  const err = mse(original, restored);
  if (err === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / err);
}

/**
 * Structural Similarity Index (SSIM).
 * Computed globally (single-window) — sufficient for metric comparison.
 * Constants C1, C2 follow the original Wang et al. paper.
 * @param {Float32Array} a  - reference image
 * @param {Float32Array} b  - distorted image
 * @returns {number}  value in [-1, 1], closer to 1 = more similar
 */
export function ssim(a, b) {
  const n  = a.length;
  const C1 = (0.01 * 255) ** 2;   // 6.5025
  const C2 = (0.03 * 255) ** 2;   // 58.5225

  let muA = 0, muB = 0;
  for (let i = 0; i < n; i++) { muA += a[i]; muB += b[i]; }
  muA /= n;
  muB /= n;

  let sigA2 = 0, sigB2 = 0, sigAB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - muA;
    const db = b[i] - muB;
    sigA2 += da * da;
    sigB2 += db * db;
    sigAB += da * db;
  }
  sigA2 /= n - 1;
  sigB2 /= n - 1;
  sigAB /= n - 1;

  const num = (2 * muA * muB + C1) * (2 * sigAB + C2);
  const den = (muA * muA + muB * muB + C1) * (sigA2 + sigB2 + C2);
  return num / den;
}

/**
 * Standard deviation of a pixel buffer.
 */
export function stdDev(buf) {
  const n = buf.length;
  let mu = 0;
  for (let i = 0; i < n; i++) mu += buf[i];
  mu /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = buf[i] - mu;
    variance += d * d;
  }
  return Math.sqrt(variance / n);
}

/**
 * Compute all metrics between original and restored images.
 * @returns {{ mse: number, psnr: number, ssim: number, stdDelta: number }}
 */
export function computeAll(original, restored) {
  return {
    mse:      mse(original, restored),
    psnr:     psnr(original, restored),
    ssim:     ssim(original, restored),
    stdDelta: stdDev(restored) - stdDev(original),
  };
}
