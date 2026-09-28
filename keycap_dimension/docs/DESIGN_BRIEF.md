# Design brief — homepage 3D „keycap scene"

> **Cum se folosește:** dă acest fișier ca prompt (atașat sau lipit) într-o sesiune nouă de Claude,
> împreună cu imaginile de referință și cu stills-urile din scenă (vezi §0). Tot ce e în §2–§6 sunt
> date **măsurate din proiectul real**, nu presupuneri — nu le reinterpreta, construiește peste ele.

---

## 0. CE PRIMEȘTI ÎMPREUNĂ CU ACEST FIȘIER

- **Imagini de referință de la alte site-uri** — le atașez eu. Din ele vreau extras *limbajul*
  (ritm, densitate, tipografie, felul în care textul convieșuiește cu 3D-ul), nu copiat layout-ul.
- **Stills din scena reală** (`keycap_f###_*.png`) — randări curate, fără UI, exportate din
  preview-ul Three.js existent. Astea sunt sursa de adevăr pentru cum arată scena.
  Recomandate: frame ~001 (vedere de sus/departe), ~075 (taste ridicate), ~150 (close-up cu
  switch-ul explodat). Le pot exporta la 2× sau 4×, cu fundal opac sau transparent.

Dacă un still lipsește, spune-mi ce frame vrei și îl export.

---

## 1. CE VREAU DE LA TINE (livrabile)

1. **3–4 variante de hero screen**, distincte conceptual (nu 4 variații de font). Fiecare cu:
   layout, ierarhie, copy real (nu lorem), poziția zonei 3D vs. poziția textului, ce se întâmplă
   la scroll în primele 100vh.
2. **Un concept complet de homepage**: secțiune cu secțiune, de la fold la footer — ce arată,
   ce spune, ce face animația 3D în acel moment, de ce există secțiunea.
3. **Spec de motion**: ce e legat de scroll, ce rulează în buclă, ce e la hover/click, ce se
   întâmplă pe `prefers-reduced-motion`.
4. **Sistem vizual**: paletă (pornind de la §3, nu inventată de la zero), scară tipografică,
   spațiere, stilul componentelor (butoane, badge-uri, etichete peste 3D), grid.
5. **Varianta mobil** pentru hero + cel puțin 2 secțiuni. Mobilul e cazul greu aici (vezi §6).

