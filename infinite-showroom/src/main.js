import * as THREE from 'three';

// ─── Device tier ─────────────────────────────────────────────────────────────
// Resolved FIRST because it picks which image set is downloaded (see below) and
// how hard the renderer is allowed to push.
const IS_MOBILE    = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Mobile/i.test(navigator.userAgent);
const SMALL_SCREEN = IS_MOBILE || window.innerWidth < 768;
// Phones render the field at 1.25× CSS pixels rather than their native 3× — the
// single largest fill-rate saving available here (a DPR-3 phone would otherwise
// shade 5.8× as many pixels). 1.25 rather than 1.0 because this scene is cheap
// enough to afford it and 1.0 is visibly soft on the big near-camera planes.
const PIXEL_RATIO_CAP = SMALL_SCREEN ? 1.25 : 1.5;

// ─── Auto-discovered images (bundled by Vite) ────────────────────────────────
// Drop MASTERS into `masters/field/` + `masters/cards/` and run `npm run images`
// — that writes the two sets read here (desktop + a smaller `mobile/` variant),
// exactly like command-center-slider's `videos/mobile/`. The masters are 3840²
// and are deliberately NOT bundled: nothing in this scene renders larger than a
// few hundred px, and shipping them cost the page three times over (download,
// decode, VRAM). Filenames match across the two sets, so the sorted-order
// bijection lane→image below is identical on phones and desktop.
// Empty folders → procedural placeholders are used.
// (Vite requires the options to be an inline object literal — no shared const.)
const fieldDesktopMods = import.meta.glob('./images/field/*.{jpg,jpeg,png,webp,avif}',         { eager: true, query: '?url', import: 'default' });
const fieldMobileMods  = import.meta.glob('./images/field/mobile/*.{jpg,jpeg,png,webp,avif}',  { eager: true, query: '?url', import: 'default' });
const cardDesktopMods  = import.meta.glob('./images/cards/*.{jpg,jpeg,png,webp,avif}',        { eager: true, query: '?url', import: 'default' });
const cardMobileMods   = import.meta.glob('./images/cards/mobile/*.{jpg,jpeg,png,webp,avif}', { eager: true, query: '?url', import: 'default' });
const sortedUrls = mods => Object.keys(mods).sort().map(k => mods[k]);
// Phones take the small set when it exists; desktop always takes the full one.
const pickSet = (desktop, mobile) =>
  SMALL_SCREEN && Object.keys(mobile).length ? mobile : desktop;
const FIELD_URLS = sortedUrls(pickSet(fieldDesktopMods, fieldMobileMods));

// ─── Card front images: EXPLICIT order ───────────────────────────────────────
// The three card FRONTS must line up with the three `.channel-card` backs the
// client orders in Webflow, and that order is an editorial decision that changes.
// It must therefore NOT fall out of alphabetical filenames: sorting
// `Caylus / Ethan Schulteis / Stokes Twins` silently puts Ethan second, which is
// precisely what went wrong. Names are matched as a case-insensitive prefix of the
// filename, so "Ethan" finds "Ethan Schulteis.webp" and renaming the file for
// clarity does not break the mapping.
// Keep this list in the SAME ORDER as the .channel-card elements in Webflow.
const CARD_ORDER = ['Caylus', 'Stokes Twins', 'Ethan'];
const cardSet = pickSet(cardDesktopMods, cardMobileMods);
const cardNamed = Object.keys(cardSet).sort().map(k => ({
  name: k.slice(k.lastIndexOf('/') + 1).replace(/\.[^.]+$/, ''),
  url:  cardSet[k],
}));
const CARD_URLS = (() => {
  const taken = new Set();
  const ordered = CARD_ORDER.map((stem) => {
    const hit = cardNamed.find(e =>
      !taken.has(e.url) && e.name.toLowerCase().startsWith(stem.toLowerCase()));
    if (!hit) { console.warn(`[infinite-showroom] CARD_ORDER entry "${stem}" matches no file in src/images/cards/ — that card gets no front image.`); return null; }
    taken.add(hit.url);
    return hit.url;
  });
  // Anything in the folder that CARD_ORDER doesn't name keeps its alphabetical
  // place at the end, so dropping in a 4th channel image still shows up instead
  // of silently vanishing.
  return ordered.concat(cardNamed.filter(e => !taken.has(e.url)).map(e => e.url));
})();

// ─── Config (Webflow-editable) ───────────────────────────────────────────────
const CFG = Object.assign({
  transparent: false,
  bg:          '#000000',   // full black
  farOpacity:  0.10,        // opacity of the most-distant images
  nearOpacity: 1.0,         // opacity when an image is right in front of the camera
  count:       34,          // scattered background images
  driftSpeed:  9.0,         // idle travel speed (units/sec) — faster now
  scrollBoost: 1.1,         // how strongly scroll velocity adds to the speed
  parallax:    5.0,         // mouse-look camera offset in world units (0 = off)
  maxTexture:  768,         // safety downscale cap (the shipped sets are already under it)
  preloadMargin: '150%',    // how early (in viewport heights) images start loading
  images:      [],          // optional real image URLs (overrides src/images/field)
  // Card FRONT images, in card order — overrides CARD_ORDER above. Set this in
  // Webflow to reshuffle or swap the fronts without a code change and redeploy;
  // leave it empty to use the bundled set. Pass full URLs.
  cardImages:  [],
}, (window.SHOWROOM_CONFIG || {}));

