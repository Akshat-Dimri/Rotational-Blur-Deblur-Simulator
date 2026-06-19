// js/ui/latex.js
// Standalone MathJax loader and typesetter.
// Guarantees MathJax is loaded exactly once regardless of how many modules import it.

let _state = 'idle'; // 'idle' | 'loading' | 'ready'
const _queue = [];   // callbacks waiting for MathJax to be ready

/**
 * ensuring MathJax 3 is loaded, then call cb().
 */
function _ensureReady(cb) {
  if (_state === 'ready')   { cb(); return; }
  if (_state === 'loading') { _queue.push(cb); return; }

  _state = 'loading';
  _queue.push(cb);

  window.MathJax = {
    tex: {
      inlineMath:  [['\\(', '\\)']],
      displayMath: [['\\[', '\\]']],
      packages:    { '[+]': ['ams'] },
    },
    chtml: {
      scale:           0.90,
      minScale:        0.5,
      matchFontHeight: false,
    },
    options: {
      skipHtmlTags: ['script','noscript','style','textarea','pre'],
    },
    startup: {
      typeset: false,   // to never autoscan
      ready() {
        MathJax.startup.defaultReady();
        _state = 'ready';
        _queue.forEach(fn => fn());
        _queue.length = 0;
      },
    },
  };

  const s   = document.createElement('script');
  s.src     = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js';
  s.async   = true;
  s.id      = 'mathjax-script';
  document.head.appendChild(s);
}

/**
 * Typeset all LaTeX inside a DOM element.
 * Clears any previous MathJax output on that element first.
 *
 * @param  {HTMLElement} el
 * @returns {Promise<void>}
 */
export function typeset(el) {
  return new Promise((resolve, reject) => {
    _ensureReady(async () => {
      try {
        // Clear stale MathJax state from previous renders on this node
        if (MathJax.typesetClear) MathJax.typesetClear([el]);
        await MathJax.typesetPromise([el]);
        resolve();
      } catch (err) {
        console.warn('[latex.js] MathJax error:', err);
        reject(err);
      }
    });
  });
}