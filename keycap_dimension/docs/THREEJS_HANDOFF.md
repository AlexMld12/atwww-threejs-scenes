# Predare către developer — `keycap_scene_web.glb`

## Ce e în fișier

| | |
|---|---|
| Dimensiune | **8,64 MB** (geometrie ~5,4 MB + texturi 2,93 MB) |
| Noduri / mesh-uri / materiale | 816 / 312 / 51 |
| Texturi | 54, toate **WebP** |
| Cameră | 1, animată (`Camera`) |
| Animație | **1 singur clip: `"Scene"`** — 176 canale, durata **6,25 s** (150 frames @ 24fps) |
| Extensii glTF | `KHR_draco_mesh_compression` ⚠️ **obligatorie**, `EXT_texture_webp`, `KHR_materials_specular` |

Toată iluminarea e **coaptă în texturi** (emisie). Scena nu are nevoie de lumini ca să arate corect.

## 1. Încărcare (Draco e obligatoriu!)

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
// (recomandat: copiază decoder-ul local în /public/draco/ și pune calea aia)

const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

loader.load('keycap_scene_web.glb', (gltf) => {
  scene.add(gltf.scene);
  // ...
});
```

`EXT_texture_webp` și `KHR_materials_specular` sunt suportate nativ de `GLTFLoader` — nu trebuie nimic.

## 2. Renderer — obligatoriu pentru a arăta ca în Blender

Scena a fost creată cu **Filmic + exposure −0.9 EV**. Fără astea, totul va părea spălăcit/prea luminos:

```js
renderer.toneMapping = THREE.ACESFilmicToneMapping;  // sau AgXToneMapping
renderer.toneMappingExposure = 0.54;                 // = 2^(-0.9), ajustează pe ochi
renderer.outputColorSpace = THREE.SRGBColorSpace;    // default în r152+
```

## 3. Environment map — pentru reflexii (birou + cutting mat)

Biroul și mat-ul de tăiere au deja `roughnessMap` + specular exportate. Fără environment, arată plate:

```js
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
// intensitate globală: scene.environmentIntensity = 1.0  (r163+)
```
Alternativ, un HDR mic (~200 KB) încărcat cu `RGBELoader` arată mai bine.

## 4. Animația — un singur clip

```js
const mixer = new THREE.AnimationMixer(gltf.scene);
const action = mixer.clipAction(gltf.animations[0]);   // "Scene"
action.play();
action.paused = true;                                  // pentru control pe scroll
const DURATION = gltf.animations[0].duration;          // 6.25

// scroll-driven: progress = 0..1
function setProgress(p) {
  action.time = THREE.MathUtils.clamp(p, 0, 1) * DURATION;
  mixer.update(0);
}
```

Clipul conține **tot**: zborul camerei + ridicarea celor 84 de taste + ridicarea celor 84 de switch-uri + explode view-ul switch-ului.

## 5. Camera din GLB

```js
const cam = gltf.cameras[0];       // cameră animată, 45mm
cam.aspect = window.innerWidth / window.innerHeight;
cam.updateProjectionMatrix();
```

**Handoff către OrbitControls** la finalul animației (camera ajunge la ~0,48 m de tastatură):

```js
const controls = new OrbitControls(cam, renderer.domElement);
controls.enabled = false;
controls.target.set(0, 0.78, 0);         // centrul tastaturii (Y-up three.js)

