// js/main.js
// Application entry point.
// Wires all DOM events → pipeline calls → UI updates.

import { simulateBlur, runDeblur, runAllFilters }   from './core/pipeline.js';
import { loadImageFile, renderToCanvas,
         clearCanvas, saveCanvasAsPNG,
         renderCompareStrip }                        from './ui/renderer.js';
import { renderInfoPanel, renderFilterTags,
         toggleIterRow }                             from './ui/infoPanel.js';
import { updateMetricsBar, resetMetricsBar,
         renderCompareTable, showCompareModal,
         hideCompareModal }                          from './ui/metricsDisplay.js';
import { FILTERS }                                   from './core/filterData.js';

// initialize state

const state = {
  originalPixels: null,
  blurredPixels:  null,
  width:          0,
  height:         0,
  activeFilter:   'inverse',
  isRunning:      false,
};

//  DOM refs 

const filterSelect   = document.getElementById('filter-select');
const omegaSlider    = document.getElementById('omega-slider');
const exposureSlider = document.getElementById('exposure-slider');
const regSlider      = document.getElementById('reg-slider');
const kernelSelect   = document.getElementById('kernel-select');
const iterSlider     = document.getElementById('iter-slider');
const runBtn         = document.getElementById('run-btn');
const compareBtn     = document.getElementById('compare-btn');
const resetBtn       = document.getElementById('reset-btn');
const uploadTrigger  = document.getElementById('upload-trigger');
const fileInput      = document.getElementById('file-input');

const saveBtn        = document.getElementById('save-btn');
const compareClose   = document.getElementById('compare-close');
const statusDot      = document.getElementById('status-dot');
const filterBadge    = document.getElementById('filter-badge');
const deblurLabel    = document.getElementById('deblur-cell-label');
const blurParamLabel = document.getElementById('blur-param-label');

const canvasOriginal  = document.getElementById('canvas-original');
const canvasBlurred   = document.getElementById('canvas-blurred');
const canvasDeblurred = document.getElementById('canvas-deblurred');
const emptyOriginal   = document.getElementById('empty-original');
const emptyBlurred    = document.getElementById('empty-blurred');
const emptyDeblurred  = document.getElementById('empty-deblurred');

//  Init 

renderInfoPanel('inverse');
renderFilterTags('inverse');
toggleIterRow('inverse');

//  Slider live-update labels 

omegaSlider.addEventListener('input', () => {
  document.getElementById('omega-val').textContent = omegaSlider.value + ' °/s';
});

exposureSlider.addEventListener('input', () => {
  document.getElementById('exposure-val').textContent = exposureSlider.value + ' ms';
});

regSlider.addEventListener('input', () => {
  document.getElementById('reg-val').textContent = (regSlider.value / 10000).toFixed(4);
});

iterSlider.addEventListener('input', () => {
  document.getElementById('iter-val').textContent = iterSlider.value;
});

//  Filter selection 

filterSelect.addEventListener('change', () => {
  const key = filterSelect.value;
  state.activeFilter = key;
  renderInfoPanel(key);
  renderFilterTags(key);
  toggleIterRow(key);
  filterBadge.textContent = FILTERS[key].name;
  deblurLabel.textContent = `Deblurred — ${FILTERS[key].name}`;
});

//  Image upload 

uploadTrigger.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

// drag and drop
const imageStrip = document.querySelector('.image-strip');

imageStrip.addEventListener('dragover', e => {
  e.preventDefault();
  imageStrip.classList.add('dragover');
});

imageStrip.addEventListener('dragleave', e => {
  if (!imageStrip.contains(e.relatedTarget)) imageStrip.classList.remove('dragover');
});

imageStrip.addEventListener('drop', e => {
  e.preventDefault();
  imageStrip.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFile(file);
});

async function handleFile(file) {
  try {
    _setStatus('running');
    const { pixels, width, height } = await loadImageFile(file);

    state.originalPixels = pixels;
    state.width          = width;
    state.height         = height;

    renderToCanvas(canvasOriginal, pixels, width, height);
    emptyOriginal.style.display = 'none';

    await simulateAndDisplay();
    _setStatus('ready');
  } catch (err) {
    console.error(err);
    _setStatus('error');
    _toast('Failed to load image');
  }
}

//  simulate blur

async function simulateAndDisplay() {
  if (!state.originalPixels) return;

  const params = _readParams();
  const { blurred } = simulateBlur(
    state.originalPixels, state.width, state.height, params
  );

  state.blurredPixels = blurred;
  renderToCanvas(canvasBlurred, blurred, state.width, state.height);
  emptyBlurred.style.display = 'none';

  blurParamLabel.textContent = `ω=${params.omega}°/s  T=${params.exposure}ms`;

  // reset deblurred panel and metrics
  clearCanvas(canvasDeblurred, emptyDeblurred);
  saveBtn.style.display = 'none';
  resetMetricsBar();
}

// re-simulate when blur parameters change
[omegaSlider, exposureSlider, kernelSelect].forEach(el => {
  el.addEventListener('change', () => {
    if (state.originalPixels) simulateAndDisplay();
  });
});

//  run deblur 