// Field image pool: Webflow config wins, else bundled files, else placeholders.
const FIELD_POOL = CFG.images.length ? CFG.images : FIELD_URLS;

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
// THROUGH it), so it behaves correctly as one scene among several.
const sceneSection = document.querySelector('.channels-universe');
// The pinned box. Its height is this scene's "one screen": the sticky travels
// exactly `section.height − sticky.height` before it unpins, so that is the full
// scroll timeline. It is measured from the ELEMENT and never from
// `window.innerHeight` — see the timeline-height note in the scroll section for
// why that distinction decides whether the scene is steady on a phone.
const stickyEl = document.querySelector('.channels-sticky')
  || (mountEl !== document.body && mountEl !== sceneSection ? mountEl : null);

// ─── Renderer ────────────────────────────────────────────────────────────────
// antialias is DESKTOP-ONLY: MSAA costs real fill rate and this scene has no hard
// geometry edges to smooth (every surface is a photo quad), so on phones it buys
// nothing measurable while charging for every sample.
const renderer = new THREE.WebGLRenderer({
  antialias: !SMALL_SCREEN, alpha: CFG.transparent, powerPreference: 'high-performance',
});
let basePR = Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP);
renderer.setPixelRatio(basePR);
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
const FOG_NEAR = 26, FOG_FAR = 90;
if (!CFG.transparent) {
  scene.background = bgColor;
  scene.fog = new THREE.Fog(bgColor, FOG_NEAR, FOG_FAR);   // distant images dissolve into space
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
// Hides the pop-in while textures decode; fades out once ENOUGH of them are up
// (see READY_MIN — the rest stream in behind the running scene) or after a
// safety timeout. Absolute-fills the mount so it only covers the scene.
const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;inset:0;background:' + CFG.bg + ';transition:opacity .7s ease;z-index:3;pointer-events:none';
mountEl.appendChild(overlay);
let overlayGone = false;
function hideOverlay() { if (overlayGone) return; overlayGone = true; overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 800); }

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

// ─── Progressive texture loader ──────────────────────────────────────────────
// The old loader fired all ~34 fetches the instant the module ran and let every
// decoded texture upload itself inside whichever render frame happened to come
// next. Three things were wrong with that, and all three hurt the WHOLE page (two
// other Three.js scenes share it):
//   1. it competed with scene #1's hero videos for bandwidth at first paint,
//      before this scene was anywhere near the viewport;
//   2. 34 concurrent fetch→decode chains saturated the connection pool, so the
//      FIRST image wasn't ready any sooner than the last;
//   3. every finished texture uploaded to the GPU on its own arrival frame, so a
//      burst of arrivals = a burst of multi-ms uploads in one frame = a hitch.
// Now: nothing loads until the section is `CFG.preloadMargin` away (deferred),
// at most MAX_PARALLEL requests are in flight, they run NEAREST-LANE-FIRST so
// what the viewer actually sees arrives first, and GPU uploads are metered to a
// few per frame. Each texture is still created ONCE and reused forever — recycling
// a plane only moves its z, it never re-uploads.
const MAX_PARALLEL     = SMALL_SCREEN ? 3 : 6;   // concurrent fetch+decode chains
const UPLOADS_PER_TICK = SMALL_SCREEN ? 1 : 2;   // GPU uploads allowed per frame

const usingReal = FIELD_POOL.length > 0;
const COUNT = usingReal ? FIELD_POOL.length : CFG.count;
// Reveal the scene once the nearest (largest, most visible) majority is up; the
// faint far tail keeps streaming in behind the already-running field.
const READY_MIN = Math.max(1, Math.ceil(COUNT * 0.6));

let queue = [];          // entries not yet fetched (sorted nearest-lane-first)
const pending = [];      // decoded bitmaps waiting for a metered GPU upload
let inFlight = 0, ready = 0, drainRaf = 0, loadingStarted = false;

function makeEntry(url) {
  const entry = { url, tex: new THREE.Texture(), ar: 1, loaded: false, onReady: [], z: 0 };
  entry.tex.colorSpace = THREE.SRGBColorSpace;
  queue.push(entry);
  return entry;
}
function placeholderEntry(index) {
  return { tex: placeholderTexture(index), ar: 512 / 683, loaded: true, onReady: [], z: 0 };
}

// Kicked by the preload IntersectionObserver at the bottom of this file.
function beginLoading() {
  if (loadingStarted) return;
  loadingStarted = true;
  queue.sort((a, b) => b.z - a.z);     // nearest the camera first
  primeCardImages();
  pump();
  if (!queue.length && !inFlight) hideOverlay();   // placeholder mode: nothing to wait for
  setTimeout(hideOverlay, 4000);                   // safety: never trap the viewer behind it
}

function pump() {
  while (inFlight < MAX_PARALLEL && queue.length) fetchEntry(queue.shift());
}

