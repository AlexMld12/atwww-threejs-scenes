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
  plină odată cu liniile negre (a doua variantă, cererea userului: liniile NU se sting pe parcurs). Dacă scena nu e
  gata când vine discul, sticla intră în 0.6 s. Abia când masca e completă liniile se sting (0.7 s) → numai sticlă →
  predarea, apoi `INTRO` (înclinare, rotire, rânduri, frunze). Conturul 3D (LineSegments2) a fost scos;
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
- Aeonik intră în repo (decizia mea, lăsată de user): Vercel construiește din GitHub, iar pe site fontul e oricum public.
- Fonturi (date de user, 2026-10-19): „Civic Standard” = Aeonik Pro (`src/fonts`, doar Regular primit; Figma e mai
  gros — tulpina 2.19 px față de 1.63 → un stroke de 0.28 px o egalează; de cerut Medium); butoanele = Martian Mono
  400 (userul a zis Light, dar tulpina măsurată în PDF = 400: 1.37 px, Light ar fi 1.19), wdth 100, −0.02 em
  (literele ±0.1 px, avansul 8.13 px la 12 px).
- Logo-ul: #2F4A3A (cererea userului; în Figma era galben).
- Hover (a doua variantă): butonul devine #2F4A3A cu text alb; eticheta se rostogolește literă cu literă, de la ultima
  (pas 0.03 s, 0.5 s pe literă, `components/ui/Roll.tsx`), la hover out exact invers; lupa doar crește (×1.18).
- `position: fixed`; intră odată cu primul rând de poze care urcă în cadru (`sceneIn`), nu la predare; urcă (animat pe `top`) cât BUILT OUTSIDE e fixat, revine
  cu 0.5 ecrane înainte de final. Linkurile nu duc nicăieri; logo-ul reîncarcă pagina (doar homepage există).

## Scroll — viteză maximă (2026-10-19)

- Problema: la scroll foarte rapid pagina trecea de creșterea pozei înainte ca banca să fie în față → BUILT OUTSIDE
  apărea direct, cu poza plină („teleport”). Creșterea pornește doar după blocare.
- `lib/scroll.ts`: toate intrările (rotiță, touchpad Win/Mac, deget + fling prin `syncTouch`, taste Space/Page/săgeți)
  adună într-o țintă; pe fiecare cadru Lenis primește cel mult 0.45 ecrane înaintea scroll-ului afișat (≈ 2.6 ecrane/s,
  măsurat 2.25 px/ms la 850 px) și nimic peste 1.2 ecrane nu se pune la coadă.
- Poarta (`takeover.gate`): pagina nu trece de punctul băncii până nu e banca în față; acolo tubul se rotește mai
  repede (3 rad/s, minim 0.3) → așteptare ~1 s la scroll rapid. Creșterea urmează direct scroll-ul (fără întârziere).
- Snap în BUILT OUTSIDE: opririle = momentele în care un item e pe loc (`STOPS`: 0.9 / 2.3 / 3.9 ecrane).
  Prima variantă (oprire 0.8 s + alunecare după pauză) era „bugită” pe touchpad: inerția (1–2 s de evenimente
  după gest) pornea pasul următor la finalul opririi și ținea snap-ul în așteptare. Acum (a doua variantă):
  între opriri UN GEST = UN PAS — primul eveniment al unui gest nou duce pagina la oprirea următoare în 0.8 s
  (easeInOut), restul gestului (inerție, rotița ținută, degetul) se ignoră. Gest nou = pauză > 160 ms, schimbare
  de sens sau un salt peste 1.6 × delta anterioară. Touch: un drag de 30 px = un pas. De la prima / ultima oprire
  un gest nou iese liber; un gest liber care ajunge la opriri se oprește la prima întâlnită și e consumat.
  Testat cu gesturi sintetice de touchpad (urcare 100 ms + inerție ×0.95 / cadru): 0.9 → 2.3 → 3.9 → ieșire și
  înapoi, câte un pas pe gest.
