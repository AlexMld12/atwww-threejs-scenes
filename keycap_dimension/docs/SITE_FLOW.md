# Parcursul site-ului — de la trei preview-uri la o pagină

*Scris 2026-09-14. Sursa: PDF-ul de Figma (`Homepage.pdf`) + descrierea userului + ce
există deja în cele trei preview-uri.*

Documentul ăsta e **puntea** dintre uneltele de lucru (`tools/preloader.html`,
`tools/preview.html`, `tools/outro_preview.html`) și pagina reală (`web/`).
`THREEJS_HANDOFF.md` spune ce valori are fiecare scenă; aici se spune **cum se leagă
între ele** și ce contract trebuie să existe în DOM.

⚠️ **Actualizat 2026-09-17: Webflow a fost abandonat.** Secțiunile de mai jos au fost
aduse la zi, dar dacă mai găsești pe undeva cuvântul „Webflow", citește-l ca „DOM-ul
site-ului". Site-ul se scrie direct în cod, în `web/`, cu Vite, și se livrează pe
Vercel.

---

## 1. Decizia de arhitectură

| Întrebare | Decizie | De ce |
|---|---|---|
| Webflow sau cod? | **COD** (răsturnată pe 2026-09-17; era „Webflow") | Animațiile de DOM depind de unde ești în pagină, iar scena știe deja asta în fiecare cadru. În Webflow ar fi trebuit dublată starea prin clase — două surse de adevăr pentru același lucru, plus nume de clase de ținut sincronizate manual. Argumentul vechi (PDF-ul e dominat de text/HUD) rămâne valabil, dar nu bate asta. |
| Cu build sau fișiere pure? | **Vite** | Închide două din cele patru puncte blocante din auditul de compatibilitate (§`THREEJS_HANDOFF`): three, lenis și decoderul Draco vin acum din npm / `public/`, nu de pe unpkg + gstatic, deci un proxy corporate nu mai omoară site-ul. Vercel detectează Vite fără configurare. |
| Iframe sau embed DOM? | **Embed DOM direct** | Tot site-ul e condus de scroll: modulul are nevoie de `window.scrollY` al paginii reale, iar într-un iframe cross-origin asta cere `postMessage`. Plus textul stă PESTE 3D în PDF. |
| Deploy | **Vercel**, Root Directory = `web/` | Decizia userului, 2026-09-17. Înlocuiește GitHub Pages + jsDelivr. |
| Un GLB sau trei? | **Trei GLB-uri, UN canvas** | Vezi §2. |

### ⚠️ Continuitatea vine din renderer, nu din geometrie
Un singur `WebGLRenderer`, un singur lanț de post-procesare (tone mapping +
`GradePass`), pentru toată pagina. Trei renderere = trei gradări = salt vizibil la
fiecare tranziție.

Dar **NU** un singur GLB: puse împreună sunt `152 KB + 8,8 MB + 1,77 MB` și
**~4 milioane de triunghiuri** rezidente simultan. `THREEJS_HANDOFF` §7 marchează deja
1,27M ca problematic pe mobil.

Deci: **un modul, trei ACTE**, fiecare montându-și și demontându-și GLB-ul.

---

## 2. Cele trei acte

### Actul 0 — Preloader (NU e condus de scroll)
`web/public/models/preloader.glb`, **152 KB**, 8 piese, doar poziții.

Rolul lui real: **e ce se vede cât curg cele 8,8 MB ale intro-ului.** Deci trebuie să
fie în **același modul** cu intro-ul. Dacă e o pagină separată sau un alt canvas, se
termină și rămâi cu ecran gol exact cât durează descărcarea — adică exact ce trebuia
să prevină.

- Progres: din `onProgress` al `GLTFLoader` pe GLB-ul de intro (procent real, nu fals).
- Animația: switch-ul desfăcut se închide (`?p=0` → `1`), liniar, fără easing — vezi
  `preloader/README.md`.
- **Primul ciclu e protejat (2026-09-28).** Desfăcut → închis → desfăcut (3 s) rulează
  fără nicio muncă grea pe firul principal: GLB-ul de intro se DESCARCĂ din prima
  clipă, dar `loader.parse` (decodare, texturi, compilare) pornește abia la
  `plPhase ≥ PL_FIRST` (2). După aceea sacadarea e acceptată. Măsurat cu `longtask`:
  în primul ciclu, doar montarea preloader-ului la faza 0. `dt` e plafonat la 1/30 s,
  ca un cadru lent să încetinească animația, nu să o facă să sară.
- Ieșire: când intro-ul e încărcat **și** animația de închidere s-a terminat, nu doar
  când sosește GLB-ul.

### Actul 1 — Hero / intro (scroll)
`keycap_scene_web.glb`, **8,8 MB**, clip `"Scene"` de **6,25 s**.

Maparea scroll → timp de clip, pe fazele care există deja în scenă:

| Fracțiune din track | Timp clip | Ce se vede |
|---|---|---|
| 0 → 0.48 | 0 → 3.00 s | biroul întreg de sus, camera coboară, tastele și switch-urile se ridică |
| 0.48 → 0.74 | 3.00 → 4.60 s | **dezvăluirea scrim-ului** — planșa de pegboard e acoperită, fundalul devine petrol închis |
| 0.74 → 1.0 | 4.60 → 6.25 s | close-up jos, switch-ul complet explodat |

Fereastra de dezvăluire e deja implementată (`applyReveal()`, `revStart`/`revEnd`) și
reglabilă din slidere. Valorile din tabel sunt cele din fișier acum.

### Actul 2 — Pașii explicativi (scroll, clipul PARCAT)
Nu e un act nou în 3D: clipul rămâne la **6,25 s**, iar scroll-ul avansează prin cele
**8 elemente** cu contur de evidențiere. **Implementat în `web/src/scene/index.js` pe
2026-09-17** (`buildSteps()` / `applySteps()` / `clearSteps()`); mai există o variantă
mai veche în `tools/preview.html`, reparată 2026-09-14.

Trackul se împarte în 8 felii egale. În fiecare felie conturul **intră neted, stă aprins
pe mijloc și iese neted** (`GLOW.fade = 0.18` din felie la fiecare capăt, cu `smoothstep`),
iar schimbul de piesă se face exact acolo unde intensitatea e **0** — deci nu se vede.
Culoarea și forma conturului sunt copiate din `outro.html`: `#5cff9d`, intensitate 8.0,
grosime 2.0, împrăștiere 0.55. Detalii și drumul respins („Suprapunere piese 0.30"):
`THREEJS_HANDOFF.md` § „Conturul din actul de pași".

Ordinea nu e hardcodată, e derivată din pozițiile reale la finalul clipului, de sus în
jos. Măsurată la 1600×900, cu dreptunghiurile pe ecran:

| # | Nod în GLB | Poziție pe ecran (y) | Etichetă corectă |
|---|---|---|---|
| 1 | `key_cap.087` | deasupra cadrului | keycap |
| 2 | `Solid 208` | 305–352 | stem |
| 3 | `Solid 154` | 372–423 | **carcasă superioară** |
| 4 | `Pipe` | 443–477 | arc |
| 5 | `Solid 368` | 493–547 | lamelă de contact |
| 6 | `Solid 87` | 548–615 | **carcasă inferioară** |
| 7 | `Solid 193` | 616–671 | LED |
| 8 | `Solid 372` | 675–712 | pini de contact |

### ⚠️ Etichetele din `tools/preview.html` sunt GREȘITE — nu le copia în copy
Scena reală (`web/src/scene/index.js`) are deja etichetele CORECTE, cele din tabelul de
mai sus. Avertismentul rămâne pentru că uneltele n-au fost corectate.
`STEP_LABELS` din `tools/preview.html` spune `Solid 87` = „carcasă sus" și `Solid 154` =
„carcasă jos". **E invers.** Verificat prin două surse independente:

1. **Ordinea măsurată pe ecran** (tabelul de mai sus): `Solid 154` e mai sus decât
   `Solid 87`.
2. **`source/preloader/preloader_pieces.json`**, unde ordinea de jos în sus e
   `p3_bottom_housing` = `Solid 87` și `p6_top_housing` = `Solid 154` — deci invers
   față de `STEP_LABELS`.

Tot din aceeași comparație: `Solid 372` nu e „piesă albă", e **pinii de contact**; iar
`Solid 193` nu e „piesă translucidă", e **LED-ul**. `DESIGN_BRIEF` §4 semnalase deja
că etichetele sunt „posibil imprecise" — acum știm exact care și cum.

Etichetele din `preloader_pieces.json` sunt cele corecte. Notă: și acolo scrie că
`p1`/`p2` sunt „de confirmat", dar pe restul cele două surse se susțin reciproc.

**Textul info per pas** (`// 01. keycap — Doubleshot PBT...` din PDF) stă în DOM
(`web/src/ui/`), nu în scenă. Scena doar spune care pas e activ.

### Actul 3 — Outro / footer (scroll)
`web/public/models/keycap_outro_web.glb`, **1,77 MB**, clip de **9,46 s**.

Scroll → timp de clip, liniar. Câmpul de taste apasă continuu, generat în three.js pe
ceas propriu (nu din clip), deci merge la nesfârșit și după ce clipul s-a terminat.

Un singur eveniment nu vine din clip: **între p=0.38 și p=0.62 keycap-ul erou se
încrucișează spre look-ul de câmp** (`HERO_LAND`), ca la aterizare să fie indistinct de
vecini. Fereastra e legată de rotirea camerei, deci dacă se re-taie clipul sau se schimbă
lungimea segmentului, se re-verifică și ea. Detaliile și măsurătorile: `THREEJS_HANDOFF.md`
§ „Aterizarea keycap-ului erou în câmp".

---

## 3. Cusătura intro ↔ outro — partea care nu e evidentă

**Cadrul final al intro-ului și cadrul de start al outro-ului arată ACELAȘI obiect:**
coloana explodată. Ambele GLB-uri conțin aceleași 7 piese + keycap
(intro: copiii lui `SW_087`; outro: copiii lui `H_SW`, prefixați `H_`).

Iar dezvăluirea de scrim lasă intro-ul exact în starea „coloană explodată pe fundal
închis", care e **exact** deschiderea outro-ului.

**Tehnica implementată în `web/src/scene/index.js`** (finală, 2026-09-16): **cele 7 piese de switch
sunt același obiect în ambele acte** — aceeași geometrie, același material. Detaliul
(umbra coaptă în atlas) și culoarea sunt identice prin construcție, nu prin potrivire.

Se poate pentru că geometria e bit-identică în cele două GLB-uri: verificat la runtime cu
amprentă sensibilă la ordine, **pozițiile, normalele și buffer-ul de indici coincid** pe
toate cele 7 piese. Diferă doar stratul UV — fiecare export a scris drept `TEXCOORD_0`
UV-ul cerut de materialul lui. Deci hero-ul din outro primește geometria ȘI materialul
intro-ului.

Referința e look-ul **intro-ului**. Rămâne un singur lucru de compensat: schimbarea de
lumini la cusătură, prin `INTRO_MUL` (pe canal). Keycap-ul erou e singura piesă care nu se
poate partaja (mesh-uri diferite: `Plane.188` vs `Plane.087`) și se potrivește prin
măsurare. Camera și pozițiile coincid deja exact — aceeași cameră
`[-0.0332, 1.0627, 0.3874]` în ambele acte.

Rezultat: Δ luminanță sub 1.2 pe majoritatea pieselor la cusătură (arc +3.1, keycap −2.5),
fundal și câmp **0.0**, media pe tot cadrul **1.68** cu granulația cadrului la 1.5.

⚠️ **Trei variante anterioare, toate respinse, cu motivul măsurat:**
1. *Amestec pe primele 15% din trackul de outro.* Ceața outro-ului venea DUPĂ cusătură
   (se vedeau tastele pierzându-se în depărtare), câștigul pe B rămânea cel al
   intro-ului (scrim-ul cu 10% mai albastru), iar schimbarea switch-ului se întâmpla
   brusc, acolo.
2. *Amestec pe actul de pași.* Corect la capete, dar la jumătate interpolarea liniară a
   celor două seturi depășea cu +30 pe luminanță.
3. *Culori plate în outro + două seturi de compensare, câte unul per stare de lumină.*
   Numeric ieșea sub 1.4, dar piesele arătau **plate**, fără umbra coaptă.

Valorile și capcanele în `THREEJS_HANDOFF.md` §7bis.

---

## 4. Planul de încărcare

| Act | Payload | Când |
|---|---|---|
| Preloader | 152 KB | primul; acoperă descărcarea intro-ului |
| Intro | 8,8 MB | descărcat imediat, parsat după primul ciclu de preloader (~3 s) |
| Outro | 1,77 MB | lazy, la ~60–70% din trackul intro-ului |

Când outro-ul preia, **biroul se descarcă din memorie** (1,27M triunghiuri care nu mai
sunt necesari). Dispose pe geometrii + texturi, nu doar `visible = false`.

---

## 5. Contract DOM

Distinct de celelalte scene, ca să poată coexista pe aceeași pagină (aceeași regulă ca
`#cc-canvas` vs `#ccn-canvas`):

```html
<!-- o singură dată, în <head> sau înainte de tracks -->
<script>window.KEYCAP_ASSET_BASE = "https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/docs/keycap/";</script>

<!-- canvas-ul, într-o secțiune sticky care acoperă tot parcursul 3D -->
<div id="keycap-canvas"></div>

<!-- tracks: modulul își ia progresul din poziția LOR, nu din vh hardcodat -->
<section class="kc-track" data-kc-act="intro"></section>
<section class="kc-track" data-kc-act="steps" data-kc-steps="8"></section>
<section class="kc-track" data-kc-act="outro"></section>

<script type="module" src="...keycap.js"></script>
```

**Progresul se derivă din `getBoundingClientRect()` al fiecărui track**, nu din valori
`vh` scrise în cod. Așa poți re-regla lungimile din CSS fără să atingi modulul.

⚠️ Din `command-center-slider/CLAUDE.md`: ține secțiunile la **`100vh`, nu `100dvh`** —
`dvh` se schimbă când bara de URL a browserului se ascunde și mută intervalul sticky,
adică exact lucrul care sărea.

API minim propus inițial (pe vremea integrării în Webflow), păstrat ca referință:

```js
window.KEYCAP = {
  onStep: (i, key, label) => {},   // callback: ce pas e activ (0..7)
  onAct:  (name) => {},            // 'preloader' | 'intro' | 'steps' | 'outro'
  onProgress: (p) => {},           // 0..1 la încărcare
};
```

**Ce e deja implementat pentru pași** (asta e forma de folosit, `onStep` de mai sus e
doar propunerea inițială):

```js
addEventListener('keycap:step', e => {
  // e.detail = { index, total, key, label }
  // index: 0..7 cât timp actul de pași e activ, -1 în rest
  // key:   'key_cap' | 'Solid 208' | 'Solid 154' | 'Pipe' | 'Solid 368' |
  //        'Solid 87' | 'Solid 193' | 'Solid 372'
});
```

Se emite **la schimbarea pasului**, nu în fiecare cadru. În paralel, scena scrie
`document.body.dataset.step` = `"1"`..`"8"` (gol în afara actului), deci se poate lega și
pur din CSS: `body[data-step="3"] .kc-info-3 { opacity: 1 }`.

⚠️ **Textul rămâne în DOM**, în `web/src/ui/`. Scena spune doar CARE pas e activ — nu
conține niciun șir de copy.

**Al doilea eveniment, `keycap:act`** (adăugat 2026-09-18, pentru nav și blocul de info):

```js
addEventListener('keycap:act', e => {
  // e.detail.name = 'intro' | 'steps' | 'outro'
});
```

⚠️ Se emite și din cadrul de încălzire de sub preloader (`warmFrame` pune `curAct = null`
înainte), deci poate veni O DATĂ în plus înainte de reveal. Pentru text nu deranjează,
dar nu-l folosi ca „userul a ajuns în actul X".

**Al treilea și al patrulea, plus unul în sens invers** (adăugate 2026-09-22):
`keycap:ready`, `keycap:progress` și `keycap:herodone` — vezi §5ter.

---

## 5bis. Tipografie și scara de dimensiuni (2026-09-18)

| | familie | greutate | mărime | line-height | letter-spacing | culoare |
|---|---|---|---|---|---|---|
| h1 | Familjen Grotesk | 400 | **70px** | 90% | −0.06em | alb |
| h1, cuvânt între `[ ]` | " | 400 | **64px** | " | " | " |
| h2 | " | 400 | **60px** | " | " | " |
| h2, cuvânt între `[ ]` | " | 400 | **54px** | " | " | " |
| paragraf | Martian Mono | 400 | **12px** | 150% | 0 | alb 40% |
| info din nav | Martian Mono | 300 | **10px** | 113% | −0.01em | alb, majuscule |

Se folosesc **doar h1 și h2**.

⚠️ **Parantezele drepte rămân la mărimea titlului**, doar cuvântul dintre ele se
micșorează. De aceea `<b>` înfășoară DOAR cuvântul, iar `[` și `]` stau în afara lui:
`<h1>The smallest<br>[ <b>machine</b> ] you own</h1>`.

⚠️ **SCARA.** Toate mărimile din machetă sunt la o lățime de referință de **1720 px** și
se scriu cu formula cerută de user:

```css
clamp( Npx, N/1720*100vw, N/1720*100vw )     /* 1 px de machetă = 0.0581395vw */
```

Preferata și maximul sunt EGALE, deci e echivalentă cu `max(Npx, N·0.0581395vw)`: sub
1720 px textul rămâne fix la N px, peste 1720 crește cu ecranul. **Nu o simplifica la un
simplu `vw`** — ai pierde pragul de jos și pe un laptop de 1440 totul s-ar micșora.
Verificat la 1440: h1 rămâne 70px, logo 70px, h1 la 115px de margine.

⚠️ **Fonturile sunt SELF-HOSTED din npm** (`@fontsource/familjen-grotesk`,
`@fontsource/martian-mono`), nu de pe `fonts.googleapis.com` — aceeași regulă ca pentru
three, lenis și Draco. Se importă doar subsetul latin și doar greutățile folosite
(400 display, 300 + 400 mono); fiecare `@import` în plus e un woff2 chiar descărcat.

---

⚠️ **Nu scrie un al doilea observator de scroll în `ui/`.** Scena e deja singura sursă de
adevăr și rulează `updateScroll()` în fiecare cadru din bucla de randare. Dacă ai nevoie
și de alte momente (intrarea într-un act, progres continuu), cere-le scenei ca evenimente
noi, în același stil.

Lungimi de track propuse ca punct de plecare: intro **600vh**, pași **800vh**
(8 × 100vh), outro **500vh**. De reglat pe simțite.

---

## 5ter. Intrarea în pagină și animația titlului (2026-09-22)

### Ordinea, cerută de user

```
preloader  →  blurul scenei se limpezește  →  DOM-ul apare  →  titlul se focalizează
                                                                        ↓
                                                        de-abia acum se poate derula
```

Până la `html.is-ready` **nu se vede niciun element de DOM**. Regula stă în DOUĂ locuri,
și amândouă sunt necesare:

| loc | de ce |
|---|---|
| `<style>` inline în `<head>`: `#content { opacity: 0 }` | în dev, tot CSS-ul e importat din `main.js`, deci între parsarea HTML-ului și execuția modulului pagina se randa NESTILIZATĂ |
| `sections.css`: `#content { opacity: 0 }` + `html.is-ready #content { opacity: 1 }` | comutarea propriu-zisă |

⚠️ **Măsurat, cu control.** `Page.startScreencast` (nu `captureScreenshot`, care sare
peste tranzitorii scurte), numărând pixelii cu luminanță peste 100 în colțul stânga-sus,
unde cădea DOM-ul nestilizat: **fără regula inline 16.936 pixeli la t = 0,10 s; cu ea, 0
pe toate cadrele de dinainte de preloader.** Controlul a fost rulat scoțând regula, ca să
se vadă că testul chiar prinde flash-ul.

### Cele patru evenimente ale scenei + unul înapoi

```js
addEventListener('keycap:ready', () => {});          // preloaderul ȘI blurul au trecut
addEventListener('keycap:progress', e => {});        // { name, p } — unde ești în act
dispatchEvent(new CustomEvent('keycap:herodone'));   // DOM → scenă: deblochează scroll-ul
dispatchEvent(new CustomEvent('keycap:modal', { detail: { open } }));  // DOM → scenă: About, oprește/pornește Lenis (§5quinquies)
```

⚠️ **Scroll-ul nu se mai deblochează în `updateReveal`.** Scena pune `is-ready`, trimite
`keycap:ready` și AȘTEAPTĂ `keycap:herodone`. Plasa e un `setTimeout` de **5 s**
(`HERO_GATE_MS`): dacă DOM-ul crapă, pagina se deblochează oricum în loc să rămână
înțepenită. Intrarea titlului durează ~2,0 s măsurat, deci plasa nu intră normal în joc.

⚠️ `keycap:progress` pleacă din `updateScroll`, adică din singurul loc care citește
trackul — regula „nu scrie un al doilea observator de scroll" rămâne valabilă. Are prag
de `2e-4` (sub un pixel de scroll pe trackul de intro), altfel ar pleca un eveniment pe
cadru și când pagina stă pe loc, pentru că `updateScroll` e chemat din buclă, nu din
`scroll`.

### Titlul, literă cu literă

`ui/index.js` sparge `h1[data-split]` în câte un `<span class="ch">` pe literă (spațiile
rămân noduri de text, `<b>` și `<br>` rămân la locul lor) și le scrie `opacity`, `filter:
blur()` și `translateY` din JS.

**De ce blur:** e același vocabular ca reveal-ul scenei (30 px de blur pe canvas care se
limpezesc) și ca bara de scanner de pe scrim. Și e literal ce arată machetele: în ambele
PDF-uri titlul are litere neclare („s-ma" din *smallest*, „mac-h" din *machine*) — nu e o
greșeală de Figma, e un cadru din animația de focalizare. Întrebarea rămasă deschisă în
sesiunea de pe 2026-09-18 se închide aici.

**De ce tot în JS și nu în `@keyframes`:** ieșirea e legată de scroll, deci se calculează
oricum pe valori. În două limbaje, cele două n-ar mai fi fost reversul una alteia — iar
cerința spune explicit că la scroll înapoi titlul trebuie să se întoarcă pe același drum.
⚠️ Și motivul care decide: o animație CSS cu `fill: forwards` **bate stilul inline** în
cascadă, deci ieșirea scrisă din JS n-ar fi avut niciun efect peste o intrare din CSS.

| valoare | ce face | unde |
|---|---|---|
| `hold` 140 ms | pauză după `is-ready` | `HERO` în `ui/index.js` |
| `dur` 760 ms | cât ține o literă | " |
| `stagger` 34 ms | decalaj între litere, în ordinea citirii | " |
| `jitter` 220 ms | **cât din pornire e la întâmplare** | " |
| `blurIn` 14 px / `dyIn` 0.18em | de unde pleacă o literă | " |
| `outTo` 0.08 | pe cât din trackul de intro pleacă titlul (≈40vh) | " |
| `outWin` 0.55 | cât din fereastră ocupă o literă | " |
| `blurOut` 16 px / `dyOut` −0.34em / `lift` 70 px | ieșirea, în sus | " |

⚠️ **`jitter` e valoarea care face efectul.** Fără el frontul e o linie dreaptă care
mătură titlul și se citește ca o mașină de scris. Cu el, la orice cadru sunt litere clare
lângă litere încă neclare — măsurat la mijlocul intrării: **16 clare, 10 în focalizare**.
⚠️ Partea aleatoare e un hash pe indice, nu `Math.random()`: la fiecare reîncărcare
trebuie să iasă ACELAȘI tipar, altfel nu se poate măsura de două ori la fel.
⚠️ Opacitatea ajunge la 1 mai devreme decât blurul (`s/0.6`): litera se vede încă neclară
și apoi se focalizează. Dacă merg împreună, efectul se citește ca un simplu fade.

Ieșirea e **reversibilă prin construcție**, pentru că nu ține stare proprie: e o funcție
de `p`. Măsurat, dus-întors: scroll 0 → `q` 0.000 (toate clare), 90 px → 0.250, 180 px →
0.500, 360 px → 1.000 (toate plecate), înapoi la 0 → 0.000, toate clare.

Puntea de reglaj e `window.__ui` (doar cu `?dbg=1`): `HERO`, `setOut(q)`, `replay()`,
`state()`. ⚠️ `replay()` recalculează pornirile din `HERO`, deci o valoare schimbată din
consolă chiar se vede — aceeași capcană ca `setInk` din `__dbg`.

### Nav: pătratul de „info"

16,47 × 16 px de machetă, colț 3,5, contur 0,5 px alb 20%, „i"-ul e SVG (nu o literă de
font), spațiere ABOUT ↔ pătrat 5 px și S.001 ↔ ABOUT 16 px — toate pe scara de clamp.
⚠️ Conturul de 0,5 px se raportează `1px` în `getComputedStyle`: Chrome rotunjește
lățimea de bordură la cel puțin un pixel de dispozitiv. Pe ecran cu DPR ≥ 2 iese firul
subțire din machetă, pe DPR 1 iese un pixel plin. Nu e ceva de „reparat" din CSS —
valoarea declarată rămâne cea din machetă.

⚠️ **Lățimile maxime se scriu tot cu clamp.** `.hero` avea `max-width: min(64ch, 70vw)`,
iar `ch` se calculează pe fontul ELEMENTULUI care poartă regula — `.hero`, cu 16 px
moșteniți, nu cei 70 px ai titlului. Ieșea **512 px fix la orice lățime**, în timp ce
titlul crește cu vw peste 1720: măsurat la 2560 px, linia lungă cere 738 px și titlul
intra pe **trei** rânduri în loc de două. Acum `--hero-max: clamp(560px, 32.55814vw,
32.55814vw)`, adică 64 px peste linia cea mai lată (496 px la 1720, măsurat).

---

### Bara de scroll: există de la primul cadru (2026-09-22)

Blocarea scroll-ului **nu** se mai face cu `overflow: hidden`. Aceea ștergea bara, iar
reapariția ei la deblocare îngusta zona utilă cu lățimea barei — **măsurat 1440 → 1425,
salt de 15 px pe tot layoutul**, exact în clipa în care se termina animația de intrare.

| variantă încercată | lățime utilă blocat | verdict |
|---|---|---|
| `body.locked { overflow: hidden }` | 1440 | sare |
| `html { overflow: hidden }` + `scrollbar-gutter: stable` | 1440 | sare |
| `html { overflow-y: hidden }` + gutter | 1440 | sare |
| **`html { overflow-y: scroll }` + blocare prin ascunderea `#track`** | **1425** | **ține** |

⚠️ **`scrollbar-gutter: stable` nu rezolvă problema**, deși e exact unealta care pare
potrivită și deși proprietatea calculată chiar e `stable`. Chrome o onorează numai când
elementul are efectiv bară: cu `overflow: hidden` sau cu document scurt, culoarul nu se
rezervă. De aceea regula e `overflow-y: scroll`, care desenează banda în toate stările.

Blocarea propriu-zisă: `body.locked #track { display: none }`. `#track` e singurul lucru
care dă înălțime paginii (tot restul e `position: fixed`), deci fără el documentul are
exact înălțimea ferestrei. Verificat: `scrollTo(0, 500)` lasă `scrollY` pe 0.

⚠️ Două consecințe de reținut:
- `updateScroll` se oprește acum pe **`unlocked`, nu pe `revealDone`**. Cele două nu mai
  coincid (scena e limpede cu ~2 s înainte de deblocare, cât intră titlul), iar în
  intervalul ăla `#track` e ascuns → `getBoundingClientRect()` întoarce zerouri și
  `segProgress` returnează 1. E fix capcana din 2026-09-18, în altă haină.
- La deblocare se cheamă `lenis.resize()`: trackul tocmai a reapărut, iar Lenis își
  reîmprospătează dimensiunile printr-un ResizeObserver, adică asincron.
- `.lenis.lenis-stopped { overflow: hidden }` din documentația Lenis a fost **scoasă** —
  ar fi tăiat bara exact în intervalul în care o vrem prezentă.

### Textul nu se mai „limpezește" la finalul animației

Chrome desenează textul obișnuit cu antialiasing pe subpixeli, dar mută elementul pe strat
propriu de compozitare — și trece pe tonuri de gri — în clipa în care primește `filter`,
`opacity < 1` sau o transformare. Se citește ca „literele sunt ușor blurate cât ține
animația și devin clare după".

Trei lucruri, toate necesare:
1. `-webkit-font-smoothing: antialiased` pe `body`: cele două stări devin identice.
   **Măsurat: diferență maximă 0 pe canal între titlul așezat și titlul în stare
   compozitată, 0 pixeli diferiți din 89.600.**
2. `.hero` **nu mai e centrată cu `top: 50%` + `translateY(-50%)`**. Procentul se
   raportează la înălțimea blocului; la 253 px iese o deplasare de o JUMĂTATE de pixel,
   adică titlul stătea permanent pe subpixel, fără nicio animație. Acum e grilă cu
   `align-content: center`, iar `max-width` a trecut pe `h1`.
3. `will-change` a fost **scos** de pe litere. Promovarea pe strat e exact ce produce
   efectul; 26 de litere nu au nevoie de ea.

### Temporizare: fără timp mort între scenă și DOM

`keycap:ready` nu mai pleacă la capătul fazei de blur, ci la **`READY_AT = 0.42`** din ea
(`easeOutQuart` a consumat deja 88,7% din cei 30 px). Decalajele din CSS au scăzut la
0 / 200 / 300 ms (erau 60 / 620 / 760), iar `HERO.hold` la 40 ms.

⚠️ **Măsurat cu blurul întins la 20 s din `__dbg.reveal.blurMs`** — în headless cei 900 ms
reali se consumă într-un singur cadru și nu se poate vedea suprapunerea. În clipa în care
pornește DOM-ul, canvas-ul mai are **blur(2.33px)** din 30; o secundă și jumătate mai
târziu blurul e încă la 1.39 px, iar 13 din 26 de litere sunt deja clare. Deci cele două
chiar se suprapun.

### Liniuțele din nav: 2 × 5.32 px, fixate pe grila ecranului (2026-09-22)

Reclamația era „sunt de dimensiuni diferite", deși în CSS au aceeași valoare. Două cauze,
descoperite una după alta, pentru că **prima metrică era oarbă**:

**1. Lățimea de 1 px.** Măsurat pe vârf: la 100/150/200% toate identice, la 125% între
84.8 și 109.1 (raport 1.29). La **2 px** vârful devine 121.3 peste tot. Înălțimea e
**5.32 px**, lungimea trasăturii din Figma (acolo lățimea e 0, fiind un `stroke`).

**2. Faza pe grila ecranului.** Cu vârful egalizat, liniuțele TOT ieșeau diferite — pentru
că vârful nu vede LĂȚIMEA APARENTĂ. Măsurat dreptunghiul fiecăreia: la 100%, 150% și 200%
toate identice; la **110%, 125%, 137.5% și 175%** lățimea sare între 3 și 4 pixeli de
ecran. Cauza: 2 px CSS × 1,25 = 2,5 pixeli de ecran, iar pasul de 21 px × 1,25 = 26,25 —
deci fiecare liniuță pornește la altă fază și se rotunjește altfel.

`snapTicks()` din `ui/index.js` duce pe grila ecranului **trei** lucruri: lățimea, pasul
(altfel liniuțele dintr-un grup au faze diferite) și originea fiecărui grup (altfel cele
două grupuri diferă între ele). Măsurat pe geometrie:

| DPR | fără fixare | cu fixare |
|---|---|---|
| 1.1 | fază împrăștiată pe **0.897 px**, lățime 2.20 | **0.039 px**, lățime **1.99** |
| 1.25 | **0.617 px**, lățime 2.50 | **0.059 px**, lățime **2.99** |
| 1.375 | **0.871 px**, lățime 2.75 | **0.129 px**, lățime **2.99** |
| 1.75 | **0.664 px**, lățime 3.50 | **0.055 px**, lățime **3.99** |

Restul de sub 0,13 px e cuantizarea internă a layoutului (1/64 px). La scalări ÎNTREGI
funcția nu rulează deloc — acolo măsurătoarea arată deja perfecțiune.

⚠️ **Asta e singura bucată din sesiune verificată pe GEOMETRIE, nu pe pixeli.** Chrome
headless nu randează nativ la scalări fracționare: randează la 1.0 și mărește. Se vede pe
înălțimea liniuței — 6 pixeli la DPR 1, apoi 8 la DPR 1.25, adică 6 × 1,25, nu
5,32 × 1,25 = 6,65 → 7. Deci harness-ul nu poate reproduce cazul, iar ce s-a putut măsura
e ce INTRĂ în rasterizare: lățime întreagă și fază identică pentru toate zece.

⚠️ `snapTicks()` se recheamă și la finalul unui scramble: textul din mijloc își poate
schimba lățimea, iar `.nav__mid` e așezat de `space-between`, deci grupurile se mută.

⚠️ **Corecția de poziție se face din MARGINI, nu din `transform`.** Un `translateX`
fracționar mută grupul pe strat de compozitare, unde browserul nu mai aliniază nimic:
măsurat, acolo liniuța se întindea pe 2 pixeli cu vârf 55–65 în loc de 80.9. `margin-right`
primește minusul, ca lățimea grupului să nu se schimbe.

⚠️ **Nu s-a mers pe SVG**, deși asta fusese propunerea. Măsurat, un SVG (per liniuță sau
unul pe grup) dă vârfuri între 17.6 și 56.9 — raport 2.99 ȘI de trei ori mai palid: o
trasătură de 0,5 px într-o cutie de 1 px pune jumătate din cerneală.

⚠️ **Și metrica a contat, de două ori.** Cerneala TOTALĂ e conservată în toate variantele
(raport 1,00) — pe integrală problema nu exista deloc. Vârful a prins prima cauză, dar nu
și a doua; abia dreptunghiul complet le-a arătat pe amândouă.

### Nav-ul se centrează pe COLOANA 3D, nu pe ecran (2026-09-23)

Cerința: „INFO SWITCH" trebuie să cadă exact peste piesele switch-ului, indiferent că
nav-ul e `space-between` și centrul lui depinde de lungimea logo-ului și a blocului din
dreapta. Măsurat, textul era cu **28,7–40,4 px** la stânga coloanei, în funcție de lățime.

⚠️ **Coloana NU e în centrul ecranului.** Măsurat pe dreptunghiul ei de pe ecran (cele 8
colțuri ale cutiei fiecărei piese, proiectate), centrul cade la
**`centrul ecranului + 0.0041 × înălțimea ferestrei`**: +2,46 px la 600, +3,69 la 900,
+4,92 la 1200, +5,90 la 1440. Proporția e cu ÎNĂLȚIMEA, nu cu lățimea, pentru că e o
cameră cu FOV vertical — deci valoarea nu se poate scrie în CSS nici ca procent, nici ca
`vw`. Scena o calculează și o trimite ca **`keycap:anchor` `{ x }`**, la încărcare și la
redimensionare (nu depinde de scroll: coloana nu se mișcă pe orizontală).

| | fără corecție | cu corecție |
|---|---|---|
| 1440×900 | −29,44 px | −0,79 |
| 1920×1080 | −32,11 px | +0,07 |
| 1280×720 | −28,70 px | +0,30 |
| 2560×1440 | −40,36 px | −0,36 |
| 1600×900 | −29,44 px | −0,44 |

Restul de sub un pixel e rotunjirea deliberată a deplasării la întreg — liniuțele trebuie
să rămână pe pixeli (vezi `snapTicks`), iar centrarea perfectă nu merită o liniuță moale.

⚠️ Cutia coloanei se reține la clipul **PARCAT**, în `buildSteps()`: piesele se mișcă în
timpul clipului, iar ancora trebuie să fie un loc fix, nu unul care aleargă după animație.
⚠️ Se proiectează **cele 8 colțuri**, nu centrul cutiei: la o cameră în perspectivă, pentru
un obiect care nu e pe axă, cele două nu coincid — și contează silueta, adică ce se vede.
⚠️ Se folosește **`blenderCam` explicit**. La primul apel (`is-ready`) pass-ul poate avea
încă `cam`, camera provizorie de dinainte de GLB, cu alt FOV: ancora ieșea cu 3,4 px pe
lângă până la prima redimensionare. `outroCam` ar fi mers la fel de bine — măsurat, ambele
încadrează coloana identic (centru 723,7 la 1440×900), deci ancora nu sare la cusătură.
⚠️ Deplasarea se face din **margini** (`margin-left: dx` / `margin-right: -dx`), nu din
`transform` și nu trecând blocul pe `position: absolute`: lățimea totală rămâne aceeași,
deci spațiul împărțit de `space-between` nu se schimbă și nimic altceva nu se mișcă. Un
`transform` fracționar ar fi mutat blocul pe strat de compozitare, unde textul se desenează
mai moale — aceeași capcană ca la liniuțe.
⚠️ Se recalculează și la finalul unui **scramble**: textul din mijloc își poate schimba
lățimea.

### Compatibilitate: bara de scroll pe alte browsere (2026-09-23)

Mecanismul (`html { overflow-y: scroll }` + blocare prin ascunderea lui `#track`) e CSS
standard, fără nimic specific unui motor. Ce înseamnă pe fiecare:

| browser | bară | ce se întâmplă |
|---|---|---|
| Chrome / Edge (Windows) | clasică, ocupă loc | `overflow-y: scroll` rezervă din primul cadru — confirmat de user |
| Firefox (Windows) | clasică | la fel; confirmat de user că e bine |
| Firefox / Safari (macOS), implicit | **overlay**, nu ocupă loc | problema NU EXISTĂ: nu se rezervă nimic și nu are ce să sară |
| Safari cu „Always show scroll bars" | clasică | se comportă ca pe Chrome, aceeași regulă rezolvă |

⚠️ **Nu s-a adăugat nicio bară custom** — cerința userului a fost explicită, și ar fi fost
și greșită: pe macOS ar fi introdus o problemă care acolo nu există.
⚠️ **Safari nu a putut fi testat** (mașina e Windows). Ce s-a făcut în schimb: s-au căutat
și eliminat două lucruri care chiar ar fi crăpat acolo, amândouă nelegate de bară —
vezi mai jos.

**`matchMedia(...).addEventListener` nu există în Safari sub 14**, doar `addListener`.
Apelul arunca `TypeError`, iar într-un modul asta nu e o eroare locală: **evaluarea
modulului se oprește**, deci nu s-ar mai fi înregistrat nici ascultătorul de
`keycap:ready` — titlul nu ar mai fi intrat niciodată, iar scroll-ul s-ar fi deblocat abia
de ceasul de siguranță de 5 s. Acum sunt tratate ambele forme, iar `snapAll()` se cheamă
la CAPĂTUL modulului, după toate înregistrările de ascultători: contractul cu scena se
leagă primul, măsurătorile de pixeli vin după.

**`color-mix()` are nevoie de Safari 16.2+**, iar acolo o declarație cu el nu „degradează":
se aruncă toată regula. Poarta de mobil ar fi rămas fără imaginea de fundal. Înlocuit cu
tokenul `--c-bg-55`, ținut manual în acord cu `--c-bg` (ca `--c-bg` cu `BG` din scenă).

### Hover-uri (2026-09-23)

| element | ce se schimbă |
|---|---|
| semnătura din stânga-jos | alb 40% → alb plin, **400 ms easeOutQuart**, plus scramble pe text (doar în footer, unde chiar e link) |
| ABOUT din nav | pătratul de „info" trece la alb plin (contur + „i"), 400 ms easeOutQuart, iar textul „ABOUT" își face scramble |

