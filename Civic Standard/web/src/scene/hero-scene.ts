import * as THREE from 'three';
import projects from '@/components/projects/projects.json';
import { isHandheld, pixelRatio, stageLift } from '@/lib/device';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { handOver, loaderMask, onLoaded, sceneIn } from '@/lib/intro';
import { fetchWithProgress, finishTask, reportProgress, type PreloadTask } from '@/lib/preload';
import { scrollPosition } from '@/lib/scroll';
import { createBackdrop } from './backdrop';
import { createReflections } from './environment';
import { createFocus } from './focus';
import { createGlass } from './glass';
import { ASSETS, CAMERA, INTRO, LOGO, PROJECTS, SCROLL, TAKEOVER, TUBE } from './config';
import { fovFor } from './framing';
import { introState } from './intro';
import { createLogo } from './logo';
import { createTakeover } from './takeover';
import { createTube, wrapRows, type Picture } from './tube';
import { installViewCurve, type ViewCurve } from './view-curve';

export const PROJECT_TUBE = '/projects/tube/';
const CELLS = TUBE.contentRows * TUBE.columns;
// the cells past the 51 renders (and the hero's bench) repeat pictures from the middle of the list, away from the
// rows they first appear in
const REPEAT_FROM = 25;

/**
 * Which project each cell of the tube shows (tube.ts, row by row), -1 for the bench photo: on the home the bench
 * sits where TUBE.bench says, on /projects there is none.
 */
export function cellProjects(withBench: boolean) {
  const cells = projects.map((_, i) => i);
  if (withBench) cells.splice(TUBE.bench[0] * TUBE.columns + TUBE.bench[1], 0, -1);
  for (let k = 0; cells.length < CELLS; k++) cells.push(REPEAT_FROM + k);
  return cells;
}

/** `mirrored`: a project's render, which runs on past its edges in mirror (focus.ts: under the open project's panel). */
async function loadTexture(blob: Blob, mirrored = false) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (mirrored) texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
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

/** `report`: the preloader's progress (the home); /projects has no preloader, and must not move it. */
async function loadAssets(report: boolean) {
  const progress = (task: PreloadTask, fraction: number) => report && reportProgress(task, fraction);
  const viewCurve = fetch(ASSETS + 'view-curve.json')
    .then((response) => response.json() as Promise<ViewCurve>)
    .finally(() => progress('view-curve', 1));

  const gltf = fetchWithProgress(ASSETS + 'logo.glb', (f) => progress('logo', f))
    .then((blob) => blob.arrayBuffer())
    .then((buffer) => new GLTFLoader().parseAsync(buffer, ''));

  const wallShares = { light: 0, leaves: 0 };
  const wallLayer = (name: keyof typeof wallShares) =>
    fetchWithProgress(`${ASSETS}backdrop-${name}.webp`, (f) => {
      wallShares[name] = f;
      progress('backdrop', (wallShares.light + wallShares.leaves) / 2);
    }).then(loadTexture);
  const backdropMap = wallLayer('light');
  const leavesMap = wallLayer('leaves').then((texture) => {
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
  });

  const studio = fetchWithProgress(ASSETS + 'studio.hdr', (f) => progress('environment', f)).then(loadStudio);

  const shares = new Array<number>(projects.length).fill(0);
  const projectMaps = Promise.all(
    projects.map(({ slug }, i) =>
      fetchWithProgress(`${PROJECT_TUBE}${slug}.webp`, (f) => {
        shares[i] = f;
        progress('pictures', shares.reduce((a, b) => a + b) / shares.length);
      }).then((blob) => loadTexture(blob, true)),
    ),
  );

  const benchMap = report
    ? fetchWithProgress('/built/1.webp', (f) => progress('bench', f)).then(loadTexture)
    : Promise.resolve(null);

  return {
    viewCurve: await viewCurve,
    gltf: await gltf,
    backdropMap: await backdropMap,
    leavesMap: await leavesMap,
    studio: await studio,
    projectMaps: await projectMaps,
    benchMap: await benchMap,
  };
}

// a phone's resolution steps down while its frames stay slow, never below 1.25 device px a px (blurred below that)
const SLOW = { frames: 45, frameS: 1 / 50, step: 0.85, floor: 1.25 };
// a 90 or 120 Hz phone: the scene at 60 a second, steady, not at whatever its GPU reaches between
const FRAME_MS = 1000 / 60 - 2;
// the intro's longest part (its spin, INTRO.spin) is over by then
const LIVE_MS = 2600;

