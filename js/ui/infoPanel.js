// js/ui/infoPanel.js
// Renders filter metadata into the right-hand info panel.
// LaTeX rendering delegated entirely to latex.js.

import { FILTERS }  from '../core/filterData.js';
import { typeset }  from './latex.js';

const panel = document.getElementById('panel-info');

/**
 * Render the info panel for a given filter key.
 * @param {string} key
 */
export async function renderInfoPanel(key) {
  const f = FILTERS[key];
  if (!f || !panel) return;

  // Wrap each LaTeX string in a display-math delimiter block
  const mathHTML = f.math
    .map(latex => `<div class="math-line">\\[${latex}\\]</div>`)
    .join('');

  panel.innerHTML = `
    <div class="info-block">
      <div class="info-name">${f.name}</div>
      <div class="info-desc">${f.desc}</div>
    </div>

    <div class="info-block">
      <span class="info-section-label">Core equation</span>
      <div class="math-block latex-block" id="latex-target">${mathHTML}</div>
    </div>

    <div class="info-block">
      <span class="info-section-label">Processing flow</span>
      <div class="flow-list">
        ${f.flow.map((step, i) => `
          ${i > 0 ? '<div class="flow-arrow">↓</div>' : ''}
          <div class="flow-node">${_esc(step)}</div>
        `).join('')}
      </div>
    </div>

    <div class="info-block">
      <span class="info-section-label">Strengths</span>
      <ul class="bullet-list good">
        ${f.good.map(s => `<li>${_esc(s)}</li>`).join('')}
      </ul>
    </div>

    <div class="info-block">
      <span class="info-section-label">Weaknesses</span>
      <ul class="bullet-list bad">
        ${f.bad.map(s => `<li>${_esc(s)}</li>`).join('')}
      </ul>
    </div>

    <div class="info-block">
      <span class="info-section-label">Best used when</span>
      <div class="info-when">${_esc(f.when)}</div>
    </div>
  `;

  // Typeset the freshly injected LaTeX
  const target = document.getElementById('latex-target');
  if (target) await typeset(target);
}

/**
 * Render filter-type tags (iterative / blind / optimal) under the dropdown.
 * @param {string} key
 */
export function renderFilterTags(key) {
  const f    = FILTERS[key];
  const wrap = document.getElementById('filter-tags');
  if (!f || !wrap) return;
  wrap.innerHTML = f.tags.length
    ? f.tags.map(t => `<span class="filter-tag ${t.cls}">${t.label}</span>`).join('')
    : '';
}

/**
 * Show / hide the iterations slider row based on filter type.
 * @param {string} key
 */
export function toggleIterRow(key) {
  const row = document.getElementById('iter-row');
  if (row) row.style.display = ['rl','tv','blind'].includes(key) ? 'flex' : 'none';
}

// helpers functions

function _esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}