let _ready = false;
let _queue = [];

function _boot(cb) {
  if (_ready) { cb(); return; }
  _queue.push(cb);
  if (document.getElementById('mjax-script')) return;

  window.MathJax = {
    tex: {
      inlineMath:  [['\\(','\\)']],
      displayMath: [['\\[','\\]']],
      packages:    {'[+]': ['ams', 'boldsymbol']},
      tags: 'none',
    },
    chtml: {
      scale: 1.0,
      minScale: 0.6,
      matchFontHeight: false,
      mtextInheritFont: true,
    },
    options: {
      skipHtmlTags: ['script','noscript','style','textarea','pre'],
    },
    startup: {
      typeset: false,
      ready() {
        MathJax.startup.defaultReady();
        _ready = true;
        _queue.forEach(fn => fn());
        _queue = [];
      },
    },
  };

  const s = document.createElement('script');
  s.id    = 'mjax-script';
  s.src   = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js';
  s.async = true;
  document.head.appendChild(s);
}

/**
 * @param {HTMLElement} el
 * @returns {Promise<void>}
 */
export function typesetElement(el) {
  return new Promise((resolve, reject) => {
    _boot(async () => {
      try {
        if (MathJax.typesetClear) MathJax.typesetClear([el]);
        await MathJax.typesetPromise([el]);
        resolve();
      } catch(e) { console.warn('[latex-renderer]', e); reject(e); }
    });
  });
}

/**
 * @returns {Promise<void>}
 */
export function typesetAll() {
  return new Promise((resolve, reject) => {
    _boot(async () => {
      try {
        const els = document.querySelectorAll('[data-latex]');
        els.forEach(el => {
          if (!el.dataset.injected) {
            el.innerHTML = `\\[${el.dataset.latex}\\]`;
            el.dataset.injected = '1';
          }
        });
        await MathJax.typesetPromise([...els]);
        resolve();
      } catch(e) { console.warn('[latex-renderer]', e); reject(e); }
    });
  });
}

/**
 * to typeset a single element by its id, with an explicit LaTeX string.
 * @param {string} id
 * @param {string} latex  — raw LaTeX without delimiters
 * @returns {Promise<void>}
 */
export function typesetById(id, latex) {
  const el = document.getElementById(id);
  if (!el) return Promise.resolve();
  el.innerHTML = `\\[${latex}\\]`;
  return typesetElement(el);
}
