# Physics Notes — Rotational Deblur

Extended theory behind the polar-domain image restoration pipeline.

---

## 1. Origin of rotational motion blur

In any imaging system where angular motion occurs during the exposure interval — gimbal-mounted surveillance cameras, satellite scanners, derotation-prism optics — each pixel traces a circular arc on the sensor plane.

For a pixel at position `(x, y)` rotating about centre `(x₀, y₀)` with angular velocity `ω` over exposure time `T`:

```
x(t) = x₀ + (x − x₀)cos(ωt) − (y − y₀)sin(ωt)
y(t) = y₀ + (x − x₀)sin(ωt) + (y − y₀)cos(ωt)
```

The resulting blurred image is the time-integral of the scene over this trajectory:

```
g(x, y) = (1/T) ∫₀ᵀ f(x(t), y(t)) dt
```

**Key property:** the arc length for a pixel at radial distance `r = √((x−x₀)² + (y−y₀)²)` is `s = r·ω·T`. Pixels further from the rotation centre are blurred more — making this **spatially variant**.

---

## 2. Why polar coordinates solve this

In Cartesian space, the PSF `h(x, y; x₀, y₀)` depends on position. Standard convolution (shift-invariant) cannot model this.

**Coordinate transform:** let `r = √(x²+y²)`, `θ = arctan(y/x)`.

In polar coordinates, the rotational motion becomes a **linear shift along θ at fixed r**:

```
g(r, θ) = (1/T) ∫₀ᵀ f(r, θ − ωt) dt
```

This is a standard 1D convolution in `θ` for each fixed `r`:

```
g_r(θ) = f_r(θ) * h_r(θ)
```

where `h_r(θ)` is a box kernel of angular width `Δθ = ω·T`, applied along the angular axis. The kernel width is **constant in angle** (shift-invariant in polar space), even though it varies in pixels with radius.

---

## 3. Discrete implementation

**Angular step:** `δθ = FOV / W` degrees per pixel.

**Kernel size in pixels at radius r:**

```
L(r) = r · ω · T · (π/180)   [arc length in pixels]
Lθ   = ω · T / δθ             [in angular pixels — constant for all r]
```

This is why processing in polar space is efficient: the same kernel `h[k]` of fixed pixel-width applies to every radial ring, regardless of radius.

---

## 4. The seven deblurring algorithms

### 4.1 Inverse filter

Direct spectral division:

```
F̂(u) = G(u) / (H(u) + ε)
```

When `H(u) ≈ 0` (at frequencies where the PSF has nulls), noise dominates. The regularisation floor `ε` prevents division by zero but limits recovery at those frequencies.

### 4.2 Wiener filter

Minimises `E[||f − f̂||²]` (mean squared error) under the assumption of stationary Gaussian signal and noise:

```
F̂(u) = [H*(u) / (|H(u)|² + Sₙₙ(u)/Sff(u))] · G(u)
```

where `Sₙₙ/Sff` is the noise-to-signal power spectral density ratio. In practice, approximated as a constant `NSR`.

**Connection to Tikhonov:** setting `NSR = λ` gives identical formulae. The Wiener filter has a Bayesian interpretation (MAP estimator under Gaussian priors); Tikhonov has a variational one (penalty on `||f||²`).

### 4.3 Tikhonov / L2 regularisation

Minimises:

```
min_f  ||h*f − g||²  +  λ||f||²
```

Solution in frequency domain:

```
F̂(u) = H*(u) · G(u) / (|H(u)|² + λ)
```

`λ` directly controls the balance: `λ→0` approaches the inverse filter; `λ→∞` smooths everything to zero.

### 4.4 Richardson-Lucy

Derived from Bayes' theorem with a Poisson likelihood (appropriate for photon-counting detectors):

```
P(g | f) = ∏ᵢ Poisson(gᵢ; (h*f)ᵢ)
```

The EM update rule (E-step: compute expected complete data; M-step: maximise) gives:

```
f_{n+1} = f_n · [hᵀ * (g / (h * fₙ))]
```

This is multiplicative, guaranteeing `f ≥ 0` throughout. Convergence is typically reached in 10–50 iterations. Over-iteration amplifies noise — a stopping criterion (e.g., `||fₙ₊₁ − fₙ|| < tol`) is essential.

### 4.5 Total variation

Seeks a solution that is piecewise smooth (edges preserved, flat regions smooth):

```
min_f  ||h*f − g||²  +  λ · ∫|∇f| dx
```

The TV seminorm `∫|∇f|` promotes sparsity of gradients. Solved via gradient descent:

```
f ← f − α · [hᵀ*(h*f − g) + λ · div(∇f / |∇f|)]
```

The `div(∇f/|∇f|)` term is the **mean curvature** of the level sets of `f` — it shrinks them, removing noise while preserving sharp transitions.

**Staircase effect:** TV minimisation can produce piecewise-constant "staircase" artefacts on smooth intensity gradients. Ameliorated by second-order TV (TGV) or Huber-TV variants.

### 4.6 Kalman smoother

Treats each angular row as a 1D state-space sequence:

```
State:  xₙ = A·xₙ₋₁ + wₙ,   wₙ ~ N(0, Q)
Obs:    yₙ = C·xₙ  + vₙ,     vₙ ~ N(0, R)
```

where `A`, `C` are constructed from the PSF structure. The **forward Kalman filter** produces the minimum-variance linear estimate given observations up to time `n`. The **backward RTS smoother** incorporates future observations:

```
xₛ[n] = xf[n] + G·(xₛ[n+1] − xf[n])
G = Pf[n] · A^T · (A·Pf[n]·A^T + Q)⁻¹
```

The result is the optimal (MMSE) linear estimator for Gaussian noise — identical to Wiener in the stationary case, but more flexible for non-stationary signals and boundary conditions.

### 4.7 Blind deconvolution

The most general case — both `f` and `h` are unknown:

```
min_{f,h}  ||h*f − g||²  +  λ₁·||∇f||₁  +  λ₂·||h||₁
subject to: h ≥ 0,  Σh = 1
```

Solved by alternating minimisation:
1. Fix `h` → update `f` (Tikhonov or TV step)
2. Fix `f` → update `h` (projected gradient, enforce non-negativity and unit sum)

This is **ill-posed** without the sparsity priors: the trivial solution `h = δ, f = g` (no deblurring) always satisfies the data term. The priors steer the solution towards a sharp image and compact kernel.

---

## 5. Metrics

| Metric | Formula | Interpretation |
|---|---|---|
| MSE | `(1/N)·Σ(fᵢ − f̂ᵢ)²` | Average squared pixel error |
| PSNR | `10·log₁₀(255² / MSE)` | dB above noise floor; >40 dB is good |
| SSIM | `(2μₐμᵦ+C₁)(2σₐᵦ+C₂) / (μₐ²+μᵦ²+C₁)(σₐ²+σᵦ²+C₂)` | Perceptual similarity; 1 = identical |
| Std dev Δ | `σ_restored − σ_original` | Positive = over-sharpened; negative = over-smoothed |

---

## 6. Known limitations

- **Fixed rotation centre:** current implementation assumes the rotation centre is at the image centre. Off-centre rotation requires a preprocessing step to estimate and shift the centre.
- **Constant angular velocity:** real systems have time-varying `ω(t)`. Extension: integrate the actual motion trajectory.
- **Greyscale only:** colour images are currently converted to luminance. Full-colour processing would apply the pipeline per channel.
- **FFT circular assumption:** the wraparound padding mitigates but does not eliminate edge artefacts from the circular convolution assumption.
