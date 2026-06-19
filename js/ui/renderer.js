// js/ui/renderer.js
// Canvas rendering helpers: load images, draw pixel buffers, save output.

/**
 * Load an image File into an ImageData object and a Float32Array pixel buffer.
 * Converts to grayscale internally.
 *
 * @param {File} file
 * @returns {Promise<{ pixels: Float32Array, width: number, height: number, imageData: ImageData }>}
 */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);

      // Draw to offscreen canvas to extract pixel data
      const canvas = document.createElement('canvas');
      // Cap at 512px for performance — polar transform is O(W×H)
      const scale  = Math.min(1, 512 / Math.max(img.width, img.height));
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels    = rgbaToGrayscale(imageData.data, canvas.width, canvas.height);

      resolve({ pixels, width: canvas.width, height: canvas.height, imageData });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

/**
 * Convert an RGBA Uint8ClampedArray to a Float32Array grayscale buffer.
 * Uses luminance weights: 0.299R + 0.587G + 0.114B
 */
export function rgbaToGrayscale(rgba, width, height) {
  const n   = width * height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    out[i]  = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return out;
}

/**
 * Render a Float32Array grayscale buffer onto a <canvas> element.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Float32Array}      pixels  - grayscale [0,255]
 * @param {number}            width
 * @param {number}            height
 */
export function renderToCanvas(canvas, pixels, width, height) {
  canvas.width  = width;
  canvas.height = height;
  const ctx     = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);

  for (let i = 0; i < width * height; i++) {
    const v = Math.round(Math.max(0, Math.min(255, pixels[i])));
    imgData.data[i * 4]     = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Clear a canvas and show a placeholder state.
 */
export function clearCanvas(canvas, emptyEl) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (emptyEl) emptyEl.style.display = 'flex';
}

/**
 * Trigger a browser download of the deblurred canvas as a PNG.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string}            filterName
 */
export function saveCanvasAsPNG(canvas, filterName = 'deblurred') {
  const link    = document.createElement('a');
  link.download = `deblur-${filterName.toLowerCase().replace(/\s+/g, '-')}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Render a comparison strip of canvases for the compare-all modal.
 * Returns an array of { key, canvas } objects.
 *
 * @param {Array}  results  - array of { key, restored, metrics, elapsedMs }
 * @param {number} width
 * @param {number} height
 * @returns {Array<{ key: string, canvas: HTMLCanvasElement }>}
 */
export function renderCompareStrip(results, width, height) {
  return results.map(({ key, restored }) => {
    const canvas   = document.createElement('canvas');
    renderToCanvas(canvas, restored, width, height);
    return { key, canvas };
  });
}
