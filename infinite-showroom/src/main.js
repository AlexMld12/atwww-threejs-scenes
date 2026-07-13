import * as THREE from 'three';

// ─── Auto-discovered images (bundled by Vite) ────────────────────────────────
// Drop files into src/images/field/ and src/images/cards/ — they're picked up
// here with no code change. Empty folders → procedural placeholders are used.
const fieldMods = import.meta.glob('./images/field/*.{jpg,jpeg,png,webp,avif}', { eager: true, query: '?url', import: 'default' });
const cardMods  = import.meta.glob('./images/cards/*.{jpg,jpeg,png,webp,avif}', { eager: true, query: '?url', import: 'default' });
const FIELD_URLS = Object.keys(fieldMods).sort().map(k => fieldMods[k]);
const CARD_URLS  = Object.keys(cardMods).sort().map(k => cardMods[k]);

// ─── Config (Webflow-editable) ───────────────────────────────────────────────
const CFG = Object.assign({
  transparent: false,
  bg:          '#05060a',
  farOpacity:  0.10,        // opacity of the most-distant images
  nearOpacity: 1.0,         // opacity when an image is right in front of the camera
  count:       34,          // scattered background images
  driftSpeed:  9.0,         // idle travel speed (units/sec) — faster now
  scrollBoost: 1.1,         // how strongly scroll velocity adds to the speed
  parallax:    5.0,         // mouse-look camera offset in world units (0 = off)
  maxTexture:  768,         // downscale cap for source images (perf — see loadEntry)
  images:      [],          // optional real image URLs (overrides src/images/field)
}, (window.SHOWROOM_CONFIG || {}));

// Field image pool: Webflow config wins, else bundled files, else placeholders.
const FIELD_POOL = CFG.images.length ? CFG.images : FIELD_URLS;

const IS_MOBILE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Mobile/i.test(navigator.userAgent);
const PIXEL_RATIO_CAP = IS_MOBILE ? 1.5 : 2;

// ─── Mount + sizing ──────────────────────────────────────────────────────────
// Canvas mounts into the PINNED (sticky) element so it fills the viewport while
// the tall `.channels-universe` section scrolls past. `#showroom-canvas` is the
// local scaffold; `.channels-sticky` is the Webflow pin.
const mountEl   = document.getElementById('showroom-canvas')
  || document.querySelector('.channels-sticky')
  || document.querySelector('.channels-universe')
  || document.body;
const viewportW = () => mountEl.clientWidth  || window.innerWidth;
const viewportH = () => mountEl.clientHeight || window.innerHeight;
// The section that drives this scene's timeline (progress = how far scrolled
// THROUGH it), so it behaves correctly as one scene among several on the page.
const sceneSection = document.querySelector('.channels-universe');

// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: CFG.transparent, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
renderer.setSize(viewportW(), viewportH(), false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (CFG.transparent) renderer.setClearAlpha(0);
else                 renderer.setClearColor(new THREE.Color(CFG.bg), 1);
renderer.domElement.style.display = 'block';
renderer.domElement.style.position = 'absolute';   // fill the mount, sit behind the cards
renderer.domElement.style.inset = '0';
renderer.domElement.style.width  = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.zIndex = '0';
if (getComputedStyle(mountEl).position === 'static') mountEl.style.position = 'relative';
mountEl.appendChild(renderer.domElement);

// ─── Scene + camera ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const bgColor = new THREE.Color(CFG.bg);
if (!CFG.transparent) {
  scene.background = bgColor;
  scene.fog = new THREE.Fog(bgColor, 26, 90);   // distant images dissolve into space
}

const camera = new THREE.PerspectiveCamera(60, viewportW() / viewportH(), 0.1, 200);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);   // fixed — planes on the XY plane always face it