function fetchEntry(entry) {
  inFlight++;
  const next = () => { inFlight--; pump(); };
  const arrive = (source) => { entry.source = source; pending.push(entry); scheduleDrain(); next(); };
  // A failure must never stall the overlay — count it as settled, but leave the
  // lane's plane hidden rather than drawing an untextured quad.
  const fail = () => { entry.failed = true; markReady(entry); next(); };

  // Preferred path: createImageBitmap decodes OFF the main thread, leaving only the
  // metered upload in uploadEntry() to pay for.
  if (typeof createImageBitmap === 'function') {
    fetch(entry.url).then(r => r.blob()).then(b => createImageBitmap(b)).then(arrive).catch(fail);
    return;
  }
  // Fallback for browsers without createImageBitmap (Safari < 15). Decodes on the
  // main thread, but the same queue + upload metering still applies, so it degrades
  // in smoothness rather than failing outright. crossOrigin is required: a
  // cross-origin <img> would TAINT the canvas below and make the WebGL upload throw
  // (the CDN sends CORS headers, so this succeeds).
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload  = () => arrive(im);
  im.onerror = fail;
  im.src = entry.url;
}

function scheduleDrain() { if (!drainRaf) drainRaf = requestAnimationFrame(drain); }
function drain() {
  drainRaf = 0;
  for (let n = UPLOADS_PER_TICK; n > 0 && pending.length; n--) uploadEntry(pending.shift());
  if (pending.length) scheduleDrain();
}

function uploadEntry(entry) {
  const source = entry.source; entry.source = null;   // ImageBitmap or <img>
  entry.ar = source.width / source.height;
  // Drawn into a canvas rather than handed over as a raw ImageBitmap: three
  // IGNORES Texture.flipY for ImageBitmap sources, and browsers disagree on
  // createImageBitmap's `imageOrientation` support — the canvas is the one path
  // that is orientation-identical everywhere. It also still honours maxTexture, so
  // an oversized image dropped into masters/ (or a Webflow `images` URL) can never
  // blow up VRAM.
  const cap = CFG.maxTexture, longest = Math.max(source.width, source.height);
  const s = longest > cap ? cap / longest : 1;
  const c = document.createElement('canvas');
  c.width  = Math.max(1, Math.round(source.width  * s));
  c.height = Math.max(1, Math.round(source.height * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  if (typeof source.close === 'function') source.close();   // ImageBitmap only
  entry.tex.image = c;
  entry.tex.needsUpdate = true;
  // Upload inside THIS metered tick instead of letting it land in an arbitrary
  // render frame alongside every other new arrival.
  try { renderer.initTexture(entry.tex); } catch { /* upload retries on next render */ }
  markReady(entry);
}

function markReady(entry) {
  entry.loaded = true;
  entry.onReady.forEach(fn => fn());
  entry.onReady.length = 0;
  if (++ready >= READY_MIN) hideOverlay();
}

// ─── Texture pool (unique, loaded once, reused) ───────────────────────────────
// One texture per image, never recreated. With real images we show each exactly
// ONCE (a bijection lane→image), so there are no on-screen duplicates. Empty
// folders fall back to a matching pool of placeholders.
const pool = usingReal
  ? FIELD_POOL.map(makeEntry)
  : Array.from({ length: COUNT }, (_, i) => placeholderEntry((i * 179 + 31) % 997));

// ─── Background image field ──────────────────────────────────────────────────
const planeGeo = new THREE.PlaneGeometry(1, 1);
const fieldItems = [];   // { mesh, entry }

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
  mesh.visible = entry.loaded;                       // no blank quad before its texture lands
  scene.add(mesh);
  fieldItems.push({ mesh, entry });

  // Load priority: this lane's spawn depth, so the nearest (biggest on screen)
  // images are fetched first and the faint far tail arrives last.
  entry.z = mesh.position.z;

  const fit = () => mesh.scale.set(baseSize * entry.ar, baseSize, 1);
  if (entry.loaded) fit(); else entry.onReady.push(fit);
}

// Recycle only repositions z — the texture stays put (no realloc, no duplicates).
function recycle(item, toFar) {
  item.mesh.position.z = toFar
    ? FIELD.zFar + Math.random() * 4
    : FIELD.zNear - Math.random() * 4;
}

const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));

// ─── The 3 centre cards (FLIP: image front + Webflow back) ────────────────────
// The client builds ONLY the BACK of the card in Webflow (`.channel-card` with
// `.channel-card-top`/`.channel-card-bot`). The FRONT is the channel image,
// which ARRIVES from the distance like a field photo (tiny + faint → full),
// then the card FLIPS to reveal that Webflow back. This script wraps each
// `.channel-card` in a flip rig at runtime, so nothing extra is needed in
// Webflow. The scene ANIMATES it (arrive → flip → hold/scroll → exit) from
// CARD_WINDOWS; all card styling stays plain CSS.
const rawCards = Array.from(document.querySelectorAll('.channels-cards .channel-card'));
if (!rawCards.length) console.warn('[infinite-showroom] No ".channels-cards .channel-card" found — check Webflow structure/classes.');

