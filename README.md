# Leveling & Earthworks Visualizer

An interactive civil surveying, drainage analysis, and cut-and-fill earthwork modeling web application built with **React**, **TypeScript**, **Tailwind CSS**, **HTML5 Canvas**, and **Three.js**.

Designed for civil engineering students, surveyors, and site planners, the tool converts raw optical leveling field readings into Reduced Levels (RL), verifies arithmetic closure, analyzes station-to-station drainage slopes, and models cut/fill volumes across both a **2D longitudinal profile** and a **toggleable 3D corridor surface**.

---

## 1. Engineering Purpose

Optical leveling and preliminary earthwork estimation sit at the foundation of site grading, road alignment, and stormwater drainage design:

- **Elevation Control (Leveling):** Convert Back Sight (BS), Intermediate Sight (IS), and Foresight (FS) staff readings from a starting Benchmark (BM) into station elevations (RL), with immediate arithmetic verification.
- **Drainage Awareness:** Identify flat zones (< 0.50% slope), reverse-grade intervals, and sag low-points where surface runoff can pond instead of draining cleanly.
- **Cut-and-Fill Estimation:** Compare Existing Ground Level (EGL) against a horizontal datum or sloped Formation Grade Line (FGL) to compute excavation (cut) vs. embankment (fill) cross-sectional areas, corridor volumes, daylight transitions, and zero-balance datum elevations.
- **Spatial Inspection (2D & 3D):** Switch seamlessly between a quantitative 2D profile chart, an interactive 3D terrain/formation surface view, or a split workspace to inspect gradients and earthwork prisms from any angle.

---

## 2. Surveying Methods & Formulas

### A. Height of Instrument (Collimation / HI) Method
Used for rapid reduction when multiple Intermediate Sights are taken from a single instrument setup:

$$\text{HI} = \text{RL}_{\text{known}} + \text{BS}$$

$$\text{RL}_{\text{station}} = \text{HI} - \text{IS} \quad \text{or} \quad \text{RL}_{\text{CP}} = \text{HI} - \text{FS}$$

At a **Change Point (CP)**, a Foresight closes the current instrument setup, and a new Backsight establishes the updated Height of Instrument:

$$\text{HI}_{\text{new}} = \text{RL}_{\text{CP}} + \text{BS}_{\text{new}}$$

### B. Rise & Fall Method
Computes point-to-point elevation differences between consecutive staff readings within the same setup, providing an independent check on every intermediate station:

$$\Delta h_i = \text{Reading}_{i-1} - \text{Reading}_i$$

- If $\Delta h_i > 0$: **Rise** $= \Delta h_i$, $\text{RL}_i = \text{RL}_{i-1} + \text{Rise}$
- If $\Delta h_i < 0$: **Fall** $= |\Delta h_i|$, $\text{RL}_i = \text{RL}_{i-1} - \text{Fall}$

### C. Leveling Arithmetic Closure Checks
The field sheet continuously checks both structural setup integrity and arithmetic closure:

- **HI Method Check:**
  $$\sum \text{BS} - \sum \text{FS} = \text{Last RL} - \text{First RL}$$
- **Rise & Fall Method Check:**
  $$\sum \text{BS} - \sum \text{FS} = \sum \text{Rise} - \sum \text{Fall} = \text{Last RL} - \text{First RL}$$

Any discrepancy exceeding $0.0015\text{ m}$ or missing setup readings (e.g., an unclosed setup or missing initial BS) is flagged immediately with the exact $\Delta$ error.

### D. Formation Slope, Cut/Fill & Drainage Logic
- **Target Formation Line (FGL):**
  $$\text{FGL}(x) = \text{FGL}_0 + \left(\frac{P}{100}\right) x$$
  Synchronized across **Grade Percentage ($P\%$)**, **Grade Angle ($\theta = \arctan(P/100)$)**, and **Slope Ratio ($1 : N$, where $N = 100/P$)**.
- **Daylight Crossing (Zero Cut/Fill):** When $d_1 = \text{EGL}_1 - \text{FGL}_1$ and $d_2 = \text{EGL}_2 - \text{FGL}_2$ have opposite signs across interval $\Delta x = x_2 - x_1$:
  $$x_{\text{cross}} = x_1 + \frac{|d_1|}{|d_1| + |d_2|} \Delta x$$
- **Areas & Volumes:**
  - Centerline profile areas are integrated trapezoidally across each pure cut/fill sub-interval (split at $x_{\text{cross}}$).
  - For a uniform corridor of width $B$, $V = A \times B$. When **Cross-Offsets (L/R)** are enabled, the corridor is integrated across transverse slices spanning $[-B/2, +B/2]$ between Left, Center, and Right ground elevations.