Curba e `--ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1)` — aceeași cu `easeOutQuart`
din scenă, scrisă în limbajul CSS.

⚠️ **Regula de hover pe link are nevoie de `#content` în selector.** Culoarea de bază a
link-urilor vine din `#content a { color: inherit }`, adică un selector cu ID
(specificitate 1-0-1), iar `.foot__scroll a:hover` (0-2-1) nu-l poate bate: hover-ul pur și
simplu nu se vedea. Măsurat, cu `matches(':hover')` adevărat și cadre forțate, culoarea
rămânea `rgba(255,255,255,0.4)` la toate cele șase eșantioane.
⚠️ Tranziția stă pe starea de REPAUS, nu pe `:hover`: altfel s-ar anima doar la intrare,
iar la ieșirea cursorului ar pocni înapoi.
⚠️ Ascultătorul de scramble stă pe LINK, nu pe textul dinăuntru: `mouseenter` pe span s-ar
declanșa din nou când cursorul trece de pe pătrat pe litere, deci de două ori pe o singură
intrare cu mouse-ul.

### Fontul paragrafului din footer

**NimbusSanL**, cerut de user și primit ca fișier (nu există pe npm: `nimbus-sans`,
`@fontsource/nimbus-sans`, `urw-base35` — toate 404). Stă în
`web/src/assets/fonts/NimbusSanL-Regu.woff2`, **42 KB**, declarat cu `@font-face` în
`fonts.css`. Regula rămâne aceeași ca pentru celelalte: livrat de pe domeniul nostru,
nimic de pe CDN. Verificat: `Nimbus Sans L loaded`, paragraful pe patru rânduri.
⚠️ `font-display: swap`, iar lista de rezervă (`Helvetica, Arial`) e METRIC-COMPATIBILĂ —
Nimbus Sans L e o variantă de Helvetica — deci până se încarcă fontul, textul are aceeași
lățime și cele patru rânduri rămân patru.