runBtn.addEventListener('click', async () => {
  if (!state.blurredPixels || state.isRunning) return;

  state.isRunning = true;
  runBtn.disabled = true;
  runBtn.textContent = 'Running…';
  _setStatus('running');

  try {
    const params = _readParams();
    const { restored, metrics, elapsedMs } = await runDeblur(
      state.blurredPixels,
      state.width,
      state.height,
      state.originalPixels,
      state.activeFilter,
      params
    );

    renderToCanvas(canvasDeblurred, restored, state.width, state.height);
    emptyDeblurred.style.display = 'none';
    updateMetricsBar(metrics, elapsedMs);
    saveBtn.style.display = 'inline-flex';
    _setStatus('ready');
  } catch (err) {
    console.error(err);
    _setStatus('error');
    _toast('Deblur failed — check console');
  } finally {
    state.isRunning     = false;
    runBtn.disabled     = false;
    runBtn.textContent  = 'Run deblur';
  }
});

//  Compare all ─

compareBtn.addEventListener('click', async () => {
  if (!state.blurredPixels || state.isRunning) return;

  state.isRunning = true;
  compareBtn.disabled = true;
  compareBtn.textContent = 'Running all…';
  _setStatus('running');

  try {
    const params  = _readParams();
    const results = await runAllFilters(
      state.blurredPixels, state.width, state.height,
      state.originalPixels, params
    );

    const strips = renderCompareStrip(results, state.width, state.height);

    // Attach canvas thumbnails to results
    const withCanvases = results.map((r, i) => ({ ...r, canvas: strips[i]?.canvas }));
    renderCompareTable(withCanvases);
    showCompareModal();
    _setStatus('ready');
  } catch (err) {
    console.error(err);
    _setStatus('error');
    _toast('Compare failed');
  } finally {
    state.isRunning          = false;
    compareBtn.disabled      = false;
    compareBtn.textContent   = 'Compare all filters';
  }
});

compareClose.addEventListener('click', hideCompareModal);
document.getElementById('compare-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideCompareModal();
});

//  Save 

saveBtn.addEventListener('click', () => {
  saveCanvasAsPNG(canvasDeblurred, FILTERS[state.activeFilter].name);
});

//  Reset ─

resetBtn.addEventListener('click', () => {
  state.originalPixels = null;
  state.blurredPixels  = null;
  clearCanvas(canvasOriginal,  emptyOriginal);
  clearCanvas(canvasBlurred,   emptyBlurred);
  clearCanvas(canvasDeblurred, emptyDeblurred);
  saveBtn.style.display = 'none';
  resetMetricsBar();
  _setStatus(null);
  blurParamLabel.textContent = '';
});

//  Helpers ─

function _readParams() {
  return {
    omega:       Number(omegaSlider.value),
    exposure:    Number(exposureSlider.value),
    eps:         Number(regSlider.value) / 10000,
    kernelType:  kernelSelect.value,
    iterations:  Number(iterSlider.value),
  };
}

function _setStatus(state) {
  statusDot.className = 'status-dot' + (state ? ' ' + state : '');
}

let _toastTimer = null;
function _toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}


//  Metric info tooltips 

const METRIC_INFO = {
  psnr: {
    title: 'Peak Signal-to-Noise Ratio',
    formula: 'PSNR = 10 · log₁₀(MAX² / MSE)',
    desc: 'Measures reconstruction quality in decibels. Higher is better. Above 40 dB is generally excellent; below 20 dB indicates heavy distortion.',
  },
  ssim: {
    title: 'Structural Similarity Index',
    formula: 'SSIM ∈ [0, 1]',
    desc: 'Compares luminance, contrast, and structure between images. 1.0 is a perfect match. Values above 0.95 indicate high perceptual similarity.',
  },
  mse: {
    title: 'Mean Squared Error',
    formula: 'MSE = Σ(fᵢ − f̂ᵢ)² / N',
    desc: 'Average squared pixel difference between the original and restored image. Lower is better. Sensitive to outliers and high-frequency noise.',
  },
  std: {
    title: 'Std Dev Difference (Δσ)',
    formula: 'Δσ = σ_original − σ_restored',
    desc: 'Difference in standard deviation between original and restored image. Near zero means contrast and texture variance are well preserved.',
  },
  time: {
    title: 'Processing Time',
    formula: 'Wall-clock ms (JS main thread)',
    desc: 'Time taken to run the selected deblur algorithm on this image. Excludes polar transform and rendering. Useful for comparing filter complexity.',
  },
};

const tooltip = document.createElement('div');
tooltip.className = 'metric-tooltip';
document.body.appendChild(tooltip);

document.querySelectorAll('.metric-info-btn').forEach(btn => {
  btn.addEventListener('mouseenter', e => {
    const key  = btn.dataset.tooltip;
    const info = METRIC_INFO[key];
    if (!info) return;

    tooltip.innerHTML = `
      <span class="metric-tooltip-title">${info.title}</span>
      <span class="metric-tooltip-formula">${info.formula}</span>
      ${info.desc}
    `;

    const rect = btn.getBoundingClientRect();
    const tt_w = 220;
    let left = rect.left + rect.width / 2 - tt_w / 2;
    // clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tt_w - 8));
    const top = rect.top - 8; // will be pushed up by transform below

    tooltip.style.left      = left + 'px';
    tooltip.style.top       = top + 'px';
    tooltip.style.transform = 'translateY(-100%)';
    tooltip.classList.add('visible');
  });

  btn.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
  });
});