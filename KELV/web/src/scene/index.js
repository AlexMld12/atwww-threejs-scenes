// Scena three.js — produsele 3D din hero (GLB-urile de la colegul cu packshot-ul,
// C:\ATWWW\KELV\KELV_PACKSHOT_PREVIEW_DEVELOPER, three 0.186.1 ca în pachetul lui).
//
// ⚠️ SPAȚIUL: lumea e în METRI (unitatea GLB-urilor: K1 are 0.1546 m), dar camera e legată
// de PAGINĂ în pixeli de machetă. Un pixel de machetă (cadrul de 1440) = 1/S metri, iar pe
// ecran = k px CSS, k = max(1, lățime/1720) — exact formula clamp() din tokens.css. Așa
// produsele stau și se scalează ca placeholder-ul din Figma (care era un <img> cu clamp),
// iar la scroll pleacă în sus odată cu hero-ul: frustumul se mută (proiecție decalată),
// ochiul camerei rămâne pe loc → mișcare rigidă, fără schimbare de perspectivă.
//
// ⚠️ ASPECTUL: README-ul pachetului avertizează că GLB-ul singur arată altfel în alt studiu.
// Materialele rămân cele din GLB (transmisia capacului K1, IOR, specular — GLTFLoader, nu
// materiale generice) și se păstrează cârligul lor de shader (lumina difuză din mediu
// separată de reflexii). LUMINILE însă se reglează pe randarea din Figma (regula: din
// Figma aspectul) — acolo produsele stau pe navy, cu lumină de sus, nu pe alb de packshot.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { HERO } from './hero-pose.js';

const k = () => Math.max(1, innerWidth / 1720);

