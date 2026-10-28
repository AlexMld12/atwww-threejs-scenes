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
- Liniile din dreapta continuă în THE DETAILS (până la 7050), pe sub imaginile de acolo, ca în Figma. (Cât timp
  pagina se termina aici erau tăiate: lungeau pagina cu 311 px — „secțiunea prea mare”.)
- Poarta hero-ului se aplică doar cât pagina e încă înaintea ei (o pagină aflată deja după ea nu mai e ținută).

## 03 · THE DETAILS + 04 · OUR VALUES — în lucru (2026-10-19)

- Figma 6739–7339 și 7339–8391 (`components/details`). Textele puse după linia de bază din PDF (metricile fontului,
  `topForBaseline`), rândurile = cele din Figma. Coloana stângă de la marginea stângă, cea dreaptă (630 / 890) de la
  centru; separatoarele de la 30 la 30. Măsurat: suprapus pe Figma, diferență medie ~2/255.
- Fonturi (potrivite pe forme / lățimi): paragrafe, titluri de card, afirmația 44 px, servicii = Aeonik (afirmația
  −0.03 em, ca fluid.glass); etichete și legende = Martian Mono; SOLID / CIVIC / CALM = Inter Bold 14.5 px (cel mai
  apropiat de PDF: IoU 0.86, înălțime și lățime exacte).
