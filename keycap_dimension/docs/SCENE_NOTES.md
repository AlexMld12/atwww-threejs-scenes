# Note de scenă — key_keyboard_project.blend


> ⚠️ **CĂILE DIN ACEST FIȘIER SUNT DE DINAINTE DE REORGANIZAREA DIN 2026-09-17.**
> Traducerea, o dată pentru tot documentul:
> `bake_textures/` → `source/bake_textures/` · `*.blend` → `source/blend/` ·
> `Prebaked_project/` → `source/prebaked/` · `assets/` → `source/assets/` ·
> `keycap_scene.glb` / `_draco.glb` → `source/exports/` ·
> GLB-urile livrabile → `web/public/models/`.
> Nimic din conținutul de Blender nu s-a schimbat — doar unde stau fișierele.
*Actualizat: 2026-07-07 · Blender 5.1.2 · Cycles · Proiect: website Three.js cu orbită interactivă*

## Pregătirea geometriei pentru bake (FĂCUT — 2026-07-07)
Diagnostic complet pe toate mesh-urile vizibile + curățare aplicată. Backup: `key_keyboard_project_BACKUP_pre_normalfix.blend`.

**Normale în interiorul mesh-urilor: perfecte** — zero winding inconsistent, zero scale negative. DAR userul a prins cu Face Orientation ce testele de consistență nu pot prinde: foi single-sided uniform întoarse. **Fixat prin flip (reverse_faces pe mesh-ul de bază):** `document 1`, `document 3`, `document 3.001` (birou, arătau în jos), `document 1.001`, `document 1.002` (blueprints pegboard, arătau în perete), `Plane.002` (mat birou, arăta în jos). **Sticky notes (16 buc):** orientare corectă, dar Solidify de 0,076 mm dădea z-fighting (pete roșii camuflaj) → grosime mărită la 0,4 mm. Roșu legitim rămas: interiorul paharului de pixuri, dosul colțurilor îndoite ale notes-urilor — NU se "repară".

**Curățat (pe mesh-urile de bază):** vârfuri duplicate sudate la 1µm + geometrie degenerată eliminată pe: Plane.002, Cube (carcasă, -92 verți), Cube.001, Switch_Plate, PegboardFrame, PegboardPanel_WebSingle, eraser, mouse_computer, Simple Click Pen. Scale non-uniform aplicat pe `wall`.

**Fețe coplanare rămase (de urmărit la bake — vin din falduri de modificatori, randează curat):** pen_box ~270 (buza de sus a cutiei), Cube ~39 (banda de jos a carcasei), Blue textmarker ~54 (zonă mică), Plane.002 ~20, clips ~24. Dacă apar pete/speckle în lightmap-ul acestor obiecte exact în zonele astea, aici e cauza.

**Întrepătrunderi de volume (INOFENSIVE, nu se repară):** clips ~8k (agrafele din grămadă se ating între ele), Cube ~9.6k (solidify + piese carcasă), pegboard 911 (T-seams la construcție, prin proiectare). Dau umbre de contact naturale.

**Audit UV (important pentru setările SimpleBake):**
- Toate cele 84 de keycaps: UV degenerat (arie ~0) → la PBR bake bifezi în SimpleBake generarea de UV-uri noi (Smart UV Project) sau le despachetezi înainte. Legendele randează OK acum pentru că materialul nu folosește UV-ul actual.
- UV tiled/suprapus (OK pentru texturi repetitive, dar NU pentru bake pe el): Plane.002 (95% în afara 0-1, tiling intenționat), pen_box (5.2×), Simple Click Pen (6.8×), Sphere.002, clips, wall, cork_board (2×, probabil mirrored) → toate au nevoie de UV nou la bake.
- FĂRĂ UV deloc: Switch_Plate, pencil.002.
- Plane.002 are deja 2 canale UV.

## Obiectiv
Website profesionist în Three.js: animație pe keycaps/switch-uri + animație de cameră bake-uită, apoi scenă exportată glTF (Draco/KTX2, țintă <15 MB), cu interacțiune de orbită. Decizie luată: NU secvență de imagini randate, ci scenă 3D reală optimizată.