### Ou de Paște: ATWWW pe cinci taste (2026-09-23)

Cinci taste din câmpul de outro scriu **ATWWW**, pe rândul din dreapta-sus (`K+09+02` …
`K+13+02`). Alese pe NUME, nu pe poziție de ecran: numele nu se schimbă la redimensionare.

Mecanismul e trivial — **legenda unei taste ESTE geometria ei**, iar `geomByLegend` ține
maparea, deci schimbarea literei înseamnă doar altă geometrie, fără cost (tastele intră în
grupurile de instanțe ale literelor respective; numărul de `InstancedMesh` rămâne 86).

⚠️ **Partea grea a fost să afli ce legendă e ce literă.** Numele nu spune (`key_cap.082` nu
înseamnă „W"), iar UV-urile MINT: legenda nu e desenată în cutia UV a feței de sus a
capacului, așa că orice decupaj din atlas după poziția aia dă litera VECINĂ. Două drumuri
care par bune și nu sunt:
- decupat din atlas după cutia UV → a dat 042 = „A", dar randat iese **Z**;
- dedus din numerotare → a dat A = 093, dar randat iese **page down**.

Singurul lucru care spune adevărul e **randarea**. S-a aflat punând pe cele cinci taste
câte cinci legende consecutive și citind ce scrie pe ele:

| legendă | literă | legendă | literă |
|---|---|---|---|
| 040 | Q | 090 | P |
| **041** | **A** | 091 | [ |
| 043 | ⌘ | 092 | ] |
| **082** | **W** | 093 | page down |
| 083 | E | 094 | S |
| 084 | R | 095 | D |
| **085** | **T** | 096 | F |
| 088 | I · 089 = O | 097 | G |

⚠️ **Numerotarea NU e continuă pe rânduri**: A stă la 041, lângă Q, nu lângă S.
⚠️ **Rândul e +02, nu +03.** Proiecția originii unei taste cade cu ~20 px sub litera ei,
deci după proiecție păreau potrivite cele de pe +03 — dar raza trasă exact prin literele
încercuite de user a nimerit `K+09+02`…`K+13+02`. Cele de pe +03 sunt ACOPERITE de ele, și
de aia primele încercări nu se vedeau deloc.
⚠️ Unealta care a rezolvat totul e **raycast-ul prin pixelul de pe ecran**: întrebi scena ce
tastă e sub un punct și primești numele ei. Orice altă metodă (proiecție, decupaj din
atlas, numerotare) a dat răspunsuri plauzibile și greșite.

---

### Mobil: nu se încarcă NIMIC din experiență (2026-09-22)

Sub 992 px, `main.js` nu mai importă nici scena, nici `ui/` — importurile sunt dinamice.
Măsurat pe 390 px: **7 cereri de rețea în total, niciuna de three, GLB sau Draco**, față de
toată încărcarea de dinainte (preloader pornit, 8,8 MB de intro descărcați ca să fie apoi
blurați). `#main`, `#pl`, `#track`, `#content` și `#dbg` sunt ascunse din media query —
înainte mesajul stătea peste nav și peste titlu, care se citeau prin el.

Fundalul e un **cadru static al scenei, cu blurul copt în fișier**:
`web/public/gate-bg.webp`, 640 px lățime, **4,9 KB**. E generat din scena reală (primul
cadru al intro-ului, p = 0, fără DOM), micșorat și blurat într-un `<canvas>` — scriptul e
`gatebg.py` din scratchpad. ⚠️ Blurul e copt, nu pus din CSS: pe telefon un `filter:
blur(18px)` pe toată fereastra e exact lucrul pe care nu vrei să-l plătești.
⚠️ Dacă se schimbă cadrul de start al scenei, imaginea trebuie regenerată — nu se
actualizează singură.

---

## 5quater. Copy-ul și HUD-ul dinamic (2026-09-23)

Sursa: brieful userului „SUBKEY — Copy + HUD dinamic". Tot textul stă în `web/src/ui/index.js`,
în trei obiecte — `HERO_TXT`, `PARTS`, `FOOT_TXT` — și nicăieri altundeva.

### ⚠️ Presupunerea §0 din brief NU s-a confirmat pe de-a-ntregul

Briefu-l presupunea ordinea *Keycap → Stem → Top housing → Spring → Contact leaves →
Bottom housing → Pins → PCB*. Ordinea REALĂ, citită din pozițiile pieselor la clipul
parcat (§2), e alta la capăt:

| # | nod în GLB | piesa reală | textul mapat |
|---|---|---|---|
| 1 | `key_cap` | keycap | PART 01/08 — KEYCAP |
| 2 | `Solid 208` | stem | PART 02/08 — STEM |
| 3 | `Solid 154` | carcasă superioară | PART 03/08 — TOP HOUSING |
| 4 | `Pipe` | arc | PART 04/08 — SPRING |
| 5 | `Solid 368` | lamelă de contact | PART 05/08 — CONTACT LEAVES |
| 6 | `Solid 87` | carcasă inferioară | PART 06/08 — BOTTOM HOUSING |
| 7 | `Solid 193` | **LED** | PART 07/08 — LED |
| 8 | `Solid 372` | pini de contact | PART 08/08 — PINS |

Deci: primele șase se potrivesc cap la cap. Pe poziția 7 e un **LED**, iar **PCB-ul din
brief nu există în scenă**. Ce s-a făcut:
- textul „07 — Pins" din brief a mers pe piesa 8, care chiar sunt pinii;
- pentru LED textele sunt scrise de mine, în aceeași voce — **de confirmat**;
- textul „08 — PCB" din brief a rămas nefolosit.

Maparea se face pe `key` (nodul din GLB), nu pe index, exact cum cere briefu-l. Verificat
automat: toate opt se potrivesc pe cheie.

### HUD-ul din colț — patru linii SEPARATE

⚠️ Nu mai e un singur text cu newline-uri. Linia 3 (`ALT … | SPEED …`) se schimbă în
fiecare cadru, deci ar fi intrat în cearta cu efectul de scramble. Acum:
`[data-hud="l1"]`, `l2`, `l4` se amestecă la schimbarea secțiunii; linia 3 are două
`<span>`-uri scrise direct, cu `font-variant-numeric: tabular-nums`.

⚠️ **COORDONATELE AU IEȘIT din toate secțiunile** (2026-09-23, cererea userului: „nu au
sens"). Linia a doua spune acum la ce strat te uiți și ce rol are: `LAYER 03/08 — SHELL`.
Numerotarea 01..08 s-a mutat AICI, fiindcă din nav a fost scoasă — acolo rămâne doar
numele piesei (`TOP HOUSING`, nu `PART 03/08 — TOP HOUSING`). Hero: `TARGET: MECHANICAL
SWITCH`; footer: `TARGET: RESOLVED`. **Textele astea sunt scrise de mine, nu din brief.**

⚠️ **Starea de pornire se scrie DIN CONFIG**, la încărcarea modulului, nu se lasă pe seama
textului din HTML. Altfel cele două se depărtează — și chiar s-au depărtat: după ce
coordonatele au fost scoase din config, în pagină rămăsese linia veche
(`COORD: [37.4412 N / …]`) și se vedea la FIECARE intrare pe site, până termina
preloaderul. Textul din HTML rămâne, dar doar ca stare inițială dacă JS-ul nu pornește.

**ALT** = 1250 × (1 − progresul pe toată pagina). **SPEED** = viteza lui Lenis ×
`HUD.speedFactor`, netezită cu `speed += (target − speed) × 0.15`.
⚠️ Nici progresul, nici viteza nu se citesc în DOM: vin din scenă, pe `keycap:progress`,
care duce și `total` și `v`. Evenimentul se emite și când se schimbă DOAR viteza — altfel,
când pagina stă pe loc, SPEED ar rămâne înghețat pe ultima valoare.
⚠️ Ținta se stinge singură dacă nu mai vine niciun eveniment 120 ms: la decelerare,
ultimele variații sunt sub pragul de emisie.
⚠️ **`speedFactor` NU e calibrat pe măsurători.** În headless cadrele sunt rarefiate, deci
`lenis.velocity` raportează chiar delta rotiței (100 / 300 / 900 px). A rămas 3, cât
propune briefu-l; e în `__ui.HUD.speedFactor`.

### Heading-ul pieselor: UNUL singur, DECLANȘAT de evidențiere

⚠️ **Animația e declanșată de schimbarea piesei, nu condusă de scroll.** O variantă
intermediară lega claritatea literelor direct de plicul conturului (`glow`): sincronizarea
era perfectă pe hârtie, dar la o derulare de viteză normală plicul face tot drumul
0 → 1 → 0 în câteva zeci de milisecunde — deci **nu se vedea nicio animație**, titlul doar
clipea. Acum `keycap:step` (exact momentul în care sare conturul) pornește o animație cu
durata ei, identică oricât de repede ai derula. Verificat cu un salt INSTANT de la o piesă
la alta: la +0,22 s textul vechi e încă clar, la +0,44 s e ieșit din focus, la +0,66 s s-a
schimbat (tot titlul stins), apoi literele intră progresiv — 6 → 15 → 28 → 30 — până la
+1,78 s. Un scroll instantaneu, o animație completă.

Forma: literele ies din focus **toate odată** și repede (240 ms), textul se schimbă exact
acolo — invizibil — apoi intră literă cu literă, ca titlul din hero (620 ms).
⚠️ **Ieșirea NU e decalată pe litere, deși intrarea e.** Cu decalaj, în momentul schimbului
unele litere erau încă vizibile și schimbul se citea ca un salt de text. Singura clipă în
care textul se poate schimba e cea în care TOT titlul e stins.
⚠️ **Și nu sunt două straturi suprapuse**, ca într-o variantă anterioară: acolo, la mijlocul
trecerii, două texte diferite stăteau unul peste altul la jumătate de opacitate și se citea
ca un glitch — raportat de user.
⚠️ La ieșirea din act titlul se stinge cu ACEEAȘI animație, nu dispare instantaneu.

Poziția rămâne legată de scroll — ea trebuie să urmeze piesa în fiecare cadru — și e
continuă, interpolată între dreptunghiurile celor opt piese: măsurat, `top` coboară monoton
120 → 208 → 362 → 496 → 625 → 671 px.
⚠️ **`.part` are nevoie de `right: 0`.** Copiii sunt absoluți, deci blocul nu-și ia lățimea
din ei: fără el rămâne LAT DE ZERO, iar `h2`-ul se rupe la fiecare cuvânt — măsurat,
înălțimi de 217/379/433 px în loc de 109, de unde titlul sărea în loc să coboare.
⚠️ **Titlul stă într-o bandă sigură** (`PART_SAFE`): prima piesă e sus de tot, parțial peste
marginea cadrului, iar fără limită titlul ieșea la `top = −42`.
⚠️ **Dreptunghiurile se măsoară DOAR din actul de pași**, unde clipul e parcat. Reținute în
`buildSteps`, ieșeau greșite: toate opt între y 405 și 492 în loc de 174–794.

### Footer

`#outro`: titlul **„It all ends with a [ sound ]"** (cel din Figma) și un paragraf.
Măsurat pe pixeli: titlul la **122 px** de marginea stângă, paragraful la **167**, spațiul
dintre ele **65 px**, paragraf **12px / 123% / −0.02em / alb plin**, lățime maximă
**227.8 px**.
⚠️ Paragraful e pe **fontul de TITLU**, nu pe monospace-ul HUD-ului. Dovada e din
măsurătoare: în machetă textul intră pe patru rânduri în 227.8 px; cu Martian Mono ieșea pe
șase, cu Familjen Grotesk pe trei.
⚠️ **Lungimea textului nu e întâmplătoare**: e măsurat să cadă pe EXACT patru rânduri în
cutia de 227.8 px, ca în machetă (verificat: 4). Dacă îl schimbi, măsoară din nou — cinci
variante încercate au dat 3, 4, 3, 3 și 4 rânduri.
⚠️ Linia de copyright a fost **scoasă** (cererea userului).
⚠️ Blocul dispare **instantaneu** la ieșirea din act, fără tranziție: actele se schimbă
instantaneu și în 3D, iar orice fade însemna un interval în care textul de footer stătea
peste secțiunea pieselor — exact ce s-a raportat (înainte avea 350 ms întârziere + 500 ms
de fade, adică aproape o secundă).

Stânga-jos: **„[ SCROLL TO EXPLORE ]" rămâne până în footer**, unde devine
**„MADE BY/ [ ATWWW ]"**, link către `https://www.atwww.studio/`, cu scramble la hover și
la focus. ⚠️ E ACELAȘI element — se schimbă doar textul și `href`-ul; două elemente
schimbate între ele ar fi însemnat două stări de ținut sincronizate. Fără `href` nu e link,
deci nu primește focus și nu duce nicăieri.

---

## 5quinquies. About — strat peste scenă, nu pagină (2026-09-24)

Macheta: `V2.pdf` (dată de user, nu e în `docs/reference/`). Se deschide din **ABOUT**,
se închide din **BACK**, din ABOUT (comutator) sau cu **Esc**. Nu e rută: scena rămâne
dedesubt, iar la închidere te întorci exact unde erai.

Totul se comută din CSS pe **`html.is-about`**:

| Unde | Pagina | About |
|---|---|---|
| lângă logo | — | `/ ABOUT US / [BACK ←]`, alb 40%; BACK: fundal `#ABE52D` 10% → 20% la hover, contur alb 20% → 100%, scramble pe text |
| mijlocul nav-ului | liniuțe + `INFO SWITCH` | `ANATOMY of A CLICK` („of" = SVG-ul blurat din machetă) |
| dreapta nav | S.001 alb | S.001 alb 40%; pătratul de „info" alb, „i" în `#052A28` |
| stânga-jos | `[ SCROLL TO EXPLORE ]` / semnătura | `SOCIALS / IN / X` (IG scos) |
| dreapta-jos | HUD-ul pe patru linii | `©2026` / `ALL RIGHTS RESERVED` / `MADE BY/ [ ATWWW ]` |
| fundal | scena | `backdrop-filter: blur(28px)` + voal `rgba(5,42,40,.72)` |

- **Straturile stau în ACEEAȘI celulă de grilă** (nav-ul din mijloc, cele două colțuri),
  deci trecerea nu mișcă nimic în jur și `placeNavMid` rămâne valabil. Breadcrumbs-ul e
  `position: absolute` lângă logo din același motiv: un bloc stâng mai lat ar fi mutat
  mijlocul nav-ului (`space-between`).
- ⚠️ **Animația de intrare `piece-in` s-a mutat pe `.foot__l` / `.foot__r`**, cutiile
  colțurilor. Cu `fill: both` ea ținea `opacity` și `filter` pe `.foot__scroll` și
  `.foot__info` pentru totdeauna, iar stingerea lor la deschiderea About n-ar fi avut efect.
- **Scroll-ul se blochează prin scenă**: `ui/` trimite `keycap:modal {open}`, scena oprește /
  pornește Lenis (ea îl deține). Dacă About se deschide cât încă intră titlul, `unlock()`
  nu mai pornește Lenis până la închidere. Tastele de scroll (săgeți, Space, PageDown) se
  opresc separat în `ui/`: Lenis oprit nu le oprește.
- Hover: toate link-urile din colțuri trec 40% → alb în 400 ms `easeOutQuart`. **Scramble
  doar pe `MADE BY/ [ ATWWW ]`**, nu pe socials (cererea userului).
- Focusul se mută pe BACK / înapoi pe ABOUT **doar când s-a ajuns acolo de la tastatură**.
  Mutat și după un clic cu mouse-ul, Chrome desena inelul de focus pe ABOUT la închidere.
- Titlul „Know more [ About ] us" intră literă cu literă (`focusAnim`, ca footer-ul);
  paragrafele intră decalat, cu blur.
- ⚠️ **Cotele sunt citite de pe CAPTURA machetei** (cadru 1440 randat la 1456, deci /1.011),
  nu din Figma. Verificate față de captură: titlul la 54 px, rândul 2 indentat cu 80, text
  NimbusSanL 14/20 justificat, coloană de 404 px centrată, 40 px între paragrafe, cele trei
  paragrafe pe 8 / 6 / 4 rânduri ca în machetă.
- ⚠️ **Italicul e sintetizat**: din NimbusSanL avem doar Regular. `letter-spacing: -0.01em`
  pe paragraful italic compensează lățimea; fără el ieșea pe cinci rânduri.
- Socials: **IN** → `https://www.linkedin.com/company/atwww/posts/?feedView=all`,
  **X** → `https://x.com/Atwww_`, ambele în tab nou. IG a fost scos (2026-09-24).

### Titlul de footer intră abia când se vede câmpul de taste (2026-09-24)

Înainte intra la ÎNCEPUTUL actului de outro, peste switch-ul explodat încă singur pe
ecran. Acum îl pornește `keycap:progress` al outro-ului, prin `OUTRO_AT = { show: 0.5,
hide: 0.47 }` (în `__ui`, reglabil). Măsurat pe baleierea actului: la p = 0.40 câmpul e încă
în ceață, la 0.55 e complet vizibil. `hide` sub `show` ca să nu clipească pe prag.
Nav-ul, HUD-ul și semnătura din stânga-jos se schimbă tot la începutul actului.

---

## 5sexies. Pagina de 404 (2026-09-24)

`web/404.html` + `src/404.js` + `styles/404.css`. Un singur ecran (`overflow: hidden`),
fără three, Lenis sau preloader. În dev, orice rută de pagină necunoscută o servește
(plugin în `vite.config.js`, `appType: 'mpa'`); în build ajunge ca `dist/404.html`, pe care
Vercel îl servește pe orice rută inexistentă.

- **Nav**: logo → `/`; mijloc: liniuțe + `ERROR 404`, centrat pe ECRAN (nu există coloană
  3D); dreapta: `S.404` + **GO BACK** cu pătratul de „info" purtând săgeata lui BACK.
  GO BACK face `history.back()` doar dacă vii de pe site; altfel duce acasă.
- **Tema — „This key is [ not ] mapped"**: conturul switch-ului ÎNCHIS din preloader
  (`source/preloader/preloader_closed.svg`, copiat în `src/assets/`, importat `?raw`), cu
  keycap-ul SĂRIT de pe switch: plutește punctat deasupra, iar la locul lui rămâne o umbră
  abia vizibilă. Peste desen trece bara de scanner. Dedesubt, cota `K+04+04 / KEYCAP — NOT
  MAPPED`. Fundal: grilă de planșetă de 48 px, la 3.5%.
- Buton **[ RETURN TO HOME ]**: același component ca BACK din About, mai mare.
- Colțuri: `SOCIALS / IN / X` și HUD-ul în varianta de eroare (`SCAN MODE: FAILED` …).
- Efectele de text (scramble, intrarea literă cu literă) s-au mutat în **`src/ui/fx.js`**,
  comun ambelor pagini. ⚠️ 404-ul NU importă `ui/index.js`: acela are efecte la import
  (ascultătorii scenei, măsurători de nav).
- Pe ecran îngust (≤ 900 px) coloanele se pun una sub alta, iar liniuțele și S.404 dispar.
  ⚠️ Înălțimea se dă desenului, lățimea iese din `aspect-ratio`; invers, pe mobil switch-ul
  ieșea peste titlu.

---

## 6. Mobil — constrângerea reală

Intro 1,27M + outro 2,75M triunghiuri, pe o pagină cu scroll continuu. `THREEJS_HANDOFF`
§7 listează mitigările; `command-center-slider/CLAUDE.md` are un tabel de auto-tuning pe
`IS_MOBILE` care merită copiat ca structură.

Pârghii, în ordinea eficienței:
1. **`BatchedMesh`/`InstancedMesh` pe cele 84 de switch-uri** (aceleași 7 mesh-uri) →
   7 draw calls în loc de 588.
2. Ascunde switch-urile până la ~30% din trackul intro-ului — sub taste, invizibile.
3. Plafon de `pixelRatio`, dezactivarea conturului pe mobil.
4. KTX2/Basis din PNG-urile master din `source/bake_textures/` → ~8× mai puțin VRAM.
   ⚠️ Măsurat pe 2026-09-17: la outro sunt **~585 MB de textură rezidentă** (55 texturi,
   două atlase 4096×4096 de ~86 MB fiecare) și **nimic nu se eliberează** când preia
   outro-ul. Asta e cea mai mare pârghie rămasă, și contează și pe desktop, nu doar pe
   mobil.

Apăsările din outro au deja un filtru de vizibilitate: doar tastele din frustum sunt
apăsate (**715–1879** din 4969, adică 2,6–7× mai puțin lucru). ⚠️ Nu adăuga o limită de
**distanță** — încercat și scos: toate tastele din cadru au peste 16 px lățime, iar
distanța camerei la câmp variază de la 1.07 m la 0.47 m, deci orice prag fix taie tot
câmpul într-o parte a clipului.

---

## 7. Decizii deschise

- **Copy-ul per piesă** (8 blocuri). Etichetele corecte sunt în tabelul din §2; textul
  în sine e de scris.
- **Lungimile de track** — propuse, nesigure până la primul test pe pagină.
- **Ce se întâmplă la finalul outro-ului**: PDF-ul arată „It all ends with a [ sound ]"
  plus footer. Sunet = decizie de conținut, neatinsă până acum.
- **Cine ține scroll-ul**: o secțiune sticky pe toată durata, sau trei consecutive.
  A doua variantă e mai ușor de reglat, dar are trei cusături de aliniat.
- ~~Schemele tehnice pe scrim~~ — **REZOLVAT 2026-09-18.** Desenele existau deja în
  `source/assets/models/papers_images/`. Nu s-a făcut SVG: se coace o textură de ordine
  (`tools/make_scrim_sheet.py`) și shaderul dezvăluie bucățile pe măsură ce derulezi.
  Nu e nevoie de mapare foaie → pas. Vezi `THREEJS_HANDOFF.md`.