// când progress ajunge la 1:
function enableOrbit() {
  action.paused = true;
  controls.enabled = true;                // de aici userul roteșteliber
}
```
⚠️ Cât timp `mixer` scrie în cameră, OrbitControls se bat cu el — activează-l doar după ce oprești mixer-ul.

## 6. Materiale — nu trebuie modificate, dar bine de știut

| Categorie | Cum e exportat | Ce face dev-ul |
|---|---|---|
| Mate (perete, pegboard, hârtii, sticky notes, plante) | emisie (unlit) | nimic |
| Lucioase (birou, cutting mat) | emisie + `roughnessMap` + specular | doar `scene.environment` |
| Taste (84) | atlas 3072 Diffuse + Normal 2048 | nimic — un singur material comun |
| Switch-uri (84) | atlas 2048 (Diffuse/Normal/Rough/Metal) | nimic — un singur material comun |

## 7. Performanță — de citit înainte de lansare

**Numere reale:** ~**1,27 milioane triunghiuri** (733k scenă + 544k cele 84 de switch-uri) și **~730 draw calls** (588 din piesele de switch).

E OK pe desktop (materialele sunt unlit, deci shader-e ieftine), dar pe mobil va suferi. Dacă e nevoie de optimizare, în ordinea eficienței:

1. **Ascunde switch-urile până sunt necesare** — la începutul animației sunt sub taste, invizibile. `switchGroup.visible = (progress > 0.3)` scade instant ~590 draw calls.
2. **`BatchedMesh` / `InstancedMesh`** pentru cele 84 de switch-uri (aceleași 7 mesh-uri) → 7 draw calls în loc de 588.
3. **Frustum culling** e activ implicit; verifică că nu dezactivezi.

**VRAM:** ~400 MB cu texturile actuale (WebP se decomprimă la RGBA plin în memoria video). Dacă e problemă pe mobil, se regenerează texturile în **KTX2/Basis** din PNG-urile master (`bake_textures/`) → ~8× mai puțin VRAM. Necesită `KTX2Loader` în plus.

## 7bis. Valorile finale de calibrare (actualizat 2026-09-14)

Reglate în `preview.html`. **Toate sunt slidere în panoul de tuning** (60 în total) —
cifrele de aici sunt valorile implicite din fișier. `preview.html` e un instrument de
preview, nu codul livrat: ce conteazǎ pentru integrare sunt valorile, plus capcanele
de la finalul secțiunii.

### Renderer + scenă
| | Valoare | De ce |
|---|---|---|
| `toneMappingExposure` | **0.54** | neschimbat față de original. Coborât la 0.40 și **revenit** — vezi capcana #2 |
| `scene.background` | linear `(0.01628, 0.04684, **0.04060**)` | era `0.04732`; albastrul coborât 14.2% pe 2026-09-17, vezi § „Paleta adusă la Figma" |
| `FogExp2` densitate | **0.18** | ⚠️ **NU 2.12** ca în outro. Camera intro-ului merge 2.35 m → 0.48 m; la 2.12 factorul e ~1.00 la cadrul larg și biroul dispare complet |
| `environmentIntensity` | **0.35** | neschimbat. Ridicarea lui e capcana #1 |

### Lumini (singura pârghie pe hero)
| | Valoare |
|---|---|
| `keyLight` (DirectionalLight) | **9.0** (era 2.5) |
| `fillLight` | **2.0** (era 0.6) |
| `AmbientLight` | 0.12 (culoare `0x2a4a3e`) |

Doar tastele și piesele de switch sunt PBR, deci **numai ele reacționează la lumini**.
Restul scenei e emisie coaptă și e complet insensibilă la ele. ⚠️ Ambientul nu e o
pârghie utilă: culoarea lui e un verde foarte închis, deci chiar la intensitate 1.0
contribuie aproape nimic (măsurat: zero diferență în pixeli).

### Emisia coaptă — DOUĂ dimmere, nu unul
| Grup | Valoare | Ce conține |
|---|---|---|
| `emissiveMats` („Birou: emisie") | **0.60** | blat, cutting mat, `doc_table_*`, recuzită (27 materiale) |
| `bgEmissiveMats` („Fundal: emisie") | **0.80** | `wall`, `Pegboard*`, `document 1.*`, `StickyNote*` (21 materiale) |

Split-ul e esențial: în cadrul final fundalul e pegboard-ul, tot emisiv, deci nu depinde
de lumini. Cu un singur dimmer, cadrul larg și close-up-ul se exclud reciproc.

### Dezvăluirea scrim-ului (2026-09-09 / 14)
Tot ce depinde de fază se calculează în `applyReveal()`, chemat din `syncUI()` — deci
prinde ȘI scrub-ul manual ȘI redarea, fără două căi care scriu pe aceleași materiale.

| | Valoare |
|---|---|
| Fereastra (`revStart`/`revEnd`) | **3.00 → 4.60 s**, `k = smoothstep(t, 3.00, 4.60)` |
| Scrim: opacitate-țintă | 1.00 (sliderul e ȚINTA la finalul tranziției, nu valoarea de acum) |
| Scrim: margine (`scrimMargin`) | 0.12 m |
| Planșă: rest la final (`bgEmiFloor`) | **0.20** — ⚠️ **NU 0**, vezi capcana #3 |
| Switch: luminozitate | **2.0 → 4.0** pe fereastră |
| Tastă: luminozitate | **1.0 → 4.0** pe fereastră |

**Scrim-ul e o placă orientată spre cameră**, reașezată în fiecare cadru din
`renderFrame()` (nu din bucla de redare — așa randează corect și exportul PNG).
Plasarea NU e o distanță radială: se calculează intervalul de **adâncime de cameră**
ocupat de subiect și de planșă, pe cutii de încadrare (8 colțuri duse în spațiul
camerei), iar placa se pune între ele — dincolo de cel mai îndepărtat punct al
subiectului, înaintea celui mai apropiat punct al planșei. Vezi capcana #4.

Curba verificată pe luminanța zonei de pegboard: **116.6 → 104.1 → 41.0 → 7.7**.

### Materiale
| | Valoare |
|---|---|
| switch: `color.setScalar` | **2.0** la repaus (→ 4.0 la dezvăluire) — atlasul intro-ului e mai închis decât materialul PBR din outro; abatere asumată de la culorile din `DESIGN_BRIEF` §3 |
| switch: `roughness` | 0.64 (era 0.40) |
| switch: `envMapIntensity` | 43.0 |
| switch (carcasă translucidă): `opacity` | 0.55 — **3 din 7 piese** folosesc `switch_glass_Baked` |
| taste: `envMapIntensity` | 8.0 |
| **piese închise** (`Pipe` = arc, `Solid 368` = contact) | `roughness` **0.15**, albedo din atlas (negru) — vezi capcana #5 |
| birou: rough / env / spec / clearcoat | 0.58 / 1.80 / 1.30 / 0.45 |
| cutting mat: `normalScale` | 0.25 |

**Fiecare din cele 7 piese ale lui `SW_087` are material CLONAT**, cu slider de boost
individual. Cele 84 de switch-uri de fundal păstrează materialul comun, deci zero draw
call-uri în plus.

### GradePass (portat din `outro_preview.html`, ultimul în lanț)
| | Valoare | Sursa |
|---|---|---|
| contrast / saturație / lift | 1.08 / 0.80 / 0.00 | recalculate pentru intro |
| **câștig R / G / B** | **0.93 / 1.00 / 0.97** (intro) · 1.16 (outro) | ⚠️ nu vine din outro. Era 1.28, calibrat pe scenă închisă ca să ridice B-ul texturilor coapte; ducea biroul spre cyan. Coborât la **0.97** pe 2026-09-17 pe referința Figma — vezi § „Paleta adusă la Figma" |
| vignetă int / întindere / formă | 0.20 / 0.61 / 4.0 | copiate din outro |
| noise int / granulație / duritate | **0.04** / 2.0 / 5.0 | intensitatea cerută de user |
| „Noise TV (quad vechi)" | 0.00 | retras — grain-ul e în GradePass |

### Cinci capcane verificate, nu presupuse
1. **`environmentIntensity` nu e pârghia paletei.** 50 din 51 de materiale sunt emisie
   coaptă, iar IBL-ul specular se adaugă și pe ele → ridicarea lui spală tot cadrul în
   cyan. Iar pe piesele de switch nu face nimic măsurabil (dielectrici închiși, F0 0.04,
   albedo 0.02–0.2): test A/B cu env global 0.35 → 2.0 dă imagine **identică**.
2. **Ținta nu e o luminanță medie, e raportul subiect/fundal.** Potrivind media pe cadru
   cu cea a outro-ului (40), dispare lumina coaptă de deasupra biroului — caracterul
   scenei. Piesele se ridică separat, din lumini și albedo.
3. **Materialele de fundal au `baseColorFactor = 000000`** (toate 21, verificat în
   runtime). Sunt emisie pură: culoarea difuză e NEGRU, tot ce se vede vine din
   `emissive`. Consecințe: (a) „stins" **înseamnă** negru, deci emisia nu se duce la 0
   cât timp planșa e încă vizibilă; (b) **nu se poate face un fade curat prin
   transparență** — scăderea emisiei și cea a opacității se înmulțesc și rezultatul se
   amestecă cu fundalul, iar hârtiile ies negre cu grila de găuri vizibilă prin ele.
   Fade-ul prin `opacity` a fost încercat și ABANDONAT.
4. **Pegboard-ul nu e la adâncime constantă.** Cu camera înclinată, partea lui de sus e
   mai aproape de cameră decât o placă așezată la distanță radială, deci o ocluzionează
   acolo și o lasă descoperită — se vede ca o muchie orizontală dură pe la o treime din
   cadru. Test numeric: banda de sus vs banda de jos la t=4.00 diferea cu **49.8**; cu
   plasarea pe intervale de adâncime, **1.6**. ⚠️ NU folosi sfere de încadrare pentru
   asta: raza sferei unui panou de 3,8 m e ~0.75 m și face calculul inutilizabil.
5. **Piesele închise nu se ridică prin albedo.** Arcul e `#0A0C0C` (~0.003 în linear);
   ×10 dă tot ~`#30`. Lizibilitatea vine din **luciu**: `roughness` mic pe un
   **dielectric** (`metalness 0`) dă `F0 = 0.04`, adică highlight ALB strâns pe corp
   negru. ⚠️ **NU metalness ridicat**: la metale `F0 = albedo`, iar un albedo negru dă
   specular negru — iese exact invers. Măsurat: luminanță 66.6 pe spirale.

### Detalii de implementare care nu sunt evidente
- **`composer` rulează pe FIECARE cadru** (înainte doar când era ceva selectat), pentru
  că gradarea trebuie să prindă tot. Plafonul de rezoluție al exportului PNG e legat de
  conturul activ, nu de composer — altfel ar coborî permanent la 18 MPx.
- **`applySliders()` după load, obligatoriu.** `bind()` își apelează `upd()` la parsarea
  modulului, deci ÎNAINTE de `loader.load`. Atunci listele de materiale sunt goale și
  valorile implicite nu ajung niciodată pe materiale — sliderele erau decorative până la
  prima mișcare cu mâna. Bug preexistent, reparat 2026-09-08.
- **`pieceMeshes`: piesele sunt copiii nodului `SW_087`**, nu „mesh-uri fără strămoș
  `SW_xxx`". Regula veche găsea ZERO, deci modul „pași explicativi" avea un singur pas.
- **`GLTFLoader` sanitizează numele:** `Solid 87.002` → `Solid_87002`, `Pipe.001` →
  `Pipe001` (punctele cad, spațiile devin underscore). Orice potrivire pe nume trebuie
  să accepte ambele forme.
