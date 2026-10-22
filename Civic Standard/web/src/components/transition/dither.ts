// The dither cover (Codrops "Interlude", transitions/dither.ts, ported from TSL to WebGL2): squares of three sizes
// (an eighth, a sixteenth and a thirty-second of the screen's height) fill in at random moments, each through a 4×4
// Bayer pattern of dots (256 per screen height), the big ones first; uncovering uses another draw of the dice. Cover
// and uncover take 1.1 s each, power1.inOut. Colour: the site's #0E1F14 (theirs #111).
const DURATION_S = 1.1;
const COLOUR = [0x0e / 255, 0x1f / 255, 0x14 / 255];

const VERTEX = /* glsl */ `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`;

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float progress;
uniform float reveal;
uniform vec3 colour;
out vec4 fragColor;

float hash(float seed) {
  uint state = uint(seed) * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return float((word >> 22u) ^ word) / 4294967296.0;
}

float two(float a, float b) { return mod(a * 2.0 + b * 3.0, 4.0); }
float bayer(float x, float y) {
  float fine = two(mod(x, 2.0), mod(y, 2.0));
  float coarse = two(mod(floor(x / 2.0), 2.0), mod(floor(y / 2.0), 2.0));
  return (fine * 4.0 + coarse + 0.5) / 16.0;
}

const float STAGGER = 0.16;
const float FILL = 0.2;
const float DOTS = 256.0;

void main() {
  // screen-height units from the top left, as their screenUV * (aspect, 1)
  vec2 position = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y) / resolution.y;
  float span = 1.0 - STAGGER * 2.0 - FILL;
  float density = 0.0;
  for (int level = 0; level < 3; level++) {
    float size = level == 0 ? 1.0 / 8.0 : (level == 1 ? 1.0 / 16.0 : 1.0 / 32.0);
    float share = level == 0 ? 0.4 : (level == 1 ? 0.5 : 1.0);
    vec2 cell = floor(position / size);
    float id = cell.x + cell.y * 997.0 + float(level) * 7919.0 + reveal * 104729.0;
    float takesPart = step(hash(id), share);
    float moment = hash(id + 50021.0) * span + float(level) * STAGGER;
    density = max(density, takesPart * clamp((progress - moment) / FILL, 0.0, 1.0));
  }
  vec2 dot = floor(position * DOTS);
  float alpha = step(bayer(dot.x, dot.y), density);
  alpha = progress >= 0.999 ? 1.0 : alpha * step(0.001, progress);
  fragColor = vec4(colour * alpha, alpha);
}`;

const power1InOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2);

export interface Dither {
  /** Covers the screen; resolves once it is all covered. */
  cover(): Promise<void>;
  /** Uncovers it; resolves once it is clear. */
  uncover(): Promise<void>;
}

export function createDither(canvas: HTMLCanvasElement): Dither {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
  let progress = 0;
  let reveal = 0;
  let draw: () => void = () => {
    canvas.style.opacity = String(progress);
  };

  if (gl) {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const resolution = uniform('resolution');
    const progressAt = uniform('progress');
    const revealAt = uniform('reveal');
    gl.uniform3fv(uniform('colour'), COLOUR);
    draw = () => {
      const ratio = Math.min(window.devicePixelRatio, 2);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(resolution, width, height);
      gl.uniform1f(progressAt, progress);
      gl.uniform1f(revealAt, reveal);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
  }

  let running = 0;
  const tween = (to: number) =>
    new Promise<void>((resolve) => {
      cancelAnimationFrame(running);
      const from = progress;
      // a turn mid-way takes only the share left, as theirs (GSAP from the current value)
      const duration = DURATION_S * 1000 * Math.abs(to - from);
      const start = performance.now();
      const step = (now: number) => {
        const t = duration ? Math.min(1, (now - start) / duration) : 1;
        progress = from + (to - from) * power1InOut(t);
        draw();
        if (t < 1) running = requestAnimationFrame(step);
        else resolve();
      };
      running = requestAnimationFrame(step);
    });

  return {
    async cover() {
      reveal = 0;
      canvas.classList.add('is-active');
      await tween(1);
    },
    async uncover() {
      reveal = 1;
      await tween(0);
      canvas.classList.remove('is-active');
      reveal = 0;
    },
  };
}
