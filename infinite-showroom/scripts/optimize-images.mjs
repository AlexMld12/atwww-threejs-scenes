// Image optimiser — run with `npm run images` whenever the client sends new art.
//
// WHY: the client's masters are 3840×3840 WebP (~350 KB each, 34 of them = 12 MB).
// Nothing in this scene ever renders an image larger than a few hundred CSS px, so
// shipping the masters cost the page three times over: download, DECODE (34 × 3840²
// = 500 Mpx of main-thread-adjacent work) and VRAM (34 × 768² after the old runtime
// downscale ≈ 110 MB with mipmaps — enough to thrash a mid-range phone).
//
// So the masters live in `masters/` (NOT bundled — outside the `src/images/**` globs
// main.js reads) and this script writes the two sets that actually ship:
//
//   masters/field/*  →  src/images/field/*.webp         (desktop, FIELD.long px)
//                    →  src/images/field/mobile/*.webp  (phones,  FIELD.longMobile px)
//   masters/cards/*  →  src/images/cards/*.webp         + cards/mobile/*.webp
//
// Filenames are preserved, so the sorted-order bijection lane→image in main.js
// stays identical between the desktop and mobile sets.
//
// Uses ffmpeg (already required by this repo for the video work in
// command-center-slider) — no extra dependency, no native module to build.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run  = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Longest-edge caps + WebP quality per set, sized against what each one is
// actually rasterised at:
//  · FIELD images are WebGL quads, so they render into a canvas capped at
//    PIXEL_RATIO_CAP (1.25 on phones, 1.5 on desktop) — never at full device DPR.
//    They also stream past at speed and spend most of their life small and faint.
//    The largest plane on a phone measures ~320 CSS px → ~400 device px, hence 384.
//  · CARDS are DOM elements (the flip rig), so they render at FULL device DPR — a
//    215 CSS px card on a DPR-3 phone wants ~645 real pixels. Undersizing these is
//    the one place the softness is plainly visible, since the card is held still
//    and read.
const SETS = [
  { name: 'field', long: 512, quality: 78, longMobile: 384, qualityMobile: 75 },
  { name: 'cards', long: 768, quality: 82, longMobile: 640, qualityMobile: 80 },
];

const SOURCE_EXT = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif', '.tif', '.tiff']);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

// Fit INSIDE a long×long box, preserving aspect ratio (`decrease` never upscales a
// source that is already smaller). -2 keeps the derived edge even.
async function encode(src, dest, long, quality) {
  await run('ffmpeg', [
    '-v', 'error', '-y',
    '-i', src,
    '-vf', `scale=w=${long}:h=${long}:force_original_aspect_ratio=decrease:flags=lanczos`,
    '-c:v', 'libwebp',
    '-quality', String(quality),
    '-compression_level', '6',
    '-preset', 'photo',
    dest,
  ]);
  return (await stat(dest)).size;
}

for (const set of SETS) {
  const srcDir = path.join(ROOT, 'masters', set.name);
  const outDir = path.join(ROOT, 'src', 'images', set.name);
  const mobDir = path.join(outDir, 'mobile');

  let files;
  try {
    files = (await readdir(srcDir)).filter(f => SOURCE_EXT.has(path.extname(f).toLowerCase())).sort();
  } catch {
    console.warn(`· ${set.name}: no masters/${set.name}/ — skipped`);
    continue;
  }
  if (!files.length) { console.warn(`· ${set.name}: masters/${set.name}/ is empty — skipped`); continue; }

  await mkdir(outDir, { recursive: true });
  await mkdir(mobDir, { recursive: true });

  console.log(`\n${set.name} — ${files.length} file(s)`);
  let srcTotal = 0, outTotal = 0, mobTotal = 0;

  for (const f of files) {
    const src  = path.join(srcDir, f);
    const base = path.basename(f, path.extname(f)) + '.webp';
    srcTotal += (await stat(src)).size;
    outTotal += await encode(src, path.join(outDir, base), set.long,       set.quality);
    mobTotal += await encode(src, path.join(mobDir, base), set.longMobile, set.qualityMobile);
    process.stdout.write('.');
  }

  console.log(
    `\n  masters ${kb(srcTotal)}` +
    `  →  desktop ${kb(outTotal)} (${(outTotal / srcTotal * 100).toFixed(1)}%)` +
    `  ·  mobile ${kb(mobTotal)} (${(mobTotal / srcTotal * 100).toFixed(1)}%)`
  );
}
