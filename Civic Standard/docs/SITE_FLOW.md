# Civic Standard — parcursul site-ului

## 00 · Preloader + Hero — în lucru (2026-10-19)

**Preloader** (Preloader.pdf, cadrul 1 = încărcare, cadrul 2 = trecerea în sticlă):
- fundal #F3F0EA; liniile logo-ului (SVG-ul din .blend) se trasează cu negru 3 % (Figma: fill_opacity 0.03),
  linie ≈ 2 px la 850 px (2.48 unități de viewBox);
- apoi masca, ca un spinner de Windows (cererea userului, 2026-10-19, a doua variantă): un disc cât jumătate din
  logo (r = 58 u) aleargă pe marginile lui (orbită 95 u, o tură în 1.3 s, viteză constantă; discul se deschide de la 0 în 0.9 s, nu apare brusc) și, cu
  progresul real, crește la r = 132 u în timp ce orbita se strânge spre centru → la 100 % toate liniile sunt negre;
  prima variantă (disc mic în interior, crescând) a fost respinsă: „ca un mucegai”;
- progresul = octeții descărcați (logo, picturi, HDR, fundal, curba) + codul scenei + compilarea shaderelor
  (`lib/preload.ts`); masca are nevoie de cel puțin 2.6 s ca să nu „sară”;
- (2026-10-19, a doua zi de lucru) **sticla intră sub mască**, nu după predare: discul SVG decupează și sticla 3D
  (uniform `mask` în `glass.ts`, discul trimis în px prin `loaderMask`, `lib/intro.ts`); în disc sticla crește
  (adâncime + opacitate) cu progresul, iar liniile (trasarea 3 % + negrul) se sting cu ea. Sticla pornește doar când
  scena e compilată și prinde discul din urmă în cel mult 1.4 s. La 100 %: numai sticlă, fără linii → predarea, apoi
  `INTRO` (înclinare, rotire, rânduri, frunze). Conturul 3D (LineSegments2) a fost scos — nu mai e nevoie de el;
- **fără tranziție între preloader și hero** (cererea userului): canvas-ul e sub preloader de la primul cadru, cu
  fundalul exact #F3F0EA (curba inversă, `backdrop.ts`); la 100 % scena preia conturul în ACELAȘI cadru (contur 3D
  LineSegments2 pe fața logo-ului, `logo.ts`; diferența la schimb = doar antialias), apoi `INTRO` din config:
  sticla crește din contur (adâncime + opacitate), conturul se stinge, logo-ul se înclină și începe să se rotească,
  rândurile urcă de jos (cel de jos primul, cu o răsucire), lumina frunzelor se aprinde din pata luminoasă spre
  margini; frunzele se mișcă încet tot timpul (`BACKDROP.sway`).

**Hero** (Civic Standard.pdf, cadrele 0–850 și 850–1700; cadrul 1700–2550 e deja secțiunea următoare):
- tubul: 9 rânduri × 6 picturi, rază 4, pas 2.7, trei familii cu vitezele 0.65 / 1.1 / 1.55, logo-ul se rotește
  invers (`turn = facing − angle`), înclinat 0.13 rad, scara 0.48 — totul din driverele .blend; identic cu
  referința (matdn/helmet);
- scroll: 0.002 unități de rând / px, plus rotire 0.004 rad/s / px care se stinge (×0.92 pe cadru), rotire liberă
  0.25 rad/s în sensul ultimului scroll — ca în referință, dar pe scroll-ul paginii (Lenis), nu pe wheel;
- secțiunea (2026-10-19, „dublă”): tubul are cel puțin 4 ecrane, apoi secțiunea se LUNGEȘTE până la următorul
  scroll la care un rând cu banca ajunge natural la înălțimea centrului (rândurile 4 / 5, decalaj 0 / 2.7 mod 8.1;
  la 1440 × 850 → 4050 px), + 2 ecrane de creștere + 1 pe poza plină; înălțimea o pune scena (`takeover.layout`,
  recalculată la resize). Nimic nu trage tubul (cererea userului, a treia variantă): rândurile urcă doar cu
  scroll-ul și se opresc în dreptul băncii; în ultimele 0.6 ecrane tubul se rotește mai departe în același sens
  (până la 1.5 rad/s, încetinind) până banca e în față, apoi stă — și dacă userul s-a oprit din scroll. Creșterea
  pornește doar după oprire (prin 1035 × 612 până la tot ecranul, Figma cadrele 3–5); scroll înapoi o derulează:
  cardul scade fără întârziere și stă lipit de panoul lui din inel (nu mai rămâne în centru și apoi sare);
- fundal: textura gobo se termină înăuntrul unui ecran lat (dunga verticală din dreapta la 1915 px); umbra se
  estompează pe 0.70…0.93 din lățime (și pe 0.085…0.13 în stânga). Lumina mai mare + textura scalată în oglindă
  dădea un caleidoscop — respins;
- takeover (referință: Valmont de Resn, offline): un panou în fața camerei e exact cardul Figma (556–883 × 197–652,
  Figma 555–884 × 197–653). Poza: Figma xref 60, 2880 × 1944, WebP q95 (`bench.webp`), fără curba de culoare,
  neoglindită pe fața din spate, desenată peste tub și sticlă. Imaginile din tub vor fi înlocuite; banca rămâne;
- bug reparat: la compilare cardul era făcut vizibil, iar randarea „behind” a sticlei îl repunea vizibil în loc
  să-i restaureze starea → apărea în preloader peste logo;