## Conexiunea la Blender
- Add-on **blender-mcp** activ pe `localhost:9876` (socket JSON: `execute_code`, `get_scene_info`, `get_viewport_screenshot`).
- Script helper: `blender_conn.py` (în scratchpad-ul sesiunii Claude; se poate recrea ușor).

## Starea optimizării (FĂCUT)
**2.420.000 → 780.000 triunghiuri, fără pierdere vizuală.**

| Obiect | Ce s-a făcut |
|---|---|
| PegboardPanels (×2, vechi) | Înlocuite complet cu `PegboardPanel_WebSingle` — vezi mai jos |
| pen_box | Subsurf 2→1 (viewport+render): 309k → 77k |
| Blue textmarker pen | Subsurf 2→1: 53k → 13k |
| Simple Click Pen | Subsurf render 3→2 |
| clips (agrafe) | Modificator Decimate COLLAPSE ratio 0.25: 331k → 83k |

### Pegboard reconstruit de la zero: `PegboardPanel_WebSingle`
- **Un singur panou continuu** (fără cusătură pe mijloc), 289k tris vs 1.394k originalul cu bevel. În colecția `peg_board`, parentat la `wall_frame`.
- Specificații reverse-engineered din original: grilă 96×47 = 4.512 găuri, spacing 13,975 mm, început grilă la world X=-0.62939 Z=0.84323; gaură ⌀4 mm la suprafață (r_out 2.0 mm), șanfren MDF 0,2 mm → bore ⌀3,6 mm **străpuns** (întunericul din găuri = umbră reală, nu culoare); grosime placă 2,6 mm (Y world: față 0.38017, spate 0.38279); FĂRĂ fețe pe spate (nu se văd niciodată).
- Materiale în aceeași ordine de sloturi: `PegboardPaint` (slot 0, fața), `PegboardMDF` (slot 1, șanfren+bore). Ambele procedurale pe coordonate **Generated** → rezolvat prin `use_auto_texspace=False` + texspace copiat de la panoul original (scara zgomotului identică, continuă fără seam).
- UV planar curat 0–1 pe toată placa → gata de lightmap bake.
- Winding verificat pt. backface culling Three.js (bore-urile cu normalele spre interior).

### Backup-uri (NU s-au șters!)
- Panourile vechi `PegboardPanels` + `PegboardPanels.001` (stare pristină, cu Bevel): colecția **`_backup`**, care e ÎN colecția `Keyboard` (Outliner: Keyboard → _backup, exclusă din view layer). Tot acolo: `Plane.053` (backup mai vechi al userului).
- Fișier complet pre-optimizare: `key_keyboard_project_BACKUP_pre_optim.blend` în folderul proiectului.

## Lecții învățate (nu repeta greșelile)
- Bevel-urile minuscule (0,1 mm) pe mesh-uri plate smooth-shaded există pentru **ruperea normalelor**, nu pentru siluetă — dezactivate brut produc shading "matlasat". Alternativă cu cost zero: modificator Weighted Normal.
- Decimate COLLAPSE distruge suprafețele plane smooth-shaded (bumps). Pe geometrie de tip panou cu găuri, decimate nu ajută deloc (97% din geometrie e în pereții găurilor) — reconstrucția e soluția.
- Verifică ÎNTOTDEAUNA vizual (screenshot viewport) înainte de a declara o optimizare reușită.

## Audit UV pentru Cycles bake (FĂCUT — 2026-07-07, după UV-urile manuale ale userului)
- **27 obiecte statice OK**, inclusiv toate cele refăcute manual (Switch_Plate, wall, cork_board, pen_box, Simple Click Pen, Sphere.002, clips, pencil.002).
- **Fixat automat:** `Plane.002` — canalul UV curat ("UVMap") setat ca activ (era activ cel cu tiling "UVMap.001"; SimpleBake bake-uiește pe canalul ACTIV!); `Bolts` — Smart UV Project nou (UV-ul era colapsat, arie 0).
- **REZOLVAT definitiv (decizia userului: nu avea nevoie de modificatori):** Solidify APLICAT pe `Cube` + cele 16 StickyNotes, Mirror APLICAT pe `mouse_computer` (backup: `key_keyboard_project_BACKUP_pre_applymods.blend`). Pe fiecare am creat canal **"BakeUV"** nou (Smart UV, fără suprapuneri, setat ACTIV = ținta bake-ului), iar canalul original "UVMap" a rămas neatins și `active_render` (materialele/scrisul de pe notes se citesc tot prin el). La bake: SimpleBake scrie pe BakeUV; la export, mesh-urile astea folosesc BakeUV + textura bake-uită.
- **TODO opțional userul cu UVPM3:** BakeUV-ul lui `Cube` are utilizare slabă (7% — multe insule mici); de reîmpachetat cu UVPackmaster (UV Editor → canal BakeUV → select all → Pack) pentru texel density mai bun. Notes ~50% ✓, mouse 38% ✓.
- **UVPackmaster 3.4.4 PRO instalat** (engine în `~/Library/Application Support/UVPackmaster/engine3`, cale setată în preferințele add-on-ului; NU în /Applications, unde zace un engine vechi 3.2.6 al unei instalări din 2024). Depozitul de extensii superhivemarket.com dezactivat (dădea alerta de sync); vechea extensie UVPM 3.2.6 dezactivată.