- **Estomparea marginilor scrim-ului se oprește** în modul orientat spre cameră: ea
  există ca să ascundă granița unui plan din scenă, iar pe un fundal care umple cadrul
  doar îl împiedică să acopere marginile. ⚠️ Consecință cunoscută: sliderul „Estompare
  margini" e inert în acest mod.

### Cusătura intro → outro în `site.html` (2026-09-16)

**Hero-ul e IDENTIC în ambele acte, prin construcție, nu prin potrivire.** Patru condiții,
toate necesare:

1. **Aceeași geometrie.** Verificat la runtime cu amprentă sensibilă la ordine: pozițiile,
   normalele ȘI buffer-ul de indici coincid între cele două GLB-uri pe toate cele 7 piese.
   Diferă doar stratul UV — fiecare export a scris drept `TEXCOORD_0` UV-ul cerut de
   materialul lui. Deci în `loadOutro`: `o.geometry = pieceMeshes[key].geometry`.
   Keycap-ul erou intră și el: are 1226 de vârfuri în outro și 1326 în intro, dar
   **același număr de triunghiuri (1736), aceeași cutie de încadrare la 5 zecimale și
   aceeași suprafață totală (0.00080437)** — diferența de vârfuri vine din cusăturile de
   UV, care dublează vârfuri. Suprafața e aceeași, deci schimbul e sigur.
2. **Același material** (`pieceMats[key]`, respectiv clona de atlas a keycap-ului).
3. **Aceleași lumini.** `keyLight` 9.0 și `fillLight` 2.0 rămân aprinse și în outro, iar
   lumina proprie a outro-ului e stinsă (`OUTRO_AREA = 0`).
4. **Ceața OPRITĂ pe hero** (`material.fog = false` pe cele 8 materiale). Ceața rămâne
   2.12 în outro pentru CÂMP, unde chiar trebuie — ascunde adâncimea.

Rezultat măsurat la cusătură: keycap **+0.0**, stem −0.0, arc +0.0, contact +0.2,
carcase −0.1 / −1.3, LED +0.1, pini −0.1, fundal și câmp **0.0**. Media `|ΔLum|` pe tot
cadrul: **1.47**, adică sub granulația animată a cadrului. Nu mai există niciun
multiplicator de compensare pe hero (`INTRO_MUL` e tot 1, rămas doar ca pârghie).

Câmpul primește `FIELD_MUL = 1.4` pe albedo, ca să recupereze lumina de suprafață stinsă.
Față de look-ul aprobat din `outro_preview.html`: −4.2 aproape, −0.7 mediu, −0.4 departe.
⚠️ Nu se poate potrivi exact cu un singur factor: lumina de suprafață era **poziționată**
deasupra câmpului, deci lumina mai tare aproape și mai slab departe, iar un albedo
uniform nu reproduce o cădere spațială.

### Paleta adusă la referința Figma (2026-09-17)

Reclamația userului: „în Figma site-ul apare mai verzui; la noi în intro parcă duce mai
mult spre albastru decât spre verde."

**Cum s-a măsurat.** Cadrele Figma s-au extras din `Homepage.pdf` (9 JPEG-uri DCTDecode),
decodate de Chrome pe canvas (nu există PIL) și redesenate la 1733×1000, aceeași
rezoluție ca randările. Metrica e **raportul B/G pe pixelii saturați verde** (`R < 10`) —
adică exact pegboard-ul, biroul, scrim-ul și câmpul, fără hârtii, post-it-uri sau plantă.
⚠️ Nu media globală a cadrului și nu dreptunghiuri puse cu ochiul: încadrarea din Figma
diferă de a noastră, iar media globală se mută cu ce nimerește în cadru. Populația de
pixeli selectată iese ~52-98% din cadru în AMBELE, deci e comparabilă.

| suprafață | Figma | noi înainte | noi acum | țintă |
|---|---|---|---|---|
| birou + pegboard (intro) | 0.874 | **1.151** | **0.866** | 0.874 |
| fundal în actul de pași | 0.925 | **1.149** | **0.957** | 0.925 |
| fundal în outro | 0.968 | **1.080** | **0.958** | 0.968 |
| coloana switch | 0.978 | 0.991 | 0.975 | — era deja bună |
| câmpul de taste | 1.016 | 0.993 | 0.944 | — era deja bun |

**Două pârghii, alese pentru că fiecare atinge exact ce trebuie:**

1. **`GRADE.gainB_intro` 1.28 → 0.97.** Rezolvă biroul. Rezolvat prin A/B LIVE pe pagină
   (1.00 → 0.904, 0.95 → 0.860), nu prin aritmetică pe shader.
   ⚠️ **De ce nu poate atinge cusătura, citit din pagina vie, nu presupus:** `uGainB` se
   mută de la `gainB_intro` la `gainB_outro` pe fereastra de reveal a INTRO-ului
   (`max(t, revealK)`), nu la cusătură. Măsurat: gainB = **1.2800** la intro p=0, dar deja
   **1.1600** în actul de pași, la cusătură ȘI în outro. Deci `gainB_intro` trăiește doar
   înainte ca switch-ul să se ridice.
2. **Albastrul din `BG` 0.04732 → 0.04060 (×0.858).** Rezolvă fundalurile. Factorul e
   soluția prin **cele mai mici pătrate pe trei ținte deodată** (fundal pași, fundal
   outro, câmp de taste), cu pantele măsurate prin A/B, nu presupuse. Erorile rămase:
   +0.032 / −0.019 / **−0.074**.
   ⚠️ A treia e prețul plătit și e cunoscut: **câmpul de taste iese cu 7% mai verde decât
   în Figma**, pentru că îl trage ceața, iar ceața își ia culoarea tot din `BG`. Nu se
   poate separa: `BG` e în același timp `scene.background`, `scene.fog.color` și `cBase`
   al scrim-ului. Dacă se vrea câmpul exact pe Figma, trebuie decuplată culoarea ceții de
   cea a fundalului — dar atunci fundalul intro-ului (scrim) și cel al outro-ului
   (`scene.background`) nu mai sunt același lucru, și sare la cusătură (vezi nota de la
   `scrimMat`: cu două culori diferite ieșea 8.9 vs 16.1 pe verde).

**Cusătura, verificată DUPĂ schimbare** (ultimul cadru de pași vs primul de outro):
fundal `ΔLum +0.00`, coloana hero `ΔLum +0.02`, RGB identic la o zecimală
(15.2/14.6 și 17.1/16.2). Rămâne sigură prin construcție: e același obiect `BG` de ambele
părți, iar `gainB` e 1.16 și acolo, și acolo.

**Ce NU s-a atins, deliberat:** switch-ul. Măsurat înainte de orice: B/G Figma 0.978 vs
noi 0.991 — era deja potrivit. A ajuns la 0.975 doar ca efect colateral al ceții, adică
și mai aproape de referință.

⚠️ **Rămâne o diferență pe LUMINOZITATE, neatinsă.** Biroul nostru e mai închis decât în
Figma: verdele saturat are G = 46.9 la noi, 65.4 în cadrul Figma 5 și 89.0 în cadrul 8.
Cele două cadre de referință se contrazic între ele cu un factor de 1.36, deci ținta nu e
strânsă. Pârghiile corecte, dacă se umblă: cele **două dimmere de emisie**
(`DESK_EMI 0.60` și `BG_EMI_BASE 0.80`), care ating doar biroul și peretele — obiecte care
nu există în outro, deci nu pot muta nici hero-ul, nici cusătura. NU expunerea globală.

### Schemele tehnice care se trasează pe scrim (2026-09-18)

Cererea: „aceste scheme să apară în timp ce dai scroll, ca și cum s-ar desena pe fundal
în timp ce piesele devin highlight-uite."