- ⚠️ În dev React montează de două ori: cleanup-ul primei scene ridica poarta celei de-a doua — `setScrollGate`
  întoarce acum o funcție care o ridică doar dacă e încă a ei.

## 01 · BUILT OUTSIDE — în lucru (2026-10-19)

- A doua variantă (cererea userului, aceeași zi): masca #06120A vine peste poza din hero CÂT CREȘTE (plan 3D peste
  card, de la 15 % din creștere, 60 % la ecran plin), deci BUILT OUTSIDE pornește cu masca deja pusă. Bara de progres
  pornește de la 0 și crește cu poziția listei (1/3 la itemul 1). Itemul 1 pornește jos (în locul lui 02) și urcă pe
  scroll; titlurile se mută LEGAT DE SCROLL (easeInOut pe pas, odată cu ștergerea pozei); abia când un titlu a ajuns
  (`arrivedAt`) se aprinde (0.3 → 1, expo.out 1 s) și îi urcă rândurile (ca mai jos). La plecare: se stinge în 0.4 s,
  textul dispare în 0.2 s. Hover pe butoane: verde, literele ca în navbar, blocul cu săgeata se mută 6 px la dreapta.
  SCROLL: săgeata iese jos și revine de sus, în buclă (2 s).

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

## 02 · Solid / Civic / Calm — în lucru (2026-10-19)

- Figma 5930–6739 (809 px; linia de la 6740 și „THE DETAILS” sunt secțiunea următoare). Poziții din PDF: cuvintele
  după originea și linia de bază a fiecăruia, pastilele după cutie, x față de centrul cadrului (720); liniile pe
  marginea lor (stânga / dreapta), 1 px #2F4A3A la 15 %; cele din dreapta trec în secțiunea următoare (până la 7050).
- Fontul cuvintelor e **Inter**, nu Aeonik (glifele din PDF au 0.753 em, Aeonik 0.70): Inter opsz 14 (nu Display),
  −0.074 em — IoU 0.90–0.94 față de PDF, suprapus ≤ 2 px. Pastilele: Martian Mono 12, −0.027 em, #212325 pe #FDFAFA,
  bordură #E0E0E0, înălțime 38, colțuri 19.
- Referința de comportament: fluid.glass/about (`AboutBeliefs`, GSAP ScrollTrigger + DrawSVG, cod descărcat): totul
  legat de scroll — cuvintele urcă din 150 % în masca lor (power3.inOut, 0.5 fiecare, la 0.05), pastilele apar cu
  fade (0.1, de la 0.4). La ei intervalul se termină când secțiunea abia a intrat complet, deci se vede prost
  (cererea userului: „mai târziu”) → la noi de la sus-ul secțiunii la 85 % din ecran până când secțiunea e toată pe
  ecran (~700 px de scroll), urmărit cu întârziere (constantă 0.35 s): și la viteza maximă de scroll urcarea
  durează ~0.85 s (prima variantă, 510 px fără întârziere: „prea rapidă”).
- Liniile: aceeași ordine ca la ei (dreapta de jos în sus, apoi mijlocul, apoi stânga), dar pe timp și în buclă.
  A treia variantă (ideea userului): linia slabă se trasează (3 s), peste ea o linie neagră plină de aceeași
  grosime, ca în preloader, pe același contur (2.4 s), stă 0.4 s, se retrage negrul (2 s), apoi linia slabă (2.4 s),
  pauză 0.3 s → din nou (10.5 s pe buclă). „Prea lent” la a doua variantă însemna pauzele, nu trasarea. Pornește
  când secțiunea intră la 60 % din ecran, rulează doar cât e pe ecran.
- Liniile din dreapta sunt tăiate la marginea secțiunii (`overflow: clip`) până facem „The Details”: ieșeau 311 px
  sub ea și lungeau pagina („secțiunea prea mare”). De scos clip-ul când există secțiunea următoare.
- Poarta hero-ului se aplică doar cât pagina e încă înaintea ei (o pagină aflată deja după ea nu mai e ținută).

