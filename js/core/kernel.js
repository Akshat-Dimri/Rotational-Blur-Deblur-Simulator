// js/core/kernel.js
// Angular PSF kernel construction for polar-domain blur simulation.
// Returns normalised Float32Array kernels of a given size.

/**
 * Build a 1D angular blur kernel.
 * @param {number} size       - kernel length in pixels
 * @param {'uniform'|'gaussian'|'forward'} type
 * @returns {Float32Array}    - normalised kernel (sums to 1)
 */
export function buildKernel(size, type = 'uniform') {
  if (size <= 1) return new Float32Array([1]);

  switch (type) {
    case 'uniform':  return _uniform(size);
    case 'gaussian': return _gaussian(size);
    case 'forward':  return _forward(size);
    default:         return _uniform(size);
  }
}

/**
 * Compute the kernel size (in pixels) for given physical parameters.
 * @param {number} omega   - angular velocity (degrees/second)
 * @param {number} T_ms    - exposure time (milliseconds)
 * @param {number} fov     - field of view (degrees)
 * @param {number} imgW    - image width (pixels)
 * @returns {number}       - kernel size in pixels (minimum 1)
 */
export function kernelSizeFromParams(omega, T_ms, fov = 60, imgW = 512) {
  const T_s     = T_ms / 1000;
  const dTheta  = omega * T_s;           // angular blur extent (degrees)
  const degPerPx = fov / imgW;           // angular resolution (deg/px)
  const size     = Math.round(dTheta / degPerPx);
  return Math.max(1, size);
}

// ── Private builders ──────────────────────────────

function _uniform(size) {
  const k = new Float32Array(size);
  k.fill(1 / size);
  return k;
}

function _gaussian(size) {
  const k    = new Float32Array(size);
  const half = (size - 1) / 2;
  const sig  = half / 2.5;
  let sum    = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    k[i] = Math.exp(-(x * x) / (2 * sig * sig));
    sum += k[i];
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

function _forward(size) {
  // Motion starts at current pixel and smears forward
  const k = new Float32Array(size);
  k.fill(1 / size);
  return k;  // offset is handled during convolution
}

/**
 * Embed a kernel into a zero-padded buffer of length n,
 * placing it at the start (causal) or centred, ready for FFT.
 * @param {Float32Array} kernel
 * @param {number}       n       - padded length (power of 2)
 * @param {'centre'|'causal'} placement
 * @returns {Float64Array}
 */
export function padKernelForFFT(kernel, n, placement = 'causal') {
  const buf = new Float64Array(n);
  if (placement === 'centre') {
    const offset = Math.floor((n - kernel.length) / 2);
    for (let i = 0; i < kernel.length; i++) buf[offset + i] = kernel[i];
  } else {
    for (let i = 0; i < kernel.length; i++) buf[i] = kernel[i];
  }
  return buf;
}
