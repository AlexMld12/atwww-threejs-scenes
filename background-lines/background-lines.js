/* ────────────────────────────────────────────────────────────────────────────
   Global animated background — living topographic contour lines (landonorris.com
   style). Self-contained, dependency-free WebGL2, one fullscreen draw call.

   The lines are ISO-CONTOURS of an animated noise field: concentric rings form
   around the field's peaks (like the Figma blobs), and as the field morphs the
   peaks appear / merge / split — so the rings fuse and divide like CELLS. Smooth,
   rounded, anti-aliased (fwidth), amber @ ~5%, on a dark background.

   Integration (Webflow custom code — page or site-wide, before </body>):
     <script>window.BG_LINES_CONFIG = { mount: 'lines-bg' };</script>
     <script src="https://cdn.jsdelivr.net/gh/AlexMld12/atwww-threejs-scenes@main/background-lines/background-lines.js"></script>

   Placement:
     • SCOPED (recommended here): set mount to the id of a STICKY 100vw×100vh div
       that wraps the sections which should show the lines. The canvas fills that
       div; the sections scroll over it. Give those sections transparent bgs.
     • FULL-PAGE: omit mount → a fixed canvas is appended behind the whole page.

   Tuning: edit CONFIG, or set window.BG_LINES_CONFIG = {…} BEFORE this script.
──────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var IS_MOBILE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Mobile/i.test(navigator.userAgent);

  var CONFIG = Object.assign({
    lineColor:   '#EBB245',   // amber contour lines
    bgColor:     '#010101',   // dark background (used when transparent:false)
    transparent: false,       // false = paints its own dark bg + lines; true = only lines (page bg shows through)
    lineOpacity: 0.06,        // per-line opacity (~the SVG's 5%)
    scale:       1.7,         // field frequency — LOWER = larger, sweeping cells; higher = smaller/denser
    lines:       10.0,        // contour bands → how many concentric rings around each peak
    thickness:   1.3,         // line width (in AA units) — higher = thicker lines
    warp:        0.28,        // domain-warp amount — organic flow of the rings (lower = rounder)
    morph:       1.3,         // how fast peaks appear / merge / split (the "cell" fusion frequency)
    speed:       0.18,        // overall animation speed
    octaves:     3,           // field detail — fewer = smoother, rounder contours (closer to the SVG)
    zIndex:      -1,          // stacking. Full-page mode: behind all content. mount mode: within the container (0 is fine).
    dprCap:      IS_MOBILE ? 1.0 : 1.5,
    renderScale: IS_MOBILE ? 0.7 : 0.9, // render-buffer fraction (subtle bg → sub-res is invisible & faster)
    // Placement:
    //   mount:  id/selector of a container to render INTO (e.g. a sticky 100vw×100vh
    //           div wrapping the sections that should show the lines). The canvas is
    //           created inside it, absolutely filling it. THIS is the scoped mode.
    //   (none): falls back to a fixed, full-page canvas appended to <body>.
    mount:       null,
    target:      null,        // optional existing canvas id to render into (advanced)
  }, window.BG_LINES_CONFIG || {});

  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // ── Canvas ────────────────────────────────────────────────────────────────
  var mountEl = CONFIG.mount
    ? (document.getElementById(CONFIG.mount) || document.querySelector(CONFIG.mount))
    : null;
  if (CONFIG.mount && !mountEl) console.warn('[bg-lines] mount "' + CONFIG.mount + '" not found — falling back to full-page.');

  var canvas;
  if (CONFIG.target && document.getElementById(CONFIG.target)) {
    canvas = document.getElementById(CONFIG.target);
  } else if (mountEl) {
    // Scoped: fill the given container (e.g. a sticky 100vw×100vh div).
    canvas = document.createElement('canvas');
    canvas.id = 'bg-lines-canvas';
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;' +
      'z-index:' + CONFIG.zIndex + ';display:block';
    if (getComputedStyle(mountEl).position === 'static') mountEl.style.position = 'relative';
    mountEl.appendChild(canvas);
  } else {
    // Full-page: fixed canvas behind everything.
    canvas = document.createElement('canvas');
    canvas.id = 'bg-lines-canvas';
    canvas.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;' +
      'z-index:' + CONFIG.zIndex + ';display:block';
    document.body.insertBefore(canvas, document.body.firstChild);
  }

  var gl = canvas.getContext('webgl2', {
    alpha: CONFIG.transparent,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    depth: false,
    stencil: false,
  });
  if (!gl) { console.warn('[bg-lines] WebGL2 not available — background lines disabled.'); return; }

  // ── Shaders ────────────────────────────────────────────────────────────────
  var VERT =
    '#version 300 es\n' +
    'void main(){\n' +
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\n' +
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n' +
    '}\n';

  var FRAG =
    '#version 300 es\n' +
    'precision highp float;\n' +
    'out vec4 fragColor;\n' +
    'uniform vec2 uRes;\n' +
    'uniform float uTime;\n' +
    'uniform vec3 uLine;\n' +
    'uniform vec3 uBg;\n' +
    'uniform float uScale;\n' +
    'uniform float uLines;\n' +
    'uniform float uThickness;\n' +
    'uniform float uWarp;\n' +
    'uniform float uMorph;\n' +
    'uniform float uOpacity;\n' +
    'uniform float uTransparent;\n' +
    'const int OCT = ' + Math.max(1, CONFIG.octaves | 0) + ';\n' +
    // 3D value noise: time is the 3rd axis, so the 2D slice MORPHS IN PLACE
    // (no drift) — peaks appear / merge / split as we move along z = time.
    'float hash3(vec3 p){ p = fract(p*0.3183099 + vec3(0.11,0.17,0.23)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }\n' +
    'float vnoise3(vec3 x){\n' +
    '  vec3 i=floor(x), f=fract(x); vec3 u=f*f*(3.0-2.0*f);\n' +
    '  return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),u.x),\n' +
    '                 mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),u.x),u.y),\n' +
    '             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),u.x),\n' +
    '                 mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),u.x),u.y), u.z);\n' +
    '}\n' +
    'float fbm3(vec3 p){ float v=0.0,a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<OCT;i++){ v+=a*vnoise3(p); p.xy=m*p.xy; p.z*=1.6; a*=0.5; } return v; }\n' +
    'float field(vec2 p){\n' +
    '  p *= uScale;\n' +
    '  float z = uTime * uMorph;\n' +          // time = 3rd axis → morph in place, no drift
    '  vec2 q = vec2(fbm3(vec3(p + 1.7, z)), fbm3(vec3(p + 8.3, z + 4.0)));\n' +
    '  return fbm3(vec3(p + uWarp*q, z));\n' + // domain-warped animated field → cells fuse & split
    '}\n' +
    'void main(){\n' +
    '  vec2 p = (gl_FragCoord.xy / uRes) - 0.5;\n' +
    '  p.x *= uRes.x / uRes.y;\n' +           // aspect-correct so cells stay round
    '  float f = field(p);\n' +
    '  float g = f * uLines;\n' +             // scale to contour bands
    '  float df = max(fwidth(g), 1e-4);\n' +  // screen-space gradient → constant line width
    '  float d = min(fract(g), 1.0 - fract(g));\n' + // distance to nearest contour level
    '  float line = 1.0 - smoothstep(0.0, df * uThickness, d);\n' + // smooth anti-aliased iso-line
    '  float a = clamp(line * uOpacity, 0.0, 1.0);\n' +
    '  if (uTransparent > 0.5) fragColor = vec4(uLine * a, a);\n' +
    '  else fragColor = vec4(mix(uBg, uLine, a), 1.0);\n' +
    '}\n';

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[bg-lines] shader:', gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('[bg-lines] link:', gl.getProgramInfoLog(prog)); return; }
  gl.useProgram(prog);

  var U = {};
  ['uRes','uTime','uLine','uBg','uScale','uLines','uThickness','uWarp','uMorph','uOpacity','uTransparent']
    .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  var lineRgb = hexToRgb(CONFIG.lineColor);
  var bgRgb   = hexToRgb(CONFIG.bgColor);
  gl.uniform3f(U.uLine, lineRgb[0], lineRgb[1], lineRgb[2]);
  gl.uniform3f(U.uBg, bgRgb[0], bgRgb[1], bgRgb[2]);
  gl.uniform1f(U.uScale, CONFIG.scale);
  gl.uniform1f(U.uLines, CONFIG.lines);
  gl.uniform1f(U.uThickness, CONFIG.thickness);
  gl.uniform1f(U.uWarp, CONFIG.warp);
  gl.uniform1f(U.uMorph, CONFIG.morph);
  gl.uniform1f(U.uOpacity, CONFIG.lineOpacity);
  gl.uniform1f(U.uTransparent, CONFIG.transparent ? 1.0 : 0.0);

  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // ── Resize ──────────────────────────────────────────────────────────────────
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap) * CONFIG.renderScale;
    var w = Math.max(1, Math.floor(canvas.clientWidth  * dpr));
    var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uRes, w, h);
    }
  }
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  // ── Animation loop ─────────────────────────────────────────────────────────
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var running = true, raf = 0, start = performance.now();

  function frame(now) {
    if (!running) return;
    resize();
    var t = reduceMotion ? 0 : ((now - start) / 1000) * CONFIG.speed;
    gl.uniform1f(U.uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = reduceMotion ? 0 : requestAnimationFrame(frame);
  }
  function play()  { if (!running) { running = true; start = performance.now(); raf = requestAnimationFrame(frame); } }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else if (!reduceMotion) play();
  });

  raf = requestAnimationFrame(frame);
  window.BG_LINES = { canvas: canvas, config: CONFIG, play: play, pause: pause };
})();