if (rawCards.length) {
  // Structural + flip CSS, injected so it works in Webflow regardless of the CSS
  // applied there. Visual styling (bg, size, padding, fonts) stays on .channel-card.
  // The perspective lives INSIDE .sc-inner's own transform rather than as a
  // `perspective` property on .sc-box. Measured both ways in Chrome 151 and
  // Firefox 153 and they are pixel-identical today, so this is not what made the
  // flip differ between them — but .sc-box carries `opacity` and `will-change`,
  // and the Transforms spec calls both "grouping" properties, which oblige the UA
  // to flatten the descendants before applying them. Engines have historically
  // read that rule strictly and thrown the perspective away (Safari most
  // recently). Folding perspective() into the SAME transform as the rotation puts
  // both in one matrix on one element, where no ancestor's grouping property can
  // reach them, so it cannot regress. Same vanishing point either way: .sc-inner
  // exactly fills .sc-box and both origins default to the centre.
  const st = document.createElement('style');
  st.textContent = `
    .channels-cards { position:absolute; inset:0; z-index:10; pointer-events:none; }
    .sc-slot  { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
    .sc-box   { opacity:0; visibility:hidden; will-change:transform,opacity; }
    .sc-inner { position:relative; transform-style:preserve-3d; transform:perspective(1200px) rotateY(0deg); }
    /* rotateY(0deg) makes the front face a 3D-transformed element in its own
       right. Firefox 153 honours backface-visibility here without it (checked),
       but engines have needed it on an otherwise untransformed child, and it
       costs nothing. */
    .sc-front { position:absolute; inset:0; overflow:hidden; transform:rotateY(0deg);
                backface-visibility:hidden; -webkit-backface-visibility:hidden; }
    .sc-front img { width:100%; height:100%; object-fit:cover; display:block; }
    .channels-cards .channel-card {
      position:relative !important; inset:auto !important; margin:0 !important; opacity:1 !important;
      transform:rotateY(180deg); backface-visibility:hidden; -webkit-backface-visibility:hidden; pointer-events:auto;
      display:flex !important; flex-direction:column !important; overflow:hidden !important;
    }
    /* Description scrolls INSIDE the card (no visible scrollbar); the rest clips.
       overflow-anchor:none keeps Chrome's scroll anchoring from nudging scrollTop
       when the card's layout changes underneath it, and touch-action:pan-y keeps
       the gesture a vertical scroll instead of something the UA may reinterpret. */
    .channels-cards .channel-card-bot {
      flex:1 1 auto !important; min-height:0 !important; overflow-y:auto !important;
      -webkit-overflow-scrolling:touch; scrollbar-width:none; -ms-overflow-style:none;
      overflow-anchor:none; touch-action:pan-y;
    }
    .channels-cards .channel-card-bot::-webkit-scrollbar { display:none !important; }
    /* The client's "there is more text below" arrow. Only the FADE and the
       click-through belong here — position, size and artwork stay theirs in
       Webflow. pointer-events:none matters: the arrow sits over the description,
       and a thumb landing on it would otherwise not scroll the text. */
    .channels-cards .channel-card-arrow { transition:opacity .25s ease; pointer-events:none; }`;
  document.head.appendChild(st);
}

const cards = rawCards.map((card, i) => {
  const slot  = document.createElement('div'); slot.className  = 'sc-slot';
  const box   = document.createElement('div'); box.className   = 'sc-box';
  const inner = document.createElement('div'); inner.className = 'sc-inner';
  const front = document.createElement('div'); front.className = 'sc-front';
  const img   = document.createElement('img');
  img.decoding = 'async';
  front.appendChild(img);

  // Wrap: .channels-cards > .sc-slot > .sc-box > .sc-inner > [.sc-front, .channel-card(back)]
  card.parentNode.insertBefore(slot, card);
  slot.appendChild(box); box.appendChild(inner);
  inner.appendChild(front); inner.appendChild(card);
  front.style.borderRadius = getComputedStyle(card).borderRadius;   // match the card's rounding

  // Let the description scroll natively under Lenis smooth-scroll (otherwise
  // Lenis hijacks the wheel and scrolls the page instead of the card).
  const scroller = card.querySelector('.channel-card-bot') || card;
  scroller.setAttribute('data-lenis-prevent', '');
  const arrow = card.querySelector('.channel-card-arrow');
  // Their CSS may give the arrow a resting opacity below 1 (a soft hint rather
  // than solid artwork), so capture it before we ever write to it and restore
  // THAT on "shown" instead of forcing a hard 1. Reading it here is safe: an
  // ancestor's opacity does not affect an element's own computed value. A base of
  // 0 means it was authored hidden for JS to reveal, so fall back to 1 — otherwise
  // the hint could never appear.
  let arrowShown = arrow ? getComputedStyle(arrow).opacity : '1';
  if (!(parseFloat(arrowShown) > 0.01)) arrowShown = '1';
  return { box, inner, scroller, card, img, arrow, arrowShown, index: i };
});