## Cum funcționează rig-ul (inspectat complet)
- Toate cele **84 keycaps**: drivers pe `delta_location` ← `KEYCAPS_LIFT_CTRL`. Parentate la empty-ul `Keychron K2 V2`.
- Toate cele **84 switch-uri**: EMPTY-uri instanță de colecție → `Switch_source` (7 piese), drivers pe `delta_location` ← `SWITCHES_LIFT_CTRL`.
- `SW087_EXPLODE_CTRL` → piesele din `SW087_parts` (explode view switch).
- Colecția `Rig` = cele 3 CTRL-uri. Camera: fără constraints, liberă.
- Keycaps au modificatori: Bevel + Subsurf(1/2) + Smooth by Angle (~1.700 tris/buc evaluat — deja OK, NU se optimizează).

## Plan export glTF (dedus, de urmat)
1. **Animația se face pe rig** (CTRL-uri) — comod și editabil. Driverele NU se exportă în glTF!
2. **La export: bake de drivers** → script care evaluează transformarea vizuală pe fiecare frame și scrie keyframe-uri TRS reale pe fiecare keycap/switch, apoi șterge driverele și zero-uie delta-urile — pe o COPIE de export, fișierul de lucru rămâne cu rig-ul viu.
3. Instanțele de colecție se exportă ca noduri cu mesh partajat ✓. Camera animată se exportă ca nod ✓ (în Three.js: AnimationMixer pentru cinematic → handoff la OrbitControls).
4. Texturi: 56 imagini, mai multe la 4K → redus la 1-2K pentru web, KTX2.

## Strategia de bake cu SimpleBake (decisă cu userul)
- **Obiecte ANIMATE** (keycaps, switch-uri, SW087_parts): DOAR PBR Bake — Base Color, Roughness, Metalness, Normal. FĂRĂ Combined/Diffuse/Lightmap și FĂRĂ AO (AO-ul ar "ștampila" ocluzia vecinilor pe obiecte care se mișcă — ex. switch negru pentru că stă sub keycap). Poziția la bake nu contează pentru canalele PBR. Switch-urile: bake O DATĂ pe piesele `Switch_source` → toate instanțele îl folosesc.
- **Obiecte STATICE** (birou, cutting mat, pegboard, hârtii, plante, carcasă): bake cu lumină (lightmap pe UV2 / Combined), dar **cu obiectele animate ascunse de la randare** — altfel umbrele tastelor rămân arse pe placă și se văd când tastele se ridică.
- **Umbre dinamice în Three.js**: 1 DirectionalLight aliniat cu `Top_main`; castShadow doar pe obiectele animate, receiveShadow pe placă/birou.
- UV-uri noi necesare DOAR pentru: cele 31 de materiale procedurale (bake target) + canal UV2 de lightmap pe statice. Cele 24 de materiale cu texturi imagine își păstrează UV-urile.

