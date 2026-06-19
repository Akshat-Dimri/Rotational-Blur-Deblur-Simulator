// js/core/filterData.js
// Filter metadata. math[] arrays contain LaTeX strings rendered by MathJax 3.
// Use only standard TeX — avoid \text{} inside aligned for compatibility.

export const FILTERS = {
  inverse: {
    name: 'Inverse filter',
    tags: [],
    desc: 'Divides the blurred image spectrum by the PSF spectrum directly in the frequency domain. The simplest and fastest deconvolution — but directly amplifies noise at frequencies where H(u) is near zero.',
    math: [
      String.raw`\hat{F}(u) = \frac{G(u)}{H(u) + \varepsilon}`,
      String.raw`\begin{aligned}
G(u) &= \mathcal{F}\{\text{blurred polar column}\} \\
H(u) &= \mathcal{F}\{\text{PSF kernel}\} \\
\varepsilon &= \text{regularisation floor}
\end{aligned}`,
    ],
    flow: ['Cartesian → polar transform','Build angular PSF kernel h[k]','FFT each radial slice → G(u)','FFT of kernel → H(u)','Compute F̂ = G / (H + ε)','IFFT → deblurred polar','Polar → Cartesian'],
    good: ['Fastest (single FFT pass)','Exact inversion when noise-free','Simple to implement'],
    bad:  ['Amplifies noise severely','Ringing artefacts at edges','Needs accurate PSF'],
    when: 'SNR is high, the blur kernel is accurately known, and computation speed matters.',
  },

  wiener: {
    name: 'Wiener filter',
    tags: [{ label: 'optimal', cls: 'optimal' }],
    desc: 'Minimises mean-squared error by trading off inverse filtering against noise smoothing. Requires an estimate of the noise-to-signal power ratio (NSR). Statistically optimal for Gaussian noise.',
    math: [
      String.raw`\hat{F}(u) = \frac{H^{*}(u)}{|H(u)|^{2} + \mathrm{NSR}} \cdot G(u)`,
      String.raw`\begin{aligned}
H^{*}(u) &= \text{complex conjugate of } H(u) \\
\mathrm{NSR} &= S_{nn}(u) \,/\, S_{ff}(u) \\
\mathrm{NSR} \to 0 &\Rightarrow \text{pure inverse filter} \\
\mathrm{NSR} \to \infty &\Rightarrow \hat{F} = 0
\end{aligned}`,
    ],
    flow: ['Cartesian → polar transform','FFT blurred column → G(u)','FFT kernel → H(u), compute H*(u)','Apply: F̂ = H*·G / (|H|² + NSR)','IFFT → deblurred polar','Polar → Cartesian'],
    good: ['MSE-optimal for Gaussian noise','Stable near zero frequencies','Tunable via NSR'],
    bad:  ['Requires noise power estimate','Linear — struggles with heavy noise','Assumes known PSF'],
    when: 'You have a reasonable noise level estimate and want the statistically optimal linear restoration.',
  },

  tikhonov: {
    name: 'Tikhonov / L2',
    tags: [],
    desc: 'Adds a smoothness penalty λ‖f‖² to the inversion problem. Equivalent to the Wiener filter when λ equals the noise-to-signal ratio. The parameter λ directly controls the ringing vs smoothness trade-off.',
    math: [
      String.raw`\min_{f} \;\|h * f - g\|^{2} + \lambda\|f\|^{2}`,
      String.raw`\hat{F}(u) = \frac{H^{*}(u) \cdot G(u)}{|H(u)|^{2} + \lambda}`,
      String.raw`\lambda \uparrow \;\Rightarrow\; \text{smoother} \qquad \lambda \downarrow \;\Rightarrow\; \text{sharper}`,
    ],
    flow: ['Cartesian → polar transform','FFT blurred column → G(u)','FFT kernel → H(u)','Compute denominator |H|² + λ','Apply: F̂ = H*·G / (|H|² + λ)','IFFT → deblurred polar','Polar → Cartesian'],
    good: ['Controls ringing via λ','Numerically stable','Same cost as Wiener'],
    bad:  ['Over-smooths fine details at high λ','Uniform smoothness assumption','λ requires manual tuning'],
    when: 'You want a stable, tunable deconvolution — this is the direct upgrade of your existing implementation.',
  },

  rl: {
    name: 'Richardson-Lucy',
    tags: [{ label: 'iterative', cls: 'iterative' }],
    desc: 'Iterative Bayesian algorithm assuming Poisson photon-counting noise. Each step multiplicatively updates the estimate, guaranteeing non-negativity throughout. Standard in astronomy and fluorescence microscopy.',
    math: [
      String.raw`f_{n+1} = f_{n} \cdot \left( h^{\top} * \frac{g}{h * f_{n}} \right)`,
      String.raw`\begin{aligned}
h &= \text{PSF kernel (forward)} \\
h^{\top} &= \text{flipped PSF (back-projection)} \\
* &= \text{convolution} \quad (\text{iterate } 10\text{--}50\times)
\end{aligned}`,
    ],
    flow: ['Initialise f₀ = blurred image','Forward project: u = h ∗ fₙ','Compute ratio map: g / u','Back-project: hᵀ ∗ (g / u)','Multiply update: fₙ₊₁ = fₙ · update','Check ‖fₙ₊₁ − fₙ‖ < tol','Polar → Cartesian'],
    good: ['Preserves non-negativity','Natural for Poisson (photon) noise','No matrix inversion'],
    bad:  ['Slow — O(k · n log n) for k iters','Over-iteration reintroduces noise','Needs stopping criterion'],
    when: 'Images from photon-counting detectors (IR cameras, microscopes, astronomical sensors) where Poisson noise dominates.',
  },

  tv: {
    name: 'Total variation',
    tags: [{ label: 'iterative', cls: 'iterative' }],
    desc: 'Minimises the total variation of the restored image — the integral of gradient magnitudes. Preserves sharp edges while suppressing noise, ideal for piecewise-smooth imagery.',
    math: [
      String.raw`\min_{f} \;\|h * f - g\|^{2} + \lambda \cdot \mathrm{TV}(f)`,
      String.raw`\mathrm{TV}(f) = \sum_{i} |\nabla f_{i}|`,
      String.raw`f \leftarrow f - \alpha \!\left[ h^{\top}*(h*f - g) \;+\; \lambda \operatorname{div}\!\left(\frac{\nabla f}{|\nabla f|}\right) \right]`,
    ],
    flow: ['Initialise f = blurred image','Data term gradient: hᵀ∗(h∗f − g)','TV gradient: div(∇f / |∇f| + δ)','Combine and step: f ← f − α·(data + λ·TV)','Clip to [0, 255]','Repeat until convergence','Polar → Cartesian'],
    good: ['Edge-preserving','Handles piecewise-smooth well','Suppresses noise without blurring edges'],
    bad:  ['Computationally expensive','Staircase artefacts on smooth gradients','Two hyperparameters (λ, α)'],
    when: 'Urban/target imagery with sharp edges and smooth regions where boundary preservation is critical.',
  },

  kalman: {
    name: 'Kalman smoother',
    tags: [{ label: 'optimal', cls: 'optimal' }],
    desc: 'Treats each angular row in polar space as a 1D time series. The PSF becomes the state-transition model. A forward Kalman filter followed by a backward RTS smoother gives the optimal MMSE estimate.',
    math: [
      String.raw`\begin{aligned}
x_{n} &= A\,x_{n-1} + w_{n}, \quad w_{n} \sim \mathcal{N}(0,\,Q) \\
y_{n} &= C\,x_{n} \;+\; v_{n}, \quad v_{n} \sim \mathcal{N}(0,\,R)
\end{aligned}`,
      String.raw`x_{n}^{s} = x_{n}^{f} + G\!\left(x_{n+1}^{s} - x_{n}^{f}\right)`,
      String.raw`G = P_{n}^{f} A^{\top}\!\left(A\,P_{n}^{f} A^{\top} + Q\right)^{-1}`,
    ],
    flow: ['Build A, C matrices from PSF','Set Q (process noise), R (sensor noise)','Forward Kalman: predict + update each θ','Store all state means and covariances','Backward RTS smoother pass','Read out smoothed state as deblurred row','Repeat per radial ring → Polar → Cartesian'],
    good: ['Optimal for linear Gaussian noise','Handles boundary conditions naturally','Gives uncertainty estimates'],
    bad:  ['O(n·k²) per row — expensive','PSF→state matrix conversion non-trivial','Assumes Gaussian noise model'],
    when: 'Well-characterised Gaussian sensor noise and need for principled uncertainty estimates alongside the deblurred result.',
  },

  blind: {
    name: 'Blind deconv',
    tags: [{ label: 'blind', cls: 'blind' }, { label: 'iterative', cls: 'iterative' }],
    desc: 'Simultaneously estimates both the unknown PSF h and the sharp image f via alternating minimisation with sparsity priors on both unknowns. Experimental.',
    math: [
      String.raw`\min_{f,\,h} \;\|h * f - g\|^{2} + \lambda_{1}\|\nabla f\|_{1} + \lambda_{2}\|h\|_{1}`,
      String.raw`\text{subject to} \quad h \geq 0, \quad \textstyle\sum h = 1`,
      String.raw`\begin{aligned}
(1)\;&\text{fix } h \;\to\; \text{solve for } f \\
(2)\;&\text{fix } f \;\to\; \text{update } h \\
&\text{repeat until } \|h_{n} - h_{n-1}\| < \mathrm{tol}
\end{aligned}`,
    ],
    flow: ['Initialise h = uniform kernel, f = g','Step 1: solve for f using current h','Step 2: solve for h using current f','Project h onto simplex (h ≥ 0, Σh=1)','Check convergence on h','Output deblurred f and estimated h','Polar → Cartesian'],
    good: ['No PSF knowledge required','Can discover asymmetric blur','Most general approach'],
    bad:  ['Ill-posed without strong priors','Slow and fragile','May converge to wrong local minimum'],
    when: 'PSF is completely unknown and cannot be calibrated from physical parameters — last resort.',
  },
};