**Format de livrare:** hero screens ca **artifacts HTML self-contained**, la 16:9 și 390×844,
cu stills-ul din scenă ca imagine de fundal / element `<img>` în locul canvas-ului 3D (marchează
clar zona ca „aici stă canvas-ul WebGL"). Restul (concept, motion, sistem) ca document structurat.
Nu-mi da cod Three.js — codul 3D există deja și e problema mea.

---

## 2. CE E SCENA, DE FAPT

Un **birou real, modelat și randat în Blender/Cycles**, cu o tastatură mecanică **Keychron K2 V2**
în centru. Nu e un render de studio pe fundal alb — e un colț de cameră, cu context:

- Blat de birou din lemn, **satinat** (are reflexii reale, nu mat).
- **Cutting mat** verde-închis pe blat.
- Perete verde-închis în spate, cu **pegboard perforat** (grilă de 4.512 găuri) pe care stau
  blueprints și hârtii.
- Recuzită de birou: pahar de sârmă cu pixuri și markere, creioane, radieră, mouse, grămadă de
  agrafe, plante, 16 sticky notes, documente pe blat.
- Iluminare de sus, **verzui-caldă** (`#b8ffd6`), tone mapping ACES cu exposure **0.54** →
  imaginea e **închisă, cinematică, cu contrast blând**. Nimic nu e alb; albul cel mai luminos
  din cadru e un verde foarte deschis.

Atmosfera de referință: „workbench de inginer, noaptea, o singură lampă" — nu „product shot".

**Punctul narativ:** tastatura se descompune. Cele 84 de taste se ridică, cele 84 de switch-uri
se ridică după ele, iar **un singur switch se explodează în cele 7 piese componente**. Site-ul e
despre *ce e sub tastă* — anatomia unui switch mecanic, arătată pe un obiect real, nu pe o diagramă.

---

## 3. PALETA REALĂ (măsurată din scenă și din materiale)

> ⚠️ **ACTUALIZARE 2026-09-17 — paleta a fost adusă la referința Figma.** Userul a
> reclamat că „în Figma site-ul apare mai verzui; la noi în intro duce mai mult spre
> albastru". Măsurat pe cadrele din `docs/reference/Homepage.pdf`, pe raportul B/G al
> pixelilor saturați verde: biroul era la **1.151**, referința la **0.874**.
>
> Două valori s-au schimbat, amândouă în `web/src/scene/index.js`:
> - `GRADE.gainB_intro` **1.28 → 0.97** (biroul: B/G 1.151 → 0.866)
> - albastrul din `BG` **0.04732 → 0.04060** (fundalurile: pași 1.149 → 0.957,
>   outro 1.080 → 0.958)
>
> Switch-ul NU a fost atins: era deja potrivit (0.991 vs 0.978 în Figma). Câmpul de
> taste iese cu ~7% mai verde decât în Figma — preț cunoscut, fiindcă îl trage ceața,
> care ia culoarea tot din `BG`. Cifrele complete și de ce nu se poate mai bine:
> `docs/THREEJS_HANDOFF.md`, § „Paleta adusă la referința Figma".
>
> ⚠️ Rămâne o diferență pe **luminozitate**, neatinsă: biroul nostru e mai închis decât
> în Figma (verde saturat G = 46.9 la noi, 65.4 și 89.0 în cele două cadre de referință,
> care se contrazic între ele cu un factor de 1.36). Pârghiile, dacă se umblă, sunt cele
> două dimmere de emisie (`DESK_EMI`, `BG_EMI_BASE`) — NU expunerea globală.
>
> ⚠️ Tabelul de mai jos e de dinainte de schimbare.

Astea sunt culorile care există deja în pixeli. Sistemul de UI trebuie să trăiască lângă ele.

| Rol | Hex | De unde vine |
|---|---|---|
| Fundal aplicație / letterbox | `#0b0f10` | fundalul canvas-ului |
| Verde-negru profund | `#051b1c` | culoare de bază a fundalului din scenă |
| Neutru închis | `#131817` | umbre / suprafețe neutre |
| Petrol mediu | `#0c4a45` | zona mai deschisă a gradientului de fundal |
| **Verde carcasă tastatură** | `#093C3F` | culoarea plată reală a carcasei Keychron |
| **Accent mint** | `#20e7b7` | accentul principal |
| Mint aprins (rar, doar accente mici) | `#00ffc2` | highlight |
| Teal UI (butoane, slidere) | `#4fd1c5` | accentul din UI-ul actual |
| Verde contur / evidențiere | `#5cff9d` | culoarea conturului de highlight pe piese |
| Lumină de scenă | `#b8ffd6` | culoarea luminilor |
| Text | `#e8eef0` | text pe fundal închis |

Culorile pieselor de switch (utile dacă faci legende, diagrame sau chips per piesă):
carcasă sus/jos `#3E534F` · piesă translucidă `#3A4D4A` · **stem albastru `#1F5F8A`** (singurul
accent rece din scenă) · contact metalic `#111A18` · piesă albă `#18231F` · arc + pini `#0A0C0C`.

**Regula:** verde/petrol e mediul, mint e accentul, albastrul stem-ului e singurul contrast
cromatic — folosește-l intenționat, nu decorativ. Fără gradiente violet/albastru generice de SaaS.

---

## 4. ANIMAȚIA — CE POT CONTROLA (constrângeri tari)

Există **un singur clip de animație, 6,25 s** (150 frames @ 24 fps), care conține tot:
zborul camerei + ridicarea tastelor + ridicarea switch-urilor + explode-ul switch-ului.
Pot pune animația pe orice `t ∈ [0, 6.25]` instantaneu → **e perfect pentru scroll-driven**.

Traiectoria camerei: **de sus și de departe** → **close-up jos**, terminând la ~48 cm de tastatură.
La finalul clipului pot da handoff către **OrbitControls** (userul rotește liber în jurul tastaturii).
Cât timp animația rulează, camera nu poate fi controlată de user — e ori una, ori alta.

Faze utile pentru storyboard (aproximative, le pot ajusta în Blender dacă ceri altă cadență):

| t | Ce se vede |
|---|---|
| 0.0 s | tastatura întreagă, cadru larg de sus — se vede tot biroul |
| ~2 s | tastele se ridică din carcasă |
| ~4 s | switch-urile se ridică după ele; se vede placa |
| ~6.25 s | close-up jos; **un switch e explodat în 7 piese**; camera se oprește → orbit liber |

**Alte lucruri deja implementate și disponibile ca interacțiune:**
- **Contur de evidențiere pe orice piesă** (detecție de margine în spațiu-ecran, grosime uniformă,
  merge și pe arc/pini). Culoare, grosime, glow și puls configurabile.
- **Mod „pași explicativi"**: parcurge pe rând cele **8 elemente** (keycap + 7 piese), de sus în jos,
  evidențiind fiecare. Ordinea e derivată din pozițiile reale, nu hardcodată. Astea sunt etichetele
  actuale — **posibil imprecise, ai voie să propui denumiri mai bune** (și mai ales copy mai bun):
  `keycap` → `carcasă sus` → `carcasă jos` → `piesă translucidă` → `stem albastru` →
  `contact metalic` → `piesă albă` → `arc + pini`.
- **Focus pe o piesă**: camera se apropie de o piesă anume și orbitează în jurul ei.
- Carcasa switch-ului e **translucidă real** (opacitate ~0.55) — se văd piesele interne prin ea.
- Toate tastele au **legende crocante** (texturi 4K coapte) — text lizibil la close-up.

---

## 5. CE **NU** POT FACE (nu propune)

- Nu pot schimba geometria, materialele sau iluminarea din scenă (totul e deja copt în texturi;
  re-bake-ul e o zi de muncă). Culorile din §3 sunt fixe.
- Nu pot adăuga obiecte noi în scenă, nu pot muta biroul, nu pot schimba recuzita.
- Nu pot face umbre dinamice ieftine sau lumini multiple noi.
- Nu vreau secvențe de imagini pre-randate (`.webm` / sprite sheets) în locul scenei 3D reale —
  decizia proiectului e scenă 3D live, cu orbit interactiv.
- Nu am o a doua scenă, un al doilea produs sau alte modele 3D. Tot site-ul se sprijină pe **acest**
  obiect. Dacă un concept cere „încă un vizual 3D", trebuie să vină din același cadru (alt unghi,
  alt frame, alt zoom, o piesă izolată).