export function initScene({ scroll }) {
  const canvas = document.getElementById('kelv-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ca în preview-ul lor („Standard" în Blender = fără curbă de tone mapping)
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = HERO.light.exposure;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();

  const L = HERO.light;
  // ---- mediul (reflexiile + difuza): o cameră navy cu o „fereastră" slabă sus ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  function buildEnv() {
    const env = new THREE.Scene();
    env.background = new THREE.Color(L.envColor);
    const box = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    box.material.color.setScalar(L.envTop);
    box.position.set(0, 0.8, 0.2);
    box.scale.set(1.6, 1.6, 1);
    box.lookAt(0, 0, 0);
    env.add(box);
    const t = pmrem.fromScene(env, 0, 0.01, 10).texture;
    env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    return t;
  }
  scene.environment = buildEnv();
  scene.environmentIntensity = L.env;

  // ---- sursa din centru (în spatele lui Foam) ----
  const core = new THREE.PointLight(0xffffff, L.core.intensity, 0, 2);
  core.position.fromArray(L.core.pos);
  scene.add(core);

  // ---- halo-ul lui Foam: un sprite aditiv, fără test de adâncime (peste vecini, ca
  // strălucirea din randarea Figma care se revarsă pe capătul serului și muchia cremei) ----
  const glow = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.08)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: L.glow.opacity, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sp.scale.set(L.glow.w, L.glow.h, 1);
    sp.renderOrder = 10;
    sp.visible = false;
    scene.add(sp);
    return sp;
  })();

  const diffuse = { value: L.diffuse };
  const draco = new DRACOLoader().setDecoderPath('/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const group = new THREE.Group();
  scene.add(group);
  const models = {};

  function prepare(root, key) {
    root.traverse((m) => {
      if (!m.isMesh) return;
      for (const mat of [].concat(m.material)) {
        for (const v of Object.values(mat)) if (v?.isTexture) v.anisotropy = renderer.capabilities.getMaxAnisotropy();
        if (L.envBoost[key]) mat.envMapIntensity = L.envBoost[key];
        // Foam „aprins" (nu capacul transparent — el rămâne sticlă)
        if (key === 'foam' && !mat.transmission) {
          mat.emissive = new THREE.Color(1, 1, 1);
          mat.emissiveIntensity = L.foamEmissive;
        }
        // cârligul din viewer.mjs-ul lor: lumina difuză din mediu cu tăria ei proprie
        // ⚠️ legat de revizia three 0.186 (README) — reverifică la un upgrade
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.previewDiffuse = diffuse;
          shader.fragmentShader = 'uniform float previewDiffuse;\n' + shader.fragmentShader.replace(
            '#include <lights_fragment_maps>',
            THREE.ShaderChunk.lights_fragment_maps.replace(
              'iblIrradiance += getIBLIrradiance( geometryNormal );',
              'iblIrradiance += previewDiffuse * getIBLIrradiance( geometryNormal );'));
        };
        mat.customProgramCacheKey = () => 'kelv-diffuse-v1';
      }
    });
  }

  // ---- mișcarea: intrare (o dată, după poarta de afișare), plutire, înclinare după mouse ----
  const M = HERO.motion;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  let t0 = null;                       // începutul intrării (s)
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => {
    mouse.x = e.clientX / innerWidth * 2 - 1;
    mouse.y = e.clientY / innerHeight * 2 - 1;
  }, { passive: true });

  function place(now = performance.now() / 1000) {
    const still = reduce.matches;
    // intrarea pornește când pagina e vizibilă ȘI modelele sunt gata (care vine ultimul)
    const cl = document.documentElement.classList;
    if (t0 == null && cl.contains('is-ready') && cl.contains('has-3d')) t0 = now;
    HERO.products.forEach((p, i) => {
      const m = models[p.key];
      if (!m) return;
      const e = still || t0 == null ? (still ? 1 : 0) : expoOut(Math.max(0, (now - t0 - i * M.enter.stagger) / M.enter.dur));
      const fl = still ? 0 : Math.sin((now / M.float.period) * Math.PI * 2 + i * 2.1) * M.float.amp;
      m.position.set(p.pos[0], p.pos[1] - ((1 - e) * M.enter.dy + fl) / HERO.S, p.pos[2]);
      m.rotation.set(p.rot[0], p.rot[1] + (1 - e) * M.enter.spin, p.rot[2], 'ZXY');
    });
    // apariția: canvas-ul se aprinde în primele 0.7 s ale intrării (produsele nu „sar" în
    // poziția de start, coborâtă)
    canvas.style.opacity = still ? '' : t0 == null ? '0' : String(Math.min(1, (now - t0) / 0.7));
    // mouse: lerp, ca înclinarea să curgă, nu să sară
    if (!still) {
      mouse.sx += (mouse.x - mouse.sx) * 0.06;
      mouse.sy += (mouse.y - mouse.sy) * 0.06;
      group.rotation.set(mouse.sy * M.tilt, mouse.sx * M.tilt, 0);
    }
    if (models.foam) {
      const f = models.foam.position;
      glow.position.set(f.x + L.glow.pos[0] - HERO.products[1].pos[0], f.y + L.glow.pos[1] - HERO.products[1].pos[1], L.glow.pos[2]);
      glow.position.applyEuler(group.rotation);
      glow.material.rotation = HERO.products[1].rot[2];
      glow.visible = true;
    }
  }

  // ---- camera: ochiul fix în spațiul hero-ului, frustumul decupează fereastra paginii ----
  // Coordonate de machetă: X la dreapta (720 = centrul), Y în jos de la vârful paginii.
  // Lume: x = (X − 720) / S, y = −(Y − eyeY) / S. Fereastra vizibilă la z = 0:
  // X ∈ 720 ± W/2k, Y ∈ [scrollY/k, (scrollY + H)/k].
  let W = 1, H = 1, dirty = true;
  function frame(sy) {
    const kk = k(), S = HERO.S, D = HERO.D / S;     // D: distanța ochiului, în metri
    const eyeY = HERO.eyeY;
    camera.position.set(0, 0, D);
    camera.near = D * 0.5;
    camera.far = D * 2;
    const n = camera.near;
    const xl = -W / 2 / kk / S, xr = W / 2 / kk / S;
    const yt = -(sy / kk - eyeY) / S, yb = -((sy + H) / kk - eyeY) / S;
    camera.projectionMatrix.makePerspective(xl * n / D, xr * n / D, yt * n / D, yb * n / D, n, camera.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
  }
  function resize() {
    W = innerWidth; H = innerHeight;
    // ⚠️ plafon 2: pe ecrane 3x costul de fragment se triplează fără câștig vizibil
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H, false);
    dirty = true;
  }
  addEventListener('resize', resize);
  resize();

  Promise.all(HERO.products.map((p) => loader.loadAsync(p.url).then((g) => {
    prepare(g.scene, p.key);
    models[p.key] = g.scene;
    group.add(g.scene);
  }))).then(async () => {
    place();
    // shaderele (transmisia capacului K1 e cea mai grea) se compilează ÎNAINTE de primul
    // cadru vizibil — altfel prima randare îngheța pagina o clipă
    frame(scrollY);
    await renderer.compileAsync(scene, camera);
    dirty = true;
    document.documentElement.classList.add('has-3d');   // hero.css ascunde placeholder-ul
  }).catch((e) => {
    // fără modele → randarea din Figma rămâne (hero.css: `html.no-3d`)
    document.documentElement.classList.add('no-3d');
    console.error('[scene] GLB', e);
  });

  // Unde e hero-ul: cel real (vârful paginii) sau COPIA lui de după footer (bucla, loop.js).
  // ⚠️ Copia trebuie să arate aceleași produse: Lenis sare de la capăt la 0 pe cadre
  // identice — cu imaginea din Figma în copie și 3D în hero, saltul s-ar fi văzut.
  // Hero-ul are 100vh + 859 px de machetă; în afara lui nu se desenează nimic.
  const loopEl = document.querySelector('[data-loop]');
  function heroOffset(sy) {
    const len = innerHeight + 859 * k();
    if (sy < len) return sy;
    const top = loopEl ? loopEl.getBoundingClientRect().top + sy : Infinity;
    if (sy + innerHeight > top) return sy - top;
    return null;
  }
  let lastY = -1;
  scroll.onFrame(() => {
    const sy = scrollY;
    if (sy !== lastY) { lastY = sy; dirty = true; }
    // produsele plutesc → în hero se desenează în fiecare cadru (cu „reduce motion", doar
    // la scroll / resize)
    if (!reduce.matches) dirty = true;
    if (!dirty || !document.documentElement.classList.contains('has-3d')) return;
    dirty = false;
    // în afara hero-ului (și cât analiza e pagina) canvas-ul e ascuns
    const y = document.documentElement.classList.contains('sa-on') ? null : heroOffset(sy);
    canvas.style.visibility = y == null ? 'hidden' : '';
    if (y == null) return;
    place();
    frame(y);
    renderer.render(scene, camera);
  });

  const api = {
    THREE, renderer, scene, camera, models, core, glow, group, diffuse, HERO, place, frame,
    redraw() { place(); dirty = true; },
    rebuildEnv() { scene.environment = buildEnv(); dirty = true; },
  };
  if (window.__dbg) Object.assign(window.__dbg, api);
  return api;
}