**Desenele existau deja pe disc**, în `source/assets/models/papers_images/` — scanurile
reale de datasheet care stau oricum prinse pe pegboard. Identificate zoomând în scrim-ul
din machetă și citind ce scrie pe el: `11.png` (secțiunea prin switch, „SMD-LED", textul
german), `38.jpg` (Output A/B, „the code repeats from 1 to 4"), `34.jpg` (keycap
SECTION A-A), `39.jpg` (desen mecanic).

⚠️ **NU s-a făcut SVG, deși asta se ceruse inițial.** Măsurat pe `11.png`: vectorizarea
dă **1723 de contururi cu 30.649 de puncte**, majoritatea din TEXT — fiecare literă
devine câteva contururi închise. Iar o literă „trasată pe contur" arată greșit: nu așa se
scrie o literă. În schimb, aceleași foi au **1035 de componente conexe**, adică fiecare
linie, fiecare cotă și fiecare literă e deja un obiect separat, gratis.

**Deci: o textură de ORDINE, nu un SVG.** `tools/make_scrim_sheet.py` compune colajul și
cheamă `tools/make_order_texture.py`, care scrie
`web/public/textures/scrim_sheet.png` (2048×1280, **2426 de bucăți**):

| canal | ce conține |
|---|---|
| R | rangul bucății, 0..1 normalizat (0 = hârtie goală) |
| G | tăria trasăturii (păstrează antialiasingul scanului) |

Shaderul scrim-ului compară R cu `uDraw` și gata — **zero cost la runtime**, nicio
redesenare pe cadru, niciun traseu de parcurs. Textul apare literă cu literă de la sine,
ceea ce răspunde și la întrebarea „ce facem cu textul".

⚠️ Textura se încarcă cu `colorSpace = NoColorSpace` și **fără mipmap-uri**: R și G sunt
DATE, nu culoare. Un mipmap ar amesteca ranguri vecine și ar dezvălui bucăți pe jumătate.
E oricum aproape 1:1 pe ecran. Cost: ~10,5 MB de VRAM.

⚠️ **Fără backticks în comentariile din shader.** Shaderul e un template literal, iar un
backtick în comentariu îl termină pe loc — a costat un `SyntaxError` pe toată pagina.

**Nu există mapare foaie → pas, și nici nu e nevoie.** Colajul se trasează pe TOT actul
de pași, în paralel cu conturul care trece prin piese — exact ca în machetă, unde fundalul
e un colaj, nu o planșă per piesă.

**Scara și decupajul (corectate 2026-09-18).** Userul: „mai mari, exact cum e în pdf,
ies din ecran prin anumite părți". Comparate cadrele alături, la aceeași mărime: în
machetă vezi **fragmente** mari de desen, tăiate de marginile cadrului — fără chenar de
pagină, fără cartuș. La noi se vedea pagina întreagă, cu tot cu ramă, și citeai „patru
documente prinse pe perete" în loc de „un perete de schițe". Acum: **trei foi de ~2×**,
așezate anume ca ramele lor să cadă în afara pânzei; coordonatele negative din `LAYOUT`
sunt intenționate. ⚠️ Nu s-a mers după mărimea textului — măsurată, era deja în regulă
(glife de 6 px mediană la noi vs 5 px în machetă). Diferența era de încadrare, nu de tipar.

**⚠️ Gruparea pe foi se face după CINE A PUS CERNEALA, nu după dreptunghi.** La scara
asta foile se suprapun obligatoriu (`rect0` 0..1267 și `rect1` 1010..2048), iar gruparea
după dreptunghi punea cerneala foii 2 din zona comună în tura foii 1 — deci trasarea
sărea de pe o foaie pe alta și înapoi. Se vedea direct în urma creionului: la 8–16% din
timp centrul cernelii era deja la x=1068, adică în a doua foaie. `build_collage` întoarce
acum o hartă de proprietar pe pixel. După reparare, prima jumătate a trasării coboară
curat prin foaia 1, cu salturi de 78–343 px pe o diagonală de 2415.

### ⚠️ BARĂ DE SCANNER — a treia și ultima variantă (2026-09-18)

**Cele două de dinainte au fost respinse de user, și amândouă aveau aceeași boală.**
Oricât de bună ar fi o ordonare pe BUCĂȚI, două bucăți consecutive în timp pot fi departe
în spațiu, iar ochiul citește asta ca salt:
1. *benzi orizontale peste tot colajul* → „apar random fără sens";
2. *drum de creion pe cuvinte, grupat pe foi* → „e ca și cum cineva s-ar apuca să scrie o
   literă trasând doar o linie, după se apucă de altceva și revine la literă". Măsurat, tot
   mai aveam 5 salturi peste 500 px din 19 felii de timp.