// Card `src` is assigned with the field preload, not at build time, so the three
// card images don't download while the viewer is still on an earlier section.
function primeCardImages() {
  for (const c of cards) {
    // Webflow config wins, so the fronts can be reordered without a redeploy.
    const src = (CFG.cardImages && CFG.cardImages[c.index]) || CARD_URLS[c.index];
    if (!src) continue;
    c.img.src = src;
    // Auto-fill the avatar (img inside the card) too, when its src is empty. The
    // arrow is excluded — it is the client's own artwork, not a channel photo.
    c.card.querySelectorAll('img:not(.channel-card-arrow)')
      .forEach(im => { if (!im.getAttribute('src')) im.src = src; });
  }
}

// ─── "More text below" arrow ─────────────────────────────────────────────────
// The client's `.channel-card-arrow` hints that the description scrolls, so it has
// to disappear once the text has actually been read and come back on scrolling up.
// Driven off the scroller's own position rather than the scene timeline, so it is
// exact. It also stays hidden on a description short enough to fit — an arrow
// pointing at nothing reads as a broken control.
function updateArrow(c) {
  if (!c.arrow) return;
  const s = c.scroller;
  const scrollable = s.scrollHeight - s.clientHeight;
  // 2px of slack both ways: scrollHeight/clientHeight are fractional at non-integer
  // zoom and DPR, so a fully-scrolled element commonly still reports ~0.5px left.
  const more = scrollable > 2 && scrollable - s.scrollTop > 2;
  c.arrow.style.opacity = more ? c.arrowShown : '0';
}

for (const c of cards) {
  if (!c.arrow) continue;
  c.scroller.addEventListener('scroll', () => updateArrow(c), { passive: true });
  updateArrow(c);
}
// One ResizeObserver instead of a pile of load/resize hooks: whether there is
// anything left to scroll changes when a webfont swaps in, when the avatar image
// lands, and on every viewport change. Watching both the scroll port and its
// content covers all three — clientHeight from the former, scrollHeight from the
// latter.
if ('ResizeObserver' in window && cards.some(c => c.arrow)) {
  const ro = new ResizeObserver(() => { for (const c of cards) updateArrow(c); });
  for (const c of cards) {
    if (!c.arrow) continue;
    ro.observe(c.scroller);
    for (const child of c.scroller.children) ro.observe(child);
  }
}

// Each card owns a wide slice of scroll progress → it advances slowly.
const CARD_WINDOWS = [
  { start: 0.06, end: 0.34 },
  { start: 0.40, end: 0.66 },
  { start: 0.72, end: 0.98 },
];

// lp = 0..1 within the card's window.
function driveCard(c, lp) {
  if (lp <= 0 || lp >= 1) {
    if (c.box.style.visibility !== 'hidden') {
      c.box.style.opacity = '0'; c.box.style.visibility = 'hidden'; c.scroller.scrollTop = 0;
      updateArrow(c);   // rewound to the top → the hint is due back for next time
    }
    return;
  }
  c.box.style.visibility = 'visible';

  // Arrive like a field photo (tiny + faint → full) → settle → flip to the back
  // → hold (read/scroll) → gentle exit.
  const IN = 0.34, SET = 0.44, FLIP_A = 0.60, HOLD = 0.80;
  let op, scale, rotY;
  if (lp < IN) {
    const t = easeInOut(lp / IN);                     op = t;          scale = lerp(0.12, 1, t); rotY = 0;
  } else if (lp < SET) {
    op = 1; scale = 1; rotY = 0;
  } else if (lp < FLIP_A) {
    const t = easeInOut((lp - SET) / (FLIP_A - SET)); op = 1; scale = 1; rotY = 180 * t;
  } else if (lp < HOLD) {
    op = 1; scale = 1; rotY = 180;
  } else {
    const t = easeInOut((lp - HOLD) / (1 - HOLD));    op = 1 - t * t; scale = lerp(1, 1.1, t); rotY = 180;
  }
  c.box.style.opacity   = op;
  c.box.style.transform = `scale(${scale})`;
  // perspective() belongs in this string, not on an ancestor — see the note on
  // the injected CSS for why keeping it in the same matrix as the rotation is
  // the flattening-proof arrangement.
  c.inner.style.transform = `perspective(1200px) rotateY(${rotY}deg)`;
}

// ─── Scroll tracking ─────────────────────────────────────────────────────────
// travelDir is the PERSISTENT travel direction: +1 = toward the camera, -1 =
// away. Scrolling flips it (down → toward camera, up → recede) and it holds
// through idle, so the field keeps drifting the way you last scrolled.
let progress = 0, lastScrollY = window.scrollY, scrollVel = 0, travelDir = 1;
// Time constant of the card-timeline follow (seconds): ~63% of the gap closed in
// 70ms, ~95% in 210ms. Small enough to still feel scroll-locked, large enough to
// swallow one coarse Firefox wheel step or a URL-bar-induced hop.
const PROGRESS_TAU = 0.07;
let progressPrimed = false;   // false → next frame snaps instead of easing