### Setări SimpleBake CyclesBake (validate, standard)
- Mod: **Diffuse** (Direct+Indirect+Color) — NU Combined (evită reflexii glossy view-dependent înghețate). Margin 16px, denoise ON, PNG 16-bit, export `//bake_textures/`, sub-folder per obiect, `copy_and_apply` emission (copii de verificare în colecția `SimpleBake_Bakes`), color space bake = **sRGB** (identic pe toate — NU "Gamma 2.2 Encoded AP1").
- Samples: **512** pt. obiecte mici; **2048** pt. suprafețe mari difuze (perete, birou).
- ⚠️ **NU activa Adaptive Sampling** pe suprafețe plate mari — combinat cu denoise produce artefacte de "acuarelă"/valuri. Doar samples uniforme + denoise.
- Batch = mai multe obiecte în listă (`objects_list`, via `obj_point`), fiecare cu textura lui; NU merged/atlas.
- Shader Three.js per material: **mat** (perete, pegboard, hârtii, sticky notes, plante) → doar emisie/MeshBasic. **Lucios** (birou, carcasă, cutting mat, plastic pixuri) → emisie + roughnessMap + envMap.

### Progres bake (statice, CyclesBake) — done
- **Diffuse→emisie (mate + dielectrice):** `table_desk` (2048), 16× StickyNote (1024), `PegboardFrame`+`PegboardPanel_WebSingle` (2048), `wall` (1024, 2048 samples), 2× blueprint perete (2048), `cork_board`/cutting mat (2048, lucios→+reflexie preview OK), 5× `doc_table_1..5` (2048), 5 pixuri/creioane (1024: Blue textmarker/Pencil/Simple Click Pen/pen_02/pencil.002), `eraser` (1024).
- **Combined→emisie (metal, reflexii înghețate OK pt. obiecte mici):** `clips` (2048, 1024 samples) ✓.
- **NU se bake-uiesc (rămân PBR real + envMap):** metalele. Decis cu userul.