**Acum: poziția de scanare se calculează DIN UV, în shader.** Textura dă doar tăria
cernelii (canalul G). Dezvăluirea e o funcție monotonă de `y`, deci **nu POATE sări** —
nu mai există nicio ordine care să se strice. Userul a cerut-o explicit („ar trebui să fie
ca un scanner"), și e și singura variantă continuă prin construcție.

```js
soft: 0.035,   // cât de moale e marginea din urma barei
beam: 0.16,    // dunga aprinsă de la front; 0 = doar dezvăluire, fără bară
beamW: 0.030,  // lățimea dungii
```

⚠️ **`t = 1.0 - su.y`, nu `su.y`.** În three texturile au `flipY = true` implicit, deci
rândul de SUS al imaginii ajunge la v = 1, iar `vUv.y` crește în sus pe ecran. Cu `su.y`
direct, bara pornea de jos și urca — invers față de sensul în care derulezi. Se vedea în
captură: cerneala apărea întâi la baza cadrului.

⚠️ **Bara trece dincolo de 1** (`1 + beamW*3`), altfel ultimul rând de cerneală rămâne pe
veci în interiorul dungii aprinse.

⚠️ Canalul **R** al texturii păstrează ordinea „de creion" din încercările anterioare. Nu
se mai folosește, dar rămâne ca să se poată reveni fără să se recoacă textura. Codul care
o produce e tot în `tools/make_order_texture.py`, cu istoricul celor trei încercări.

**Așezarea: TREI FOI ÎNTREGI, ÎNTR-UN RÂND (a șasea, și cea care ține — 2026-09-18).**
Au fost cinci înainte, respinse pe rând, și toate aveau aceeași rădăcină: încercam să bag
**patru foi portret** (raport ~0.72) într-un **cadru landscape**. Nu intră.

| # | ce am încercat | ce a ieșit |
|---|---|---|
| 1 | patru pagini întregi, așezate de mână | „schemele sunt unele peste altele" |
| 2 | șase pagini, mai mici | tot suprapuse |
| 3 | patru pagini într-un rând | una ieșea un ciot: 185 px din 760 |
| 4 | benzi dreptunghiulare, grilă 2×2 | „combinate și tăiate" — grila tăia prin desene și prin rânduri de text |
| 5 | elemente individuale, decupate și împachetate | nimic tăiat, dar mărunte, în rafturi vizibile și cu repetiții — arăta a catalog de pictograme |
| 6 | **trei foi întregi, la înălțimea pânzei, centrate** | nimic suprapus, nimic tăiat pe dinăuntru |

**Trei intră** — cu marginile din stânga și din dreapta ieșind ~330 px din cadru, exact ca
în machetă, unde desenele curg în afara ecranului. Singurele tăieturi sunt marginile
pânzei, care se citesc oricum ca margine de ecran.

⚠️ **Scările DIFERĂ între foi**, și nu din întâmplare: în machetă blocul „Output A /
Output B" e vizibil mai mic decât secțiunea prin switch. Cu toate la aceeași înălțime,
`38.jpg` ieșea prea mare și trăgea ochiul în locul coloanei. De aceea `SHEETS` e o listă
de perechi `(fișier, scară)`: `11.png` 1.00 · `38.jpg` 0.78 · `34.jpg` 0.92.

⚠️ Lecția, dacă se mai umblă: **decupajul dreptunghiular dintr-o pagină nu știe unde se
termină un desen.** Orice variantă bazată pe el (3, 4) taie prin conținut. Ori muți pagini
întregi, ori muți elemente întregi — nimic între.

**Așezarea: FRAGMENTE ÎNTR-O GRILĂ (respinsă, vezi tabelul de mai sus).**
Userul, după două încercări: „parcă schemele sunt unele peste altele… fără scale să le
încadrezi pe toate". Constrângerea de fond, care explică ambele eșecuri: foile sunt
**portret** (raport ~0.72), pânza e **landscape**. Patru pagini întregi nu au cum să intre
una lângă alta fără să se calce — ori le suprapui, ori una iese un ciot. Verificat
amândouă: cu suprapunere iese terci, iar cu rând strict de patru, `39.jpg` ajungea să se
vadă doar 185 px din 760.

Dar **în machetă nu se văd pagini întregi, ci fragmente** — nicăieri nu apare un chenar de
pagină sau un cartuș. Deci `densest_band()` decupează AUTOMAT din fiecare foaie fereastra
de forma celulei cu cea mai multă cerneală, iar cele patru benzi se așază într-o grilă
2×2 care umple exact pânza. Zero suprapunere, zero goluri, zero chenare, toate cele patru
surse vizibile, și **nimic nu se mai așază de mână** — dacă schimbi `SHEETS`, restul se
recalculează.

**Scara, a doua corectură (2026-09-18).** Prima dată am mărit prea mult: userul a răspuns
„nu e scale-ul la care m-am așteptat" și a trimis cadrul din Figma la rezoluție mare.
Comparate alături, la aceeași mărime: în machetă sunt **mai multe elemente, mai mici**, iar
fundalul e făcut aproape numai din **desene** (vederi, cote, secțiuni), nu din tabele de
text. Acum: **șase foi la 1320 px**, în două rânduri decalate, alese să fie line art
(`11 · 38 · 34` sus, `33 · 35 · 22` jos). Lăsate deoparte deliberat: `36`/`39`
(OUTPUT CIRCUIT, MECHANICAL DRAWING — pagini dense de text) și `41`/`42` (datasheet USB,
numai text).
⚠️ **Potrivirea de șablon NU a mers** pentru măsurarea scării: corelația a ieșit 0.245 și
a nimerit capătul intervalului, deci n-a fost folosită. Scara e aleasă comparând cadrele
alăturate, nu măsurată — singurul loc din proiectul ăsta unde a fost așa, pentru că
imaginea de referință e un JPEG cu granulație peste care orice detector de cerneală dă
~36% și în machetă, și la noi.

**Ordinea: „de creion", nu „de citire" (2026-09-18, ÎNLOCUITĂ de bara de scanner).** Prima variantă sorta pe
benzi orizontale peste tot colajul. Userul a reclamat, pe bună dreptate: „schemele apar
random fără sens". Cu patru foi alăturate, o bandă orizontală le taie pe TOATE, deci
creionul desena o fărâmă din foaia 1, apoi din 2, 3, 4, apoi înapoi la 1 pe banda
următoare — zgomot, nu scriere. Acum (`cursive_order`), două niveluri:
- **global** — o foaie se termină înainte să înceapă următoarea (grupare după
  dreptunghiul din `LAYOUT`);
- **local** — în interiorul foii, drum de vecin-cel-mai-apropiat pornind din stânga-sus,
  cu `up_penalty = 2.5`, adică a urca pe foaie costă în plus. Fără înclinarea aia,
  vecin-cel-mai-apropiat pur zigzaghează în sus și în jos prin același paragraf și tot nu
  se citește ca o scriere.

**Trei momente, nu unul** (`SCRIM.fadeIn / drawn / fadeOut`): cerneala urcă de la 0 pe
primele 4% (altfel primele bucăți pocnesc), colajul e complet la **p = 0.78** ca să mai ai
o bucată de act în care să-l citești, apoi se stinge de la **0.86** până la 0.
⚠️ **Stingerea nu e înfrumusețare, e obligatorie:** în outro scrim-ul nu mai există deloc
(`scrim.visible = !isOutro`), iar fundalul devine `scene.background`. Fără fade, tot
colajul dispărea instantaneu exact la cusătură — singurul lucru vizibil la o tranziție
care altfel e măsurată invizibilă. Verificat: `uInk = 0.0000` pe ultimul cadru de pași.

**Intensitatea: `SCRIM.ink = 0.016`** (coborâtă de la 0.055 pe 2026-09-18, pentru că în
actul de pași vine TEXT de info peste fundal și la 0.055 desenele concurau cu el).
Valoarea nu e aleasă, e cea care aterizează pe machetă — acolo liniile stau la **+4.0
mediu / p99 +10.0**:

| `ink` | mediu | p99 |
|---|---|---|
| 0.055 | +6.70 | +27.9 |
| 0.040 | +5.63 | +21.6 |
| 0.030 | +4.85 | +17.0 |
| 0.022 | +4.23 | +13.8 |
| **0.016** | **+3.73** | **+11.2** |

⚠️ **p99 contează mai mult decât media** pentru lizibilitatea textului: liniile cele mai
aprinse sunt cele care deranjează, nu media pe zonă. De aceea 0.016 și nu 0.022, deși
0.022 are media mai aproape de referință.

⚠️ **Bara de scanner NU a coborât proporțional** (0.16 → 0.075, deci raportul
bară/cerneală a crescut de la 2.9 la 4.7). Bara trece și dispare, deci nu stă peste text;
cerneala rămasă în urmă stă. Dacă scanarea trebuie să se citească mai tare fără să crească
și fundalul, se ridică DOAR `beam`.

⚠️ **Pârghiile live scriu CONSTANTA, nu uniforma.** `setScrimSheet` rescrie `uInk` în
fiecare cadru din `SCRIM.ink` înmulțit cu plicul de fade, deci un reglaj scris direct pe
uniformă trăiește un singur cadru. Prima versiune a lui `__dbg.setInk` făcea exact asta:
baleiajul ieșea plat (+4.83 / +4.87 / +4.85 pentru trei valori diferite) și părea că
pârghia nu face nimic. Aceeași capcană ca la `outlinePass.enabled`, pe care `applySteps`
îl rescrie la fel.

Încadrarea e de tip „cover", calculată în `layoutScrim` din raportul de aspect, ca desenul
să nu se întindă cu fereastra.

### ⚠️ Bug de detecție a actului, scos la iveală de scheme (2026-09-18)

Vechea buclă cerea `r.top <= 1 && r.bottom > innerHeight * 0.5`. Pe **ultimele 50vh ale
fiecărui segment** nu se potrivea niciun act, iar `name` rămânea pe valoarea implicită,
`'intro'`, cu progres 1. Nu se vedea cât timp actele arătau oricum același cadru parcat —
dar ramura de intro resetează `uDraw`, deci desenele dispăreau brusc chiar înainte de
cusătură. Găsit măsurând `uDraw` la capătul actului de pași: **0.000 în loc de 1**.

Acum se alege **ultimul act care a început**, nu primul „îndeajuns pe ecran". Verificat pe
toate cele șase poziții (mijloc și coadă pentru fiecare act).

### Contur Fresnel pe piesele negre (2026-09-17)

Reclamația userului: „arcul și ultima piesă nu sunt așa bine vizibile, îți dai seama că
sunt acolo când apare highlight-ul pe ele. Să pară negre, dar să le poți vedea fără
highlight, fără să schimbăm culoarea fundalului."

**Măsurat înainte**, ca diferență de luminanță față de fundalul din jurul cutiei fiecărei
piese, în actul de pași — și sunt **trei**, nu două:

| piesă | contrast | | piesă | contrast |
|---|---|---|---|---|
| keycap | +60.2 | | **arc** | **+2.0** |
| carcasă superioară | +51.4 | | **lamelă de contact** | **−2.6** |
| carcasă inferioară | +47.7 | | **pini de contact** | **+2.6** |
| stem | +50.8 | | LED | +27.2 |

Lamela de contact e chiar mai ÎNCHISĂ decât fundalul.

**Soluția: un termen Fresnel adăugat la `outgoingLight`.** La incidență normală (mijlocul
piesei, spre cameră) e zero, deci corpul rămâne negru; la unghi razant urcă, deci piesa
își capătă muchia. Nu e un truc: e comportamentul real al unui dielectric, a cărui
reflectanță la unghi razant tinde spre 1 indiferent de culoare.

```js
const RIM = { 'Pipe': 0.65, 'Solid 368': 25.0, 'Solid 372': 28.0 };
const RIM_POW = 2.2;
```

⚠️ **Valorile diferă cu două ordine de mărime și nu e o greșeală — e geometria.** Arcul e
o spirală: văzut din lateral e aproape numai siluetă, deci termenul îl prinde tot (la 2.0
sărea deja la +47.6, mai luminos decât LED-ul). Lamela și pinii sunt plăci PLATE spre
cameră, unde Fresnel prinde doar muchia.

⚠️ **Metrica: „procent de pixeli din piesă peste fundal + 12", nu media.** Aceeași lecție
ca la σ — media e oarbă la o muchie subțire. Pe medie, pinii se mișcau de la +2.6 la +5.6
și păreau nerezolvați; pe pixeli vizibili au sărit de la 5.6% la 35.8%.

| | înainte | după | referință: piesele care se vedeau |
|---|---|---|---|
| arc | 18.2% | **35.6%** | 49-70% |
| pini de contact | 5.6% | **35.8%** | |
| lamelă de contact | 3.3% | 4.2% | |

⚠️ **LAMELA DE CONTACT rămâne nerezolvată — limită cunoscută, nu scăpare.** Fiind o placă
plată spre cameră, Fresnel îi aprinde doar muchiile de sus; corpul rămâne la −2.6.
Dacă trebuie ridicată, pârghia e alta (highlight speculat din poziția luminii, sau un
prag de ambient), nu asta.

**DRUMURI RESPINSE:**
- `envMapIntensity` — deja consemnat ca pârghie moartă: A/B 43 → 14.29 dă imagine
  IDENTICĂ, `introEnv` e prea închis ca să conteze pe piese;
- **o a treia lumină (kicker din spate)** — ar fi funcționat, dar configurația de lumini
  intră în cheia de cache a programului în three, deci intrarea ei în scenă recompilează
  TOATE materialele. Exact blocajul pe care îl evită tot mecanismul de warm-up. În plus
  ar fi atins și tastatura din intro, și restul coloanei;
- ridicarea albedo-ului — cerința era explicit ca piesele să RĂMÂNĂ negre.

⚠️ **Un singur `customProgramCacheKey` pentru toate trei**, nu unul pe piesă. Sursa de
shader e identică; diferă doar valorile uniformelor, iar three le ține per material chiar
când programul e partajat. Cu cheie pe piesă ieșeau **12 programe în plus** în loc de 4,
adică ~2 s în plus la preloader pe SwiftShader. Verificat după unificare, cu valori
diferite per piesă: „doar arc" aprinde numai arcul (39.60), ceilalți rămân la 12.96 /
16.03. Programe: 75 → **79**, constant în toate actele.

**Cusătura, verificată după schimbare** (ultimul cadru de pași vs primul de outro):
arc Δ**−0.59**, lamelă Δ**−0.05**, pini Δ**−0.03**. Sigură prin construcție — cele trei
piese sunt ACELAȘI obiect de material în ambele acte (`pieceMats[key]`, atribuit
hero-ului de outro în `loadOutro`), cu aceleași lumini și aceeași ceață oprită.

**Regresie:** cadrul de intro (tastatura pe birou) **0 pixeli peste 8** — piesele sunt
ascunse în tastatură acolo, deci nu se vede nimic. Verificat și pe tot parcursul
outro-ului (p = 0.03 / 0.15 / 0.28 / 0.40) că nu apare nicio aprindere excesivă la unghi
razant. Preloader pe build-ul de producție: 15,3-15,5 s pe SwiftShader.

### Conturul din actul de pași (2026-09-17)

Cele 8 piese se evidențiază pe rând, câte una, pe trackul de pași. `OutlinePass`, așezat
**după `OutputPass`** exact ca în `outro.html` — așa conturul nu mai trece prin tone
mapping și culoarea iese aia aleasă. `GradePass` rămâne ultimul, ca vigneta și grain-ul
să prindă și conturul; altfel el ar fi singurul lucru din cadru fără vignetă.

| valoare | sursa |
|---|---|
| `visibleEdgeColor` `#5cff9d` | `outro.html` |
| `hiddenEdgeColor` `#1c6b45` | `outro.html` (acolo derivat ca `visible × 0.35`) |
| `edgeStrength` 8.0 | `outro.html`, sliderul „Intensitate" |
| `edgeThickness` **0.5** | era 2.0 (`outro.html`, „Grosime") — subțiat 2026-09-28 |
| `downSampleRatio` **1** (`GLOW.res`) | era 2, implicitul OutlinePass — 2026-09-28 |
| rază blur glow **8**, 8 eșantioane (`GLOW.glowRadius`) | era 4 / 4 — 2026-09-28 |
| `edgeGlow` 0.55 | `outro.html`, „Împrăștiere" |
| `pulsePeriod` 0 | `outro.html` |
| `GLOW.fade` **0.18** | **nou** — vezi mai jos |

**Linie subțire, glow neschimbat (2026-09-28).** Cererea: arcul ieșea un bloc plin, nu se
mai citea ca arc. OutlinePass detectează muchia la jumătate de rezoluție, deci linia avea
~4 px de ecran înainte de orice blur, iar ×8 saturează și cozile; golul dintre spire are
2–3 px. Acum: detecție la rezoluție completă, `edgeThickness` 0.5, iar blur-ul de glow e
un material **reconstruit** cu 8 eșantioane și rază 8 texeli de jumătate de rezoluție =
aceiași 16 px de ecran ca înainte. Glow-ul pe inelul din jurul arcului: 18.80 → 18.64
(media G), deci neschimbat. Respinse: doar `thickness` 1 (spirele rămân contopite);
`downSampleRatio` 1 cu raza 8 pe materialul ORIGINAL (4 eșantioane → glow în trepte).
Pârghie: `__dbg.setGlowRes(res, radius)`; grosimea direct pe `__dbg.outlinePass.edgeThickness`.
Cost: masca și detecția de muchie la rezoluție completă, doar în actul de pași.

**Preloader (2026-09-28):** muchii `LineMaterial` **1.0 px** (era 1.8), siluetă **0.8 px**
(era 1.6) — `PL_LW` în `scene/index.js`, sliderele „Grosime muchii / siluetă" din
`tools/preloader.html`. La 1.2 / 1.0 spirele arcului încă se lipeau.

**Ordinea nu e hardcodată.** Se citește Y-ul real al fiecărei piese la clipul PARCAT
(`t = clipDur`) și se sortează de sus în jos. Verificat la runtime — iese exact tabelul
din `SITE_FLOW.md` §2: *keycap · stem · carcasă superioară · arc · lamelă de contact ·
carcasă inferioară · LED · pini de contact*. Etichetele sunt cele CORECTE din `SITE_FLOW`,
nu `STEP_LABELS` din `preview.html`/`outro.html`, care are carcasele inversate.

**Plicul unei felii** (de ce nu e ca în outro): trackul se taie în 8 felii egale; în
fiecare, conturul intră pe primele 18%, stă la maxim, iese pe ultimele 18%, cu
`smoothstep` la capete (o rampă liniară se citește ca două praguri pe un contur luminos).

⚠️ **DRUM RESPINS: „Suprapunere piese 0.30" din `outro.html`.** Formula de acolo,
`w = (f + ovl) / (1 + 2·ovl)`, **nu coboară niciodată la 0** la granița dintre felii: la
0.30, predarea se face la `sin(π·0.1875) = 0.556` din intensitate. Iar `OutlinePass` are o
singură `edgeStrength` pentru tot ce e în `selectedObjects`, deci piesa veche NU poate
scădea în timp ce noua crește — conturul POCNEȘTE de pe o piesă pe alta la 4.4 din 8. În
`outro.html` e intenționat (acolo e un puls care TRECE prin coloană); aici fiecare piesă e
un capitol de info cu text în DOM, deci conturul trebuie să stea aprins cât se citește.
Un crossfade adevărat ar cere un **al doilea `OutlinePass`**, adică încă un set de render
target-uri full-screen — nu merita pentru un efect pe care plicul îl dă deja curat.

Rampa măsurată peste granița 1→2, simetrică și continuă:
`8.00 · 7.71 · 4.89 · 1.87 · 0.000 | 0.000 · 1.87 · 4.89 · 7.74 · 8.00`.

⚠️ **`renderer.compileAsync` NU acoperă `OutlinePass`.** Pass-ul are shaderele lui (mască,
două treceri de blur, compunerea muchiei) plus un `overrideMaterial` de adâncime pe toată
scena — nimic din astea nu e un material din scenă, deci `compile()` nu le vede. Se leagă
doar randând un **cadru REAL** cu pass-ul aprins (`warmOutline()`, sub preloader, pe starea
`applyIntro(1)`, cu prima și ultima piesă). Fără el, blocajul cade exact la intrarea în
actul de pași, unde coloana stă pe loc și se vede cel mai prost. Verificat:
`renderer.info.programs.length` = **75 constant** în toate actele (68 înainte de contur).

⚠️ **Capcană la cadrul de încălzire, prinsă de user pe 2026-09-17.** `applyIntro(p)`
**SCRIE** `introProgress`. Deci un warm-up care face `applyIntro(1)` și apoi „restaurează"
cu `applyIntro(introProgress)` reaplică tot 1 — scena rămâne parcată pe finalul clipului.
Iar `updateScroll()` nu apucă să corecteze, pentru că începe cu `if (!revealDone) return;`:
pe toată durata reveal-ului scena rămâne înghețată în starea de încălzire. Se vedea la
ORICE încărcare, inclusiv prima și în incognito — după ce preloaderul și blur-ul se
stingeau, apărea coloana explodată în loc de tastatura de pe birou. Progresul se reține
într-o variabilă locală ÎNAINTE (`const pWas = introProgress`). Același tipar e valabil
pentru orice funcție care scrie o stare globală „pe ascuns"; `warmFrame()` din `loadOutro`
scapă doar pentru că nu cheamă `applyIntro` cu altă valoare.

Cost, măsurat în actul de pași: draw calls **16 → 34**, triunghiuri **16.004 → 29.217**
(pass-ul re-randează scena mică pentru adâncime + mască). `enabled = false` în intro și
outro, deci acolo costul e zero. Regresie pe cadrele de intro / cusătură: **0 pixeli
peste 8**.

### Scroll-ul revine SUS la refresh (2026-09-17)

Implicit browserul restaurează poziția de scroll după `load`, iar scena pornea din mijlocul
unui act cu preloaderul deja consumat. Trei locuri, toate necesare — unul singur nu ajunge:

1. `history.scrollRestoration = 'manual'` într-un `<script>` **clasic, în `<head>`** (nu în
   modul): oprește restaurarea browserului.
2. `scrollTo(0, 0)` la pornirea modulului **și** pe `pageshow` — revenirea din bfcache
   (Înapoi/Înainte) nu reexecută modulul, deci nimic din pasul 1 nu s-ar mai întâmpla.
3. `scrollTo(0, 0)` + `lenis.scrollTo(0, { immediate: true, force: true })` **înainte** de
   `lenis.start()`, în `updateReveal`: Lenis își ține propria poziție interpolată, iar dacă
   pornește cu ea nenulă primul cadru sare.

Verificat: din actul de outro la `scrollY = 15300`, după reload → `scrollY = 0`, act
`intro`, `p = 0.000`.

⚠️ **Pentru harness:** dispariția lui `#pl` nu mai e semnalul de „gata de derulat".
Resetarea la 0 se face abia la capătul fazei de blur, deci un scroll programatic trimis
imediat după ce `#pl` dispare e anulat. Semnalul corect e
`!document.getElementById('pl') && !document.body.classList.contains('locked')`.

### Aterizarea keycap-ului erou în câmp (2026-09-17)

Exact ce face hero-ul identic cu intro-ul îl face, la capătul outro-ului, **diferit de
vecinii lui**: materialul copt al intro-ului și, mai ales, `fog = false`. Ceața de outro
e `FogExp2` la 2.12, iar câmpul stă la ~1,1 unități sub cameră, deci vecinii sunt împinși
aproape complet spre culoarea fundalului — hero-ul, scutit de ceață, rămâne singurul
obiect nefogat din cadru. Măsurat pe populația celor 12 taste vecine, keycap-ul erou era
la **+3.38 σ** pe luminanță (46.4 vs 31.9 ± 4.3): un outlier statistic, de unde citirea
de „sticker lipit peste câmp".

**Soluția nu e o compensare de culoare**, care n-ar putea reproduce nici legenda de câmp
nici căderea ceații, și care ar strica cusătura de la începutul outro-ului. Se
ÎNCRUCIȘEAZĂ două mesh-uri purtate de aceeași animație:

| strat | geometrie | material | rol |
|---|---|---|---|
| dedesubt | `heroCapMesh.geometry` (intro) | `heroCapIntro` | neatins → cusătura la p=0 rămâne identică |
| deasupra | `Plane.087` (outro) | clonă de `Keycaps_Col 1` prin `patchKeycap`, în `capMats` | la opacitate 1 E, prin construcție, un vecin |

Stratul de deasupra e literalmente ce a exportat Blender pentru tasta aia: același
material ca al vecinilor, același UV (deci **aceeași literă, „U"** — fără morf de
legendă), aceeași ceață, același `FIELD_MUL` scris în fiecare cadru de `applyActBlend`.

```js
const HERO_LAND = { from: 0.38, to: 0.62 };   // în progresul actului de outro
// opacitate = THREE.MathUtils.smoothstep(p, HERO_LAND.from, HERO_LAND.to)
```

**Fereastra e aleasă pe animație, nu din ochi.** Între p=0.38 și p=0.62 camera își face
aproape toată rotirea (pitch-ul se mută cu ~40° din cei ~67 totali) iar keycap-ul coboară
de la y=0.246 la y=0.057 din cursa lui — adică exact intervalul în care se mișcă oricum
tot cadrul. Înainte de p=0.38 keycap-ul e încă erou pe fundal negru și rămâne aprins;
după p=0.62 e o tastă ca oricare.

Rezultat măsurat la capăt, față de aceeași populație de 12 vecini:

| | luminanță | σ (detaliu) | z-score lum |
|---|---|---|---|
| înainte | 46.39 | 26.90 | **+3.38 σ** |
| după | 31.06 | 16.34 | **−0.18 σ** |
| vecini | 31.83 ± 4.33 | 17.46 ± 6.46 | — |

**Costuri verificate, toate nule sau neglijabile:**
- `transparent` **intră în cheia de cache a programului** (three r176,
  `parameters.opaque`, layer 17), deci se pune O SINGURĂ DATĂ la load, ca programul să se
  lege în cadrul de încălzire de sub preloader. Programele trec de la 64 la 68 și rămân
  **68 constant în toate actele** — zero compilări după reveal.
- Durata preloader-ului: 14,1 s vs 14,15 s (SwiftShader, două rulări fiecare) — sub
  variația de la o rulare la alta.
- Draw call-uri: 100 → 102, doar cât e vizibil stratul. Triunghiuri +3.472.
- Regresie: intro, pași și cusătura diferă de varianta dinainte cu **0 pixeli peste 8**
  (maximele de 6,7–7,7 sunt granulația animată din GradePass).

⚠️ Cele două mesh-uri sunt COPLANARE (aceleași triunghiuri, alt ordin de vârfuri). Fără
`polygonOffset -1` și `depthWrite = false` pe stratul de deasupra, testul de adâncime dă
speckle pe toată suprafața.

⚠️ Stratul se agață de nodul `H_keycap` **după** traversarea din `loadOutro`, nu în
timpul ei: `traverse` iterează `children` pe viu, iar un copil numit `H_keycap_land`
trecea de `/^H_keycap/` și își făcea la rândul lui un copil, la infinit
(`RangeError: Maximum call stack size exceeded`). Testul de nume e acum ancorat
(`/^H_keycap$/`) ȘI copilul se adaugă în afara buclei — două garduri, nu unul.

**Două greșeli de măsurare care au costat două runde, de evitat:**

1. ⚠️ **Media luminanței e ORBĂ la detaliu.** O suprafață plată și una texturată pot avea
   exact aceeași medie. Reclamația userului („în intro piesele par mai detaliate, cu umbră
   pe ele; în outro mai plate") era invizibilă în toate tabelele mele de medii, care
   arătau potrivire sub 1.4. Instrumentul potrivit e **deviația standard în interiorul
   piesei**: ea a arătat raport 0.49 pe keycap și 0.83 pe carcase. Pentru „detaliu",
   „contrast", „textură" se măsoară σ, nu media.
2. ⚠️ **Un test care nu schimbă nimic nu dovedește nimic.** Prima măsurătoare de ceață
   „dovedea" că ceața nu atinge coloana (Δ ±0.2) și pe baza ei am construit două runde de
   compensări. Era void: înghețase densitatea pe 0.18 **în actul de pași**, unde bucla o
   punea oricum la 0.18 — deci compara 0.18 cu 0.18. Refăcut corect, **în actul de outro**:
   cu densitatea coborâtă de la 2.12 la 0.18, hero-ul devine identic la virgulă
   (103.8/26.50 vs 103.8/26.43). Ceața era toată diferența rămasă: ridică negrele și taie
   contrastul cu ~30%. Verifică întotdeauna că valoarea forțată DIFERĂ de cea curentă.

**Drumuri respinse, toate măsurate:**
- culori plate per piesă în outro (`PIECE_COL`) + compensare pe medie: numeric ieșea sub
  1.4, dar piesele arătau **plate**, fără umbra coaptă;
- două seturi de compensare, câte unul per stare de lumină: corect la capete, dar la
  jumătatea drumului interpolarea depășea cu +30 pe luminanță;
- ridicarea arcului și a contactului prin emisie în intro (`INTRO_EMI0`);
- atribuirea doar a MATERIALULUI intro-ului, fără geometrie: atlasul cade pe UV-uri
  greșite (keycap gri-închis, Δ −61);
- aceleași lumini în ambele acte **plus** lumina de outro: hero-ul iese cu +55 pe
  luminanță, fiind luminat de trei surse în loc de două.

⚠️ **Câștigul pe B** (0.97 intro → 1.16 outro; era 1.28 înainte de 2026-09-17) se mută pe fereastra de reveal
(3.00 → 4.60 s), nu la cusătură: el schimbă fundalul (B 22.4 vs 20.4), iar acolo planșa
dispare oricum în spatele scrim-ului. Se scrie ca `max(t, revealK)`, pentru că în outro
`applyIntro` nu se mai apelează.

⚠️ **`perr.py` are o fereastră de 60 s, nu 12.** Erorile din callback-ul lui
`loader.load` apar după ce GLB-ul de 8,8 MB se decodează (~20 s pe SwiftShader). Cu 12 s
am ratat un `ReferenceError`, am măsurat **preloaderul** crezând că măsor outro-ul, și
valorile ieșeau de 4× mai mari cu „panta zero" pe jumătate din piese.

### Zero compilări de shader după preloader (2026-09-15)

Blocajul „de o singură dată când switch-ul iese din tastatură" era compilare de shadere în
mijlocul animației. Măsurat pe `renderer.info.programs.length`: **23 după reveal → 30 la
4.5 s → 48 la 6.2 s**, adică 25 de programe legate sincron, în timpul animației.

Trei cauze, în ordinea în care au fost găsite:
1. **`RectAreaLight`-ul de outro, adăugat în scenă la 65% din intro.** În three.js
   configurația de lumini intră în cheia de cache a programului, deci în clipa în care
   intră lumina **toate** materialele își recompilează shaderul. Rezolvat: lumina se
   creează la pornire, iar precompilarea din `loadIntro` leagă ambele configurații (cu și
   fără ea) — programele rămân în cache.
2. **Outro-ul se încărca la 65% din intro.** Mutat în preloader: `loadOutro(startReveal)`,
   deci reveal-ul pornește abia când și outro-ul e gata. GLB-ul are 1,77 MB, iar
   preloader-ul există exact ca să acopere așteptarea.
3. **`renderer.compileAsync` nu e suficient.** Rămâneau 8 programe (`physical,STANDARD` —
   cele 7 clone de piesă + placa). ⚠️ Am crezut că e vizibilitate pe lanțul de părinți și
   am aprins tot subarborele: tot 8. Soluția care funcționează e **un cadru REAL** cu
   outro-ul pe ecran, sub preloader — prin definiție compilează exact ce are nevoie un
   cadru real. ⚠️ Cadrul de încălzire trebuie să ruleze **înainte** de restaurarea
   vizibilității (`visWas` reține starea de după load, unde `outroRoot.visible` e deja
   false — altfel randezi un outro invizibil și nu compilează nimic; se vedea că rămâneau
   tot 5 programe).

Rezultat verificat: **56 de programe după reveal și 56 în orice punct** din intro, din
actul de pași și din outro.

## 8. Fișiere## 8. Fișiere

- `keycap_scene_web.glb` — livrabilul
- `bake_textures/` — PNG-urile master (16-bit), pentru orice regenerare viitoare
- `key_keyboard_project.blend` — fișierul de lucru (rig viu, materiale procedurale)
- `key_keyboard_project_EXPORT.blend` — copia din care s-a exportat (texturi scalate, materiale coapte)