// ─── Field volume ────────────────────────────────────────────────────────────
// Images are laid out on an ANNULUS (ring) around the z-axis: a central keep-out
// radius (rKeep) leaves the middle clear for the card, and the phyllotaxis
// spread below distributes them evenly so they don't clump. Each image keeps its
// (x,y) "lane" and only travels in z, so near ones sweep to the screen edges
// (perspective) and never cross the centre card; far ones sit small behind it.
// Small/portrait screens see a much narrower slice of the field, so a wide
// desktop spread reads as sparse. Condense the ring on mobile so the images
// pack together and it feels like a dense "universe".
const SMALL_SCREEN = IS_MOBILE || viewportW() < 768;
const FIELD = {
  rKeep: SMALL_SCREEN ? 3.5 : 7,     // central keep-out radius (world units)
  rMax:  SMALL_SCREEN ? 20  : 46,    // outer radius (WIDE on desktop, tight on mobile)
  yFlat: SMALL_SCREEN ? 1.15 : 0.82, // taller spread on portrait phones
  zNear: 12,      // recycle point in front of the camera
  zFar:  -80,     // spawn depth
};
const FIELD_DEPTH = FIELD.zNear - FIELD.zFar;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));   // golden angle → even, non-clumping spread

// ─── Loading overlay ─────────────────────────────────────────────────────────
// Hides the pop-in while textures decode; fades out when they're ready (or after
// a safety timeout). Absolute-fills the mount so it only covers the scene.
const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;inset:0;background:' + CFG.bg + ';transition:opacity .7s ease;z-index:3;pointer-events:none';
if (getComputedStyle(mountEl).position === 'static') mountEl.style.position = 'relative';
mountEl.appendChild(overlay);
let toLoad = 0, loaded = 0, overlayGone = false;
function hideOverlay() { if (overlayGone) return; overlayGone = true; overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 800); }
function onAssetLoaded() { if (++loaded >= toLoad) hideOverlay(); }
setTimeout(() => hideOverlay(), 6000);   // safety: never trap the user behind it