// ─── Stable timeline height ──────────────────────────────────────────────────
// `window.innerHeight` is NOT a constant on a phone: Android and iOS grow and
// shrink it every time the URL bar retracts or returns, which is continuously
// while you scroll up and down. It used to be the denominator below, so a bar
// sliding by ~90px moved the ENTIRE card timeline by ~1% of the section — enough
// to jerk a card mid-flip or pop one in and out at a window edge. That is what
// reads as the page "snapping" somewhere else.
// The section and its sticky pin are sized in `vh` (= the LARGE viewport, bar
// retracted) and deliberately never in `dvh`, so the sticky's own measured height
// is both the CORRECT denominator (it is exactly how far the pin travels) and a
// constant. It is re-measured only on a genuine layout change — see onResize.
let vpFallbackH = window.innerHeight;   // only used on a page with no sticky pin
function measureTimelineH() {
  const h = stickyEl ? stickyEl.clientHeight : 0;
  // Reject a nonsense measurement (mount collapsed, or it turned out to be the
  // tall section itself) rather than dividing the timeline by it.
  return h > 0 && (!sceneSection || h < sceneSection.clientHeight) ? h : vpFallbackH;
}
let timelineH = measureTimelineH();

// Diagnostic, not a fix: CSS scroll snapping is a PAGE-level setting this scene
// cannot see or override from inside its own section, and it is the one thing
// that will genuinely throw the viewer to a different section when a phone's URL
// bar resizes the scroll port mid-gesture (the resize forces the browser to
// re-snap). If it is switched on anywhere up the tree, say so once so it can be
// found in Webflow instead of being blamed on the scene.
for (const el of [document.documentElement, document.body, sceneSection]) {
  if (!el) continue;
  const snap = getComputedStyle(el).scrollSnapType;
  if (snap && snap !== 'none') {
    console.warn('[infinite-showroom] CSS scroll-snap is active on', el,
      `(scroll-snap-type: ${snap}). On phones the URL bar resizes the scroll port mid-scroll, ` +
      'which makes the browser re-snap and jump to a neighbouring section. Remove it in Webflow ' +
      'if the page is jumping — this scene drives itself from scroll position and does not need it.');
    break;
  }
}

function scrollProgress() {
  // Section-relative when embedded (works as one scene among several); the tall
  // `.channels-universe` provides the range while its sticky child stays pinned.
  if (sceneSection) {
    const rect = sceneSection.getBoundingClientRect();
    const range = rect.height - timelineH;
    return range > 0 ? clamp01(-rect.top / range) : 0;
  }
  const max = document.documentElement.scrollHeight - timelineH;
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
  }, { passive: true });
}

// ─── Adaptive resolution (true GPU time) ─────────────────────────────────────
// Ported from command-center-slider. renderScale multiplies the base pixel ratio;
// 1.0 is byte-identical to the non-adaptive path. Load is judged on the TRUE GPU
// frame time from an EXT_disjoint_timer_query_webgl2 query wrapped around the
// render — NOT the rAF interval, which is floored by vsync (~16.7ms @60Hz) and so
// can't tell a GPU coasting at 2ms from one barely coping. A capable GPU measures
// its real ~1-2ms here and never downscales; a struggling phone measures its real
// >10ms and steps down. Extension missing (Safari/iOS) → controller inert at 1.0.
const gl    = renderer.getContext();
const rsExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

const RS_STEPS        = [1, 0.85, 0.72, 0.6];
const RS_BUDGET_MS    = 10;  // sustained EMA above this ⇒ over budget → downscale
const RS_HEADROOM_MS  = 6;   // sustained EMA below this ⇒ headroom → upscale (deadband 6–10ms)
const RS_DOWN_SAMPLES = 20;
const RS_UP_SAMPLES   = 60;
const RS_COOLDOWN     = 45;
const RS_WARMUP       = 15;
const RS_SETTLE       = 2;

let renderScale = 1, rsIndex = 0;
let rsGpuMs = 0, rsSeeded = false, rsQuery = null;
let rsWarmup = RS_WARMUP, rsSettle = 0, rsOverCount = 0, rsUnderCount = 0, rsCooldown = 0;

function applyRenderScale() {
  renderer.setPixelRatio(basePR * renderScale);
  renderer.setSize(viewportW(), viewportH(), false);
  // The reallocation above perturbs the next couple of timings — skip them so the
  // controller never reads its own resize hitch as over-budget frames.
  rsSettle = Math.max(rsSettle, RS_SETTLE);
  rsOverCount = 0; rsUnderCount = 0;
}

