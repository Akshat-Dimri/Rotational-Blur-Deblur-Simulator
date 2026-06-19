// js/ui/metricsDisplay.js
// Updates the metrics bar and renders the compare-all modal table.

import { FILTERS } from '../core/filterData.js';

//  metrics bar

/**
 * to update the four metric chips in the metrics bar.
 * @param {{ psnr, ssim, mse, stdDelta }} metrics
 * @param {number} elapsedMs
 */
export function updateMetricsBar(metrics, elapsedMs) {
  _setMetric('metric-psnr', metrics.psnr.toFixed(2) + ' dB', _psnrClass(metrics.psnr));
  _setMetric('metric-ssim', metrics.ssim.toFixed(4),          _ssimClass(metrics.ssim));
  _setMetric('metric-mse',  metrics.mse.toFixed(2),           '');
  _setMetric('metric-std',  (metrics.stdDelta >= 0 ? '+' : '') + metrics.stdDelta.toFixed(2), '');
  _setMetric('metric-time', elapsedMs.toFixed(0) + ' ms',     '');
}

/**
 * Reset all metric chips to em-dash placeholder.
 */
export function resetMetricsBar() {
  ['metric-psnr','metric-ssim','metric-mse','metric-std','metric-time'].forEach(id => {
    _setMetric(id, '—', 'muted');
  });
}

function _setMetric(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = 'metric-value' + (cls ? ' ' + cls : '');
}

function _psnrClass(v) {
  if (v > 40) return 'good';
  if (v > 30) return '';
  return 'warn';
}

function _ssimClass(v) {
  if (v > 0.9)  return 'good';
  if (v > 0.75) return '';
  return 'warn';
}

//  compare modal

/**
 * Render the compare-all results table inside the modal body.
 * Highlights the best filter per metric.
 *
 * @param {Array<{ key, metrics, elapsedMs, canvas }>} results
 */
export function renderCompareTable(results) {
  const body = document.getElementById('compare-body');
  if (!body) return;

  // Find best values
  const best = {
    psnr:   Math.max(...results.map(r => r.metrics.psnr)),
    ssim:   Math.max(...results.map(r => r.metrics.ssim)),
    mse:    Math.min(...results.map(r => r.metrics.mse)),
    timeMs: Math.min(...results.map(r => r.elapsedMs)),
  };

  // to sort by PSNR descending for ranking
  const sorted = [...results].sort((a, b) => b.metrics.psnr - a.metrics.psnr);

  const rows = sorted.map((r, rank) => {
    const f       = FILTERS[r.key];
    const isBest  = r.metrics.psnr === best.psnr;
    const rowCls  = isBest ? 'best-row' : '';

    return `
      <tr class="${rowCls}">
        <td><span class="rank-badge">${rank + 1}</span></td>
        <td><strong>${f.name}</strong></td>
        <td style="max-width:80px">
          <canvas width="64" height="64"
            style="width:64px;height:64px;border-radius:4px;border:0.5px solid rgba(0,0,0,0.08)"
            id="cmp-canvas-${r.key}">
          </canvas>
        </td>
        <td class="${r.metrics.psnr === best.psnr ? 'good' : ''}"
            style="color:${r.metrics.psnr === best.psnr ? 'var(--teal)' : 'inherit'}">
          ${r.metrics.psnr.toFixed(2)} dB
        </td>
        <td class="${r.metrics.ssim === best.ssim ? 'good' : ''}"
            style="color:${r.metrics.ssim === best.ssim ? 'var(--teal)' : 'inherit'}">
          ${r.metrics.ssim.toFixed(4)}
        </td>
        <td>${r.metrics.mse.toFixed(2)}</td>
        <td>${r.elapsedMs.toFixed(0)} ms</td>
      </tr>
    `;
  });

  body.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Filter</th>
          <th>Result</th>
          <th>PSNR ↑</th>
          <th>SSIM ↑</th>
          <th>MSE ↓</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `;

  // to paste thumbnails into the canvas cells
  sorted.forEach(r => {
    const canvas = document.getElementById(`cmp-canvas-${r.key}`);
    if (!canvas || !r.canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(r.canvas, 0, 0, 64, 64);
  });
}

/**
 * to show the compare overlay modal.
 */
export function showCompareModal() {
  const overlay = document.getElementById('compare-overlay');
  if (overlay) overlay.style.display = 'flex';
}

/**
 * to hide the compare overlay modal.
 */
export function hideCompareModal() {
  const overlay = document.getElementById('compare-overlay');
  if (overlay) overlay.style.display = 'none';
}