// ─── Texture helpers ─────────────────────────────────────────────────────────
function placeholderTexture(index, label) {
  const w = 512, h = 683;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const hue = (index * 47) % 360;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue}, 55%, 42%)`);
  g.addColorStop(1, `hsl(${(hue + 40) % 360}, 60%, 22%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 120px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label != null ? String(label) : String(index + 1), w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Load a texture ONCE, DECODED OFF THE MAIN THREAD (createImageBitmap) and
// DOWNSCALED to `CFG.maxTexture` — the source images are 3840², far larger than
// they ever render, so capping them slashes decode time and GPU memory (the real
// cause of the slow load). `.ar` fills in on arrival; `onReady` fires so
// consumers can size their plane to the image aspect (contain = no crop).
// Textures are created once and reused — no per-recycle GPU uploads.
function loadEntry(url) {
  const entry = { tex: new THREE.Texture(), ar: 1, loaded: false, onReady: [] };
  entry.tex.colorSpace = THREE.SRGBColorSpace;
  const finish = () => { entry.loaded = true; entry.onReady.forEach(fn => fn()); entry.onReady.length = 0; onAssetLoaded(); };
  toLoad++;
  fetch(url).then(r => r.blob()).then(b => createImageBitmap(b)).then((bmp) => {
    entry.ar = bmp.width / bmp.height;
    const cap = CFG.maxTexture;
    const longest = Math.max(bmp.width, bmp.height);
    if (longest > cap) {
      const s = cap / longest;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      entry.tex.image = c;
    } else {
      entry.tex.image = bmp;
    }
    entry.tex.needsUpdate = true;
    finish();
  }).catch(finish);
  return entry;
}
function placeholderEntry(index) {
  return { tex: placeholderTexture(index), ar: 512 / 683, loaded: true, onReady: [] };
}

// ─── Texture pool (unique, loaded once, reused) ───────────────────────────────
// One texture per image, never recreated. With real images we show each exactly
// ONCE (a bijection lane→image), so there are no on-screen duplicates. Empty
// folders fall back to a matching pool of placeholders.
const usingReal = FIELD_POOL.length > 0;
const COUNT = usingReal ? FIELD_POOL.length : CFG.count;
const pool = usingReal
  ? FIELD_POOL.map(loadEntry)
  : Array.from({ length: COUNT }, (_, i) => placeholderEntry((i * 179 + 31) % 997));

// ─── Background image field ──────────────────────────────────────────────────
const planeGeo = new THREE.PlaneGeometry(1, 1);
const fieldItems = [];   // { mesh }

for (let i = 0; i < COUNT; i++) {
  // Phyllotaxis position on the annulus (fixed per lane).
  const angle = i * GOLDEN;
  const rad = FIELD.rKeep + (FIELD.rMax - FIELD.rKeep) * Math.sqrt((i + 0.5) / COUNT);
  const baseX = Math.cos(angle) * rad;
  const baseY = Math.sin(angle) * rad * FIELD.yFlat;

  // Each lane owns a UNIQUE texture (no duplicates) and a RANDOM size so images
  // vary big↔small. The plane is sized to the image's OWN aspect (contain), so
  // the picture is shown whole — never cropped, never stretched.
  const entry = pool[i];
  const baseSize = 2.4 + Math.random() * 4.2;        // varied dimensions

  const mat = new THREE.MeshBasicMaterial({
    map: entry.tex, transparent: true, opacity: CFG.farOpacity, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(planeGeo, mat);
  mesh.scale.set(baseSize, baseSize, 1);             // provisional (square) until aspect known
  mesh.position.set(baseX, baseY, FIELD.zFar + Math.random() * FIELD_DEPTH);
  scene.add(mesh);
  fieldItems.push({ mesh });

  const fit = () => mesh.scale.set(baseSize * entry.ar, baseSize, 1);
  if (entry.loaded) fit(); else entry.onReady.push(fit);
}

// Recycle only repositions z — the texture stays put (no realloc, no duplicates).
function recycle(item, toFar) {
  item.mesh.position.z = toFar
    ? FIELD.zFar + Math.random() * 4
    : FIELD.zNear - Math.random() * 4;
}

// ─── The 3 centre cards (HTML/CSS, built & styled in Webflow) ─────────────────
// Webflow structure (class contract):
//   .channels-cards  →  .channel-card ×3  (each: .channel-card-top {img, name,
//   span} + .channel-card-bot {description}). This script only ANIMATES the
//   cards (fly-in scale+fade → hold → gentle exit) from CARD_WINDOWS; all
//   sizing/fonts/colours are plain CSS. The .channel-card-img auto-fills locally
//   from src/images/cards/ (alpha order) when its <img src> is left empty.
const cardEls = Array.from(document.querySelectorAll('.channels-cards .channel-card'));
cardEls.forEach((el, i) => {
  const src = CARD_URLS[i];
  if (!src) return;
  el.querySelectorAll('img').forEach((img) => { if (!img.getAttribute('src')) img.src = src; });
});
// The scrollable region inside each card (long descriptions scroll here without
// scrolling the scene — see index.html CSS). Reset to top when a card hides.
const cardScrollers = cardEls.map(el => el.querySelector('.channel-card-bot') || el);

const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));

// Each card owns a wide slice of scroll progress → it advances slowly.
const CARD_WINDOWS = [
  { start: 0.06, end: 0.34 },
  { start: 0.40, end: 0.66 },
  { start: 0.72, end: 0.98 },
];

// lp = 0..1 within the card's window. Drives the DOM card's CSS transform.
function driveCard(el, lp, i) {
  if (lp <= 0 || lp >= 1) {
    if (el.style.visibility !== 'hidden') {
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
      if (cardScrollers[i]) cardScrollers[i].scrollTop = 0;   // reset scroll for next time
    }
    return;
  }
  el.style.visibility = 'visible';

  // Slow fly-in (32%) → long hold (read/scroll) → slow, gentle exit (26%).
  const IN = 0.32, HOLD = 0.74;
  let op, scale;
  if (lp < IN) {
    const t = easeInOut(lp / IN);          op = t;         scale = lerp(0.8, 1, t);
  } else if (lp < HOLD) {
    op = 1; scale = 1;
  } else {
    const t = easeInOut((lp - HOLD) / (1 - HOLD));  op = 1 - t * t; scale = lerp(1, 1.1, t);
  }
  el.style.opacity   = op;
  el.style.transform = `scale(${scale})`;
}

// ─── Scroll tracking ─────────────────────────────────────────────────────────
// travelDir is the PERSISTENT travel direction: +1 = toward the camera, -1 =
// away. Scrolling flips it (down → toward camera, up → recede) and it holds
// through idle, so the field keeps drifting the way you last scrolled.
let progress = 0, lastScrollY = window.scrollY, scrollVel = 0, travelDir = 1;

function scrollProgress() {
  // Section-relative when embedded (works as one scene among several); the tall
  // `.channels-universe` provides the range while its sticky child stays pinned.
  if (sceneSection) {
    const rect = sceneSection.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    return range > 0 ? clamp01(-rect.top / range) : 0;
  }
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? clamp01(window.scrollY / max) : 0;
}

// ─── Mouse-look parallax ─────────────────────────────────────────────────────
// Cursor MOVEMENT (not dragging) slides the camera laterally while it keeps
// looking straight ahead (parallel, NOT pivoting on a point). That's true depth
// parallax — near images shift more than far ones — like the reference site.
// The centre card counter-follows the camera so it stays locked in the middle.
const CAM_Z = camera.position.z;
let pmx = 0, pmy = 0, ptx = 0, pty = 0;
if (CFG.parallax > 0 && !IS_MOBILE) {
  window.addEventListener('pointermove', (e) => {
    ptx = (e.clientX / window.innerWidth)  * 2 - 1;
    pty = (e.clientY / window.innerHeight) * 2 - 1;
  });
}

// ─── Animate ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Scroll flips the persistent travel direction; its magnitude adds speed.
  // Idle → the field keeps drifting in `travelDir` at the (faster) base speed.
  const dy = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;
  scrollVel += (Math.abs(dy) - scrollVel) * 0.15;
  if (Math.abs(dy) < 0.01) scrollVel *= 0.88;          // ease boost back to 0 when idle
  if (dy > 0.5)       travelDir =  1;                  // scroll down → toward camera
  else if (dy < -0.5) travelDir = -1;                  // scroll up   → recede
  const speed = travelDir * (CFG.driftSpeed + scrollVel * CFG.scrollBoost);
  progress = scrollProgress();

  // Mouse-look parallax (smoothed). Slide the camera, keep looking straight
  // ahead (parallel) so nearer images shift more than farther ones. Computed
  // before the cards so they can counter-follow and stay centred.
  pmx += (ptx - pmx) * 0.06;
  pmy += (pty - pmy) * 0.06;
  camera.position.x =  pmx * CFG.parallax;
  camera.position.y = -pmy * CFG.parallax * 0.6;
  camera.lookAt(camera.position.x, camera.position.y, camera.position.z - 100);

  for (let i = 0; i < fieldItems.length; i++) {
    const m = fieldItems[i].mesh;
    m.position.z += speed * dt;
    if (m.position.z > FIELD.zNear)      recycle(fieldItems[i], true);
    else if (m.position.z < FIELD.zFar)  recycle(fieldItems[i], false);
    // Depth-based opacity: faint far away → full (nearOpacity) in front of the
    // camera. Eased so images stay subtle until they're genuinely close.
    const d = clamp01((m.position.z - FIELD.zFar) / (CAM_Z - FIELD.zFar));
    m.material.opacity = CFG.farOpacity + (CFG.nearOpacity - CFG.farOpacity) * d * d;
  }

  for (let i = 0; i < cardEls.length; i++) {
    const w = CARD_WINDOWS[i];
    if (w) driveCard(cardEls[i], clamp01((progress - w.start) / (w.end - w.start)), i);
  }

  // Dev-only functional probe (harmless in prod).
  window.__showroomDebug = { speed, travelDir, scrollVel, progress, camX: camera.position.x, camY: camera.position.y };

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = viewportW() / viewportH();
  camera.updateProjectionMatrix();
  renderer.setSize(viewportW(), viewportH(), false);
}
window.addEventListener('resize', onResize);

animate();