- **Drainage Check Between Stations:**
  $$S_i = \frac{\text{RL}_{i+1} - \text{RL}_i}{x_{i+1} - x_i} \times 100\%$$
  Intervals with $|S_i| < 0.50\%$ are flagged as **Marginal / Flat Spots**, while valleys where downward grade transitions to upward grade (or opposes the target drainage direction) are flagged as **Sag / Reverse-Grade Traps**.

---

## 3. Toggleable 3D Ground Surface & Cut-and-Fill View

Users can switch between **2D Profile**, **3D Surface**, and **Split View** from the workspace toolbar without interrupting table editing or calculations.

### How Corridor Parameters Shape 3D Geometry
- **Station Chainages & RLs:** Mapped along the longitudinal $X$-axis (centered at mid-chainage) and vertical $Y$-axis.
- **Corridor Width ($B$):** Controls the transverse $Z$-axis span $[-B/2, +B/2]$.
  - **Standard Mode:** Sweeps the centerline ground profile uniformly across width $B$ so the prismatic relationship $V = A \times B$ is visually clear.
  - **Cross-Offsets Mode (`Cross-Offsets L/R: On`):** Uses per-station Left ($\Delta \text{RL}_L$) and Right ($\Delta \text{RL}_R$) edge offsets to build a multi-strip 3D terrain mesh across the corridor width.
- **Formation Grade & Elevation ($\text{FGL}_0$, $P\%$):** Generates a translucent amber design surface plane across the corridor, clearly showing cut zones (coral-rose prisms above FGL) and fill zones (emerald prisms below FGL), plus purple daylight crossing lines.

### 3D Controls & Performance
- **Camera Controls:** Smooth orbit, pan, and zoom (`OrbitControls`), **Iso / Side / Plan** presets, and a **Reset** button with damped camera transitions.
- **Display Toggles:** Toggle **Wireframe**, **Grid & Axes** (reference datum grid + chainage/width/elevation labels), **Formation Plane**, and **Vertical Exaggeration** ($1\times, 2\times, 3\times, 5\times$) to inspect subtle slopes like $-0.5\%$ gutters clearly.
- **Lightweight Rendering Architecture:**
  - When **2D Profile** is active, the WebGL canvas is not mounted, keeping field-sheet editing zero-overhead.
  - Uses **on-demand rendering** (draws only on camera interaction, resize, or parameter updates—no idle 60 fps loop).
  - Caps device pixel ratio at `2` (`1` on software WebGL renderers).
  - Uses React `useDeferredValue` so rapid slider drags and typing stay non-blocking, and disposes old `BufferGeometry`, materials, and textures on every rebuild.

---

## 4. Features & How to Use

1. **Choose a Sample Dataset:** Start immediately with one of three built-in presets in the top toolbar:
   - *Leveling & Drainage Check* (urban roadway gutter with Change Point and sag trap)
   - *Cut & Fill Grading* (undulating terrain with Cross-Offsets enabled for 3D meshing)
   - *Sloped Formation* (ascending ramp with $+2.0\%$ target formation and two Change Points)
2. **Select Reduction Method:** Switch between **HI / Collimation** and **Rise & Fall** at the top of the field sheet; both sets of values and arithmetic checks update live.
3. **Edit Field Readings:** Modify Starting BM RL, Chainage, BS, IS, FS, optional Left/Right $\Delta \text{RL}$ offsets, or add/delete stations.
4. **Configure Formation & Slope:** Adjust $\text{FGL}_0$, Grade `%`, Angle `°`, Ratio `1:N`, or Corridor Width `B`, or click **Auto-Balance Cut/Fill** to solve for the zero-net-volume formation elevation.
5. **Inspect 2D/3D & Export:** Switch between **2D Profile**, **3D Surface**, and **Split View**, inspect segment drainage warnings, and export the complete field sheet and closure summary via **Export CSV**.

---

## 5. Assumptions & Engineering Disclaimer

- **Linear Terrain Interpolation:** Ground surfaces between consecutive surveyed stations (and across Left–Center–Right offsets) are linearly interpolated; irregular terrain features between stations are not captured unless additional stations are surveyed.
- **Vertical Corridor Walls:** Cut and fill volumes assume a rectangular corridor cross-section of width $B$ without angled side batters (cut/fill side slopes).
- **No Shrinkage / Swell Factors:** Reported volumes are geometric bank/in-situ volumes and do not apply soil bulking, compaction, or topsoil stripping allowances.
- **Educational & Preliminary Modeling Use Only:** This application is intended for surveying education, concept visualization, and preliminary quantity checks. All construction grading, drainage engineering, and earthwork billing must be verified by a licensed surveyor or civil engineer using approved design standards.

---

## 6. Local Setup & Deployment

### Prerequisites
- Node.js 18+ and npm

### Local Development
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### Production Build & Type Check
```bash
npm run lint
npm run build
npm run preview
```

### Static Deployment (Vercel / Netlify / GitHub Pages)
The production build outputs static assets to `dist/`:
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- Deploy directly with Vercel (`vercel --prod`) or any static web host.
