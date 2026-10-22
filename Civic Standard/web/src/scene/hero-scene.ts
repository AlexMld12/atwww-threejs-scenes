import * as THREE from 'three';
import { pixelRatio } from '@/lib/device';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { handOver, loaderMask, onLoaded, sceneIn } from '@/lib/intro';
import { fetchWithProgress, finishTask, reportProgress } from '@/lib/preload';
import { scrollPosition } from '@/lib/scroll';
import { createBackdrop } from './backdrop';
import { createReflections } from './environment';
import { createGlass } from './glass';
import { ASSETS, CAMERA, INTRO, LOGO, SCROLL, TUBE } from './config';
import { fovFor } from './framing';
import { introState } from './intro';
import { createLogo } from './logo';
import { createTakeover } from './takeover';
import { createTube, wrapRows } from './tube';
import { installViewCurve, type ViewCurve } from './view-curve';

async function loadTexture(blob: Blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

async function loadStudio(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const hdr = await new HDRLoader().loadAsync(url);
  URL.revokeObjectURL(url);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  return hdr;
}

async function loadAssets() {
  const viewCurve = fetch(ASSETS + 'view-curve.json')
    .then((response) => response.json() as Promise<ViewCurve>)
    .finally(() => finishTask('view-curve'));

  const gltf = fetchWithProgress(ASSETS + 'logo.glb', (f) => reportProgress('logo', f))
    .then((blob) => blob.arrayBuffer())
    .then((buffer) => new GLTFLoader().parseAsync(buffer, ''));

  const wallShares = { light: 0, leaves: 0 };
  const wallLayer = (name: keyof typeof wallShares) =>
    fetchWithProgress(`${ASSETS}backdrop-${name}.webp`, (f) => {
      wallShares[name] = f;
      reportProgress('backdrop', (wallShares.light + wallShares.leaves) / 2);
    }).then(loadTexture);
  const backdropMap = wallLayer('light');
  const leavesMap = wallLayer('leaves').then((texture) => {
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
  });

  const studio = fetchWithProgress(ASSETS + 'studio.hdr', (f) => reportProgress('environment', f)).then(loadStudio);

  const shares = new Array<number>(TUBE.paintings).fill(0);
  const paintingMaps = Promise.all(
    shares.map((_, i) =>
      fetchWithProgress(`${ASSETS}paintings/${i + 1}.webp`, (f) => {
        shares[i] = f;
        reportProgress('paintings', shares.reduce((a, b) => a + b) / shares.length);
      }).then(loadTexture),
    ),
  );

  const benchMap = fetchWithProgress('/built/1.webp', (f) => reportProgress('bench', f)).then(loadTexture);

  return {
    viewCurve: await viewCurve,
    gltf: await gltf,
    backdropMap: await backdropMap,
    leavesMap: await leavesMap,
    studio: await studio,
    paintingMaps: await paintingMaps,
    benchMap: await benchMap,
  };
}

/** `onHeroHeight` gets the hero's scroll length in px: it ends where a bench row comes level with the centre. */
export async function createHeroScene(canvas: HTMLCanvasElement, paperCss: string, onHeroHeight: (px: number) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // the glass is ray-traced per pixel: the heaviest of the site's scenes on a phone
  renderer.setPixelRatio(pixelRatio(2, 1.25));
  renderer.toneMapping = THREE.CustomToneMapping;
  finishTask('scene-code');

  const assets = await loadAssets();
  installViewCurve(assets.viewCurve);

  const scene = new THREE.Scene();
  const reflections = createReflections(renderer, assets.studio, assets.backdropMap, assets.leavesMap);
  assets.studio.dispose();

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.05, 200);
  camera.position.z = CAMERA.distance;

  const { backdrop, backdropUniforms, fitBackdrop } = createBackdrop(
    assets.backdropMap,
    assets.leavesMap,
    assets.viewCurve,
    paperCss,
  );
  const { tube, rows, benchPanels } = createTube(
    assets.paintingMaps,
    assets.benchMap,
    renderer.capabilities.getMaxAnisotropy(),
  );
  const takeover = createTakeover(assets.benchMap, benchPanels);
  const logoMesh = assets.gltf.scene.getObjectByProperty('isMesh', true) as THREE.Mesh;
  const glass = createGlass(renderer, logoMesh.geometry, reflections.texture, assets.backdropMap, assets.leavesMap);
  const logo = createLogo(assets.gltf.scene, glass);
  scene.add(backdrop, tube, logo.logo, takeover.card);

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = fovFor(width, height);
    camera.updateProjectionMatrix();
    glass.setBackdropScale(fitBackdrop(camera));
    onHeroHeight(takeover.layout(height));
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  let angle = TUBE.phase;
  let spin = 0;
  let direction = 1;
  let lastScroll = scrollPosition();
  // The scroll as the tube shows it (eased once more than the page): the rows, the turn to the bench and the photo's
  // growth all follow this one value, so the motion keeps one feel from the tube into the takeover.
  let shownScroll = lastScroll;
  let loaded = false;
  let loadedAt = -1;
  let elapsed = 0;

  const update = (dt: number, now: number) => {
    const intro = introState(loadedAt < 0 ? -1 : (now - loadedAt) / 1000);
    const scroll = scrollPosition();
    const delta = scroll - lastScroll;
    lastScroll = scroll;
    if (delta) direction = Math.sign(delta);

    spin += delta * SCROLL.spinPerPx;
    spin = THREE.MathUtils.clamp(spin * Math.pow(SCROLL.spinDamping, dt * 60), -SCROLL.maxSpin, SCROLL.maxSpin);
    const stageHeight = Math.max(canvas.clientHeight, 1);
    // Until the handover the logo faces the camera, exactly where the preloader drew it.
    const motion = direction * TUBE.idleSpin * intro.spin + spin;
    shownScroll += (scroll - shownScroll) * (1 - Math.pow(1 - SCROLL.follow, dt * 60));
    angle = takeover.turn(angle, motion, shownScroll, dt);

    const shift = wrapRows(takeover.travelFor(shownScroll));
    rows.forEach((row, i) => {
      const rest = 1 - intro.rise(i - shift / TUBE.rowSpacing);
      row.position.y = (i - (TUBE.rows - 1) / 2) * TUBE.rowSpacing - shift - INTRO.riseDistance * rest;
      row.rotation.y = angle * TUBE.familySpeeds[i % TUBE.familySpeeds.length] + INTRO.riseTwist * rest;
    });
    logo.turn.rotation.y = LOGO.facing - angle * LOGO.turnRatio;
    // Until the handover the glass shows only under the preloader's disc, with its black lines.
    logo.setForm(loadedAt < 0 ? loaderMask.glass : 1, intro.tilt);
    glass.setMask(loadedAt < 0 ? loaderMask : null, canvas);
    // The navbar comes in as the first row rises into the frame (the tube's front edge), not when the rise starts.
    const frontEdge = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - TUBE.radius);
    if (loadedAt >= 0 && rows.some((row) => row.position.y + TUBE.panelHeight / 2 > -frontEdge)) sceneIn();
    takeover.grow(shownScroll, canvas.clientWidth, stageHeight);

    elapsed += dt;
    backdropUniforms.backdropTime.value = elapsed;
    backdropUniforms.backdropReveal.value = intro.backdrop;
    glass.setWallThrough(1 - intro.backdrop);
  };

  // Compile with the takeover card on as well, so it does not stall the frame it first appears in.
  takeover.card.visible = true;
  await renderer.compileAsync(scene, camera);
  update(0, performance.now());
  glass.render(scene, camera, logo.mesh, [logo.model, takeover.card]);
  canvas.classList.add('is-drawn');
  finishTask('compile');

  const stopLoaded = onLoaded(() => {
    loaded = true;
  });

  // Past the hero (the page below it) nothing of it is seen: no update, no ray-traced frame for the GPU.
  let onScreen = true;
  const visibility = new IntersectionObserver((entries) => (onScreen = entries.at(-1)!.isIntersecting));
  visibility.observe(canvas.closest('section') ?? canvas);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    if (!onScreen && loadedAt >= 0) {
      last = now;
      lastScroll = shownScroll = scrollPosition();
      return;
    }
    if (loaded && loadedAt < 0) loadedAt = now;
    update(Math.min((now - last) / 1000, 0.1), now);
    last = now;
    glass.render(scene, camera, logo.mesh, [logo.model, takeover.card]);
    if (loaded) handOver();
  });

  return () => {
    stopLoaded();
    renderer.setAnimationLoop(null);
    observer.disconnect();
    visibility.disconnect();
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    assets.paintingMaps.forEach((map) => map.dispose());
    assets.benchMap.dispose();
    assets.backdropMap.dispose();
    assets.leavesMap.dispose();
    reflections.dispose();
    glass.dispose();
    renderer.dispose();
  };
}
