# KELV — parcursul site-ului

**Site de referință (cererea userului, 2026-10-05):** tot site-ul trebuie să se comporte
exact ca https://web.archive.org/web/20260409222057/https://www.drinksom.eu/ — macheta KELV
e aceeași structură, cu alt conținut. Când o secțiune are o animație, se citește ÎNTÂI
din DOM-ul lor (stiluri inline la mai multe poziții de scroll, prin CDP), nu din ochi.
Ecranul machetei e de **850 px** (secțiunile 2–4 au 850; CTA-urile stau la 32 de jos).

Macheta (`reference/Homepage.pdf`, 1440 × 9111) are 9 zone. Se lucrează **una câte una**;
nu se trece la următoarea până când userul nu aprobă secțiunea curentă.

| # | Secțiune | y în machetă | Stare |
|---|---|---|---|
| — | Header fix (liniuțe · KELV° · FOAM CLEANSER · OPEN SHOP) | 0 → 82, repetat | **în lucru** (cu hero-ul) |
| 01 | Hero — produsele + BEYOND / ALWAYS / STATE OF MIND | 0 → 1709 | **în lucru** — static ca în Figma, animațiile urmează |
| 02 | Mental Focus (01/03) | 1709 → 2559 | **în lucru** — secțiunea PILLARS (02–04), sticky, vezi mai jos |
| 03 | Stamina Boost (02/03) | 2559 → 3409 | **în lucru** (în PILLARS) |
| 04 | Imune Control (03/03) | 3409 → 4259 | **în lucru** (în PILLARS) |
| 05 | Galeria (6 imagini + video) | 4259 → 5519 | **în lucru** — secțiunea GALLERY (05–06), vezi mai jos |
| 06 | Ancient Wisdom | 5519 → 6369 | **în lucru** (în GALLERY) |
| 07 | Become Someone Powerful (formular email) | 6369 → 7219 | **în lucru** — vezi mai jos |
| 08 | Zona de trecere (produsul se rotește) | 7219 → 8261 | **în lucru** — vezi mai jos |
| 09 | Footer: Beyond Always State of Mind + bara | 8261 → 9111 | **în lucru** — vezi mai jos |

## Contractul DOM

- `.site-header` — fix, z 50. `.ticks` cu `--ticks-lit` (câte liniuțe sunt aprinse) =
  progresul pe toată pagina: 0 sus, toate la capătul footer-ului (`src/components/chrome/Ticks.tsx`).
- `.cta--l` / `.cta--r` (JOIN CLUB / BUY NOW) — fixe, la 32 px de jos, z 50; poziția
  verticală din `--cta-shift` (0 jos → 1 mijloc), scrisă din scroll de gallery.js.
