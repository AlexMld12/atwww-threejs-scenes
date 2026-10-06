// Poza produselor din hero + luminile — valorile care leagă scena de randarea din Figma.
// Coordonate: vezi capul lui scene/index.js (metri; S = px de machetă pe metru).
// Rotațiile: [x, y, z] în ordinea 'ZXY' — întâi rotirea în jurul axei proprii (y), apoi
// înclinarea spre / dinspre cameră (x), apoi înclinarea în planul ecranului (z).
//
// POZELE NU sunt din ochi: potrivire de siluetă față de `products-placeholder.webp`
// (alfa, 331 × 344) — randare albă a celor trei GLB-uri și coborâre pe coordonate pe
// S + (x, y, rx, ry, rz) pentru fiecare; IoU 0.817 → 0.956. Adâncimea (z) e fixată:
// silueta nu o vede, doar ordinea (Foam în față, Serum în spate).
//
// LUMINA e reglată pe culorile din Figma măsurate în 8 puncte (corpul / muchia / capătul
// serului, Foam, capacul, corpul / josul / fundul cremei). Ce arată randarea lor: o sursă
// puternică în CENTRU — Foam strălucește ca o lampă, iar vecinii sunt navy închis, luminați
// doar pe muchiile dinspre el. Rig-ul de packshot al colegului (3 lumini albe de studio pe
// fundal alb) dădea sticle gri-albe, plate — măsurat: corpul serului 125 vs 35 în Figma.
// Ce a rămas din el: materialele, tone mapping-ul Standard (liniar), cârligul difuz.
export const HERO = {
  S: 4907.5,        // px de machetă pe metru (din potrivire; K1 0.1546 m ≈ 759 px)
  D: 5000,          // distanța ochiului, px de machetă (~10°, ca obiectivul lor de 200 mm)
  eyeY: 752,        // ochiul la mijlocul cutiei placeholder-ului (64 + 1377 / 2)
  light: {
    exposure: 1,
    // mediul (reflexiile + lumina difuză): cameră navy cu o „fereastră" slabă sus
    envColor: '#283b8c',
    envTop: 0.8,
    env: 0.45,
    diffuse: 0.6,              // tăria luminii difuze din mediu (cârligul lor de shader)
    // sursa din centru: în SPATELE lui Foam → vecinii primesc doar muchii luminoase
    // (în față, serul ieșea alb în întregime)
    core: { pos: [-0.008, 0, -0.09], intensity: 0.35 },
    foamEmissive: 0.5,         // Foam „aprins" — eticheta rămâne estompată, ca în Figma
    glow: { opacity: 0.22, w: 0.2, h: 0.3, pos: [-0.004, 0.004, 0.06] },   // halo-ul lui Foam
    envBoost: { cream: 3 },    // crema e mai deschisă (89, 96, 126 în Figma) decât serul
  },
  products: [
    { key: 'serum', url: '/models/K2_CALM_Serum.glb', pos: [-0.05035, 0.06136, -0.03], rot: [0.4425, 0.465, 0.17] },
    { key: 'foam', url: '/models/K1_COOL_Foam.glb', pos: [-0.00385, 0.0011, 0.03], rot: [0.4707, 0.1304, -0.3328] },
    { key: 'cream', url: '/models/K3_SEAL_Cream.glb', pos: [0.04395, -0.01937, 0], rot: [-0.7807, -0.0482, -0.6613] },
  ],
  // mișcarea (nu e în Figma — cadrul e static; „cum crezi că e mai bine", user 2026-10-06)
  motion: {
    enter: { dur: 1.6, stagger: 0.12, dy: 120, spin: 0.35 },   // px de machetă, radiani
    float: { amp: 6, period: 6.5 },                           // px de machetă, secunde
    tilt: 0.06,                                               // radiani, după mouse
  },
};