// ─── Animate ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Scroll flips the persistent travel direction; its magnitude adds speed.
  // Idle → the field keeps drifting in `travelDir` at the (faster) base speed.
  const rawDy = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;
  // Not every change in scrollY came from a finger. A URL-bar slide, the
  // browser's scroll anchoring or an in-page anchor jump can all report one
  // enormous frame delta; letting that through flips travelDir and slams the
  // whole field in the opposite direction for no reason the viewer can see.
  // 25 viewports/second is far past anything a thumb or a wheel produces, so
  // anything beyond it is an artefact, not a scroll.
  const dy = Math.abs(rawDy) > timelineH * 25 * dt ? 0 : rawDy;
  scrollVel += (Math.abs(dy) - scrollVel) * 0.15;
  if (Math.abs(dy) < 0.01) scrollVel *= 0.88;          // ease boost back to 0 when idle
  if (dy > 0.5)       travelDir =  1;                  // scroll down → toward camera
  else if (dy < -0.5) travelDir = -1;                  // scroll up   → recede
  const speed = travelDir * (CFG.driftSpeed + scrollVel * CFG.scrollBoost);

  // The cards run off a TIME-SMOOTHED progress rather than the raw scroll offset.
  // No two browsers hand you scroll the same way: Firefox reports wheel deltas in
  // LINES and animates each step on its own easing, Chrome reports pixels on a
  // different curve, phones add momentum, and Lenis replaces the lot again. Fed
  // straight into a 3D rotation that makes one identical flick of the wheel look
  // like a different animation per browser — which is what the client sees
  // between Firefox and Chrome, since the flip rig itself was measured
  // pixel-identical in both. An exponential follow on a fixed TIME constant
  // removes the input's fingerprint: whatever granularity arrives, the card
  // always takes the same ~0.2s to catch up. Being dt-based it is frame-rate
  // independent too, so 60Hz and 120Hz converge at the same rate.
  const targetProgress = scrollProgress();
  if (!progressPrimed || Math.abs(targetProgress - progress) > 0.2) {
    // First frame, a resume, or a teleport (anchor link, back/forward restore):
    // snap, or the cards would visibly slide across half the timeline to catch up.
    progress = targetProgress;
    progressPrimed = true;
  } else {
    progress += (targetProgress - progress) * (1 - Math.exp(-dt / PROGRESS_TAU));
  }

  // Mouse-look parallax (smoothed). Slide the camera, keep looking straight
  // ahead (parallel) so nearer images shift more than farther ones. Computed
  // before the cards so they can counter-follow and stay centred.
  pmx += (ptx - pmx) * 0.06;
  pmy += (pty - pmy) * 0.06;
  camera.position.x =  pmx * CFG.parallax;
  camera.position.y = -pmy * CFG.parallax * 0.6;
  camera.lookAt(camera.position.x, camera.position.y, camera.position.z - 100);

  for (let i = 0; i < fieldItems.length; i++) {
    const item = fieldItems[i];
    const m = item.mesh;
    m.position.z += speed * dt;
    if (m.position.z > FIELD.zNear)      recycle(item, true);
    else if (m.position.z < FIELD.zFar)  recycle(item, false);
    // Depth-based opacity: faint far away → full (nearOpacity) in front of the
    // camera. Eased so images stay subtle until they're genuinely close.
    const d = clamp01((m.position.z - FIELD.zFar) / (CAM_Z - FIELD.zFar));
    const op = CFG.farOpacity + (CFG.nearOpacity - CFG.farOpacity) * d * d;
    m.material.opacity = op;
    // Skip drawing what can't contribute: no texture yet, or so deep in the fog
    // that the quad resolves to background-over-background. 34 blended quads is
    // pure overdraw on a phone, so dropping the invisible tail is free fill rate.
    const fogVis = CFG.transparent ? 1 : clamp01((FOG_FAR - (CAM_Z - m.position.z)) / (FOG_FAR - FOG_NEAR));
    m.visible = item.entry.loaded && !item.entry.failed && op * fogVis > 0.012;
  }

  for (let i = 0; i < cards.length; i++) {
    const w = CARD_WINDOWS[i];
    if (w) driveCard(cards[i], clamp01((progress - w.start) / (w.end - w.start)));
  }

  // ── Adaptive-resolution monitor ────────────────────────────────────────────
  // Poll the query issued on a previous frame (only one is ever in flight), fold
  // it into a slow EMA, and step the scale when either side sustains.
  if (rsExt && rsQuery !== null) {
    if (gl.getParameter(rsExt.GPU_DISJOINT_EXT)) {
      gl.deleteQuery(rsQuery); rsQuery = null;         // timer disturbed → discard
    } else if (gl.getQueryParameter(rsQuery, gl.QUERY_RESULT_AVAILABLE)) {
      const gpuMs = gl.getQueryParameter(rsQuery, gl.QUERY_RESULT) / 1e6;   // ns → ms
      gl.deleteQuery(rsQuery); rsQuery = null;
      // Texture uploads are still landing → this frame's GPU cost isn't the
      // steady state. Don't let the load-in hitch downscale the whole session.
      if (pending.length || inFlight || queue.length) rsSettle = Math.max(rsSettle, RS_SETTLE);

      if (rsWarmup > 0) rsWarmup--;
      else if (rsSettle > 0) rsSettle--;
      else {
        if (rsSeeded) rsGpuMs += (gpuMs - rsGpuMs) * 0.1;
        else { rsGpuMs = gpuMs; rsSeeded = true; }
        if (rsCooldown > 0) rsCooldown--;
        rsOverCount  = rsGpuMs > RS_BUDGET_MS   ? rsOverCount + 1  : 0;
        rsUnderCount = rsGpuMs < RS_HEADROOM_MS ? rsUnderCount + 1 : 0;

        if (rsOverCount >= RS_DOWN_SAMPLES && rsCooldown === 0 && rsIndex < RS_STEPS.length - 1) {
          renderScale = RS_STEPS[++rsIndex];
          applyRenderScale();
          rsCooldown = RS_COOLDOWN;
        } else if (rsUnderCount >= RS_UP_SAMPLES && rsCooldown === 0 && rsIndex > 0) {
          renderScale = RS_STEPS[--rsIndex];
          applyRenderScale();
          rsCooldown = RS_COOLDOWN;
        }
      }
    }
  }

  // Dev-only functional probe (harmless in prod).
  window.__showroomDebug = {
    speed, travelDir, scrollVel, progress, targetProgress, timelineH,
    camX: camera.position.x, camY: camera.position.y,
    ready, total: COUNT, queued: queue.length, inFlight, pending: pending.length,
    renderScale, gpuMs: +rsGpuMs.toFixed(2), tier: SMALL_SCREEN ? 'small' : 'desktop',
  };

  // Wrap the render in ONE timer query (never nest — only one TIME_ELAPSED query
  // may be active at a time).
  const rsTiming = rsExt !== null && rsQuery === null;
  if (rsTiming) { rsQuery = gl.createQuery(); gl.beginQuery(rsExt.TIME_ELAPSED_EXT, rsQuery); }
  renderer.render(scene, camera);
  if (rsTiming) gl.endQuery(rsExt.TIME_ELAPSED_EXT);
}

