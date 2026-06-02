# Command Center Slider — Three.js scene

A self-contained Three.js scene that ships into a Webflow page via iframe.
Lives inside the `ATWWW Three.js scenes` repository alongside other standalone
scenes. **Each scene is independent** — its own `package.json`, build output,
and assets — and Webflow embeds **one specific scene** at a time.

## What the scene does

- Loads a GLB (`public/test_3.glb`) containing:
  - `Curve` → the logo (gets a glass / ice `MeshPhysicalMaterial`)
  - `Screen_00`..`Screen_04` → five curved video planes
  - `Circle`, `Circle001` → the floor and ceiling shells
- 5 video clips from `public/videos/clip_*` play on the screens. Their
  average frame color drives per-screen `RectAreaLight`s that spill onto
  the floor and ceiling.
- Each screen has a frosted-glass hover mask (red tint + per-fragment noise
  + a "HOVER" sticker painted into the screen's UVs). Hovering fades the
  mask out to reveal the bare video.
- Single `SpotLight` under the logo lights it like a "legendary drop."
- Planar `Reflector`s (floor + ceiling) — patched fragment shader does a
  blurred mirror reflection.
- Postprocessing: `RenderPass → OutlinePass (neon orange on the logo) → SMAAPass → OutputPass`.
- Intro animation: logo rises from below the floor (3 s), outline ramps to
  full strength over the second half, spotlight ramps independently over
  6 s, then everything is static.
- Mouse comet trail (2D canvas overlay) and a bottom-right "planet" SVG
  control for orbiting the camera.

## File layout

```
command-center-slider/
├── CLAUDE.md             ← this file
├── index.html            ← Vite entry, just <div id="app"></div>
├── package.json          ← three + vite, no lil-gui
├── vite.config.js
├── public/
│   ├── test_3.glb        ← the scene's GLB
│   └── videos/           ← clip_1.mp4 … clip_5.mp4 (720p placeholders)
└── src/
    └── main.js           ← entire scene (single file, no GUI)
```

The build output is **not** kept here. `npm run build` writes to
`../docs/command-center-slider/` (see "Production build" below).

## Local dev

```
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Production build

```
npm run build
```

Outputs to `../docs/command-center-slider/` (Vite, configured via `outDir` in
`vite.config.js`). The repo serves GitHub Pages from the `/docs` folder on the
default branch, so the build must live there. `base: './'` keeps all asset
paths relative, and runtime asset URLs in `main.js` use
`import.meta.env.BASE_URL` so the GLB/videos resolve correctly under the Pages
subfolder. Commit the `docs/command-center-slider/` folder after each build.

## Webflow integration

The scene is **embedded as an iframe** in Webflow.

1. After every change, `npm run build` and commit the new
   `docs/command-center-slider/` folder.
2. Push to GitHub. The parent repo (`atwww-threejs-scenes`) has GitHub Pages
   enabled: Settings → Pages → "Deploy from a branch" → `main` / `/docs`.
3. In Webflow add an Embed block with:
   ```html
   <iframe
     src="https://AlexMld12.github.io/atwww-threejs-scenes/command-center-slider/index.html"
     style="border:0; width:100%; height:100vh; display:block"
     allow="autoplay"
     loading="lazy">
   </iframe>
   ```

## Performance

The scene auto-tunes via a `IS_MOBILE` flag at the top of `src/main.js`:

| Setting              | Desktop | Mobile |
|----------------------|---------|--------|
| Pixel ratio cap      | 1.5     | 1.0    |
| Composer MSAA        | 2       | 0      |
| Reflector RT scale   | 0.5×    | 0.4×   |
| Planar reflectors    | ON      | OFF    |

The mirrors are the single biggest GPU cost — they render the entire scene
into a texture every frame, so on mobile they're disabled outright.
SMAA stays on for outline AA; the rest of the scene reads fine without
reflections.

## Replacing the test videos

`src/main.js` has a `TEST_VIDEOS` array near the top:

```js
const TEST_VIDEOS = [
  `${import.meta.env.BASE_URL}videos/clip_1.mp4`,
  ...
];
```

The placeholders are 720p30 H.264 (`yuv420p`) `.mp4`, re-encoded from the
original `.mkv` so they stay under GitHub's 100 MB per-file limit and play on
Safari/Firefox. For production, swap them for higher-quality `.mp4` hosted on
Cloudinary, Bunny CDN, or any CORS-enabled host (drop the `BASE_URL` prefix and
use the absolute URL). The same `attachVideos()` flow handles both relative
paths and absolute URLs.

## Tuning parameters

All tunables live in the `params` object near the top of `src/main.js`.
No GUI — edit, save, refresh.

Common knobs:
- `maskColor`, `maskBaseOpacity`, `maskNoiseAmount` — hover mask look
- `outlineColor`, `outlineStrength`, `outlineGlow` — neon logo outline
- `reflectorTint`, `reflectorBlur` — floor mirror feel
- `roofReflectorTint`, `roofReflectorBlur` — ceiling mirror feel
- `ringIntensity`, `ringAngleDeg`, `ringDecay` — logo spotlight
- `logoGlassIor`, `logoGlassRoughness`, `logoGlassTint` — logo glass
- `logoAnimDuration` (3 s rise), `spotAnimDuration` (6 s spot ramp)
- `cameraDistance`, `lookOffsetY`, `fov` — camera framing

## Things to know

- The video planes have hover masks that **render on a separate layer** (
  `LAYER_MAIN_ONLY = 1`). The reflectors' virtual cameras only see layer 0,
  so the masks don't appear in the floor/ceiling reflections — videos do.
- The OutlinePass uses `downSampleRatio = 1` (full-res edge buffers). If
  the outline ever ladders again, that's the first place to check.
- The mask shader patches in a blur kernel + a per-fragment noise hash +
  a UV-mapped "HOVER" sticker. Don't add another transparent pass for the
  badge — it lives inside the mask shader.
- The Reflector class is patched (`makeBlurredReflector`) to do a 9×9 box
  blur on the reflection texture with an overlay blend. Keeps the mirror
  bright while avoiding razor-sharp pixel mirrors.