- Cardurile (gri în Figma): randări de aproape în studioul colegului (`tools/blender_details.py`, scena K7_armrests,
  camera noastră în perspectivă 70 mm, f/5.6, 760×918, 192 eșantioane, film transparent) — capetele plăcilor în
  secțiune și cotul zincat al brațului. Fundalul cardului `--card` #E7E5DF (tonul secțiunii Seating din Figma). Ilustrația cu
  bănci: din PDF, `public/values/benches.svg` (contururi umplute, #2F4A3A la 35 %).
- Animații: fluid.glass are o singură dezvăluire de text (BaseHeading: SplitText pe rânduri cu mască, yPercent
  200 → 0, 1.5 s, la 0.1 s, power3.out, o dată, „top bottom”); restul e static la ei. Userul a cerut animații pe tot
  textul → aceeași dezvăluire pe toate textele, pornită la 85 % din ecran (mai târziu decât la ei, să se vadă), plus
  (ale noastre, în același spirit) separatoarele trasate de la stânga și imaginile / ilustrația descoperite de jos.
  CSS (tranziții pe `top`, nu transform, textul rămâne clar) + IntersectionObserver (`use-reveal.ts`).
- Desenul cu bănci alunecă spre dreapta pe scroll (`use-drift.ts`, ±90 px, la locul lui din Figma la mijlocul
  ecranului). Cutia lui e dezvăluită (clip-path), imaginea din ea se mișcă: clip-path + transform pe același element
  țineau IntersectionObserver-ul blocat. Tot de acolo: un observer poate livra mai multe intrări → se ia ultima.

## 05 · FROM THE RANGE — în lucru (2026-10-20)

- Figma 8391–9276 (885 px): regula și eticheta ca la THE DETAILS; săgețile 40 × 40 verzi, colț 6, sus 22, dreapta 30;
  cardurile de la 152, 465.2 lățime, la 15.8, înalt 585.1 / scund 435.8 alternativ; titlul Aeonik 18 la 27 sub
  imagine, legenda Martian Mono 12, #0E1F14 la 40 %, la 46.
- Produsele: pachetul colegului `C:\ATWWW\Civic Standard\DEVELOPER_STUDIO_2026-10-20` (catalog: 23 randări 2400 px
  transparente, JSON cu nume / dimensiuni / culori; .blend cu 23 de scene de studio, AgX High Contrast, ortografice).
  Userul a ales: băncile din catalog, primele două ca în Figma (K7 cu brațe, K5); SMART bench nu există în catalog
  (G2 e explicit „fără SMART”). `tools/prepare_products.py`: alpha − 4 (umbra ajunge lin la 0, altfel tăietura se vedea
  ca un dreptunghi), decupat, 1200 px WebP.
- Comportamentul = fluid.glass/about (`Team`, cod descărcat): **Embla Carousel v8** `{ loop: false, align: 'start',
  dragFree: true, skipSnaps: true }` — „bounce-ul” e arcul de la capete al Embla (o aruncare trece de margine și
  revine). La noi `align` = marginea de 30 px. Săgețile: un card (scrollPrev / scrollNext); iconița iese în direcția
  ei și revine din partea cealaltă la hover (0.5 s power3.in + 0.5 s power3.out). Cursorul lor „Drag” e al site-ului
  lor, nu e în Figma → `cursor: grab`. Testat: aruncare spre stânga la început → 389 px, revine la 30 în ~1 s.


## 06 · CONFIGURATOR (Seating / Recycling / Greenery) — în lucru (2026-10-20)

- Figma: `docs/reference/Customize - Section.pdf` și `… - Bins.pdf` (1440 × 850, fond #E7E5DF). Tab-uri Aeonik 42
  (inactive 15 %), reguli la 102 și 758, numele produsului mono 12, cercuri 48 (#0E1F14; LAYOUT la hover auriu, ca în
  PDF), etichete mono sub ele, paleta 20 px la 4 (aleasă = pastilă 43), „CONFIGURE YOURS” verde + săgeată (inert).
  Iconițele: din PDF. „LENGHT” din Figma → „Length” (greșeală de tipar).
- Cerințe user: LAYOUT trece prin produsele categoriei; cercul din stânga e doar informație (lungime / volum);
  paleta recolorează vopseaua (cadrul băncilor; la coșuri și jardiniere corpul + capacul); camera: stânga / dreapta /
  sus, nu în jos; la eliberare revine.
- Comportament = MOTO Stack (custom.stack-furniture.com, R3F + drei `CameraControls`, cod descărcat): camera-controls,
  doar rotire (click stânga / un deget), viteză 1, smoothDamp 0.125 s la drag și 0.25 s la `reset(true)` pe
  `controlend`; azimut liber; la noi maxPolar = poza (nu coboară). Piesele se schimbă instant, doar camera se
  reîncadrează; culoarea se apropie cu 5/s; cercurile ascunse după 0.5 s de drag. Lentila lor e 35°; la noi 20°
  (randările Figma sunt ortografice).
- Încadrarea (măsurată pe ambele PDF-uri): cutia produsului, văzută pe direcția camerei din catalog, intră în
  666.5 × 498.6 px (banca la fel de lată, coșul la fel de înalt — ambele exact), centrul ei la (−4, −6) de centrul
  secțiunii; cercurile la 88 px de laturi, stânga +30, dreapta −50.
- Asset-uri din studioul colegului (`PRODUSE_STUDIO_FARA_BG.blend`, 17 scene):
  - `tools/blender_configurator.py`: piesele unite, un material pe finisaj (cheia lui), coordonatele metrice ca
    `_COORD`; AO copt pe un atlas (smart UV) cu podeaua inclusă; umbra văzută de sus (shadow catcher, produsul
    invizibil pentru cameră); camera și cele 4 lumini în JSON; finisajele plastic și zinc coapte pe 0.5 m (zincul
    ca nemetal, altfel culoarea difuză iese neagră; rugozitatea și AO-ul Non-Color).
  - `tools/blender_configurator_env.py`: ce reflectă metalul = studioul fără produs (podeaua gri a shadow
    catcher-ului e reală pentru razele reflectate). Fără el zincul ieșea negru.
  - `tools/blender_view_lut.py`: AgX High Contrast ca LUT 3D 48³ (AgX amestecă canalele: curba pe canal a hero-ului
    nu merge); aplicat în fiecare material (hero-ul ține hook-ul global CustomToneMapping).
  - `tools/prepare_configurator.py`: gltf-transform meshopt, WebP, products.json.
- three.js (`scene/configurator`): 4 RectAreaLight (radianța P / (π A)), mediul per produs prin PMREM, AO și pe
  lumina directă (aoMap-ul three o aplică doar pe cea ambientală), detaliul finisajului pe fața piesei în
  coordonatele ei (derivatele lui `_coord` dau normala). Randare doar când ceva se mișcă și secțiunea e pe ecran
  (~7 ms / cadru). Preloader-ul așteaptă primul produs din fiecare categorie; restul se încarcă unul câte unul când
  secțiunea e la 1.5 ecrane (nu cât hero-ul e pe ecran), meshopt pe workeri, shader-ele compilate la încărcare.
- Hero-ul nu mai randează (sticla ray-traced) cât secțiunea lui nu e pe ecran.
- Pe touch rotirea e oprită (secțiunea are 850 px, altfel blochează scroll-ul paginii) — de decis la mobil.
- K7 (Plaza): „doar zincat” în catalog, dar userul vrea toată paleta → cadrul zincat devine vopsea (un produs fără
  piesă vopsită își vopsește cadrul zincat).
- Înălțimea = ecranul (100svh, pe orice dispozitiv): partea de sus după distanțele Figma de sus, cea de jos (regula,
  culoarea, paleta, butonul) de jos (850 − y). Mai scund decât 850 → produsul scade proporțional (rămâne între
  reguli); mai înalt → aceeași scară, se vede mai mult în jur. Verificat la 1917×871, 1440×700, 1280×720.

## Retușuri de fluiditate (2026-10-20, cererea userului: „să nu pară făcut cheap”)

- Hero, reveal-ul rândurilor: întârzierea ține de locul rândului în tub, nu de indexul lui (`introState().rise`).
  Un scroll rapid imediat după preloader reînfășoară rândurile (la fiecare 3 sunt la fel) și rândul sosit pe un loc
  avea alt stadiu al reveal-ului → sărea.
- Hero → BUILT OUTSIDE: **poarta a dispărut**. Banca venea în față pe timp și pagina aștepta la capătul tubului
  („se blochează puțin, apoi mă lasă”). Acum ultimele 1.5 ecrane de scroll aduc banca în față (mișcarea proprie a
  tubului se stinge, unghiul trece lin spre următorul unghi frontal în sensul rotirii, atins exact la capăt).
  Rândurile, rotirea spre bancă și creșterea pozei urmează același scroll netezit (`shownScroll`): înainte poza
  urma scroll-ul Lenis direct, inelul unul netezit încă o dată → altă „netezime” la trecere.
- Frânarea (cererea userului: imaginile se învârteau repede și se opreau brusc când poza ajungea în centru): pe
  ultimele 2 ecrane rândurile frânează constant până la 0 (parcurg jumătate din drumul de la viteză plină, așa că
  aterizarea e cu jumătate de zonă mai jos și rândul cu banca tot la centru ajunge), iar rotirea merge spre cel mai
  apropiat unghi frontal (cel mult o jumătate de tură), cu ease in-out. Măsurat: deplasarea pe 400 px scade 0.79 →
  0.63 → 0.45 → 0.26 → 0.07 → 0.
- Opririle BUILT OUTSIDE: un flux susținut (4 delte la rând care nu scad, ≥ 4) e gest nou, deci pagina pășește mai
  departe; inerția touchpad-ului (care doar scade) rămâne ignorată. Înainte, un scroll continuu stătea la prima oprire.
- Desenul cu bănci: vizibilitatea e măsurată pe secțiune (sub clip-path-ul reveal-ului elementul conta ca nevăzut
  și sărea la capătul animației).
- Navbar-ul urcă și peste configurator (`is-nav-away`, cât secțiunea trece de marginea lui de jos) și revine la
  scroll înapoi; clasa e separată de `is-nav-hidden` (BUILT OUTSIDE o scrie la fiecare cadru).
- Testat cu un flux continuu de `wheel` (CDP): de la predare până în configurator fără nicio oprire lungă.

## 07 · BUILT TO STAY (poza cu jardinierele + „Civic Standard, built to stay.”) — în lucru (2026-10-20)

- Figma 10126–10956 (830 px): poza = `/built/2.webp` (aceeași cu a doua din BUILT OUTSIDE; în PDF 1440 × 1152 de la
  9991.9 → object-position y 41.7 %), masca #06120A la 50 %, titlul alb (desenat vectorial în PDF; potrivit: Aeonik
  44, −0.01 em, lățime 522, linia de bază 791.7), butoanele albe la 760: săgeata, apoi „REQUEST A QUOTE” (inerte).
- Animația (cererea userului: zoom-in la intrare, poza „fixă” dar fără să se miște mult; restul propunerea mea):
  totul legat de scroll (`use-stay.ts`): poza se deplasează 6 % din înălțime împotriva scroll-ului (pare fixă) și
  face zoom 1.06 → 1.16 (ease-out) cât secțiunea intră pe ecran; masca se deschide 68 % → 50 %. Titlul și
  butoanele urcă din mască (ca toate textele) când secțiunea a intrat 60 %: stau la baza ultimei secțiuni, sub
  pragul de 85 % al celorlalte, deci nu porneau niciodată. Săgeata: la hover iese spre dreapta și revine.
- Navbar-ul revine aici (configuratorul îl ascunde doar cât îl acoperă).
- Runda 2 (userul: zoom-ul se întâmpla mai mult cât secțiunea nu era pe ecran): totul pe porțiunea văzută, de la
  intrarea sus-ului până la secțiunea întreagă pe ecran: zoom 1 → 1.18 ease in-out, poza rămâne în urmă cu 35 % din
  cât mai are de intrat (aproape fixă, piciorul ei mereu sub marginea ecranului), masca 72 → 50 %. Titlul: fiecare
  cuvânt urcă în masca lui de la 150 % (ca Solid · Civic · Calm), dar pe timp, o dată (1.2 s power3.inOut, 0.08 s
  între cuvinte), la jumătatea intrării. Hover: eticheta și săgeata sunt un singur buton → ambele devin verzi
  (și la BUILT OUTSIDE, unde era deja așa).

## 00 · Preloader — runda 2 (2026-10-20)

- Sticla se formează odată cu discul (grosime + opacitate = creșterea lui) și e întreagă exact când discul a
  descoperit toate liniile; dacă scena se compilează târziu, ajunge din urmă în ≤ 0.4 s. Apoi liniile se sting.
- „Arăta desenată”: razele ieșite din sticlă vedeau ecranul din spate, care înainte de intro e hârtie goală.
  Acum văd peretele luminat (cu umbra frunzelor) direct din textura lui (`wallThrough` în glass.ts) până când
  peretele e dezvăluit pe ecran în intro (1 − intro.backdrop), deci prin sticlă se văd refracțiile luminii.

## 08 · PREFOOTER (adrese, linkuri, text legal) — în lucru (2026-10-20)

- Figma 10956–11726 (770.7 px, #FBF9F4). Desenele (bănci, coș, scaun) și glifele sociale: `tools/extract_drawings.py`
  → `public/prefooter/*.svg` (trasee PDF cu culorile lor; panoul coșului e umplut cu #FAF9F6, ca în Figma, ca să
  oprească regulile). Titluri Aeonik 18, adrese 12/15, linkuri 18/21 și 14/18, legal 14/18 la 30 %; reguli 2 px la
  230.1 / 408.7 (verde 15 %) și 637.7 (#DCDFDA); pătratele sociale 28 px #0E1F14.
- Referința: floema.com/en (`Footer.vue`, cod citit + măsurat headless): fără pin / cortină; reguli trasate de la
  stânga (1 s power2.out, o dată la 98 %); blocurile unui rând apar pe rând cu fade + urcare (birourile 20 px, 0.6 s,
  la 0.08 s, la 80 %; linkurile mari 14 px / 0.5 s / 0.05 s, cele mici 12 px / 0.45 s / 0.04 s cu 0.2 s întârziere;
  iconițele sociale 10 px / 0.45 s / 0.06 s, la intrarea lor); desenele alunecă orizontal legat de scroll (băncile
  −3vw → 0 pe primul rând, coșul 2vw → 0 pe rândul birourilor, scaunul −10 % → 10 % din lățime până intră rândul
  linkurilor); hover pe linkuri = subliniere de 1 px trasată de la stânga (0.5 s expo.out), iconițele 1.05 / 0.9.
  Textul se mișcă pe `top` (rămâne clar). Ce nu au ei: textul legal → reveal-ul nostru pe rânduri (la 98 %, e la
  piciorul paginii). Iconița ↗ a linkurilor externe de la ei nu e în Figma → nu.
- Banda galbenă „CIVIC STANDARD” (11726–11908) e footer-ul, următoarea secțiune; floema n-are wordmark mare.
- Coșul stă în fața regulilor (z-index; panoul lui e umplut cu culoarea paginii, ca în Figma).

## 09 · FOOTER (banda galbenă „CIVIC STANDARD”) — în lucru (2026-10-20)

- Figma 11726.7–11907.7 (181 px, #E3B23C): wordmark-ul desenat (`tools/extract_drawings.py` → `public/footer/
  wordmark.svg`, lățimea paginii), copyright Aeonik 14 la 40 %, politicile mono 12, la 10 px de margini, linia de
  bază 171. Prefooter-ul acoperă primii 28 px ai benzii (în Figma el se termină la 11754.5) și aruncă umbra: în PDF e
  o imagine neagră încețoșată pe marginea lui (25 % la margine, ~28 px la jumătate) → box-shadow 0 0 24px negru 50 %.
- Referința: telhaclarke.com.au (cod `Footer-*.js` + măsurat): o cortină. `<footer>` = prefooter (z 1) + banda
  `position: sticky; bottom: 0` (z 0) cu margin-top −28: prefooter-ul urcă și o descoperă de sus. Pe drumul
  descoperit (liniar, legat de scroll) conținutul benzii urcă de la 40 % din înălțimea lui la 0 și un văl în
  culoarea benzii (la ei negru pe negru) trece 0.85 → 0. Lăsat deoparte, la cererea userului: micșorarea paginii
  (scale 1 → 1 − 3rem/lățime, origin bottom), contra-scalarea benzii și barele negre laterale. Fără animații
  one-shot în footer, ca la ei; hover pe politici = sublinierea din prefooter.
- ⚠️ offsetTop-ul unui element sticky include poziția în care e lipit: suprapunerea se citește din margin-top.
- Runda 2 (userul, la 1917 px): (1) o fâșie galbenă ieșea sub poza cu jardinierele — marginea negativă a benzii
  lăsa banda sticky să urce cu 28 px peste începutul footer-ului; acum prefooter-ul are margin-bottom −28 (coboară
  el peste bandă). (2) Wordmark-ul are lățimea paginii, deci crește cu ecranul; banda creștea după regulă și literele
  ajungeau peste linkuri. Banda = înălțimea wordmark-ului (100vw · 140/1440) + rândul de jos (41, după regulă),
  rândul ancorat de jos. (3) FROM THE RANGE: cardurile se dezvăluiau unul câte unul abia când erau trase în ecran
  (arăta ca o încărcare lentă); acum toate odată, când slider-ul intră la 85 %.
- Runda 3 (userul): wordmark-ul nu se mai taie — ca la telhaclarke, banda se descoperă întreagă (fără suprapunerea
  de 28 px din Figma), cu marginea de 10 deasupra; umbra prefooter-ului se stinge cu progresul (gone la final).
  FROM THE RANGE: înapoi la reveal pe fiecare card, dar declanșat de Embla (`slidesInView`, imediat și în timpul
  drag-ului), de când slider-ul a intrat la 85 %; IntersectionObserver-ul pe card (pragul de 85 % pe verticală)
  ținea ascunse titlurile cardurilor înalte. Pozele produselor: 960 px (704 KB toate).
- Runda 4 (userul): umbra = efectul din Figma pe dreptunghiul de 28 px de la piciorul prefooter-ului: drop shadow
  y 10, blur 12, negru 25 % → box-shadow pe prefooter, înmulțit cu (1 − progresul), 0 când banda e toată afară.
  Conținutul benzii urcă acum ca un singur bloc (ca `.footer-bottom-inner` la ei): blocul avea `inset: 0` și,
  mutat de `top`, se scurta, iar rândul de jos stătea pe loc peste wordmark; acum are înălțimea benzii și rândul vine
  de sub marginea ei.

## Retușuri 2026-10-21

- Umbra footer-ului: valorile Figma arată mai slab în browser (ca în Webflow) → y 14, blur 36, negru 45 %.
- „Journal” scos din prefooter (nu va exista pagina).
- Săgeata din „Request a quote”: animația pe WAAPI; la ieșirea de pe buton se întoarce de unde a ajuns (reverse),
  nu mai sare la loc.

## PAGINA PRODUCTS (/products) — în lucru (2026-10-21)

- Figma: `docs/reference/Products.pdf` (1440 × 6542). Sus: titlul Aeonik 65 (2 rânduri), regulă sub nav la 91.2,
  „FILTER BY: CATEGORY”, 6 carduri de categorie (140 × 170, albe, imaginea 134 pe #E7E5DF; activă = #7A9285, text alb),
  „SHOWING: n/23 RESULTS”, grila de 4 coloane (327, între ele 24, rânduri 348) din 858.2; apoi configuratorul,
  built to stay și footer-ul, ca pe home.
- `tools/extract_products_page.py`: fiecare card din PDF (poziție, mărime 1×1 / 1×2 / 2×1, nume, etichetă, finisaj,
  măsură) și locul randării în card (% din card), randările potrivite pe pixeli cu catalogul colegului →
  `components/products/grid.json`, `public/products/*.webp` (1100 px). Corecturi: G2/K5_1900 se confundă la potrivire
  (același cadru) → K5_1900; rastelul are în Figma eticheta „BENCHES” → „BIKE RACKS”. Cardul de catalog: poza din PDF
  sub masca nopții 60 %; ultimul card gol din Figma rămâne (umple rândul) doar fără filtru.
- Stări (cererea userului): hover pe card = #E8E5DF sub alb 70 % + eticheta verde; categoria activă #7A9285;
  la început nicio categorie (toate produsele), al doilea click o deselectează.
- Comportament = floema.com/en/products (cod citit + măsurat): intrarea — rândurile titlului cad de sus (0.8 s circ.out,
  0.05 între ele), cardurile de categorie de la −50 % (0.8 s, 0.02), etichetele 1.2 s power4.out, primele 6 carduri
  urcă 200 px (0.8 s circ.out, la 0.1, de la 0.4 s); filtrarea — cardurile pleacă (30 px, 0.35 s power1.out), lista
  se schimbă, cele noi vin împreună (0.45 s power2.out, 0.1 s întârziere); hover pe categorie = randarea se apropie
  (1.01 → 1.09, 2.5 s expo.out). Ale noastre în plus: regulile trasate de la stânga, restul cardurilor urcă 60 px
  la intrarea în ecran (85 %), poza catalogului se apropie la hover. Filtrul lor plutitor nu e în Figma → nu.
- Pagini într-un singur document, ca pe KELV (`lib/routes.ts`): home-ul rămâne montat și ascuns (scena 3D, scroll-ul),
  pagina de produse se montează la fiecare vizită (intrarea se reia); URL-ul prin history (Back / Forward merg);
  scroll-ul fiecărei pagini se păstrează. `app/*/page.tsx` sunt goale, `<Site />` stă în layout. Intrare directă pe
  /products: preloader-ul cu fond (nu are scena în spate), navbar-ul vine la predare.
- Tranziția: dither-ul Codrops Interlude (`transition/dither.ts`, portat din TSL în WebGL2): pătrate de 1/8, 1/16,
  1/32 din înălțime, umplute prin Bayer 4×4 (256 puncte pe înălțime), acoperire și descoperire 1.1 s power1.inOut,
  culoarea #0E1F14.
- Linkuri: „Products” din navbar și din prefooter, „Browse the range” + săgeata din BUILT OUTSIDE → /products; logo-ul
  duce acasă (pe home reîncarcă, ca înainte). BUILT OUTSIDE își scoate opririle și clasa de navbar cât e ascuns.

## Runda 2 a paginii Products + scroll (2026-10-21)

- Preloader-ul e doar al home-ului: intrarea directă pe /products nu-l are (pagina e liberă imediat, navbar-ul vine
  odată cu ea). Home-ul (hero + secțiunile lui) se montează abia la prima vizită: venind din /products, dither-ul
  descoperă preloader-ul, care ține pagina (`setScrollLocked`) până la predarea scenei, exact ca la o încărcare.
  Navbar-ul stă ascuns cât rulează preloader-ul (`is-preloading`). Configuratorul își preîncarcă produsele când e
  aproape (nu mai așteaptă preloader-ul).
- Produsele au o singură paletă (a configuratorului, 5 culori); cele zincate (K7) arată prima culoare, ca în
  configurator. Cardul gol din Figma e scos; toate cele 23 de produse sunt pe pagină.
- BUILT OUTSIDE (userul: oprea prea mult la trecerea rapidă, textele dispăreau repede): scroll-ul trece liber prin
  opriri; după 220 ms fără input între două, pagina se așază (0.7 s) pe următoarea în sensul mișcării dacă a trecut
  de 30 % din drum, altfel înapoi. Textul unui item rămâne cât poziția e la ±0.35 de el (înainte: doar exact pe
  oprire) și se stinge în 0.5 s (era 0.2). Măsurat: un scroll continuu trece secțiunea (6600 → 10900) fără oprire.

## PAGINA DE PRODUS (CMS, /products/<slug>) — hero în lucru (2026-10-21)

- Figma: `docs/reference/Product CMS.pdf` (1440 × 9395; exemplul: Plaza Bench with Armrests). Referința de
  comportament: pedestal.com/products/moon-rollin-ultra-marine (acolo hero-ul e o galerie de poze, săgeata = poza
  următoare). Se face secțiune cu secțiune; acum doar hero-ul (0–851).
- O pagină pentru fiecare din cele 23 de produse: `tools/prepare_product_pages.py` → `components/product/catalogue.json`
  (nume, categorie, dimensiuni, mărimile modelului); adresa = numele (cu mărimea când două produse îl împart: K1, K3,
  K4, K5, K6). `lib/routes.ts` are al treilea view, „product”, cu slug-ul; cardurile din /products duc la pagină.
- Hero (decizia userului: 3D viu în piațetă): randarea din Figma n-are scenă în niciun pachet → piațeta e construită
  în `tools/blender_plaza.py` (dale 1.2 × 1.8, perete de panouri 1.65 m, stâlp vopsit, fâșie de iarbă cu păr Cycles),
  camera potrivită pe Figma cu banca reală din studioul colegului (doar la `--preview`): poza de repaus pune banca la
  x 340–1145 (Figma 324–1137). Două plăci, fără produs și fără frunze: lumina cerului și lumina soarelui (1800 × 805 px
  Figma în jurul cadrului, la 2×), plus mediul văzut de pe bancă (`tools/prepare_plaza.py` → `public/plaza`).
- three.js (`scene/plaza`): plăcile proiectate din camera Blender pe cutiile piațetei (parallax corect la mișcări mici);
  culoarea = cer × umbra de contact a studioului + soare × frunze × umbra produsului. Umbra produsului = silueta lui
  văzută din soare (tot ce e în piațetă stă în spatele ei), cu penumbră. Frunzele (`foliage.ts`) sunt desenate live,
  ale noastre (nu textura Light Wrangler): ramuri și frunze plate văzute din soare, legănate de vânt (ramuri lent,
  crenguțe repede, frunzele tremură și se întorc), estompate de un blur; același „cookie” cade pe bancă (lumina
  direcțională din materiale). Banca are materialele configuratorului (`dress` în `configurator/finishes.ts`, comun).
- Mișcarea (a noastră): camera se retrage lin din apropiere în poza Blender (2.8 s expo.out) cât apare scena, apoi se
  înclină puțin după cursor; titlul urcă în mască, grupurile barei vin de jos la 0.08 s, regula se trasează. Săgeata
  rotește produsul cu 1/6 de tură (1.6 s expo.inOut), umbrele îl urmează. Culorile schimbă cadrul pe loc (5/s).
- Navbar pe pagina de produs: săgeată înapoi, PRODUCTS LIST (→ /products), QUOTE / 0; logo-ul e #F3F0EA peste
  piațetă și redevine verde când piațeta a trecut de el.
- De lămurit: Figma scrie „Natural Galvanised Steel” cu pastila Sage aleasă → eticheta arată numele culorii alese, iar
  produsele zincate pornesc pe Sage (randarea din Figma). „Configure” și „Add to quote” sunt inerte (fără flux în
  Figma). Lipsesc GLB-urile pentru G4, G5, K4_1900, K5_1900, K6_1900, K8_module (de exportat cu
  `tools/blender_configurator.py`).
- Produs fără GLB (cererea userului): silueta lui în piațetă, tăiată din randarea de catalog (alfa > 0.82, fără
  umbra moale), plată în culoarea aleasă, cu frunzele trecând peste ea; înaltă cât produsul (×1.35, randarea îl vede
  de sus), lată cât e lung. Peste ea, o bandă verde #2F4A3A, înclinată −3°, cu „COMING SOON” alb care curge (pe
  `left`, rămâne clar); săgeata lipsește (n-are ce roti).

## PAGINA DE PRODUS — THE BENCH (Figma 851–2849), în lucru (2026-10-21)

- Eticheta „THE <tip>” (Benches → bench, Bins → bin…), Martian Mono 12 #212325, linia de bază 933.1. Declarația
  Aeonik 40 / 41 de la x 720, lată de 575 (rândurile cad ca în Figma): primele cuvinte #0E1F14, restul la 15 %
  (pedestal: la fel, static). Textul e al fiecărui produs: K7 din Figma; celelalte spun ce știe catalogul până vine
  textul lor. Pozele: una 1424 × 801 (de la 1155), două 708 × 885, 8 între ele și de la margini, colțuri 2.
- Pozele sunt randări ale produsului în piațetă (`tools/blender_gallery.py`, din studioul colegului, în prima culoare
  a paginii; K7 primește vopseaua studioului): ansamblu, capătul stâng, detaliu. Tot fără frunze și pe două plăci,
  plus distanța fiecărui pixel până la cameră (16 biți în doi octeți, WebP lossless; `tools/prepare_gallery.py`):
  `scene/plaza/gallery.ts` află unde e pixelul și pune umbra frunzelor (aceeași ca în hero, `sun.ts`) pe soare.
- Mișcarea (a site-ului): eticheta și declarația urcă pe rânduri din mască (fiecare cuvânt își află rândul după
  așezare, `Statement.tsx`), pozele se descoperă de jos și se așază din 1.12 (2 s expo.out).
- Declarația e de fapt un fill (userul): toată pornește la 15 % și se umple literă cu literă cu scroll-ul, de când
  vârful ei ajunge la 85 % din ecran până când baza ajunge la 45 %; o literă se umple pe 6 % din drum. Figma arată
  starea de la jumătate.
- Galeria e randată pentru toate cele 23 (69 de cadre, ~1.4 min / cadru, 43 MB în `public/gallery`).
- Pachetul colegului (verificat tot, 104 fișiere + ZIP): niciun GLB, nicio fotografie; doar .blend-ul (23 de scene,
  toate cu geometrie), randările de catalog pe transparent, straturile (17) și previzualizările. GLB-urile sunt ale
  noastre, din .blend: cele 6 lipsă (G4, G5, K4_1900, K5_1900, K6_1900, K8_module) exportate acum, toate 23 au 3D.
  `blender_configurator.py` cădea pe K6_1900 (scena activă a fișierului e chiar a lui); `prepare_configurator.py`
  adaugă la `products.json` în loc să-l rescrie. Silueta cu „COMING SOON” rămâne pentru produse viitoare fără model.
- Poza mare nu se încărca la majoritatea (userul): browserul ține doar câteva contexte WebGL („Too many active WebGL
  contexts”); fiecare poză avea al ei, iar la fiecare produs se adunau → cădeau cele mai vechi (poza mare, apoi
  tranziția și configuratorul). Acum galeria are un singur context comun (o umbră de frunze pe cadru, fiecare poză
  copiată în canvas-ul ei 2D), eliberat cu `forceContextLoss` când pleacă ultima poză; hero-ul își eliberează
  contextul la demontare (nu și la remontarea din dev, unde canvas-ul rămâne). Testat: 5 produse la rând, zero pierderi.

## PAGINA DE PRODUS — SHOWCASE (Figma 2857–5589), în lucru (2026-10-21)

- Figma: bloc 8 → 1432, culoarea aleasă la 60 % peste hârtie; declarația (fill, ca la THE BENCH) la x 720, linia de
  bază 2939.7; randarea de catalog 1075 px cu mijlocul la 4051 (+17.5 față de centru); pastila albă verticală
  (34 lată, 5.9 înăuntru, culori de 22, cea aleasă 44 înaltă) la x 38, cu mijlocul 26.3 deasupra produsului.
- Comportament = pedestal.com, „Colors for your mood” (product-showcase, citit + măsurat): secțiune înaltă
  (300svh la ei, 2732 în Figma la noi), produsul într-un sticky de înălțimea ecranului; video-ul lor de rotire (4 s)
  e derulat liniar de scroll de când blocul ajunge sus până când piciorul lui ajunge jos; culoarea schimbă video-ul
  și fundalul (0.3 s ease-out), butonul ales se lungește (0.3 s).
- La noi (`scene/showcase.ts`): produsul 3D cu studioul colegului (luminile, mediul, umbra — încărcarea e acum comună
  cu configuratorul, `configurator/product.ts`), văzut de camera de catalog (ortografică, 1075 px pe lățimea ei),
  o tură întreagă pe parcursul secțiunii. Culoarea vopsește cadrul (5/s) și fundalul.
- Sticky-ul are marginea de sus în bloc (`flow-root`), altfel ieșea din el și împingea blocul cu 769.

## MOBIL / TABLETĂ / LANDSCAPE — în lucru (2026-10-22)

- Regula: sub 1024 px, `web/src/styles/mobile.css` (încărcat ultimul) suprascrie tokenii cu px ficși (gândiți la
  390), marginile laterale 15 px (cererea userului); 744–1023 (tabletă, telefon culcat) același layout, cu 2 coloane
  unde referințele le folosesc. Desktopul (≥ 1024) neatins. Pozițiile Figma puse inline din JS sunt anulate pe mobil
  (`!important`), secțiunile trec în flux; rândurile Figma (`.line`) devin inline (textul curge, intră cu fade).
- Referințele măsurate headless pe 390×844, 820×1180, 844×390 (agenți, scratchpad/research/):
  - fluid.glass: o coloană, cuvintele Solid/Civic/Calm stivuite în zigzag (~91 px), liniile ascunse; sliderul
    ~1.2 carduri (287 px), înălțimi alternante;
  - floema: meniu pe tot ecranul (linkuri mari 32 px, celelalte jos pe 2 coloane); footer o coloană, desene pe
    reguli; /products 2 coloane sub 1024, carduri 266 înalte, late pe tot rândul, pe touch doar numele;
  - telhaclarke: cortina rămâne pe mobil, wordmark-ul pe lățime;
  - valmont: secvența fixată rămâne, coloana de text ~70 px de la stânga;
  - pedestal: o coloană, galeria 60svh, opțiunile sub ea, cardurile pe toată lățimea, culorile showcase-ului o
    pastilă orizontală jos, specificațiile etichetă | valoare, coșul = dialog la 4 px de margini;
  - MOTO Stack: taburile sus, controalele un panou jos; rubens: nicio adaptare (tuburile mari, tăiate).
- Făcut: navbar (logo, Quote/Back, burger → `nav/MobileMenu.tsx`), toate secțiunile home, /products, pagina de
  produs, configuratorul (produsul ridicat cu `lift`, punctele ținute pe ecran), sertarul de ofertă.
- Capcană: în Git Bash un argument `/` devine cale Windows (`C:/Program Files/Git/`): `MSYS_NO_PATHCONV=1`.
- 2026-10-22, după feedback pe Honor Magic5 Lite: touch nativ (Lenis anula touchstart → tap-urile nu mergeau);
  hero pe telefon: sticla 3 suprafețe + rest, trasată la 0.6 din rezoluție și afișată de logo (`glass.ts`), fundalul
  din spate la ½ și la 2 cadre, DPR 1.75 adaptiv (≥ 1.25), cap 60 fps; logo-ul centrat pe zona vizibilă
  (`--stage-lift`); mișcările de scroll pe `screenHeight()` (100lvh), nu pe innerHeight (bara Chrome). Site live:
  https://civic-standard.vercel.app (export static: Vercel refuza o funcție numită după calea cu spațiu).

## Navigație nouă + 404 — în lucru (2026-10-28)

- **Nav New.pdf:** linkurile sunt doar PRODUCTS și OUR PROJECTS (căutarea și QUOTE rămân), pe toate paginile, cu
  aceleași distanțe ca înainte. În prefooter și în meniul de mobil linkurile mari sunt tot Products și Our Projects.
  Pagina de produs și configuratorul își păstrează navigația. OUR PROJECTS nu duce încă nicăieri (pagina urmează).
- **404 (Page 404.pdf, 1440 × 830):** orice altă adresă, inclusiv un slug de produs care nu există
  (`routes.ts` → `notfound`, `app/not-found.tsx` pentru export). Navbar-ul de aici are doar cele două linkuri, ca
  în Figma. Fără footer.
  - Cei doi „4” sunt conturul din PDF (regula nonzero; cu evenodd apărea o așchie pe vârf), #A9B7A0.
  - „0” e stația K3_Q600 în studioul configuratorului (`scene/notfound/bin-scene.ts`), cu camera ortografică din
    catalog, încadrată pe silueta măsurată din alfa randării Figma (577.8–859.4 × 144.1–584.8). Nu se rotește.
  - Unitatea cadrului e regula clamp, micșorată doar când cadrul nu încape (laptop îngust, fereastră scundă).
    Textul și butoanele păstrează mărimile regulii.
  - Mobil: pe orizontală, cadrul Figma; pe verticală, un cadru propriu de 390 × 740 (404 la 0.398, cuvintele în jur).
  - Intrarea: „4” urcă descoperiți de jos, stația coboară pe umbra ei, rândurile urcă, apoi butoanele, apoi
    cuvintele. Cuvintele plutesc „ca o navă care își caută echilibrul”: un leagăn lent + un arc care depășește
    puțin ținta (`use-hover.ts`, pe left/top, deci textul rămâne clar).

## Hero cu randările proiectelor + OUR PROJECTS — în lucru (2026-10-28)

- **Randările colegului** (`C:\ATWWW\Civic Standard\Renders`, 51 de PNG de 3000 px) → `tools/prepare_projects.py`
  → `public/projects`: `tube/<slug>.webp` (512 px), `<slug>-m.webp` (1280 px: panoul, ecranul plin pe telefon),
  `<slug>.webp` (2400 px: ecranul plin). Fiecare randare e un proiect (`components/projects/projects.json`). Textele
  le-am scris eu, pe produsul din catalog pe care îl arată randarea.
- **Tubul** trece prin 9 rânduri × 6 de conținut (`TUBE.contentRows`): 51 de randări + banca (rândul 1, coloana 1)
  + 2 repetiții. Rândurile fizice se reîmpachetează tot la 3, iar la fiecare împachetare imaginile urcă cu 3 rânduri
  (`tube.showFor`). Randările sunt afișate ca fotografii (fără curba de culoare), neoglindite pe partea dinspre cameră.
- **Hero-ul s-a lungit** cât să intre în cadru toate rândurile: `HERO.minTravel` 13.7 unități. Banca ajunge la
  centru la 16.2 unități, adică ~11 500 px la 1440 × 850 (înainte, ~7 ecrane). Picturile vechi
  (`public/hero/paintings`) nu se mai folosesc.
- **/projects** e aceeași scenă (`createHeroScene`, `mode: 'projects'`):
  - fără preloader: logo-ul se rotește deja, peretele e luminat, iar rândurile urcă de jos;
  - scroll-ul e virtual, fără capete (`lib/virtual-scroll.ts`: rotița, degetul cu fling, tastele);
  - click (tap) pe orice imagine, aproape sau departe (a doua variantă, cererea userului): întâi tubul o aduce în
    față, la mijloc (rândurile urcă sau coboară, inelul se rotește la cel mai apropiat unghi; 1.4–2.6 s, după
    distanță), abia apoi crește pe tot ecranul (1.6 s). Adresa devine `/projects/<slug>` fără dither (`navigateSoft`).
    Închiderea face drumul invers (1.4 s), iar rotirea tubului revine treptat (1.6 s). Valorile sunt în
    `PROJECTS` (config.ts);
  - imaginea deschisă: întâi acoperă tot ecranul, apoi, cât intră panoul, se strânge ca randarea să încapă aproape
    întreagă în stânga panoului (pe telefon, deasupra lui). Sub panou continuă în oglindă (doar marginile de 10 px
    o arată). Imaginea la 2400 px (1280 px pe telefon) se încarcă din hover și e urcată pe GPU la click; pe GPU
    rămân cel mult 4;
  - săgețile: imaginea nouă intră cu un wipe moale din partea săgeții (1.8 s), pe zona vizibilă;
  - scroll-ul din panou: `lib/scroll.ts` lasă în pace elementele cu `data-lenis-prevent` (handler-ul nostru rula
    înaintea verificării Lenis și bloca rotița);
  - panoul intră din dreapta (rama sertarului de ofertă). Săgețile schimbă proiectul (replaceState). Back, × sau
    Escape îl închid, iar imaginea intră înapoi în panoul ei din inel. Tubul stă pe loc cât proiectul e deschis.
  - × urmează cursorul peste imagine. Pe telefon stă în colțul din dreapta-sus (cererea userului: nu pe mijlocul
    imaginii), unde e navbar-ul când nu e deschis un proiect. Apare odată cu panoul: crește puțin peste mărimea lui
    și se așază, iar × se rotește la loc. Navbar-ul pleacă cât e deschis un
    proiect (Figma nu-l arată).
  - Panoul: al doilea „DIMENSIONS” din Figma e „MATERIALS”, iar „FINISH” de lângă desen e „PRODUCT” (linkul spre
    pagina produsului). SEND QUOTE REQUEST pune produsul, cu finisajul și numărul de bucăți, în lista de ofertă.