type Options =
  /** The home's hero: `onHeroHeight` gets its scroll length in px, which ends where the bench row comes level. */
  | { mode: 'home'; onHeroHeight: (px: number) => void }
  /**
   * /projects: no preloader, no end; `scroll` is the page's own (virtual) scroll, `setScroll` moves it to where an
   * open project left the tube.
   */
  | { mode: 'projects'; scroll: () => number; setScroll: (px: number) => void };

const LOOP = TUBE.familySpeeds.length * TUBE.rowSpacing;
const MIDDLE_ROW = (TUBE.rows - 1) / 2;
const FRONT_ANGLE = -Math.PI / 2;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// full-size renders kept on the GPU (each is ~30 MB with its mipmaps): the last few opened
const HI_RES_KEPT = 4;

export async function createHeroScene(canvas: HTMLCanvasElement, paperCss: string, options: Options) {
  const home = options.mode === 'home';
  const handheld = isHandheld();
  // no multisampling on a phone: its pixel ratio already smooths the edges, and it doubles the cost of every pass
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !handheld, powerPreference: 'high-performance' });
  // the glass is ray-traced per pixel: the heaviest of the site's scenes on a phone
  renderer.setPixelRatio(pixelRatio(2, 1.75));
  renderer.toneMapping = THREE.CustomToneMapping;
  if (home) finishTask('scene-code');

  const assets = await loadAssets(home);
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
  const cells = cellProjects(home);
  const pictures: Picture[] = cells.map((project) =>
    project < 0
      ? { map: assets.benchMap!, aspect: TAKEOVER.imageAspect }
      : { map: assets.projectMaps[project], aspect: 1 },
  );
  const tube = createTube(pictures, renderer.capabilities.getMaxAnisotropy());
  const { rows } = tube;
  const takeover = home ? createTakeover(assets.benchMap!, tube.panels) : null;
  const focus = home ? null : createFocus();
  const front = takeover?.card ?? focus!.card;
  const logoMesh = assets.gltf.scene.getObjectByProperty('isMesh', true) as THREE.Mesh;
  const glass = createGlass(renderer, logoMesh.geometry, reflections.texture, assets.backdropMap, assets.leavesMap);
  const logo = createLogo(assets.gltf.scene, glass);
  scene.add(backdrop, tube.tube, logo.logo, front);

  const scroll = home ? scrollPosition : options.scroll;
  let dirty = true;
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = fovFor(width, height);
    // the logo in the middle of what the screen shows, as the preloader's (preloader.css, --stage-lift)
    const lift = stageLift(height);
    if (lift) camera.setViewOffset(width, height, 0, lift, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    glass.setBackdropScale(fitBackdrop(camera));
    if (home) options.onHeroHeight(takeover!.layout(height));
    dirty = true;
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  let angle = TUBE.phase;
  let spin = 0;
  let direction = 1;
  let lastScroll = scroll();
  // The scroll as the tube shows it (eased once more than the page): the rows, the turn to the bench and the photo's
  // growth all follow this one value, so the motion keeps one feel from the tube into the takeover.
  let shownScroll = lastScroll;
  let loaded = !home;
  let loadedAt = -1;
  let elapsed = 0;

  // /projects: a picture clicked is first brought to the front (`seek`: the rows travel, the ring turns), then grows
  // (focus.ts); `held` keeps the tube there while it is open, and after a close the tube's own turn comes back
  // over PROJECTS.resumeS (`resume`).
  let travel = 0;
  let held: { travel: number; angle: number } | null = null;
  let resume = 1;
  const seek = {
    active: false,
    t: 0,
    duration: 1,
    from: { travel: 0, angle: 0 },
    to: { travel: 0, angle: 0 },
    cell: -1,
    map: null as THREE.Texture | null,
    growing: false,
  };

  /** Where the tube has to be for `cell` to face the camera in the middle, from where it is now. */
  function frontOf(cell: number, fromTravel: number, fromAngle: number) {
    tube.showFor(fromTravel);
    const panel = tube.panelOf(cell);
    // its row as the rows run (tube.ts): the travel that brings it level with the centre
    const round = Math.floor((fromTravel + LOOP / 2) / LOOP);
    const row = panel.row + TUBE.familySpeeds.length * round;
    const speed = TUBE.familySpeeds[panel.family];
    // the nearest turn at which it faces the camera (its row turns `speed` times the tube's angle)
    const base = (FRONT_ANGLE - panel.phi) / speed;
    const period = (Math.PI * 2) / speed;
    const angleTo = base + Math.round((fromAngle - base) / period) * period;
    return { travel: (row - MIDDLE_ROW) * TUBE.rowSpacing, angle: angleTo, speed };
  }

  const update = (dt: number, now: number) => {
    const intro = introState(loadedAt < 0 ? -1 : (now - loadedAt) / 1000);
    // /projects comes in with the logo already turning and the wall lit; only the rows rise
    if (!home) intro.tilt = intro.spin = intro.backdrop = 1;
    const position = scroll();
    const delta = position - lastScroll;
    lastScroll = position;
    if (delta) direction = Math.sign(delta);

    spin += delta * SCROLL.spinPerPx;
    spin = THREE.MathUtils.clamp(spin * Math.pow(SCROLL.spinDamping, dt * 60), -SCROLL.maxSpin, SCROLL.maxSpin);
    const stageHeight = Math.max(canvas.clientHeight, 1);
    // Until the handover the logo faces the camera, exactly where the preloader drew it.
    const motion = direction * TUBE.idleSpin * intro.spin + spin;
    shownScroll += (position - shownScroll) * (1 - Math.pow(1 - SCROLL.follow, dt * 60));
    if (takeover) {
      angle = takeover.turn(angle, motion, shownScroll, dt);
      travel = takeover.travelFor(shownScroll);
    } else if (seek.active) {
      seek.t = Math.min(1, seek.t + dt / seek.duration);
      const e = easeInOut(seek.t);
      travel = seek.from.travel + (seek.to.travel - seek.from.travel) * e;
      angle = seek.from.angle + (seek.to.angle - seek.from.angle) * e;
      if (seek.t >= 1) {
        seek.active = false;
        held = { ...seek.to };
      }
    } else if (held) {
      ({ travel, angle } = held);
    } else {
      resume = Math.min(1, resume + dt / PROJECTS.resumeS);
      angle += motion * easeInOut(resume) * dt;
      travel = shownScroll * SCROLL.travelPerPx;
    }
    tube.showFor(travel);
    // the picture starts to grow as it settles at the front, from the panel that shows it now
    if (!seek.growing && seek.cell >= 0 && (seek.t >= PROJECTS.growFrom || !seek.active)) {
      seek.growing = true;
      focus!.open(tube.panelOf(seek.cell), seek.map!);
    }
    const shift = wrapRows(travel);
    rows.forEach((row, i) => {
      const rest = 1 - intro.rise(i - shift / TUBE.rowSpacing);
      row.position.y = (i - (TUBE.rows - 1) / 2) * TUBE.rowSpacing - shift - INTRO.riseDistance * rest;
      row.rotation.y = angle * TUBE.familySpeeds[i % TUBE.familySpeeds.length] + INTRO.riseTwist * rest;
    });
    logo.turn.rotation.y = LOGO.facing - angle * LOGO.turnRatio;
    // Until the handover the glass shows only under the preloader's disc, with its black lines.
    logo.setForm(home && loadedAt < 0 ? loaderMask.glass : 1, intro.tilt);
    glass.setMask(home && loadedAt < 0 ? loaderMask : null, canvas);
    // The navbar comes in as the first row rises into the frame (the tube's front edge), not when the rise starts.
    const frontEdge = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - TUBE.radius);
    if (loadedAt >= 0 && rows.some((row) => row.position.y + TUBE.panelHeight / 2 > -frontEdge)) sceneIn();
    if (takeover) takeover.grow(shownScroll, canvas.clientWidth, stageHeight);
    else {
      focus!.update(dt, canvas.clientWidth, stageHeight);
      // closed: the tube is free again, its scroll where the project left it
      if (held && !seek.active && focus!.progress() === 0 && !focus!.isMoving()) {
        lastScroll = shownScroll = held.travel / SCROLL.travelPerPx;
        if (!home) options.setScroll(shownScroll);
        held = null;
        spin = 0;
        resume = 0;
      }
    }

    elapsed += dt;
    backdropUniforms.backdropTime.value = elapsed;
    backdropUniforms.backdropReveal.value = intro.backdrop;
    glass.setWallThrough(1 - intro.backdrop);
  };

  // Compile with the front card on as well, so it does not stall the frame it first appears in.
  front.visible = true;
  if (focus) focus.open(tube.panels[0][0], assets.projectMaps[0], true);
  await renderer.compileAsync(scene, camera);
  front.visible = false;
  if (focus) {
    focus.close();
    focus.update(1e3, 1, 1);
  }
  update(0, performance.now());
  glass.render(scene, camera, logo.mesh, [logo.model, front]);
  canvas.classList.add('is-drawn');
  if (home) finishTask('compile');

  const stopLoaded = home
    ? onLoaded(() => {
        loaded = true;
      })
    : () => undefined;

  // Past the hero (the page below it) nothing of it is seen: no update, no ray-traced frame for the GPU.
  let onScreen = true;
  const visibility = new IntersectionObserver((entries) => (onScreen = entries.at(-1)!.isIntersecting));
  visibility.observe(canvas.closest('section') ?? canvas);

  // A phone's GPU varies tenfold: if the frames stay slow (under ~40 a second, over a second's worth), the scene
  // draws at fewer device pixels, step by step, down to SLOW.floor; it never goes back up (no back and forth).
  const slow = { frames: 0, time: 0 };
  const adapt = (dt: number) => {
    if (!handheld || loadedAt < 0) return;
    slow.frames++;
    slow.time += dt;
    if (slow.frames < SLOW.frames) return;
    const average = slow.time / slow.frames;
    slow.frames = slow.time = 0;
    const ratio = renderer.getPixelRatio();
    if (average > SLOW.frameS && ratio > SLOW.floor) {
      renderer.setPixelRatio(Math.max(SLOW.floor, ratio * SLOW.step));
      resize();
    }
  };

  // /projects: while a picture fills the screen nothing else shows, so the tube holds still under it (it comes back
  // to the ring where it was) and nothing is drawn but for a change.
  const covered = () => focus !== null && focus.progress() === 1 && !focus.isMoving();

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    if (now - last < FRAME_MS) return;
    if (!onScreen && loadedAt >= 0) {
      last = now;
      lastScroll = shownScroll = scroll();
      return;
    }
    if (covered()) {
      last = now;
      lastScroll = scroll();
      if (!dirty) return;
      dirty = false;
      focus!.update(0, canvas.clientWidth, Math.max(canvas.clientHeight, 1));
      glass.render(scene, camera, logo.mesh, [logo.model, front], false);
      return;
    }
    if (loaded && loadedAt < 0) loadedAt = now;
    update(Math.min((now - last) / 1000, 0.1), now);
    adapt((now - last) / 1000);
    last = now;
    // the glass drawn live until the intro has settled it (preloader's disc, tilt, spin), then as a phone's snapshots
    glass.render(scene, camera, logo.mesh, [logo.model, front], loadedAt < 0 || now - loadedAt < LIVE_MS);
    if (home && loaded) handOver();
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  // the full-size renders, fetched on hover or click, uploaded where the frame can afford it
  const hiRes = new Map<number, Promise<THREE.Texture>>();
  const fetched = new Set<number>();
  const uploaded = new Set<number>();
  const shown = { project: -1 };

  function fullSize(project: number) {
    if (!hiRes.has(project)) {
      const size = handheld ? '-m' : '';
      hiRes.set(
        project,
        fetch(`/projects/${projects[project].slug}${size}.webp`)
          .then((response) => response.blob())
          .then((blob) => loadTexture(blob, true))
          .then((texture) => {
            fetched.add(project);
            return texture;
          }),
      );
      // the oldest ones leave the GPU
      for (const old of hiRes.keys()) {
        if (hiRes.size <= HI_RES_KEPT) break;
        if (old === shown.project) continue;
        void hiRes.get(old)!.then((texture) => texture.dispose());
        hiRes.delete(old);
        uploaded.delete(old);
        fetched.delete(old);
      }
    }
    return hiRes.get(project)!;
  }

  /** The full-size picture, uploaded: once the screen is still (an upload is a long frame). */
  async function sharp(project: number) {
    const map = await fullSize(project);
    if (!uploaded.has(project)) {
      while (focus!.isMoving() || seek.active) await new Promise(requestAnimationFrame);
      renderer.initTexture(map);
      uploaded.add(project);
    }
    return map;
  }

  const neighbours = (project: number) => {
    void fullSize((project + 1) % projects.length);
    void fullSize((project - 1 + projects.length) % projects.length);
  };

  return {
    /** The project under a point of the screen (client px), or null: any picture of the tube, near or far. */
    pick(clientX: number, clientY: number) {
      if (!focus || held || seek.active || focus.progress() > 0) return null;
      const rect = canvas.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(rows, true)[0];
      return hit
        ? { project: cells[hit.object.userData.cell as number], cell: hit.object.userData.cell as number }
        : null;
    },
    /** Fetches a project's full-size picture ahead (the pointer is over it). */
    prefetch(project: number) {
      void fullSize(project);
    },
    /** The project's panel comes in (true) or goes: the open picture makes room for it. */
    setFitted(on: boolean) {
      focus?.setFitted(on);
      dirty = true;
    },
    /** The part of the screen (canvas px) an open project's picture fits: what its panel leaves. */
    setView(x: number, y: number, width: number, height: number) {
      focus?.setView(x, y, width, height);
      dirty = true;
    },
    /**
     * Opens a project: the tube brings its panel (`cell`, the one clicked, else the first that shows it) to the
     * front, then it grows to the full screen. `instant` (the page opened on a project) puts it there at once.
     * Resolves once it fills the screen.
     */
    async open(project: number, cell = cells.indexOf(project), instant = false) {
      if (!focus) return;
      shown.project = project;
      // the full-size picture from the start if it has come (uploaded now, at the click), else the tube's until then
      void fullSize(project);
      if (fetched.has(project) && !uploaded.has(project)) {
        renderer.initTexture(await fullSize(project));
        uploaded.add(project);
      }
      const map = uploaded.has(project) ? await fullSize(project) : assets.projectMaps[project];
      const to = frontOf(cell, travel, angle);
      if (instant) {
        held = { travel: to.travel, angle: to.angle };
        travel = to.travel;
        angle = to.angle;
        tube.showFor(travel);
        focus.open(tube.panelOf(cell), map, true);
      } else {
        const rows = Math.abs(to.travel - travel) / TUBE.rowSpacing;
        const turns = Math.abs((to.angle - angle) * to.speed) / Math.PI;
        Object.assign(seek, {
          active: true,
          t: 0,
          duration: Math.min(
            PROJECTS.seekS[1],
            PROJECTS.seekS[0] + PROJECTS.seekPerRow * rows + PROJECTS.seekPerTurn * turns,
          ),
          from: { travel, angle },
          to: { travel: to.travel, angle: to.angle },
          cell,
          map,
          growing: false,
        });
        spin = 0;
      }
      dirty = true;
      neighbours(project);
      if (!uploaded.has(project)) void sharp(project).then((full) => shown.project === project && focus.sharpen(full));
      while (focus.progress() < 1) await new Promise(requestAnimationFrame);
      seek.cell = -1;
    },
    /** Another project while one is open (the panel's arrows): wiped in, from the right for the next one. */
    async change(project: number, direction: number) {
      if (!focus) return;
      shown.project = project;
      const map = await sharp(project);
      if (shown.project !== project) return;
      focus.change(map, direction);
      dirty = true;
      neighbours(project);
    },
    /** Back into the ring: the tube is set (unseen, under the picture) so its panel is at the front; it shrinks there. */
    close() {
      if (!focus) return;
      seek.active = false;
      seek.cell = -1;
      const cell = cells.indexOf(shown.project);
      const to = frontOf(cell, held?.travel ?? travel, held?.angle ?? angle);
      held = { travel: to.travel, angle: to.angle };
      travel = to.travel;
      angle = to.angle;
      tube.showFor(travel);
      focus.setPanel(tube.panelOf(cell));
      focus.close();
      shown.project = -1;
    },
    dispose() {
      stopLoaded();
      renderer.setAnimationLoop(null);
      observer.disconnect();
      visibility.disconnect();
      scene.traverse((child) => {
        // the tube's panels and the focus card free their own
        if (child instanceof THREE.Mesh && !rows.includes(child.parent as THREE.Group) && child !== focus?.card) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      tube.dispose();
      focus?.dispose();
      hiRes.forEach((map) => map.then((texture) => texture.dispose()).catch(() => undefined));
      assets.projectMaps.forEach((map) => map.dispose());
      assets.benchMap?.dispose();
      assets.backdropMap.dispose();
      assets.leavesMap.dispose();
      reflections.dispose();
      glass.dispose();
      renderer.dispose();
    },
  };
}