- `.chrome` — stratul fix cu header-ul și CTA-urile; `src/components/chrome/Chrome.tsx` e randat de două ori, a doua oară ca
  `.chrome--dark` (#17110F, liniuțe portocalii, buton închis cu text alb). Originalul e
  decupat FĂRĂ banda deschisă din ecran, clona DOAR pe ea (`--lb-a` / `--lb-b`, din
  secțiunile `[data-theme="light"]`) → culoarea se schimbă pe pixel, exact unde marginea
  secțiunii trece peste text (cererea userului: „ca difference, treptat").
- `html.chrome-off` — header + CTA-uri ascunse (galeria).
- `[data-roll-host]` + `[data-roll]` — ORICE buton cu text rulat literă cu literă și
  săgeată rotită (inactiv cât e `disabled`).
- `[data-zoom-card]` — card care se mărește la intrarea secțiunii lui (`src/components/home/Pillars.tsx`):
  JS scrie doar `--e`, CSS-ul face scale + raza.
- `#kelv-canvas` — fix, tot ecranul, transparent, **z 2**. Intră între titlul mare (z 1)
  și textele hero-ului (z 5). `.hero` nu are voie să creeze context de stivuire.
- `#content > section[data-section]` — câte una per secțiune.
- `[data-reveal="<s>"]` (+ `data-reveal-lines` sau `data-reveal-fx="blur"`) — reveal o
  dată la intrarea în ecran (`src/components/ui/Reveal.tsx`). Pornit DUPĂ `html.is-ready`.
- `html.is-ready` — pusă de `src/lib/scroll.tsx` după CSS + fonturi (plafon 2 s; plasă în <head> la
  3 s). Până atunci `body` e `visibility: hidden` (`base.css`; plasa e în scriptul de boot din `src/app/layout.tsx`).
- Starea scroll-ului: `ui.scroll` (`y`, `progress`, `velocity`, `onFrame(fn)`), citită de
  scenă în același rAF. Un singur rAF pe tot site-ul.

## 01 · Hero — măsurile (din PDF, coordonate la 1440)

| Element | Măsura | Ancorare |
|---|---|---|
| Liniuțe | 1.5 × 13, pas 6.5, top 10, x 10 → 1428.5; 52 albe, restul 13% | stânga + dreapta 10 |
| KELV° | 122.08 × 24.84 la (10, 48.08), vectorial (`src/components/ui/icons.tsx`) | stânga |
| FOAM CLEANSER | 27.12 px; FOAM Expanded 900 #FF4D1F −0.06em; CLEANSER ExtraCond 700 −0.014em; centrul la 726.06 | centru +6.06 |
| OPEN SHOP | 109.58 × 43 la top 39, raza 3, Plex Mono 13 −0.04em, padding 14, săgeată 7.58 × 7 | dreapta 10 |
| Info stânga | Plex Mono 14/18, majuscule, lățime 27 de caractere, (250.5, 343) | stânga |
| Info dreapta | idem, aliniat dreapta; cerneala se termină la 1274, top 1134 | dreapta 166 |
| JOIN CLUB / BUY NOW | Plex Mono 14, subliniat, **fixe**, jos 32 | stânga / dreapta 10 |
| Titlul mare | 130.3 px, rânduri la 96, top 987.5, alb 20%; centrul la 689 | centru −31 |
| Paragraf | Archivo 16/21, +0.01em, centrat, top 1342; centrul la 712.5 | centru −7.5 |
| Strălucirea | imagine RGBA la (−609, 168), 2602 × 2210, compusă normal peste #030F38 | centru |
| Produse (placeholder) | (53, 64), 1322 × 1377 | centru |
| Spuma | mutată în secțiunea 2: card 100vh, scalat din centru (vezi mai jos) | — |

### Structura (copiată din drinksom.eu)

- Hero = **100vh** (primul ecran: produse, info stânga) + **859 px** în flux (titlul mare
  la +137.5, info dreapta la +284, paragraful la +492). Δ = y_machetă − 850.
- Strălucirea continuă ~670 px sub capătul hero-ului (`overflow-x: clip`, nu `clip` pe
  ambele axe): ea e fundalul din jurul cardului cât timp cardul e mic.
- Secțiunea 2 începe exact la capătul hero-ului: 320vh, `sticky` de 100vh, în el un card
  de 100vh cu spuma. `p = 1 − top_secțiune / vh` (0 → 1 pe ultimul ecran înainte să se
  fixeze), `e = 1 − 2^(−10p)`, `scale = 0.08 + 0.92e`, `raza = min(32, 64(1 − e))` px.
  Valori citite din stilurile inline ale cardului lor la 9 poziții de scroll; curba
  verificată (`log2(1 − scale) + 10p` = −0.12 constant).

Verificat 2026-10-05: primul ecran la ≤ 1 px față de randarea PDF (înainte de mutarea
părții de jos sub 100vh); tranziția la 1440 × 850, cadre la 0 / 500 / 859 / 1000 / 1200 /
1400 / 1709 / 2200 / 3000 — sticky-ul ține la top 0 de la 1709 la capăt.

### Rezolvate cu userul (2026-10-05)

1. Liniuțele = progresul pe tot site-ul, 0 în hero, toate la footer.
2. JOIN CLUB / BUY NOW = sticky, 32 px de jos.
3. Spuma = fundalul secțiunii 2, efectul exact ca pe drinksom.eu.

### Animații (2026-10-05)

Toate citite din codul drinksom.eu (chunk-ul `5baabc9d998219fd.js` + `TextReveal` din
`3729cca02aaafdff.js` + keyframe-urile din CSS-ul lor), apoi ajustate unde a cerut userul.

| Ce | Comportament | Sursa |
|---|---|---|
| JOIN CLUB / BUY NOW | la `mouseenter`/`focus`: `navUnderlineSweep` 0.9 s ease-in-out — linia iese spre dreapta, dispare, revine din stânga; rulează complet și la ieșire | drinksom, identic |
| Butoane (toate, pe tot site-ul) | aceeași animație ca OPEN SHOP — cerința userului 2026-10-06 | userul |
| OPEN SHOP — text | literă cu literă, fiecare urcă cu o copie (animat pe `top`, NU `transform` — textul rămâne clar în mișcare); 0.4 s cubic-bezier(.95,0,.05,1), val de la ULTIMA literă spre prima, decalaj `--roll-stagger` 0.03 s; la ieșire invers (de la prima) | drinksom (textul întreg) + userul (literă cu literă) |
| OPEN SHOP — săgeata | `rotate(-45deg)` → spre dreapta-sus; 0.6 s cubic-bezier(.25,.46,.45,.94); revine la ieșire | drinksom, identic |
| Paragrafele hero-ului | RÂND CU RÂND: fiecare rând din `opacity 0, y +30, blur 4, scale 0.96` → poziția lui; 0.8 s cubic-bezier(.76,0,.24,1); decalaj 0.07 s între rânduri; o dată, la intrarea în ecran (10%) | drinksom + userul (rânduri, scale) |
| Titlul mare | DOAR blur → clar (de la blur-ul lui A/S, 6 px), fără mișcare, scale sau opacitate; rânduri la 0.07 s; A și S rămân blurate. Rândul întreg, nu pe litere — altfel se pierde kerning-ul | userul (2026-10-06) |
| Liniuțele | aliniate la pixeli întregi de ecran (vezi header.css / ticks.js) | fix, cerut de user |

### Deschise

- Animațiile produselor și ale titlului mare — „vorbim după".
- ~~grain-ul de pe drinksom~~ — NU. Regula userului: **ce nu e în Figma nu se face.**
- Fundalul secțiunii 2 în Figma are în plus o vignetă (perechea de imagini 8/9 din PDF)
  — de verificat pe pixeli când facem conținutul secțiunii.

## 02–04 · PILLARS (2026-10-06)

O singură secțiune sticky, ca „power-pillars" de pe drinksom.eu. Formulele sunt copiate
din codul lor (`src/components/home/Pillars.tsx`):

- 320vh; `y` = progresul prin partea fixată; primele 30% = pauză pe pilonul 1.
- `$` = poziția continuă (curbă în două trepte), `D` = pilonul curent, `B` =
  easeInOutCubic în ultimele 35% ale fiecărui segment.
- **Fundalurile** se suprapun după `B`. Sunt COPTE din randarea PDF-ului
  (`tools/extract_pillars.py`, `pillar-1..3.webp`): imaginea + tenta + vignetele Figma,
  fără texte, produse și cercuri. Cardul care se mărește din hero = `pillar-1`.
- ⚠️ **UN SINGUR PUNCT DE SCHIMBARE** (cererea userului, 2026-10-06 — la scroll lent
  fundalul, textul și produsul se schimbau în momente diferite): totul trece la mijlocul
  tranziției, `B = 0.5` — fundalul 50/50, produsul cu muchia spre ecran (270°). Textele
  au histerezis ±0.03 (să nu comute înainte-înapoi pe loc); produsul nu, ca să cadă
  exact pe muchie. Măsurat: produsul la 274° / fundal 50.8%, textul la fundal 54%.
  (drinksom schimbă textele abia la capătul tranziției — aici NU copiem asta.)
- **Textele** la schimbarea pilonului vizibil: titlul se schimbă pe loc și vine din blur (0.55 s,
  rândurile la 0.07 s); cuvintele paragrafului și rândurile tagline-ului ies în sus
  (0.25 s power2.in, decalaj 0.015 s) și intră de jos (0.5 s expo.out, decalaj 0.03 s) —
  animate pe `top` în unități `lh` (vezi capcana din CLAUDE.md).
- **Intrarea** (cardul ajunge full-bleed): titlul +0.25 s, textul din dreapta +0.4 s,
  tagline-ul +0.55 s, produsul +0.25 s. **Ieșirea**: toate 0.3 s (opacitate, scale 0.96,
  blur 8).
- **Cercurile** (cerința userului): trasate „cu compasul" — `stroke-dashoffset` 1 → 0 în
  1.6 s, din vârful cercului — la intrarea pilonului lor; cele vechi se sting în 0.4 s.
  Inele 1 px, alb 29%: pilonul 1 unul (209, 309, r 651.5), pilonul 2 niciunul (cercul
  din cadru e în imagine), pilonul 3 două ((−193.5, 106.5, r 431), (351, 283, r 487.5)).
- **Produsul** (imagini Figma, provizoriu): poziția / mărimea / rotația de repaus
  interpolate între D și D+1 după `B`; rotație pe Y de `B · 1.5` ture; ambele fețe
  au aceeași imagine, schimbată la `B = 0.5` (270°, pe muchie) — nevăzut. Tilt de
  la mouse spre partea opusă atingerii (max 18°), o tură la click (1.2 s).
- Măsuri (centrul ecranului = 425 în cadrul de 850): titlu x 209, rândul 1
  ExtraCondensed 800 58.4 −0.04em, rândul 2 Expanded 900 69.26 −0.06em (portocaliu la
  1–2, alb la 3); „0X/03" Plex Mono 14 (cifrele 600) la x 904; paragraf Archivo 16/21
  lățime 280; tagline Plex Mono 14 centrat, jos 32.
- Verificat 2026-10-06 la 1440 × 850 față de cadrele 2 și 4: toate elementele la ≤ 1 px.

## 05–06 · GALLERY → ANCIENT WISDOM (2026-10-06)

O singură secțiune sticky (280vh), ca „origin" de pe drinksom.eu; formulele copiate din
codul lor sunt în antetul `src/components/home/Gallery.tsx`:

- Progresul `R` netezit cu lerp 0.1 → `e`. Grila urcă până video-ul e pe centru
  (`smoothstep(e/0.35)`), apoi video-ul se mărește: discret până la 45%
  (`(e/0.45)³·0.15`), apoi easeOutCubic până la 92%, până acoperă ecranul
  (`max(vw/w, vh/h)`). Originea mărimii = centrul video-ului.
- ORDINEA la revenire, legată de scroll (user, 2026-10-06 — CTA-urile urcau după texte și
  treceau peste ele): e ≥ 0.60 header + CTA-uri reapar JOS → e 0.64–0.74 CTA-urile urcă
  la mijloc (`--cta-shift`, smoothstep) → e 0.76–0.88 titlul + paragraful apar; cuvintele
  intră de jos (0.5 s expo.out, decalaj 0.03 s, +0.15 s). Masca urmează mărirea video-ului.
- Din MACHETĂ / de la USER: masca navy peste video 5% → 70%; header-ul și CTA-urile
  dispar pe galerie (`html.chrome-off`) și revin pe Ancient Wisdom, CTA-urile mutate în
  mijlocul ecranului (`--cta-shift` pe `bottom`); fără colțuri rotunjite și fără
  strângerea golurilor (drinksom le are, macheta nu).
- Plăcile (`tools/extract_gallery.py`): randate din PDF cu clip pe placă (decupaj și rotație
  exacte), cele două laterale din rândul 2 decupate din original (ies din pagină).
- ⚠️ Video PROVIZORIU: `public/video/placeholder.mp4`, generat din imaginea plăcii din
  mijloc (zoom lent 1 → 1.08 → 1, 8 s, buclă fără cusătură). Se încarcă doar când secțiunea
  e la un ecran distanță. Userul trimite video-ul real.
- Plăcile UMPLU lățimea (user, 2026-10-06): lățime = (secțiune − 3 × 10) / 2, proporția
  705 × 400 păstrată, golul orizontal 10 și cel vertical 20 (rândurile de 420 au 10 sus și
  10 jos). La 1440 ies exact pozițiile din machetă.
- Măsuri: rânduri la 10 / 430 / 850, plăci 705 × 400; titlu
  ANCIENT ExtraCondensed 800 + WISDOM Expanded 900, ambele 58.4 (spațiul dintre ele −3 px);
  paragraf Archivo 500 25/30 lățime 840, jos 32; CTA-uri pe mijloc (top 416).
- Verificat 2026-10-06 la 1440 × 850: plăcile 0–1 px față de cadrul galeriei; titlul,
  paragraful, CTA-urile și header-ul 0 px față de cadrul Ancient Wisdom.

### Deschise (galerie)
- Video-ul real (de la user).
- CTA-urile rămân pe mijloc doar cât ține Ancient Wisdom; în macheta secțiunilor 7–8 sunt
  tot la mijloc (top 416) — de stabilit când facem secțiunea 7.

## 07 · BECOME SOMEONE POWERFUL (2026-10-06)

- Fundal `#F0F8FC` (`data-theme="light"`): header-ul și CTA-urile devin #17110F pe pixel,
  unde ating fundalul (vezi `.chrome` în contractul DOM). Verificat: marginea care trece
  prin JOIN CLUB îl taie — sus alb pe navy, jos închis pe deschis.
- CTA-urile coboară înapoi jos, din scroll, legat de marginea secțiunii 7: cât ea urcă de
  la josul ecranului la mijloc (în machetă stau la mijloc — userul le vrea jos).
- Sticky 220vh: întâi titlul, textul și formularul; produsul (Foam Cleanser, 10.03°,
  721.6 px) apare la 60% din partea fixată (~72vh de scroll — la 21vh acoperea formularul
  prea repede, user 2026-10-06), cu rotație −24° → 0 și scale 0.55 → 1
  (1.2 s expo.out), ca să nu acopere formularul din prima. Sub prag se retrage.
- Reveal: rândurile titlului (decalaj 0.07 s) și rândurile paragrafului (+0.2 s).
- Formular (comportament drinksom, ordine de la user): eticheta plutitoare; eroarea
  „INVALID EMAIL ADDRESS" doar după blur; checkbox-ul disponibil abia cu email valid
  (inactiv la 30%, ca în machetă), SEND FORM activ abia cu bifa (inactiv la 20%); bifa se
  desenează; butonul are animația de litere + săgeată. ⚠️ Trimiterea nu are backend —
  vine odată cu Shopify.
- Măsuri: titlu ExtraCondensed 800 + „SOM" Expanded 900, 72.41 / pas 62, portocaliu,
  rândurile decalate față de centru (−4 / +1 / 0, măsurat); text Plex Mono 400 14/16
  lățime 290; input 462 × 64, bordură 2 portocaliu 30%, colț 4; checkbox 14, bordură 2;
  buton 460 × 43, colț 3.
- Verificat 2026-10-06 la 1440 × 850 față de cadrul 7: toate elementele la ≤ 1 px.

## 08–09 · PRODUSUL CARE CĂLĂTOREȘTE + FOOTER (2026-10-06)

- **Produsul** e un singur strat fix (`.travel-product`, `src/components/home/TravelProduct.tsx`), nu stă în
  nicio secțiune: apare pe secțiunea 7 la 60% din partea fixată (rotație + scale), apoi,
  legat de scroll, trece prin trei poze din machetă — J pe 7 (−5.85, +0.85, 10.03°), M la
  mijlocul zonei 8 (−8.7, −6, −15°), F în footer (−10.85, −56.15, 10.03°) — cu o tură
  pe Y pe fiecare etapă (easeInOutCubic). Va fi GLB; aceleași valori vor conduce modelul.
- **Zona 8** (1042 px): gradientul din machetă, copt (`tools/extract_footer.py`).
  `data-theme="light"` + `data-theme-end="0.76"`: header-ul rămâne închis până unde
  contrastul alb îl depășește pe cel închis (WCAG, măsurat pe gradient), pe pixel.
  `chrome.js` reunește benzile deschise lipite (7 + 8).
- **Footer** (un ecran): navy + strălucirea din hero (aceleași coordonate), titlul din hero
  ×1.4152 (184.4 px, pas 135.86), alb 20%, ÎN SPATELE produsului; reveal din blur pe
  rânduri; textul mono (rânduri) și bara (y + blur) cu reveal-ul obișnuit. Bara: 753 × 42,
  colț 3, #D7EEF7 14%, Plex Mono 12 −0.022em, CONTACTS · politicile (gol 14) · WEBSITE BY
  (alb 20%) ATWWW, jos 31.
- În footer JOIN CLUB / BUY NOW dispar (`html.cta-off`; cadrul nu le are). Header-ul
  rămâne — liniuțele ajung toate aprinse la capătul paginii.
- Corecturi măsurate pe pixeli: BEYOND / STATE centrate la ~700, ALWAYS +5.5; STATE OF
  MIND −0.0363em la 184 px.
- Verificat 2026-10-06 la 1440 × 850: footer-ul la ≤ 2 px față de cadrul 9111.

### Deschise (08–09)
- Link-urile din bară (Contacts, politici, ATWWW) au `href` provizorii — paginile de
  politici vin cu Shopify.
- În footer header-ul rămâne vizibil (pentru liniuțe), deși cadrul din machetă nu îl are —
  de confirmat cu userul.

## Retușuri 2026-10-06 (footer, buclă, snap)

- **Titlul mare (hero + footer) literă cu literă** (`tools/mega_spacing.py`): fiecare literă
  are marginea care îi pune cerneala exact ca în PDF; letter-spacing-ul pe rând lipea
  perechi ca E-Y (kerning-ul lui Chrome). Verificat: hero 0 px pe toate perechile, footer ≤ 1.
- **ATWWW** → https://www.atwww.studio/ (tab nou). Linkurile din bară: hover portocaliu.
- **Bucla** (ca pe drinksom): Lenis `infinite: true` (+ `syncTouch`, `lerp 0.14` — opțiunile
  lor) și o copie a primului ecran din hero după footer (`.loop`, `src/components/home/Home.tsx`).
  Verificat: cadrul de la capăt = cadrul de la 0 (diferență medie 0, maximă 1/255); rotița
  în jos din footer → hero, în sus din hero → footer. Bara de liniuțe exclude copia.
  Produsul fix urcă odată cu footer-ul în buclă.
- **Snap-ul din hero** (`useHeroSnap`, `src/components/home/hooks.ts`): după 140 ms fără scroll, sub 350 px de vârf →
  înapoi sus în 1.2 s easeOutCubic. Pe drinksom nu s-a putut citi / măsura (modul încărcat
  la cerere; Lenis-ul lor nu rulează în Chrome automat) — tiparul e cel de pe secțiunea lor
  cu formularul. Verificat: 196 px → 0; 720 px → rămâne.

## Retușuri 2026-10-06 (produsul din footer)

- **Outro-ul la încărcare** (bug raportat): în dev CSS-ul vine din modulul JS, iar `.tp-reveal`
  trecea ANIMAT din starea nestilizată (vizibil) în cea ascunsă — o rotire + micșorare de
  1.2 s la fiecare refresh. Fără tranziție până la `is-ready` (travel.css). Măsurat prin CDP:
  doar două stări, fără cadre intermediare.
- **Saltul buclei** (din hero în sus → direct în footer) juca intro-ul produsului în footer.
  La un salt > ½ ecran starea se pune fără tranziție (travel.js).
- **Produsul se stinge** când derulezi mai departe din footer: opacitate 1 → 0 pe 45% dintr-un
  ecran (`FADE_OUT`), easeInOutCubic.

## SKIN ANALYSIS — /skin-analysis (2026-10-06, construită, așteaptă retușurile userului)

Machete: `reference/skin-analysis/` (Start, 001–6, END V1, END V2; originalele în
`C:\ATWWW\KELV\Skin Analysis\`). Logica: documentul „KELV° Skin Reading · quiz logic for
development" (@Simin) — în `web/src/analysis/logic.ts`, cu cele 5 cazuri de test
(`npm test` în `web/`, toate trec, inclusiv ID-urile kitului).

**Intrarea:** OPEN SHOP (`href="/skin-analysis"`). Același document (History API), nu o pagină
nouă — `src/components/analysis/SkinAnalysis.tsx` (ruta Next `/skin-analysis`, montată din layout):
- intrare: stratul urcă peste home (clip-path de jos în sus, 1 s, [.76,0,.24,1]), home-ul se
  întunecă dedesubt, ecranul intră în cascadă; apoi analiza devine pagina (`html.sa-on`, în
  flux, scroll Lenis fără `infinite`), home-ul e scos din flux dar rămâne așezat;
- Back-ul browserului / logo-ul: invers — stratul coboară și descoperă home-ul la poziția
  exactă (verificat: 3000 → 3000), Forward redeschide cu răspunsurile păstrate;
- intrarea directă / refresh pe /skin-analysis: scriptul din `<head>` pune `sa-on` din primul
  cadru. Next servește `/skin-analysis` ca pagină statică.

**Fișiere:** `src/analysis/logic.ts`, `src/components/analysis/`, `src/styles/analysis.css`, tokenii în
`tokens.css` §SKIN ANALYSIS, iconițele cu `tools/extract_analysis.py` (`sa-kit.svg`, `sa-why.svg`).

**Măsurat:** greutăți după aria de cerneală (titluri Expanded 800, „SKIN READING" 900,
ExtraCondensed 800, butoane Plex Mono 500, fișa 700); letter-spacing rezolvat în browser
(canvas, cu kerning): Expanded −0.04em, mono 14 −0.04em, mono 13 −0.035em, mono 12 0/−0.01em.
Aliniere per element față de PDF (dx/dy): start, pasul 1, pasul 7, raportul (cu textele din
Figma injectate) — toate ≤ 1 px (1 px = marginile pe jumătăți de pixel ale machetei, ex. 401.5).

**Abateri de la Figma — de confirmat cu userul:**
- Macheta are 6 ecrane de întrebări „din 7" și sare pasul *routine*; titlul ecranului 4 din
  Figma („What does your routine look like today?") e pus pe pasul routine, iar pasul *signs*
  are un titlu PROVIZORIU („How does the heat show up on your skin?").
- „Why we ask": textele nu există nici în Figma, nici în document — PROVIZORII.
- Din document, fără desen în Figma: rândul „Profile: …", rândul PROFILE din fișă, bifa
  „Refill every 28 days and save", oferta K2, opțiunea „Nothing in particular".
- Textele din raport sunt cele din document (Figma are placeholdere), deci K1 trece pe 2 rânduri.
- Progresul: regula documentului (½ pas cu răspuns, 1 pas după Continue), nu poziția din Figma.
- Raportul: varianta END V1 (cardul din dreapta pe alb). END V2 nu e făcută.
- Coșul: fără Shopify încă — butonul emite `kelv:add-to-cart` cu proprietățile din document.
- Mobil: neabordat (ca restul site-ului).

## 01 · HERO — scena HERO_130 (2026-10-06)

- **Sursa:** scena colegului `C:\ATWWW\KELV\KELV_HERO130_PREVIEW_V2_DEVELOPER\` (GLB animat cu
  cameră, clipul `HERO_Full` de 14 s, three 0.186.1). NU cele trei GLB-uri individuale (acelea
  rămân pentru Pillars / produsul care călătorește).
- **Comprimare:** `npm run hero -- <HERO_130_animated.glb>` (`web/scripts/optimize-hero.mjs`):
  meshopt + WebP 2048, doar `HERO_Full`; 7.0 → 2.1 MB. `KHR_animation_pointer` (aprinderea lui
  K1) e repus de o extensie proprie — gltf-transform nu îl cunoaște și `prune` îl ștergea.
- **Runtime** (`web/src/scene/`): portat din `hero-runtime.mjs` (LUT Filmic VHC, gradul ACEScct,
  bloom, vignetă, grain, capacul transparent). Canvas-ul stă peste cutia randării din Figma
  (53, 64, 1322 × 1377 = aspectul 0.96 al camerei lor) și urmărește hero-ul sau copia lui.
- **Cadrul de repaus = t 4 s** (cadrul 97 din manifest). Silueta lor brută: IoU 0.80 față de
  Figma; cu o corecție constantă pe produs (mutare + rotație în planul ecranului,
  `scene/config.ts`): **0.982**. Distanța minimă între produse pe tot clipul: 13 mm.
  Respins: rotații libere (0.965, dar serul își pierdea fundul alb din Figma).
- **Lumina:** valorile lor + capac mai reflectant (2) + o lumină frontală joasă pe cremă.
  Ambientul colora produsele în albastru saturat; bloom cu prag 0 = ceață. Diferența rămasă:
  crema cu ~17/255 mai închisă, capacul mai puțin vizibil decât în Figma.
- **Mișcarea:** la încărcare intrarea lor 0 → 4 s (în timp), apoi scroll-ul prin hero derulează
  4 → 14 s (rotire + deschidere), înapoi la urcare. Fără plutire / mouse. „Reduce motion" =
  direct cadrul din Figma.
- **Rezerva**: randarea din Figma apare doar cu `html.no-3d` (fără WebGL / GLB eșuat).
- **De confirmat cu userul:** maparea pe scroll, lumina. Pillars + produsul care călătorește: încă imagini.
