# Rotational Deblur Explorer

An interactive browser-based tool for understanding and comparing image deblurring algorithms applied to **rotational motion blur** — the spatially variant degradation that occurs in gimbal-mounted cameras, satellite imaging sensors, and scanning electro-optical systems.

Built as part of a summer internship project at **IRDE, DRDO, Dehradun** (May–July 2025).

**Live demo:** `https://akshatdimri.github.io/rotational-deblur`

---

## The problem

When an imaging sensor rotates during exposure, each pixel traces a circular arc. Pixels further from the rotation centre sweep out longer arcs — meaning the blur **varies with radius**. This spatially variant PSF makes standard deconvolution methods (which assume uniform blur) ineffective.

**The key insight:** transform the image from Cartesian to polar coordinates. In polar space, rotational blur becomes a **1D linear shift along the angular axis (θ)** for each fixed radius. This converts a spatially variant problem into a locally shift-invariant one — amenable to standard frequency-domain inversion.

---

## What this tool does

1. **Simulates** rotational motion blur on any uploaded image using a physics-consistent angular PSF
2. **Deblurs** using seven different restoration algorithms, each selectable from a dropdown
3. **Displays** the full mathematical formulation, processing flow diagram, and strengths/weaknesses for each algorithm
4. **Measures** restoration quality using PSNR, SSIM, MSE, and standard deviation metrics
5. **Compares** all seven algorithms side-by-side with a ranked results table

---

## Algorithms included

| Filter | Type | Key property |
|---|---|---|
| Inverse filter | Direct | Fastest; noise-sensitive |
| Wiener filter | Direct | MSE-optimal for Gaussian noise |
| Tikhonov / L2 | Direct | Tunable smoothness penalty |
| Richardson-Lucy | Iterative | Optimal for Poisson (photon) noise |
| Total variation | Iterative | Edge-preserving regularisation |
| Kalman smoother | Optimal | Probabilistic; gives uncertainty estimates |
| Blind deconv | Iterative | Simultaneous PSF + image estimation |

---

## Repository structure

```
rotational-deblur/
│
├── index.html                  # App entry point
│
├── css/
│   ├── layout.css              # App shell, grid, topbar
│   ├── panels.css              # Left/centre/right panel styles
│   └── components.css          # Buttons, sliders, inputs
│
├── js/
│   ├── main.js                 # Event wiring and orchestration
│   │
│   ├── core/
│   │   ├── pipeline.js         # Blur simulation + deblur dispatch
│   │   ├── polarTransform.js   # Cartesian ↔ polar transforms
│   │   ├── fft.js              # Cooley-Tukey FFT / IFFT
│   │   ├── kernel.js           # PSF kernel builders
│   │   ├── metrics.js          # PSNR, SSIM, MSE, std dev
│   │   └── filterData.js       # Filter metadata (equations, flow, tags)
│   │
│   ├── filters/
│   │   ├── inverseFilter.js    # Inverse / Wiener / Tikhonov
│   │   ├── richardsonLucy.js   # Richardson-Lucy iterative
│   │   └── advancedFilters.js  # TV, Kalman, blind deconv
│   │
│   └── ui/
│       ├── renderer.js         # Canvas rendering, image I/O
│       ├── infoPanel.js        # Right-panel equation/flow renderer
│       └── metricsDisplay.js   # Metrics bar + compare modal
│
├── assets/
│   └── demo-images/            # Sample test images
│
└── docs/
    └── physics-notes.md        # Extended theory and derivations
```

---

## Running locally

No build step required — pure ES modules.

```bash
git clone https://github.com/akshatdimri/rotational-deblur
cd rotational-deblur

# Any static file server works:
npx serve .
# or
python -m http.server 8080
```

Open `http://localhost:8080` in Chrome or Firefox.

> **Note:** Must be served over HTTP (not opened as a file) due to ES module CORS restrictions.

---

## Deploying to GitHub Pages

1. Push the repo to GitHub
2. Go to **Settings → Pages → Source: Deploy from branch → main / root**
3. GitHub Pages will serve `index.html` at `https://<username>.github.io/rotational-deblur`

---

## Performance notes

- Images are downscaled to a maximum of 512px on the longer axis before processing
- The polar transform is O(W × H) — runs in < 1s for 512×512 in a modern browser
- Richardson-Lucy and TV are iterative — 20 iterations recommended; increase for better quality at cost of speed
- Blind deconvolution is capped at 8 outer iterations in compare mode for responsiveness

---

## Physical parameters

| Parameter | Symbol | Default | Effect |
|---|---|---|---|
| Angular velocity | ω | 75 °/s | Determines blur arc length |
| Exposure time | T | 5 ms | Proportional to arc length |
| Regularisation | ε | 0.0005 | Noise vs sharpness trade-off |

Angular blur extent: `Δθ = ω · T = 0.375°` at defaults.
Blur in pixels (512px image, 60° FOV): `L = Δθ / (FOV/W) ≈ 3.2 px`

---

## References

1. Sanipour & Akhlaghi — *A New Method for Eliminating Blur Caused by Rotational Motion*, PeerJ 2015
2. Chen & Chen — *Regularization Rotational Motion Image Blur Restoration*, J. Chem. Pharm. Res. 2016
3. Fawwaz et al. — *Restoration of Rotational Motion Blurred Images using Inverse Filters*, ISCIE 2011
4. Wang et al. — *Image Quality Assessment: From Error Visibility to Structural Similarity*, IEEE TIP 2004
5. Gonzalez & Woods — *Digital Image Processing*, 4th ed., Pearson 2018