let lastWinW = window.innerWidth, lastMountW = viewportW(), lastMountH = viewportH();

function onResize() {
  // A phone fires `resize` on every single URL-bar slide. Because the section and
  // its pin are sized in `vh`, NOTHING on the page actually changed size — but
  // the old handler still re-allocated the drawing buffer (a visible hitch, and
  // `setSize` reallocates even for identical dimensions) and re-read the timeline
  // from a height that had moved. Both are now gated on real measurements.
  //
  // Width is the only trustworthy signal that a phone genuinely re-laid out
  // (rotation, or a desktop window resize), so the no-sticky fallback height only
  // follows that. When there IS a sticky, its measured height is used directly,
  // so a page that does react to the bar (dvh) still tracks correctly.
  if (window.innerWidth !== lastWinW) {
    lastWinW = window.innerWidth;
    vpFallbackH = window.innerHeight;
  }
  timelineH = measureTimelineH();

  const w = viewportW(), h = viewportH();
  const dpr = Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP);   // zoom / monitor change
  if (w === lastMountW && h === lastMountH && dpr === basePR) return;   // nothing to re-allocate
  lastMountW = w; lastMountH = h; basePR = dpr;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  applyRenderScale();
}
window.addEventListener('resize', onResize);

// ─── Render-loop gating (pause offscreen / hidden tab) ───────────────────────
// Full-cost GPU work must actually CEASE when the scene is scrolled out of view
// OR the tab is backgrounded — not just skip a draw. `onscreen` (from the
// IntersectionObserver on the scene section) and `visible` (from
// visibilitychange) are tracked separately; the loop runs only when BOTH hold.
let rafId = 0;
let running = false;
let onscreen = false;              // set by the IntersectionObserver below
let visible  = !document.hidden;   // set by visibilitychange

function start() {
  if (running) return;             // idempotent — never two concurrent rAF loops
  running = true;
  clock.getDelta();                // discard the stale (huge) delta → no time jump
  lastScrollY = window.scrollY;    // reset scroll accumulator → no field lurch on resume
  scrollVel = 0;                   // resume from base drift, not a stale scroll boost
  progressPrimed = false;          // snap the cards to where scroll actually is now
  rsSettle = Math.max(rsSettle, RS_SETTLE);   // don't measure the resume frame
  rafId = requestAnimationFrame(animate);
}
function stop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);     // stop scheduling — GPU work truly stops
}
function updateRunning() {
  if (onscreen && visible) start();
  else stop();
}

document.addEventListener('visibilitychange', () => {
  visible = !document.hidden;
  updateRunning();
});

// Observe the scene's root section; kept alive for the page lifetime.
const gateEl = sceneSection || mountEl;
const io = new IntersectionObserver((entries) => {
  onscreen = entries[entries.length - 1].isIntersecting;
  updateRunning();
}, { threshold: 0 });
io.observe(gateEl);

// ─── Preload gate ────────────────────────────────────────────────────────────
// A SECOND observer with a generous rootMargin starts the image loading while the
// section is still `CFG.preloadMargin` below the viewport — early enough that the
// field is populated on arrival, late enough that it never competes with the hero
// at first paint. Fires immediately if the section is already in range (reload
// mid-page). No IntersectionObserver → just load.
if ('IntersectionObserver' in window) {
  // A bare number in the Webflow config ("preloadMargin: 150") would be an invalid
  // rootMargin and throw, taking the whole scene down — so give it a unit.
  const margin = typeof CFG.preloadMargin === 'number' ? `${CFG.preloadMargin}px` : String(CFG.preloadMargin);
  try {
    const pio = new IntersectionObserver((entries) => {
      if (!entries.some(e => e.isIntersecting)) return;
      pio.disconnect();
      beginLoading();
    }, { rootMargin: `${margin} 0px` });
    pio.observe(gateEl);
  } catch (e) {
    console.warn('[infinite-showroom] bad preloadMargin', CFG.preloadMargin, '— loading immediately', e);
    beginLoading();
  }
} else {
  beginLoading();
}
