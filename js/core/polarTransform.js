// js/core/polarTransform.js
// Cartesian ↔ Polar coordinate transforms using bilinear interpolation.
// All operations work on flat Float32Array pixel buffers (grayscale, 0–255).

/**
 * Convert a Cartesian grayscale image to polar coordinates.
 * @param {Float32Array} src   - flat pixel buffer, row-major, width×height
 * @param {number} srcW        - source width  (px)
 * @param {number} srcH        - source height (px)
 * @param {number} angularStep - degrees per row in the polar image (default 0.5)
 * @returns {{ data: Float32Array, pW: number, pH: number, cx: number, cy: number, angularStep: number }}
 */
export function cartesianToPolar(src, srcW, srcH, angularStep = 0.5) {
  const cx = (srcW - 1) / 2;
  const cy = (srcH - 1) / 2;
  const maxR = Math.ceil(Math.sqrt(
    Math.max(cx, srcW - 1 - cx) ** 2 + Math.max(cy, srcH - 1 - cy) ** 2
  ));

  const pW = maxR;                              // radial axis  (columns)
  const pH = Math.ceil(360 / angularStep);      // angular axis (rows)
  const dst = new Float32Array(pW * pH);

  for (let ri = 0; ri < pW; ri++) {
    for (let ti = 0; ti < pH; ti++) {
      const theta = (ti * angularStep * Math.PI) / 180;
      const xc = ri * Math.cos(theta) + cx;
      const yc = ri * Math.sin(theta) + cy;

      dst[ti * pW + ri] = bilinear(src, srcW, srcH, xc, yc);
    }
  }

  return { data: dst, pW, pH, cx, cy, angularStep };
}

/**
 * Convert a polar grayscale image back to Cartesian coordinates.
 * @param {Float32Array} polar  - flat polar buffer (pH rows × pW cols)
 * @param {number} pW           - polar width  (radial bins)
 * @param {number} pH           - polar height (angular bins)
 * @param {number} dstW         - output Cartesian width
 * @param {number} dstH         - output Cartesian height
 * @param {number} cx           - rotation centre x
 * @param {number} cy           - rotation centre y
 * @param {number} angularStep  - degrees per polar row
 * @returns {Float32Array}
 */
export function polarToCartesian(polar, pW, pH, dstW, dstH, cx, cy, angularStep) {
  const dst = new Float32Array(dstW * dstH);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r  = Math.sqrt(dx * dx + dy * dy);
      let theta = Math.atan2(dy, dx);
      if (theta < 0) theta += 2 * Math.PI;

      const rp = r;
      const tp = (theta * 180) / (Math.PI * angularStep);

      dst[y * dstW + x] = bilinear(polar, pW, pH, rp, tp);
    }
  }

  return dst;
}

/**
 * Bilinear interpolation on a flat Float32Array image buffer.
 * Returns 0 for out-of-bounds coordinates.
 */
function bilinear(buf, w, h, x, y) {
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = x1 + 1;
  const y2 = y1 + 1;

  if (x1 < 0 || y1 < 0 || x2 >= w || y2 >= h) {
    // clamp instead of returning 0 — reduces black border artefacts
    const xc = Math.max(0, Math.min(w - 1, Math.round(x)));
    const yc = Math.max(0, Math.min(h - 1, Math.round(y)));
    return buf[yc * w + xc];
  }

  const fx = x - x1;
  const fy = y - y1;

  const q11 = buf[y1 * w + x1];
  const q21 = buf[y1 * w + x2];
  const q12 = buf[y2 * w + x1];
  const q22 = buf[y2 * w + x2];

  return (1 - fy) * ((1 - fx) * q11 + fx * q21)
       +      fy  * ((1 - fx) * q12 + fx * q22);
}

/**
 * Pad polar image with wraparound rows for circular convolution.
 * Returns { padded: Float32Array, padH: number, wrapRows: number }
 */
export function wrapPolar(polar, pW, pH, kernelSize) {
  const wrapRows = Math.ceil(kernelSize / 2) + 2;
  const padH     = pH + 2 * wrapRows;
  const padded   = new Float32Array(padH * pW);

  // top wrap (last wrapRows rows of polar)
  for (let r = 0; r < wrapRows; r++) {
    const srcRow = pH - wrapRows + r;
    padded.set(
      polar.subarray(srcRow * pW, (srcRow + 1) * pW),
      r * pW
    );
  }
  // original data
  padded.set(polar, wrapRows * pW);
  // bottom wrap (first wrapRows rows of polar)
  for (let r = 0; r < wrapRows; r++) {
    padded.set(
      polar.subarray(r * pW, (r + 1) * pW),
      (wrapRows + pH + r) * pW
    );
  }

  return { padded, padH, wrapRows };
}

/**
 * Remove the wraparound padding added by wrapPolar.
 */
export function unwrapPolar(padded, pW, pH, wrapRows) {
  const out = new Float32Array(pH * pW);
  out.set(padded.subarray(wrapRows * pW, (wrapRows + pH) * pW));
  return out;
}