- poza de repaus e identică cu cadrul 1 din Blender (verificat suprapus).

Deschise:
- fundalul (2026-10-19, varianta 3 aleasă de user: „ajustezi, clarifici și poziționezi”): gobo-ul real Light
  Wrangler, cu lumina pusă ca la exportul Figma (30 × 25, centrată — aliniere ECC cu rasterul Figma: ncc 0.87),
  spread 0.032 → 0.012 (~3 × mai clar), energie 1000 → 700 (pata nu mai arde frunzele). Randat în două straturi
  (`tools/blender_backdrop.py`): lumina fără frunze + umbra frunzelor (lit / unlit, 0.8…1). Pe site umbra se
  leagănă: rotație ±0.5° în jurul punctului de unde cresc frunzele (dreapta-sus, în afara cadrului) + tremur fin
  (`BACKDROP.sway*`, `flutter`); lumina stă pe loc;
- cadrajul 3D urmează regula clamp (px constanți pe unitate până la 1720, apoi cu lățimea); bara de scroll e ascunsă;
- mobil: neînceput (la regula de acum, pe un telefon logo-ul ar rămâne 178 px și tubul se taie pe lateral).

## Navbar — în lucru (2026-10-19)

- Figma 0–90: logo-ul galben #E3B23C (37 × 40) + linie 1 px (#0E1F14 la 10 %) + „Civic Standard” 20 px, pastile albe
  40 px (colțuri 6, padding 21, distanță 3; căutarea 56 px, la 32 px de Sustainability), etichete mono 12 #241F21.
- Fonturi (date de user, 2026-10-19): „Civic Standard” = Aeonik Pro (`src/fonts`, doar Regular primit; Figma e mai
  gros — tulpina 2.19 px față de 1.63 → un stroke de 0.28 px o egalează; de cerut Medium); butoanele = Martian Mono
  400 (userul a zis Light, dar tulpina măsurată în PDF = 400: 1.37 px, Light ar fi 1.19), wdth 100, −0.02 em
  (literele ±0.1 px, avansul 8.13 px la 12 px).
- Hover: eticheta (și lupa) se rostogolește în sus, o copie vine de jos (0.6 s, animat pe `top`).
- `position: fixed`; intră odată cu primul rând de poze care urcă în cadru (`sceneIn`), nu la predare; urcă (animat pe `top`) cât BUILT OUTSIDE e fixat, revine
  cu 0.5 ecrane înainte de final. Linkurile nu duc nicăieri; logo-ul reîncarcă pagina (doar homepage există).

## 01 · BUILT OUTSIDE — în lucru (2026-10-19)

- Referință de comportament: Valmont (Resn) = valmont.com (2023), Wayback 2024-03-19; codul lor (`ValmontLib`,
  `HomeVideoSlider`) + video-ul din studiul de caz (v01, 4–13 s). Ce am luat (2026-10-19): poza nu se mișcă și nu
  se scalează, o descoperă o margine dreaptă care urcă legat de scroll, fără easing; înainte de schimbare, poza
  următoare urcă 10 % de jos (pe 0.5 ecrane, din repaus — la repaus cadrul e exact Figma); textul se schimbă la
  jumătatea ștergerii și rulează pe ceas: titlurile alunecă în locurile Figma (expo.out 1.4 s), rândurile
  paragrafului + butoanele urcă 40 px cu fade (expo.out 1.6 s, întârziere 0.1, pas 0.1), vechiul text dispare în
  0.2 s. Rândurile paragrafului = cele din Figma (`content.ts`). Nu am luat: deriva de parallax (−10 %; ar cere poza
  mărită, deci altă încadrare decât Figma).
- Fonturi: Aeonik Pro Regular (titluri, text; tulpini egale cu PDF-ul) + Martian Mono 400 (etichete, SCROLL).
- Secțiunea începe cu un ecran mai devreme (margin-top −1 ecran) și își fixează stage-ul exact când poza din hero
  e plină; aceeași poză (`/built/1.webp`, folosită și de hero), aceeași încadrare (object-position y 43 %, ca Figma;
  hero-ul decupează la fel, `TAKEOVER.alignY`) → predarea canvas → DOM diferă cu ~1/255.
- Cronologie (ecrane de la fixare, `timeline.ts`): masca #06120A 0 → 60 % pe 0–0.5; conținutul apare pe 0.35–0.95
  (opacitate + coborâre 24 px, animat pe `top`/`margin`, nu transform); schimbarea 1→2 pe 1.5–2.3, 2→3 pe 3.1–3.9;
  fixat 4.6 ecrane. (Prima variantă, înlocuită: poza următoare urca de jos cu zoom 1.12 → 1.) Titlurile își schimbă
  locul (trecute sus din 113 în 113, activul la 212 sub ultimul, următorul jos la 733 — măsurat în cele 3 cadre);
  textul + butoanele vechi dispar în prima treime, noile apar în ultima; inactivele au 30 % (măsurat pe pixeli).
- Bara de progres (y 73): galbenul pornește de la 70 px (Figma) și crește până la toată lățimea la ultimul item.
  ⚠️ Figma arată 70 px în toate 3 cadrele — de confirmat cu userul.
- Poziții verificate pe pixeli la 1440 × 850: cadrele 1 și 3 la ≤ 1 px.
- Fonturile din PDF sunt Type3 fără nume: weight-ul se măsoară din grosimea tulpinilor (scratchpad, pymupdf + PIL).
  Inter (al treilea font dat de user) nu apare în nav / BUILT OUTSIDE; de verificat la secțiunile următoare.