---

## 6. CONSTRÂNGERI TEHNICE CARE AFECTEAZĂ DESIGNUL

- **Greutate:** GLB de **8,8 MB**, cu decompresie Draco. Primul paint e rapid, dar scena apare cu
  întârziere → **starea de încărcare face parte din design**, nu e un spinner de umplutură.
  Dă-mi un concept pentru ea (are și procentaj de progres real disponibil).
- **Cost de randare:** ~**1,27 milioane de triunghiuri**, ~**730 draw calls**. Pe desktop e OK.
  **Pe mobil va suferi.** Prin urmare: pe mobil e plauzibil să reduc calitatea sau să scot
  switch-urile în anumite faze. Designul mobil nu trebuie să depindă de 3D fluid non-stop —
  propune un fallback demn (poster + interacțiune redusă, sau 3D doar în hero).
- 3D-ul e un **canvas fullscreen**; tot textul stă în DOM peste el. Deci: contrast peste imagine,
  scrim-uri, zone sigure. Am și un plan de fundal cu gradient animat *în scenă*, în spatele
  tastaturii, dacă textul are nevoie de suport (culori din §3, opacitate reglabilă).
- Pot exporta **PNG-uri curate la 2×/4×, cu fundal transparent** din orice frame → orice still de
  care ai nevoie pentru compoziții statice se poate obține.

---

## 7. DECIZII DESCHISE — IA-LE TU, DAR ARGUMENTEAZĂ

1. **Poziționarea.** Presupunerea mea de lucru: *piesă de showcase / portfolio tehnic* — o pagină
   care demonstrează măiestrie 3D + web, folosind anatomia unui switch mecanic ca subiect.
   Dacă din referințele atașate reiese altceva (magazin de keycaps, pagină de produs, lab de
   studio creativ), propune varianta mai bună și spune de ce.
2. **Limba conținutului:** default **engleză**; scrie copy real, tehnic, sobru. Fără hype de SaaS.
3. **Lungimea paginii:** un scroll lung cinematic (5–7 secțiuni) vs. un fold dens + puțin sub el.
   Alege și justifică în raport cu cele 6,25 s de animație disponibile.

---

## 8. CRITERII DE REUȘITĂ

- Hero-ul se citește într-o secundă și **nu acoperă tastatura** în momentele în care ea e subiectul.
- Se simte ca un obiect de inginerie, nu ca un template. Densitate mare de informație e binevenită
  (etichete, măsurători, numerotare, mono-spaced) atât timp cât ierarhia rămâne clară.
- Scroll-ul are un motiv: fiecare secțiune corespunde unei stări reale a animației.
- Textul e lizibil peste imagine închisă și zgomotoasă, fără să distrugă atmosfera cu carduri opace.
- Varianta mobil nu e desktop-ul strâns — e o decizie separată.

Începe cu 2–3 întrebări dacă ceva din referințe contrazice brief-ul. Altfel, livrează direct.
