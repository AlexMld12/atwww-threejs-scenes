// Values from Civic_standard_Intro-Animation.blend (scene "02 • Civic Standard — Image Tube"),
// converted to three's Y-up axes: Blender (x, y, z) → (x, z, -y).

export const CAMERA = {
  fov: 50,
  distance: 6,
};

// The scene is framed by the site's size rule, clamp(Npx, N / 1720 * 100vw, N / 1720 * 100vw): the Figma frame
// (1440 × 850 through the 50° camera) sets N px per scene unit at the origin, constant up to 1720 px wide.
export const FRAMING = {
  pxPerUnit: 850 / (2 * CAMERA.distance * Math.tan((CAMERA.fov / 2) * (Math.PI / 180))),
  designWidth: 1720,
};

export const TUBE = {
  radius: 4,
  columns: 6,
  rows: 9,
  rowSpacing: 2.7,
  // Rows repeat in three families; each family spins at its own rate and starts half a column apart.
  familySpeeds: [0.65, 1.1, 1.55],
  familyOffsets: [0, 0.5, 0],
  panelWidth: 0.72,
  panelHeight: 1,
  paintings: 7,
  phase: 0.28,
  idleSpin: 0.25,
};

export const LOGO = {
  offsetX: 0.08,
  tilt: 0.13,
  size: 0.48,
  facing: 0.28,
  // Counter-rotation against the tube: 1 = the logo turns exactly as fast as the tube angle.
  turnRatio: 1,
};

export const GLASS = {
  color: [0.856, 0.864, 0.86],
  ior: 1.45,
  // The world HDR is only seen by glossy rays, at strength 0.65.
  envIntensity: 0.65,
  // Cube face size of the reflection capture.
  reflectionSize: 512,
  // Surfaces a ray may meet through the logo (Cycles: 8 transmission bounces).
  traceBounces: 8,
  // a phone's GPU: the light that comes through after 3 surfaces is most of it
  handheldBounces: 3,
};

export const BACKDROP = {
  distance: 12,
  // Aspect of the camera frame the wall was rendered around (2880 × 1700).
  aspect: 2880 / 1700,
  // The render covers this many camera frames (the .blend wall is 1.21 ×), for wider screens and the glass's rays.
  cover: 1.2,
  // Same factor as tools/prepare_assets.py: the texture stores linear light divided by it.
  gain: 1.2,
  // Where the light comes from on the texture (uv): the leaves light up from there outwards, this far (in heights).
  lightOrigin: [0.3, 0.74],
  revealReach: 2.3,
  // The leaves' shadow is stored over leavesMin…1 (same value as tools/blender_backdrop.py).
  leavesMin: 0.8,
  // Wind: the fronds turn a little (radians) about where they grow, top right outside the frame, and flutter (uv).
  swayPivot: [1.08, 1.1],
  swayAngle: 0.009,
  swaySpeed: 0.8,
  flutter: 0.0012,
};

// Seconds after the handover. Ranges are [start, end].
export const INTRO = {
  tilt: [0.25, 1.9],
  spin: [0.6, 2.4],
  backdrop: [0, 2.6],
  // Rows come up from below, the bottom one first, with a twist that unwinds on the way.
  riseStart: 0.15,
  riseStagger: 0.07,
  riseDuration: 1.9,
  riseDistance: 18,
  riseTwist: -0.9,
};

// Scroll response, as in the reference demo: page pixels move the rows and add spin that dies down.
export const SCROLL = {
  travelPerPx: 0.002,
  spinPerPx: 0.004,
  spinDamping: 0.92,
  maxSpin: 2,
  follow: 0.12,
};

// The hero's scroll, in screens: the tube, then the bench photo growing to the full screen (Figma frames 3 → 5).
// The tube runs at least tubeScreens; the section then lengthens to the next scroll where a bench row is level.
// Over the last seekScreens before it the rows brake to a standstill and the scroll turns the bench panel to the
// front (it used to be time: the page then waited at the landing for the turn, which read as the scroll sticking).
export const HERO = {
  tubeScreens: 4,
  growScreens: 2,
  seekScreens: 2,
};

// A panel at the front of the tube, centred, is Figma's frame-3 card (329 × 456 px); it grows through frame 4's
// rectangle (Figma px of the 1440 frame) to the full screen.
export const TAKEOVER = {
  grown: [1035, 612],
  imageAspect: 2880 / 1944,
  // Where the full-screen photo sits (object-position y): as in BUILT OUTSIDE, which takes over from it.
  alignY: 0.43,
  // BUILT OUTSIDE's mask (--night, 60 %) comes over the photo while it grows, from this share of the growth on.
  mask: '#06120A',
  maskOpacity: 0.6,
  maskFrom: 0.15,
};

export const ASSETS = '/hero/';