### Categorii material (REGULA finală, validată)
- **Mat** (perete, hârtii, pegboard, sticky, plante) → Diffuse→emisie. Copia arată identic cu render.
- **Dielectric lucios** (birou, cutting mat, mouse — Metallic 0) → Diffuse→emisie + roughnessMap + normalMap + envMap. Copia „emisie plată" pare ștearsă — NORMAL, luciul revine la export.
- **Metal** (Metallic 1: clips, bolts, orice „black metal") → NU Diffuse (difuzul e negru!). Ori Combined→emisie (reflexii înghețate, OK pt. mic/haotic), ori PBR real+envMap.

### pen_box — REVENIT LA ORIGINAL (userul a șters reconstrucția)
Userul a șters `pen_cup_web`/`pen_markers` și folosește din nou **pen_box original** (77k tris, cupă cu plasă alfa: `AlphaMesh.jpg`+`NormalMEsh.jpg`, blend HASHED). De tratat la export ca PBR real (alphaTest + metalness + envMap). Secțiunea de mai jos = istoric al reconstrucției abandonate.

### [ABANDONAT] pen_box reconstruit (2026-07-23)
Original 77.192 tris (cupă alfa-mesh 512 + solid metal 10k + **4 markere ~66k**) → înlocuit. Backup: `key_keyboard_project_BACKUP_pre_penbox.blend`; originalul în colecția exclusă `_penbox_backup`.
- **`pen_cup_web`** (640 tris): cupă nouă solidă conică (r_jos 3,26 / r_sus 4,47 cm, h 9,1cm, centru 0.565,0.259, z 0.744-0.835), Solidify 2,5mm + Weighted Normal, UV Smart Project, material `black metal`. FĂRĂ alfa (userul nu voia complicații în three.js; cupa se vede puțin în anim). De bake-uit Combined ca `clips`.
- **`pen_markers`** (66k→13.224 tris): markerele separate din pen_box (delete fețe cup-mat), Decimate COLLAPSE 0.2. Vizual OK.
- Total nou: **13.864 tris** (de la 77.192, −82%).
- ⚠️ Colecția veche `_backup` (din Keyboard) NU mai există sub acest nume — folosește `_penbox_backup` / verifică Outliner.

## Inventar scenă (referință rapidă)
254 obiecte: 147 mesh, 97 empty, 9 lumini Area (4 seturi: Lights_0_Current/1_SideKey/2_Backlight/4_Raking + Light Linking), 1 cameră, 61 materiale (31 procedurale / 24 cu imagini). Frame range 1–250. Render 4K. RigidBody: pen_box. Tris per colecție (după optimizare): peg_board 289k, Keycaps 146k, stationery 98k, Case 97k, RigidBodyWorld 77k, plante 35k, doc_paper 20k, SW087_parts 10k, Sticky Notes 5k.

### 🎉 TOATE BAKE-URILE COMPLETE (2026-07-25)
- **Statice:** tot ce e în bake_textures/ (vezi listele de mai sus + case_big/case_small Combined, plants, mouse Combined, pen_box_wire+pen_markers Combined).
- **pen_box final = `pen_box_wire`** (cupă de sârmă construită de la 0: fire-tub elicoidale, 7k tris, opacă, scalată 1.15× împreună cu pen_markers; pivotul la bază). `pen_box` simplu = fallback ascuns.
- **PBR atlase animate:** `switch_atlas` (7 piese Switch_source pe canal "AtlasUV" — grilă 3×3 manuală, NU Smart Atlas care dă confetti; acoperă automat și SW087_parts care partajează mesh-urile!) + `keycaps_atlas` (84 taste, 4096, doar Diffuse+Normal; New UVs Smart Atlas; legende verificate crocante pe model).
- **Pentru developer:** keycaps → metalness=0, roughness=0.5 (constante, nu hărți). Switch translucid copt opac (de revizitat doar dacă deranjează).
- ⚠️ Lecție SimpleBake: dacă un bake crapă la mijloc, curăță imaginile duplicate (`D.images` cu .001/.002), materialele `SBW_*` și copiile `_Baked` moarte înainte de re-bake — altfel dă "Found N images looking for...".
- ⚠️ Copiile `_Baked` din SimpleBake_Bakes stau SUPRAPUSE peste originale (aceleași poziții) — ține-le ascunse până la asamblarea exportului.

## ✅ EXPORT FĂCUT (2026-07-25) — `keycap_scene_web.glb`, 8,64 MB
Predare completă către dev: **`THREEJS_HANDOFF.md`** (cod + setări). Export făcut din `key_keyboard_project_EXPORT.blend` (copie; master-ul rămâne cu rig viu).

**Ce s-a făcut la asamblare:**
- Material `switch_atlas_Baked` aplicat pe piesele din `Switch_source` → cele 84 de instanțe + cele 7 piese SW087 au primit look-ul copt (partajează mesh-urile).
- **FIX critic UV:** cele 7 mesh-uri de switch aveau canalul "after bake" pe index 0 (= TEXCOORD_0 în glTF) și AtlasUV pe 1 → am șters "after bake", a rămas doar AtlasUV. Fără asta, switch-urile ar fi ieșit cu mapare greșită.
- 46 de texturi scalate în copia de export (documente 2048→1024, sticky notes/mărunțiș →512, keycaps Normal 3072→2048, switch Rough/Metal →512). Master-ele PNG neatinse.
- `Pipe.002` (arcul switch-ului, 6048 tris) decimat 0.35 → 2116; per switch 10.404→6.472 tris (×84 = 544k în loc de 874k).
- **Driverele NU au fost bake-uite manual** — `export_bake_animation=True` din exportatorul glTF le eșantionează singur. Economie mare de timp; de reținut pentru viitor.

**Setări export folosite:** GLB, `use_visible=True`, `export_apply=True`, cameras ON / lights OFF, `animation_mode='SCENE'` + `anim_scene_split_object=False` + `merge_animation='NLA_TRACK'` → **un singur clip "Scene"**, WebP q88, Draco level 6 (pos 14 / normal 10 / uv 12).

**Rezultat:** 816 noduri, 312 mesh-uri, 51 materiale, 54 texturi WebP, 1 cameră, 1 clip de 6,25 s cu 176 canale (175 noduri animate).
⚠️ Performanță de urmărit: ~1,27M triunghiuri și ~730 draw calls (588 din piesele de switch) — mitigări listate în THREEJS_HANDOFF.md secțiunea 7.

## Pași următori (TODO)
1. ⏳ Animație keycaps/switches (CTRL-uri) + animație cameră → bake cameră
2. ⏳ SimpleBake conform strategiei de mai sus
3. ⏳ Script bake drivers → keyframes TRS (pe copie de export)
4. ⏳ Export glTF + Draco + KTX2, țintă <15 MB
5. ⏳ Three.js: env + lumini dinamice + umbre pe animate + OrbitControls handoff
