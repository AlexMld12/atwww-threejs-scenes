// =============================================================================
// SCENA 3D — preloader -> intro -> pasi -> outro, condusa de scroll.
//
// ⚠️ Fisierul asta e CALIBRAT PE PIXELI. Aproape fiecare numar din el a fost obtinut
// prin masurare, nu ales, iar comentariile spun de ce NU merge altfel. Inainte sa
// schimbi o valoare, citeste `docs/THREEJS_HANDOFF.md` §7bis.
//
// A fost mutat aici din `site.html` la reorganizarea din 2026-09-17, VERBATIM: singurele
// modificari sunt caile catre modele si catre decoderul Draco. Verificat dupa mutare
// pixel cu pixel fata de randarile de dinainte.
// =============================================================================
import * as THREE from 'three';
import Lenis from 'lenis';

// Caile catre livrabile. In `public/` => servite din radacina, deci `/models/...`.
const MODELS = {
  base:      import.meta.env.BASE_URL,
  intro:     import.meta.env.BASE_URL + 'models/keycap_scene_web.glb',
  outro:     import.meta.env.BASE_URL + 'models/keycap_outro_web.glb',
  preloader: import.meta.env.BASE_URL + 'models/preloader.glb',
};

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================================================================
// ARHITECTURĂ — de citit înainte de a schimba ceva structural
//
// DOUĂ canvas-uri, deliberat:
//   #main — un singur renderer + un singur lanț de post-procesare pentru TOATE
//           actele 3D (intro, pași, outro). Continuitatea vizuală vine de aici:
//           trei renderere ar însemna trei gradări și un salt la fiecare tranziție.
//   #pl   — preloader-ul, cu renderer propriu, peste tot. E un desen plat de tip
//           blueprint (linii albe pe fundal solid), nu are nevoie de gradarea comună,
//           iar un strat separat face reveal-ul o simplă tranziție CSS. Se distruge
//           după reveal, deci nu costă nimic mai departe. Continuitatea care conta
//           acolo — culoarea fundalului și noise-ul — e potrivită exact.
//
// NU un singur GLB: împreună fac ~10.7 MB și ~4M triunghiuri rezidente. Fiecare act
// își încarcă și eliberează GLB-ul. Vezi SITE_FLOW.md §2.
// ============================================================================

const qs = new URLSearchParams(location.search);
if (qs.get('dbg') === '1') document.body.classList.add('dbg');
const dbgEl = document.getElementById('dbg');

// ---------------------------------------------------------------- smooth scroll
// ⚠️ NOTĂ PENTRU WEBFLOW: scena NU are nevoie de nicio integrare cu Lenis. Progresul
// se citește din `getBoundingClientRect()` al segmentelor, în fiecare cadru — adică din
// poziția REAL randată. Orice scroller (nativ, Lenis, altul) funcționează automat.
// Deci: dacă adaugi Lenis global în setările Webflow, NU trebuie cod în plus pentru
// scenă. Instanța de aici e doar pentru ca preview-ul ăsta să se miște ca site-ul.
// Singurul lucru care ar cere cod: blocarea scroll-ului în timpul preloader-ului —
// acolo scena cheamă `lenis.stop()`. Cu Lenis-ul site-ului, expune-l ca `window.lenis`
// și scena îl folosește pe acela (vezi mai jos).
const lenis = window.lenis || new Lenis({
  duration: 1.1,           // cât de „lung" e glisajul; 1.1 s e aproape de simțul Webflow
  smoothWheel: true,
  touchMultiplier: 1.6,
});
lenis.stop();              // pornim blocat: preloader-ul rulează

// ⚠️ Trei locuri, nu unul. `history.scrollRestoration = 'manual'` (vezi <head>) oprește
// restaurarea browserului, dar nu acoperă tot:
//  · `scrollTo(0, 0)` aici — dacă pagina a apucat deja să fie derulată (refresh rapid,
//    sau un browser care restaurează înainte să ruleze scriptul din <head>);
//  · `pageshow` — revenirea din bfcache (Înapoi/Înainte) NU reexecută modulul, deci
//    nimic din ce e mai sus nu s-ar mai întâmpla, iar pagina ar reveni derulată;
//  · încă unul chiar înainte de `lenis.start()`, în `updateReveal` — Lenis își ține
//    propria poziție interpolată, iar dacă pornește cu ea nenulă, primul cadru sare.
scrollTo(0, 0);
addEventListener('pageshow', () => {
  scrollTo(0, 0);
  lenis.scrollTo(0, { immediate: true, force: true });
});

// ---------------------------------------------------------------- valori comune
// Toate din THREEJS_HANDOFF.md §7bis. Aici NU sunt slidere: pagina asta e un test
// „ca în site", iar reglajele se fac în preview.html / outro_preview.html.
// Conturul din actul de pași. Culoarea și cele trei valori de formă sunt COPIATE din
// `outro.html` (sliderele „Glow-ul care trece prin piese"), ca cele două momente în care
// site-ul evidențiază o piesă să arate identic.
const GLOW = {
  strength: 8.0,        // outro.html: Intensitate 8.0
  // ⚠️ LINIA a fost subțiată (2026-09-28), glow-ul NU. Cerința userului: „arcul are
  // outline-ul prea gros și nu se mai vede că e un arc". Cauza nu era doar `thickness`:
  // OutlinePass detectează muchia la JUMĂTATE de rezoluție (`downSampleRatio = 2`), deci
  // linia pleacă de la ~4 px de ecran înainte de orice blur, iar ×8 din `strength`
  // saturează și cozile. Între spire golul e de 2–3 px — umplut complet.
  // DRUM RESPINS: doar `thickness` 2 → 1 la jumătate de rezoluție. Linia scade puțin,
  // dar spirele rămân contopite (muchia de bază e tot 4 px).
  // DRUM RESPINS: `downSampleRatio = 1` cu kernelRadius 8 pe blur-ul de glow ORIGINAL.
  // Acel material are doar 4 eșantioane (MAX_EDGE_GLOW = 4), deci la rază 8 sare câte
  // un texel și glow-ul iese în trepte orizontale peste spire.
  // Ce merge: rezoluție completă + blur de glow RECONSTRUIT cu 8 eșantioane, rază 8
  // texeli de jumătate de rezoluție = aceiași 16 px de ecran ca înainte (4 texeli de
  // sfert). Glow-ul măsurat pe inelul din jurul arcului: 18.80 → 18.66 (canal G), deci
  // neschimbat. Costul: masca și detecția de muchie la rezoluție completă, doar în
  // actul de pași.
  thickness: 0.5,       // era 2.00 (outro.html: Grosime 2.00), la jumătate de rezoluție
  res: 1,               // downSampleRatio al OutlinePass; era 2 (implicitul)
  glowRadius: 8,        // rază blur glow, în texeli ai bufferului de glow; era 4
  spread: 0.55,         // outro.html: Împrăștiere 0.55
  visible: '#5cff9d',
  hidden: '#1c6b45',    // outro.html îl derivă ca visible * 0.35; aici e scris direct
  // Cât din felia unei piese se duce pe intrare și pe ieșire. ⚠️ ASTA e singura valoare
  // care NU vine din outro.html, pentru că rolul e altul: acolo e un puls care TRECE
  // prin coloană, aici fiecare piesă e un capitol de info cu text în DOM, deci conturul
  // trebuie să STEA aprins cât se citește textul, nu să treacă.
  // ⚠️ DRUM RESPINS: „Suprapunere piese 0.30" din outro.html. Formula de acolo
  // (`w = (f + ovl) / (1 + 2·ovl)`) nu coboară niciodată la 0 la granița dintre felii —
  // la 0.30 predarea se face la sin(π·0.1875) = 0.556 din intensitate, iar `OutlinePass`
  // are o singură `edgeStrength` pentru tot ce e selectat, deci piesa veche nu poate
  // scădea în timp ce noua crește: conturul POCNEȘTE de pe o piesă pe alta la 4.4 din 8.
  // Un crossfade adevărat ar cere un al DOILEA OutlinePass (încă un set de render
  // target-uri full-screen). Aici e rezolvat altfel: plicul coboară la 0 exact la
  // graniță, deci schimbul de obiect se face când nu se vede nimic.
  fade: 0.18,
};
// ⚠️ ALBASTRUL A COBORÂT cu 14.2%, de la 0.04732 la 0.04060 (2026-09-17). Cerința
// userului: „în Figma site-ul apare mai verzui, la noi în intro duce mai mult spre
// albastru decât spre verde". Măsurat pe cadrele Figma exportate din PDF, pe raportul
// B/G al pixelilor saturați verde (R < 10) — populație aproape identică ca mărime în
// referință și în randare, deci comparabilă:
//   fundal în actul de pași:  Figma 0.925  ·  noi 1.149
//   fundal în outro:          Figma 0.968  ·  noi 1.080
//   câmpul de taste:          Figma 1.016  ·  noi 0.993   ← ăsta era deja potrivit
// Factorul e rezolvat prin cele mai mici pătrate pe cele TREI ținte deodată (pantele
// măsurate prin A/B live, nu presupuse): k = 0.858. Erorile rămase: +0.032 / −0.019 /
// −0.074. A treia e prețul plătit: câmpul de taste iese puțin mai verde decât în Figma,
// pentru că îl trage ceața, care ia culoarea tot de aici.
// ⚠️ `BG` ajunge în TREI locuri, două prin COPIE: `scene.background` (aceeași
// referință), `scene.fog.color` (construit din `BG.getHex()`) și `cBase` al scrim-ului
// (`BG.clone()`). Schimbat aici, se propagă corect pentru că toate trei se
// construiesc DUPĂ; pentru reglaj live există `__dbg.setBG`, care le scrie pe toate trei.
// ⚠️ De ce e SIGUR pentru cusătură: e același `BG` de ambele părți (scrim-ul în intro,
// `scene.background` în outro). Verificat după schimbare: fundal ΔLum +0.00, coloana
// hero ΔLum +0.02. Vezi nota de la `scrimMat` pentru ce se întâmplă dacă cele două
// culori de fundal se desincronizează.
const BG = new THREE.Color().setRGB(0.01628, 0.04684, 0.04060, THREE.LinearSRGBColorSpace);
const LIGHT_COL = 0xb8ffd6;
const EXPOSURE = 0.54;
const GRADE = {
  contrast: 1.08, sat: 0.80, lift: 0.0,
  // ⚠️ Câștigul pe B diferă între acte, INTENȚIONAT. Vezi SITE_FLOW.md §3.
  // `gainB_intro` A COBORÂT de la 1.28 la 0.97 (2026-09-17): 1.28 era calibrat ca să
  // ridice B-ul texturilor coapte, dar ducea biroul spre albastru-cyan, iar referința
  // Figma îl vrea verde. Măsurat pe pixelii saturați verde: B/G Figma 0.874 (media
  // cadrelor 5 și 8), noi 1.151. Rezolvat prin A/B live, nu prin aritmetică: 1.00 dădea
  // 0.904, 0.95 dădea 0.860, deci 0.97 → 0.878.
  // ⚠️ DE CE NU ATINGE CUSĂTURA, măsurat, nu presupus: `uGainB` se mută de la
  // `gainB_intro` la `gainB_outro` pe fereastra de reveal a INTRO-ului (`revealK`), nu
  // la cusătură. Citit din pagina vie: gainB = 1.2800 la intro p=0, dar deja 1.1600 în
  // actul de pași, la cusătură ȘI în outro. Deci `gainB_intro` există doar înainte ca
  // switch-ul să se ridice — exact partea pe care userul a cerut-o mai verde — și nu
  // poate schimba nici hero-ul, nici câmpul.
  gainR: 0.93, gainG: 1.00, gainB_intro: 0.97, gainB_outro: 1.16,
  vig: 0.20, vigR: 0.61, vigP: 4.0,
  noise: 0.04, grain: 2.0, pow: 5.0, nzCol: 0x9fe8d4,
};
// Fereastra de dezvăluire a scrim-ului, în secunde de clip (intro).
const REVEAL = { start: 3.00, end: 4.60 };
// Reveal-ul preloader -> intro, în DOUĂ faze distincte (cerere 2026-09-15):
//   faza 1: stratul de preloader se stinge REPEDE (opacitate 1 -> 0) și lasă în spate
//           scena blurată la 30 px;
//   faza 2: blur-ul se stinge (30 -> 0).
// Scroll-ul se deblochează abia la finalul fazei 2 — nu are sens să avansezi în scenă
// cât timp încă nu e limpede. Ambele faze folosesc ease-out quart.
const INTRO_REVEAL = { plMs: 600, blurMs: 900, blurPx: 30 };

// ---------------------------------------------------------------- poarta de desktop
// Sub pragul ăsta nu există variantă de mobil (decizia userului, 2026-09-18): se vede
// scena blurată în spate și un mesaj. Partea vizuală e integral în CSS (`scene.css`),
// ca să comute instant la redimensionare. Aici stă doar partea care nu se poate face
// din CSS: ce NU se mai încarcă și oprirea buclei de randare.
// ⚠️ Pragul e scris în DOUĂ locuri, aici și în media query-ul din `scene.css`.
const GATE_W = 992;
const isSmall = () => innerWidth < GATE_W;
// Se citește O SINGURĂ DATĂ, la pornire: `loadOutro` și bucla de randare nu se pot
// „re-decide" la mijloc fără să reconstruim scena. Trecerea peste prag se tratează
// separat, cu o reîncărcare — vezi handler-ul de `resize`.
const SMALL = isSmall();
const easeOutQuart = u => 1 - Math.pow(1 - u, 4);

// Intervalele de scroll pe act. Derivate din înălțimile din #track, nu hardcodate —
// așa poți re-regla lungimile în CSS (sau în Webflow) fără să atingi modulul.
const ACTS = ['intro', 'steps', 'outro'];

// ---------------------------------------------------------------- renderer + post
const mainEl = document.getElementById('main');
// ⚠️ `antialias: false` (era `true`), măsurat: imaginea iese IDENTICĂ. Scena nu se
// randează în canvas, ci în render target-urile lui EffectComposer, care NU au MSAA; în
// canvas ajunge doar quad-ul de ecran plin al ultimului pass, pe care MSAA-ul n-are ce
// netezi. Deci `true` nu cumpăra nimic, dar costa un framebuffer multisamplat (4x) la
// rezoluția ecranului — la DPR 2 pe un 2560x1440, peste 100 MB de memorie video.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const BASE_PR = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(BASE_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSURE;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
mainEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.FogExp2(BG.getHex(), 0.18);   // 0.18, NU 2.12 — vezi §7bis capcana

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const keyLight = new THREE.DirectionalLight(LIGHT_COL, 9.0);
keyLight.position.set(0.24, 2.1, 0.3);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(LIGHT_COL, 2.0);
fillLight.position.set(0, 1.45, 1.2);
scene.add(fillLight);

// ⚠️ Lumina de outro se CREEAZĂ aici, nu în loadOutro, deși se adaugă în scenă abia
// acolo. Motivul, măsurat: în three.js configurația de lumini intră în cheia de cache a
// programului, deci în clipa în care `RectAreaLight`-ul intră în scenă TOATE materialele
// își recompilează shaderul. Se vedea direct pe `renderer.info.programs.length`: 23 după
// reveal, 30 la 4.5 s, 48 la 6.2 s — adică 25 de programe compilate sincron, în mijlocul
// animației, exact la momentul „switch-ul iese din tastatură" pe care l-ai simțit ca
// blocaj. Precompilarea din loadIntro o adaugă temporar, leagă ambele variante (cu și
// fără ea), apoi o scoate; programele rămân în cache, deci mai târziu nu se mai compilează.
RectAreaLightUniformsLib.init();
const LTINT = new THREE.Color().setRGB(0.72, 1.0, 0.84, THREE.SRGBColorSpace);
const outroLight = new THREE.RectAreaLight(LTINT, 0, 0.87, 0.87);
outroLight.position.set(0.0572, 1.1663, -0.0139);
outroLight.lookAt(0.0572, 0.1663, -0.0139);
scene.add(new THREE.AmbientLight(0x2a4a3e, 0.12));

const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
cam.position.set(0, 1.0, 1.2);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, cam);
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uVig: { value: GRADE.vig }, uVigR: { value: GRADE.vigR }, uVigP: { value: GRADE.vigP },
    uNoise: { value: GRADE.noise }, uGrain: { value: GRADE.grain }, uPow: { value: GRADE.pow },
    uContrast: { value: GRADE.contrast }, uSat: { value: GRADE.sat }, uLift: { value: GRADE.lift },
    uGainR: { value: GRADE.gainR }, uGainG: { value: GRADE.gainG },
    uGainB: { value: GRADE.gainB_intro },
    uTime: { value: 0 }, uNzCol: { value: new THREE.Color(GRADE.nzCol) },
  },
  vertexShader: `varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  // Ordinea din lanț e cea din preview.html: lift, contrast, saturație, câștig pe
  // canale, vignetă, noise. Câștigul stă înainte de vignetă — pus după, ar colora și
  // închiderea marginilor. Noise-ul e ultimul, în spațiu de afișare.
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVig, uVigR, uVigP, uNoise, uGrain, uPow, uContrast, uSat, uLift, uTime;
    uniform float uGainR, uGainG, uGainB;
    uniform vec3 uNzCol;
    varying vec2 vUv;
    void main(){
      vec4 src = texture2D( tDiffuse, vUv );
      vec3 c = src.rgb;
      c += uLift;
      c = ( c - 0.5 ) * uContrast + 0.5;
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      c = mix( vec3( l ), c, uSat );
      c *= vec3( uGainR, uGainG, uGainB );
      vec2 vd = abs( vUv - 0.5 ) * 2.0;
      float vr = pow( pow( vd.x, uVigP ) + pow( vd.y, uVigP ), 1.0 / uVigP );
      c *= 1.0 - smoothstep( uVigR, 1.0, vr ) * uVig;
      vec2 ip = floor( gl_FragCoord.xy / max( uGrain, 1.0 ) );
      float n = fract( sin( dot( ip + vec2( uTime * 61.7, uTime * 23.3 ),
                                 vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      c += uNzCol * ( uNoise * pow( n, uPow ) );
      gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), src.a );
    }`,
});
// ⚠️ OutlinePass e DUPĂ OutputPass, ca în `outro.html`: așa conturul nu mai trece prin
// tone mapping și culoarea aleasă iese exact aia. GradePass (vignetă + grain) rămâne
// ultimul, ca să prindă și conturul — altfel el ar fi singurul lucru din cadru fără
// vignetă și s-ar citi ca un strat lipit deasupra.
const outlinePass = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, cam);
outlinePass.edgeStrength = GLOW.strength;
outlinePass.edgeThickness = GLOW.thickness;
outlinePass.edgeGlow = GLOW.spread;
// Rezoluția și blur-ul de glow nu au setter în OutlinePass: `downSampleRatio` e citit
// doar în `setSize`, iar materialul de glow are numărul de eșantioane fixat la
// construcție. Deci se înlocuiește materialul și se redimensionează (vezi GLOW).
function applyGlowRes() {
  const o = outlinePass;
  o.downSampleRatio = GLOW.res;
  o.separableBlurMaterial2.dispose();
  o.separableBlurMaterial2 = o._getSeparableBlurMaterial(Math.ceil(GLOW.glowRadius));
  o.separableBlurMaterial2.uniforms.kernelRadius.value = GLOW.glowRadius;
  o.setSize(o.renderTargetMaskBuffer.width, o.renderTargetMaskBuffer.height);
}
applyGlowRes();
outlinePass.pulsePeriod = 0;
outlinePass.visibleEdgeColor.set(GLOW.visible);
outlinePass.hiddenEdgeColor.set(GLOW.hidden);
outlinePass.enabled = false;        // aprins doar în actul de pași

composer.addPass(renderPass);
composer.addPass(new OutputPass());
composer.addPass(outlinePass);
composer.addPass(gradePass);
composer.setPixelRatio(BASE_PR);
composer.setSize(innerWidth, innerHeight);

// ============================================================================
// ACTUL 0 — PRELOADER
// Randerer propriu, scenă proprie, cameră ortografică din față. Portat din
// preloader/preloader.html: fiecare piesă se desenează de TREI ori — umplere opacă în
// culoarea fundalului (face ocluzia), coajă inversată pe BackSide împinsă pe normală
// în spațiu-vedere (silueta), și EdgesGeometry cu LineSegments2 (muchiile interne).
// EdgesGeometry NU dă siluete, doar muchii peste pragul diedru: fără coajă, keycap-ul
// — formă rotunjită — e aproape invizibil.
// ============================================================================
const PL_BG = 0x051b1c, PL_LINE = 0xffffff;
const PIECES = [
  { id: 'p1_pin_contact',    up:   0.00, depth: 0.00 },
  { id: 'p2_led',            up:  14.19, depth: 1.24 },
  { id: 'p3_bottom_housing', up:  28.38, depth: 2.48 },
  { id: 'p4_contacts',       up:  42.56, depth: 3.72 },
  { id: 'p5_spring',         up:  56.75, depth: 4.96 },
  { id: 'p6_top_housing',    up:  70.94, depth: 6.20 },
  { id: 'p7_stem',           up:  85.13, depth: 7.44 },
  { id: 'p8_keycap',         up: 105.52, depth: 9.23 },
];
const MM = 0.001;
const meanUp = PIECES.reduce((s, p) => s + p.up, 0) / PIECES.length;
const meanDepth = PIECES.reduce((s, p) => s + p.depth, 0) / PIECES.length;

const plEl = document.getElementById('pl');
const plRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
plRenderer.setPixelRatio(BASE_PR);
plRenderer.setSize(innerWidth, innerHeight);
plRenderer.outputColorSpace = THREE.SRGBColorSpace;
plRenderer.setClearColor(PL_BG, 1);
plEl.appendChild(plRenderer.domElement);

const plScene = new THREE.Scene();
const plCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
const plGroup = new THREE.Group();
plScene.add(plGroup);

const plFillMat = new THREE.MeshBasicMaterial({
  color: PL_BG, polygonOffset: true, polygonOffsetFactor: 1.2, polygonOffsetUnits: 1.2,
});
// Grosimi în px de ecran, reglate din `tools/preloader.html` (Grosime muchii / siluetă).
// ⚠️ Subțiate 1.8 / 1.6 → 1.0 / 0.8 (2026-09-28), cererea userului: la 1.8 arcul ieșea
// un bloc plin, golul dintre spire e sub 2 px. La 1.2 / 1.0 spirele încă se lipeau.
const PL_LW = { edge: 1.0, sil: 0.8 };
const plLineMat = new LineMaterial({ color: PL_LINE, linewidth: PL_LW.edge, worldUnits: false });
// `colorspace_fragment` e OBLIGATORIU în shader-ul cojii: fără el culoarea liniară se
// scrie direct într-un framebuffer sRGB și silueta iese cu altă nuanță decât liniile
// din LineMaterial, care face conversia. Se vede mai ales pe keycap, aproape numai siluetă.
const plShellMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { uColor: { value: new THREE.Color(PL_LINE) }, uWidth: { value: 0.0004 } },
  vertexShader: `
    uniform float uWidth;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      mv.xyz += n * uWidth;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
      #include <colorspace_fragment>
    }`,
});

// Noise-ul preloader-ului: ACEEAȘI formulă și aceleași valori ca în GradePass.
// ⚠️ FĂRĂ `colorspace_fragment` aici (spre deosebire de coajă): GradePass rulează după
// OutputPass, deci scrie în spațiu de AFIȘARE. Cu conversie, aceleași cifre dădeau grain
// de ~3.6× mai vizibil — măsurat: sigma 13.3 față de 1.74.
const plNoiseScene = new THREE.Scene();
const plNoiseCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const plNoiseMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uNoise: { value: GRADE.noise },
    uGrain: { value: GRADE.grain }, uPow: { value: GRADE.pow },
    uColor: { value: new THREE.Color(GRADE.nzCol) },
  },
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform float uTime, uNoise, uGrain, uPow;
    uniform vec3 uColor;
    void main(){
      vec2 ip = floor(gl_FragCoord.xy / max(uGrain, 1.0));
      float n = fract(sin(dot(ip + vec2(uTime * 61.7, uTime * 23.3),
                             vec2(12.9898, 78.233))) * 43758.5453);
      gl_FragColor = vec4(uColor * (uNoise * pow(n, uPow)), 1.0);
    }`,
  depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
});
plNoiseScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), plNoiseMat));

const plParts = [];
const plFrame = { c: new THREE.Vector3(), r: 0.08 };
let plReady = false;

function plLayout() {
  const r = plFrame.r * 1.3;
  const a = innerWidth / innerHeight;
  if (a >= 1) { plCam.top = r; plCam.bottom = -r; plCam.left = -r * a; plCam.right = r * a; }
  else { plCam.left = -r; plCam.right = r; plCam.top = r / a; plCam.bottom = -r / a; }
  plCam.updateProjectionMatrix();
  plCam.position.set(plFrame.c.x, plFrame.c.y, plFrame.c.z + Math.max(0.5, plFrame.r * 12));
  plCam.lookAt(plFrame.c);
  plShellMat.uniforms.uWidth.value = (plCam.top - plCam.bottom) / innerHeight * PL_LW.sil;
  plLineMat.resolution.set(innerWidth, innerHeight);
}

// progres: 0 = desfăcut, 1 = închis. Offset-urile brute urcă toate de la piesa de jos,
// deci s-ar asambla la baza stivei; scăzând media, închiderea se face în MIJLOC de la
// sine, fără să translatăm grupul (o încercare anterioară făcea asta și se vedea ca un salt).
function plSetProgress(p) {
  const k = Math.min(1, Math.max(0, p));
  for (const part of plParts) part.node.position.copy(part.offset).multiplyScalar(1 - k);
}

const draco = new DRACOLoader();
// ⚠️ Decoderul Draco se serveste LOCAL, din `public/draco/`, nu de pe gstatic.com.
// Motivul e masurat in auditul de compatibilitate (docs/THREEJS_HANDOFF.md): un
// proxy care blocheaza gstatic omora tot site-ul, pentru ca fara decoder niciun GLB
// nu se incarca. Fisierele vin din `node_modules/three/examples/jsm/libs/draco/`,
// copiate de scriptul `predev`/`prebuild` din package.json.
draco.setDecoderPath(import.meta.env.BASE_URL + 'draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

loader.load(MODELS.preloader, (gltf) => {
  const byId = new Map();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    byId.set(o.name.replace(/^CL_/, '').replace(/_\d+$/, ''), o);
  });
  const boxOpen = new THREE.Box3();
  for (const spec of PIECES) {
    const src = byId.get(spec.id);
    if (!src) { console.warn('preloader: lipsește', spec.id); continue; }
    const geom = src.geometry.clone();
    geom.applyMatrix4(src.matrixWorld);   // coacem transformul, pivotul devine global
    geom.computeVertexNormals();          // GLB-ul e exportat FĂRĂ normale; coaja le cere
    const node = new THREE.Group();
    const shell = new THREE.Mesh(geom, plShellMat); shell.frustumCulled = false;
    const fill = new THREE.Mesh(geom, plFillMat); fill.frustumCulled = false;
    node.add(shell); node.add(fill);
    const eg = new THREE.EdgesGeometry(geom, 25);
    const seg = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(eg), plLineMat);
    seg.computeLineDistances(); seg.frustumCulled = false;
    node.add(seg);
    plGroup.add(node);
    const offset = new THREE.Vector3(0, (spec.up - meanUp) * MM, (spec.depth - meanDepth) * MM);
    plParts.push({ node, offset });
    const b = new THREE.Box3().setFromBufferAttribute(geom.attributes.position);
    boxOpen.union(b).union(b.clone().translate(offset));
  }
  boxOpen.getCenter(plFrame.c);
  plFrame.r = Math.max(boxOpen.max.y - boxOpen.min.y, boxOpen.max.x - boxOpen.min.x) * 0.5;
  plLayout();
  plReady = true;
  loadIntro();          // GLB-ul mare pornește DOAR după ce preloader-ul poate desena
});

// ============================================================================
// ACTUL 1 — INTRO. Calibrările sunt cele din preview.html / THREEJS_HANDOFF §7bis.
// ============================================================================
let introRoot = null, mixer = null, action = null, clipDur = 0;
let blenderCam = null, introLoaded = false, introProgress = 0;
let introEnv = null;
const switchMats = [], glassMats = [], deskMats = [], emissiveMats = [], bgEmissiveMats = [];
const keycapMats = [], bgMeshes = [], darkMats = [];
const pieceMeshes = {}, pieceMats = {};
const DARK_PIECES = { 'Pipe': 1, 'Solid 368': 1 };

// ---------------------------------------------------------------- contur de lumină
// Trei piese erau practic invizibile pe fundal, măsurat ca diferență de luminanță față
// de fundalul din jurul cutiei lor: arc **+2.0**, lamelă de contact **−2.6** (mai
// ÎNCHISĂ decât fundalul), pini de contact **+2.6**. Restul coloanei stă la +27…+60.
// Se vedeau doar când primeau contur în actul de pași.
//
// Cerința: să rămână NEGRE, dar să se vadă, și fără să se schimbe fundalul.
// Soluția e un termen Fresnel adăugat la lumina de ieșire: la incidență normală
// (mijlocul piesei, spre cameră) e ZERO, deci corpul rămâne negru; la unghi razant
// (silueta) urcă, deci piesa își capătă muchia. Nu e un truc — e chiar comportamentul
// real al unui dielectric: reflectanța la unghi razant tinde spre 1 indiferent de
// culoare. De aia arată a lumină de contur, nu a emisie.
//
// ⚠️ DRUMURI RESPINSE:
//  · `envMapIntensity` — deja consemnat ca pârghie moartă: A/B 43 → 14.29 a dat imagine
//    IDENTICĂ, `introEnv` e prea închis ca să conteze pe piese;
//  · o a treia lumină (kicker din spate) — ar fi lucrat, dar configurația de lumini
//    intră în cheia de cache a programului în three, deci intrarea ei în scenă
//    recompilează TOATE materialele. Exact blocajul pe care îl evită tot mecanismul de
//    warm-up. În plus ar fi atins și tastatura din intro, și restul coloanei.
//  · ridicarea albedo-ului — cerința era explicit ca piesele să RĂMÂNĂ negre.
//
// ⚠️ De ce e sigur pentru cusătură, prin construcție: cele trei piese sunt ACELAȘI
// obiect de material în ambele acte (`pieceMats[key]`, atribuit hero-ului de outro în
// `loadOutro`), cu aceleași lumini și aceeași ceață oprită. Măsurat înainte de schimbare:
// arc 16.24 în pași vs 16.07 în outro, pini 16.03 vs 16.01. Orice scriem pe material
// apare la fel de ambele părți, fără compensare.
// ⚠️ Valorile diferă cu DOUĂ ORDINE DE MĂRIME între piese, și nu e o greșeală — e
// geometria. Arcul e o spirală: văzut din lateral e aproape numai siluetă, deci aproape
// fiecare pixel al lui are unghi razant și termenul Fresnel îl prinde tot. Lamela și
// pinii sunt plăci PLATE orientate spre cameră: la ele Fresnel prinde doar muchia, deci
// are nevoie de mult ca să se vadă ceva. Măsurat pe „procent de pixeli din piesă peste
// fundal + 12" (media e oarbă la o muchie subțire, exact ca la σ):
//   arc   18.2% -> 35.6%     pini  5.6% -> 35.8%     lamelă  3.3% -> 4.2%
// Pentru referință, piesele care se vedeau bine stau la 49-70%.
// La valori mai mari (arc 0.85, pini 40) nu se mai câștigă nimic — pinii rămân la 35.8%
// iar arcul începe să arate a sârmă luminoasă, nu a metal negru.
// ⚠️ LAMELA DE CONTACT rămâne nerezolvată de metoda asta și e o limită cunoscută, nu o
// scăpare: fiind o placă plată spre cameră, Fresnel îi aprinde doar muchiile de sus.
// Corpul ei stă la −2.6 față de fundal. Dacă trebuie ridicată, pârghia e alta (un
// highlight speculat din poziția luminii sau un prag de ambient), nu asta.
const RIM = { 'Pipe': 0.65, 'Solid 368': 25.0, 'Solid 372': 28.0 };
// Exponentul: cât de strâns stă conturul pe siluetă. Mai mic = bandă mai lată, care
// începe să semene cu albedo ridicat și strică „negrul". 2.2 ține muchia subțire.
const RIM_POW = 2.2;
const SW_BASE = 2.0, SW_TGT = 4.0, KC_BASE = 1.0, KC_TGT = 4.0;
const BG_EMI_BASE = 0.80, BG_EMI_FLOOR = 0.20, DESK_EMI = 0.60;
let swNow = SW_BASE, kcNow = KC_BASE, revealK = 0;
let heroCapIntro = null, heroCapMesh = null;

// ---------------------------------------------------------------- actul de pași
// ⚠️ Etichetele sunt cele din `SITE_FLOW.md` §2, NU `STEP_LABELS` din `preview.html` /
// `outro.html`. Alea au carcasele INVERSATE (`Solid 87` = „carcasă sus" e greșit) și mai
// spun „piesă translucidă" pentru LED și „piesă albă" pentru pini. Verificat prin două
// surse independente: ordinea măsurată pe ecran și `preloader/preloader_pieces.json`.
const STEP_LABELS = {
  'key_cap':   'keycap',
  'Solid 208': 'stem',
  'Solid 154': 'carcasă superioară',
  'Pipe':      'arc',
  'Solid 368': 'lamelă de contact',
  'Solid 87':  'carcasă inferioară',
  'Solid 193': 'LED',
  'Solid 372': 'pini de contact',
};
const stepList = [];
let curStep = -2;      // -2 = încă nimic emis; -1 = niciun pas activ

// Ordinea NU e hardcodată: se citește Y-ul real al fiecărei piese la clipul PARCAT
// (t = clipDur, exact starea din actul de pași) și se sortează de sus în jos. Așa, dacă
// se re-exportă GLB-ul cu alte offseturi de explodare, ordinea se corectează singură.
function buildSteps() {
  if (!action || !introRoot) return;
  const tWas = action.time;
  action.time = clipDur; mixer.update(0); introRoot.updateMatrixWorld(true);
  const box = new THREE.Box3(), c = new THREE.Vector3();
  const add = (key, mesh) => {
    if (!mesh) return;
    box.setFromObject(mesh); box.getCenter(c);
    colBox.union(box);                  // vezi `publishAnchor`
    stepList.push({ key, mesh, label: STEP_LABELS[key] || key, y: c.y });
  };
  add('key_cap', heroCapMesh);
  for (const k in pieceMeshes) add(k, pieceMeshes[k]);
  stepList.sort((a, b) => b.y - a.y);
  colHasBox = !colBox.isEmpty();
  action.time = tWas; mixer.update(0);
  console.log('pași:', stepList.map((x, i) => (i + 1) + '. ' + x.label).join(' · '));
}

// ---------------------------------------------------------------- ancora pentru DOM
// Userul vrea ca textul din mijlocul nav-ului să fie centrat pe COLOANA DE PIESE, nu pe
// ecran și nici pe nav (care e `space-between`, deci centrul lui depinde de lungimea
// blocurilor din stânga și din dreapta). Coloana nu e în centrul ecranului: măsurat,
// centrul ei cade la `centrul ecranului + 0.0041 x înălțimea ferestrei` — adică +3.7 px
// la 900 px înălțime, +5.9 px la 1440. Proporția cu ÎNĂLȚIMEA, nu cu lățimea, e firească:
// camera are FOV vertical, deci un decalaj 3D fix se vede ca o fracțiune constantă din
// înălțime. De asta valoarea nu se poate scrie în CSS ca procent și se calculează aici.
//
// Cutia se reține la clipul PARCAT (starea din actul de pași, exact ce se vede în
// captura userului), fiindcă piesele se mișcă în timpul clipului, iar ancora trebuie să
// fie un loc fix, nu unul care aleargă după animație.
// ⚠️ Se proiectează CELE 8 COLȚURI, nu centrul cutiei: la o cameră în perspectivă cele
// două nu coincid pentru un obiect care nu e pe axă, iar ce contează e silueta, adică ce
// se vede.
// ⚠️ Camera curentă, nu `blenderCam`: în outro randează `outroCam`, dar la cusătură
// ambele încadrează coloana IDENTIC (măsurat: centru 723.7 în amândouă, la 1440x900),
// deci ancora nu sare la trecerea dintre acte.
const colBox = new THREE.Box3();
let colHasBox = false;
// Dreptunghiul pe ecran al unui mesh, în pixeli CSS. Îl folosește DOM-ul ca să așeze
// heading-ul piesei în dreptul ei. ⚠️ Cele 8 colțuri ale cutiei, nu centrul: la o cameră
// în perspectivă centrul proiectat nu e centrul siluetei.
// ⚠️ Valabil doar cu clipul PARCAT (actul de pași), unde piesele nu se mișcă. În intro
// clipul rulează, deci dreptunghiul s-ar schimba de la un cadru la altul.
function screenBox(mesh) {
  const cam = blenderCam || renderPass.camera;
  if (!cam || !mesh) return null;
  cam.updateMatrixWorld(true);
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox, v = new THREE.Vector3();
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
    mesh.localToWorld(v); v.project(cam);
    const x = (v.x * 0.5 + 0.5) * innerWidth;
    const y = (-v.y * 0.5 + 0.5) * innerHeight;
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  return { x: (minx + maxx) / 2, y: (miny + maxy) / 2, sus: miny, jos: maxy };
}

function publishAnchor() {
  if (!colHasBox) return;
  // ⚠️ `blenderCam` EXPLICIT, nu `renderPass.camera`. La primul apel (momentul `is-ready`)
  // pass-ul poate avea încă `cam`, camera provizorie de dinainte de încărcarea GLB-ului,
  // cu alt FOV — iar ancora ieșea cu 3.4 px pe lângă, până la prima redimensionare, când
  // se recalcula corect. `outroCam` ar fi mers la fel de bine (măsurat: ambele încadrează
  // coloana identic), dar aici contează să fie o cameră REALĂ, nu provizoria.
  const cam = blenderCam || renderPass.camera;
  if (!cam) return;
  cam.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let minx = Infinity, maxx = -Infinity;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? colBox.max.x : colBox.min.x,
          i & 2 ? colBox.max.y : colBox.min.y,
          i & 4 ? colBox.max.z : colBox.min.z).project(cam);
    const x = (v.x * 0.5 + 0.5) * innerWidth;
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
  }
  // Al cincilea eveniment către DOM. Pleacă doar la încărcare și la redimensionare —
  // valoarea nu depinde de scroll, coloana nu se mișcă pe orizontală.
  dispatchEvent(new CustomEvent('keycap:anchor', { detail: { x: (minx + maxx) / 2 } }));
}

// Plicul unei felii: intră neted, stă aprins, iese neted. `smoothstep`, nu rampă
// liniară — capetele unei rampe liniare se citesc ca două praguri pe un contur luminos.
function stepEnvelope(f) {
  const e = Math.min(0.49, GLOW.fade);
  if (e <= 0) return 1;
  if (f < e) return THREE.MathUtils.smoothstep(f, 0, e);
  if (f > 1 - e) return THREE.MathUtils.smoothstep(1 - f, 0, e);
  return 1;
}

// Trasarea desenelor de pe scrim. Trei momente, nu unul (vezi `SCRIM`):
//   · intră  — cerneala urcă de la 0 pe primele procente, altfel primele bucăți pocnesc;
//   · e gată — colajul e complet la `drawn`, deci mai ai o bucată de act în care să-l
//     citești, nu se termină exact la cusătură;
//   · iese   — se stinge până la 0 ÎNAINTE de finalul actului.
// ⚠️ Stingerea nu e o înfrumusețare, e obligatorie: în outro scrim-ul nu mai există
// deloc (`scrim.visible = !isOutro`), iar fundalul devine `scene.background`. Fără fade,
// tot colajul dispărea instantaneu exact la cusătură — singurul lucru vizibil la o
// tranziție care altfel e măsurat invizibilă.
function setScrimSheet(p) {
  const u = scrimMat.uniforms;
  // ⚠️ Bara trebuie să treacă DINCOLO de 1, nu să se oprească la 1: altfel ultimul
  // rând de cerneală rămâne pe veci în interiorul dungii aprinse.
  u.uDraw.value = Math.min(1 + SCRIM.beamW * 3, p / SCRIM.drawn * (1 + SCRIM.beamW * 3));
  u.uInk.value = SCRIM.ink
    * THREE.MathUtils.smoothstep(p, 0, SCRIM.fadeIn)
    * (1 - THREE.MathUtils.smoothstep(p, SCRIM.fadeOut, 1));
}

// Contractul cu DOM-ul: scena spune DOAR care pas e activ, textul stă în Webflow
// (`SITE_FLOW.md` §2). Evenimentul se emite la SCHIMBAREA pasului, nu în fiecare cadru.
// Dreptunghiurile TUTUROR celor opt piese, pentru heading-ul care coboară continuu.
// ⚠️ Se calculează DOAR din actul de pași, unde clipul e parcat și piesele stau pe loc.
// Prima variantă le reținea în `buildSteps`, cu clipul mutat temporar la final — și ieșeau
// GREȘITE: măsurat, toate opt cădeau între y 405 și 492 în loc de 174–794, adică poza de
// repaus (switch-ul încă în tastatură), nu cea explodată. Pus altfel: acolo poza nu era
// încă aplicată pe matricele de lume în momentul citirii.
// ⚠️ Se recalculează când se schimbă dimensiunea ferestrei — sunt pixeli de ecran.
let boxCache = null, boxW = 0, boxH = 0;
function stepBoxes() {
  if (!stepList.length) return null;
  if (boxCache && boxW === innerWidth && boxH === innerHeight) return boxCache;
  boxCache = stepList.map((st) => screenBox(st.mesh));
  boxW = innerWidth; boxH = innerHeight;
  return boxCache;
}

function emitStep(i, force) {
  if (i === curStep && !force) return;
  curStep = i;
  const st = i >= 0 ? stepList[i] : null;
  document.body.dataset.step = st ? String(i + 1) : '';
  // ⚠️ `box` e dreptunghiul piesei PE ECRAN, nu în lume: DOM-ul are nevoie de el ca să
  // pună heading-ul în dreptul piesei. Se recalculează și la redimensionare (`force`),
  // altfel ar rămâne pe poziția de dinainte.
  dispatchEvent(new CustomEvent('keycap:step', { detail: {
    index: i, total: stepList.length,
    key: st ? st.key : null, label: st ? st.label : null,
    box: st ? screenBox(st.mesh) : null,
    // toate cele opt, ca DOM-ul să poată interpola poziția între ele
    boxes: st ? stepBoxes() : null } }));
}

function applySteps(p) {
  if (!stepList.length) return;
  const n = stepList.length;
  const x = Math.min(n - 1e-6, Math.max(0, p) * n);
  const i = Math.floor(x);
  const k = stepEnvelope(x - i);
  outlinePass.selectedObjects = [stepList[i].mesh];
  outlinePass.edgeStrength = GLOW.strength * k;
  outlinePass.renderCamera = renderPass.camera;
  outlinePass.enabled = k > 0.004;
  emitStep(i);
}

function clearSteps() {
  if (!outlinePass.enabled && curStep === -1) return;
  outlinePass.enabled = false;
  outlinePass.selectedObjects = [];
  emitStep(-1);
}

// ---------------------------------------------------------------- plafonul de textură
// ⚠️ MEMORIE VIDEO: cele două GLB-uri decodează ~716 MB de textură (RGBA8 + mipmap-uri),
// toate rezidente deodată. Patru texturi de 4096² (~90 MB fiecare) și una de 3125x2292
// au FIȘIERE aproape goale — roughness-ul biroului 30 KB, normal map-ul tastelor 46 KB —
// adică ~ nicio informație la rezoluția aia. Pe un iGPU (memorie partajată) sau pe Safari,
// asta înseamnă swap sau tab închis de sistem.
// Se micșorează LA ÎNCĂRCARE, înainte de primul upload, la cel mult `TEX_CAP` pe latură.
// ⚠️ EXCEPȚIA e atlasul de culoare al tastelor (`map` pe `keycaps_atlas`): el poartă
// legendele, iar keycap-ul erou ajunge aproape de cameră în outro. Rămâne la 4096.
// ⚠️ Trebuie chemat ÎNAINTE de orice randare: `cubeCam.update` din loadIntro randează deja
// scena, adică urcă texturile pe GPU. După aia micșorarea n-ar mai elibera nimic.
const TEX_CAP = 2048;
const TEX_KEEP_MAP = /keycaps_atlas/i;
const TEX_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap',
  'aoMap', 'transmissionMap', 'specularIntensityMap', 'specularColorMap', 'clearcoatMap'];
let texSavedMB = 0;
function capTextures(root) {
  const done = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      for (const k of TEX_SLOTS) {
        const t = m[k];
        if (!t || done.has(t)) continue;
        done.add(t);
        if (k === 'map' && TEX_KEEP_MAP.test(m.name)) continue;
        const img = t.image;
        if (!img || !img.width) continue;
        const sc = Math.min(1, TEX_CAP / Math.max(img.width, img.height));
        if (sc >= 1) continue;
        const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, 0, 0, w, h);
        texSavedMB += (img.width * img.height - w * h) * 4 * 1.333 / 1e6;
        if (img.close) img.close();          // ImageBitmap-ul mare nu mai e nevoie
        t.image = cv;
        t.needsUpdate = true;
      }
    }
  });
}

// ---------------------------------------------------------------- comasarea switch-urilor
// ⚠️ DRAW CALLS: intro-ul avea 974 pe cadru, din care ~830 doar pentru switch-uri. Fiecare
// dintre cele 84 are 7 piese = 7 mesh-uri, iar cele 3 de sticlă (transparente, pe două
// fețe) three.js le desenează de DOUĂ ori, spate apoi față. Măsurat în headless: 22.6 ms de
// JS pe cadru în intro față de 5.3 în outro, care are dublul de triunghiuri dar 100 de
// apeluri — costul e în apeluri, nu în geometrie. Pe un laptop slab sau pe Firefox/Safari,
// unde un apel WebGL e mai scump, asta e diferența dintre 60 și 30 de cadre.
//
// Animația mută DOAR grupul `SW_xxx` (canal de translație pe grup, nu pe piese), deci
// piesele stau fix în grupul lor și se pot contopi: toate piesele cu același material
// devin un singur mesh, în spațiul grupului. 7 mesh-uri → 2 pe switch.
// ⚠️ SW_087 NU se atinge: piesele lui explodează (au canale proprii) și sunt folosite una
// câte una în actul de pași (`pieceMeshes`, contur, heading).
// ⚠️ Instanțierea nu mergea: geometriile sunt UNICE pe fiecare switch (173 de mesh-uri
// distincte în GLB), deci n-ai ce instanția.
function mergeSwitchPieces() {
  let before = 0, after = 0;
  const groups = [];
  introRoot.traverse(o => { if (/^SW_\d+$/.test(o.name) && o.name !== 'SW_087') groups.push(o); });
  for (const g of groups) {
    const byMat = new Map();
    for (const c of g.children) {
      if (!c.isMesh || Array.isArray(c.material) || c.children.length) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat) {
      before += list.length;
      if (list.length < 2) { after += list.length; continue; }
      const geos = list.map(c => {
        c.updateMatrix();
        const gg = c.geometry.clone();
        gg.applyMatrix4(c.matrix);          // în spațiul grupului
        return gg;
      });
      const merged = mergeGeometries(geos, false);
      for (const gg of geos) gg.dispose();
      if (!merged) { after += list.length; continue; }   // atribute incompatibile: rămân separate
      const m = new THREE.Mesh(merged, mat);
      m.name = g.name + '_merged_' + (mat.name || 'mat');
      g.add(m);
      for (const c of list) { g.remove(c); c.geometry.dispose(); }
      after += 1;
    }
  }
  mergeStats = { groups: groups.length, before, after };
}
let mergeStats = null;

// Primul ciclu al preloader-ului se vede ÎNTREG și fluid (cererea userului, 2026-09-28):
// desfăcut → închis → desfăcut, fără nicio muncă grea pe firul principal. Înainte,
// `loadIntro()` pornea în același cadru cu prima desenare, iar parsarea GLB-ului de
// 8,8 MB, decodarea texturilor și compilarea shaderelor cădeau exact peste primul ciclu —
// animația sărea de la un cadru la altul. Acum DESCĂRCAREA pornește imediat (rețeaua nu
// blochează firul), dar `loader.parse` așteaptă promisiunea de mai jos, rezolvată din
// bucla de randare când `plPhase` trece de `PL_FIRST`. După aceea sacadarea e acceptată.
// ⚠️ DRUM RESPINS: amânarea întregului `loadIntro` cu 3 s. Ar fi adăugat 3 s la timpul
// total de încărcare pe orice conexiune; așa, pe una lentă, descărcarea se suprapune cu
// ciclul și nu se pierde nimic.
const PL_FIRST = 2;        // în jumătăți de ciclu: 1 = până la închis, 2 = ciclu întreg
let plFirstDone;
const plFirstCycle = new Promise(res => { plFirstDone = res; });
function loadAfterFirstCycle(url, onLoad, onProgress) {
  const fl = new THREE.FileLoader();
  fl.setResponseType('arraybuffer');
  fl.load(url, (buf) => plFirstCycle.then(() =>
    loader.parse(buf, url.replace(/[^/]*$/, ''), onLoad, (err) => console.error(url, err))),
  onProgress, (err) => console.error(url, err));
}

function loadIntro() {
  loadAfterFirstCycle(MODELS.intro, (gltf) => {
    introRoot = gltf.scene;
    scene.add(introRoot);
    introRoot.updateMatrixWorld(true);

    if (gltf.cameras.length) {
      blenderCam = gltf.cameras[0];
      blenderCam.aspect = innerWidth / innerHeight;
      blenderCam.near = 0.01; blenderCam.far = 100;
      blenderCam.updateProjectionMatrix();
      renderPass.camera = blenderCam;
    }
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(introRoot);
      action = mixer.clipAction(gltf.animations[0]);
      action.play(); action.paused = true;
      clipDur = gltf.animations[0].duration;
    }

    // piesele switch-ului explodat = copiii nodului SW_087. ⚠️ GLTFLoader sanitizează
    // numele: `Solid 87.002` -> `Solid_87002`, `Pipe.001` -> `Pipe001`.
    const sw087 = introRoot.getObjectByName('SW_087');
    (sw087 || introRoot).traverse(o => {
      if (!o.isMesh) return;
      const m = o.name.match(/^(?:Solid[ _]?(87|154|193|208|368|372)|(Pipe))/);
      if (!m) return;
      const key = m[2] ? 'Pipe' : 'Solid ' + m[1];
      if (!pieceMeshes[key]) pieceMeshes[key] = o;
    });

    capTextures(introRoot);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const seen = new Set();
    introRoot.traverse(o => {
      if (!o.isMesh) return;
      for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!mat || seen.has(mat.uuid)) continue;
        seen.add(mat.uuid);
        for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap']) {
          if (mat[k]) { mat[k].anisotropy = maxAniso; mat[k].needsUpdate = true; }
        }
        // switch: în GLB vine ca emisie coaptă. Convertit în PBR real ca să primească lumină.
        if (/switch_atlas|switch_glass/i.test(mat.name)) {
          if (mat.emissiveMap && !mat.map) mat.map = mat.emissiveMap;
          mat.emissive.setScalar(0); mat.emissiveIntensity = 0;
          mat.color.setScalar(SW_BASE);
          mat.roughness = 0.64; mat.metalness = 0.0; mat.envMapIntensity = 43.0;
          switchMats.push(mat);
          if (/switch_glass/i.test(mat.name)) {
            mat.transparent = true; mat.opacity = 0.55;
            mat.depthWrite = false; mat.side = THREE.DoubleSide;
            glassMats.push(mat);
          }
        }
        if (/keycaps_atlas/i.test(mat.name)) { mat.envMapIntensity = 8.0; keycapMats.push(mat); }
        if (/cork_board|CuttingMat/i.test(mat.name) && mat.normalScale) mat.normalScale.set(0.25, 0.25);
        if (/table_desk|Desk/i.test(mat.name)) {
          mat.roughness = 0.58; mat.envMapIntensity = 1.8;
          if ('specularIntensity' in mat) mat.specularIntensity = 1.3;
          if ('clearcoat' in mat) { mat.clearcoat = 0.45; mat.clearcoatRoughness = 0.12; }
          deskMats.push(mat);
        }
        // Două grupuri de emisie: biroul rămâne luminat, fundalul coboară la un prag.
        if (mat.emissiveMap && !/switch_atlas|switch_glass/i.test(mat.name)) {
          if (/wall|Pegboard|document 1\.|StickyNote/i.test(mat.name)) {
            bgEmissiveMats.push(mat);
            if (!bgMeshes.includes(o)) bgMeshes.push(o);
          } else { emissiveMats.push(mat); mat.emissiveIntensity = DESK_EMI; }
        }
        mat.needsUpdate = true;
      }
    });

    // ⚠️ Keycap-ul erou primește CLONĂ a atlasului de taste. Atlasul e unul singur pentru
    // toate cele 84 de taste ale tastaturii ȘI pentru capacul switch-ului 087; fără clonă,
    // compensarea de culoare a hero-ului îi întuneca și tastatura din intro,
    // la ~40%. Nodul e `key_cap.087_Baked`, sanitizat de GLTFLoader în `key_cap087_Baked`.
    introRoot.traverse(o => {
      if (!o.isMesh || heroCapIntro) return;
      if (!/^key_cap[._]?087/.test(o.name)) return;
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!src) return;
      heroCapIntro = src.clone();
      heroCapIntro.name = src.name + '_hero087';
      o.material = heroCapIntro;
      heroCapIntro.fog = false;   // vezi nota de la piese: ceața era toată diferența
      heroCapIntro.needsUpdate = true;
      heroCapMesh = o;          // geometria lui se folosește și pentru hero-ul din outro
    });

    // material propriu per piesă; piesele închise primesc luciu în loc de albedo ridicat
    for (const [key, mesh] of Object.entries(pieceMeshes)) {
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!src || !/switch_atlas|switch_glass/i.test(src.name)) continue;
      const c = src.clone();
      c.name = src.name + '_' + key.replace(/\s+/g, '');
      mesh.material = c;
      switchMats.push(c);
      if (glassMats.includes(src)) glassMats.push(c);
      if (DARK_PIECES[key]) {
        darkMats.push(c);
        c.roughness = 0.15;           // F0 = 0.04 pe dielectric: highlight alb pe corp negru
        c.roughnessMap = null; c.metalnessMap = null;
      }
      if (RIM[key]) addRim(c, key);
      // ⚠️ CEAȚA OPRITĂ pe hero. Ea era, măsurat, TOATĂ diferența rămasă între acte: în
      // outro densitatea e 2.12 și ridică negrele, tăind contrastul cu ~30% (keycap sigma
      // 26.4 → 17.8). Cu ea coborâtă la valoarea intro-ului, hero-ul ieșea identic la
      // virgulă (103.8/26.50 vs 103.8/26.43). Ceața rămâne 2.12 pentru CÂMP, unde chiar
      // trebuie — ascunde adâncimea; doar hero-ul n-o mai primește.
      // ⚠️ O măsurătoare anterioară „dovedea" că ceața nu atinge coloana. Era greșită:
      // înghețase densitatea pe 0.18 exact acolo unde bucla o punea oricum la 0.18, deci
      // compara 0.18 cu 0.18. Instrumentul trebuie verificat că schimbă chiar ceva.
      c.fog = false;
      c.needsUpdate = true;
      pieceMats[key] = c;
    }

    // environment din scenă: reflexiile devin ce e REAL în jur, nu studioul generic
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.05, 60, cubeRT);
    cubeCam.position.set(0, 1.0, 0);
    scene.add(cubeCam); cubeCam.update(renderer, scene); scene.remove(cubeCam);
    introEnv = pmrem.fromCubemap(cubeRT.texture).texture;
    scene.environment = introEnv;

    mergeSwitchPieces();
    introLoaded = true;
    buildSteps();
    applyIntro(0);

    // ⚠️ Precompilare și pentru INTRO, nu doar pentru outro. Blocajul de o singură dată
    // pe care îl simțeai „când switch-ul iese din tastatură" e exact aici: scrim-ul
    // devine vizibil abia la 3.00 s, iar `ShaderMaterial`-ul lui își compilează programul
    // în primul cadru în care e desenat — sincron, în mijlocul animației. La fel și
    // materialele translucide ale pieselor, care primesc alt program decât cele opace.
    // Le compilăm aici, cât timp preloader-ul încă rulează: de asta reveal-ul pornește
    // din `.then`, nu imediat — „site-ul e gata" înseamnă și „shaderele sunt legate".
    const scrimWas = scrim.visible;
    scrim.visible = true;
    const pcam = blenderCam || cam;
    // ⚠️ `renderer.compileAsync` NU acoperă `OutlinePass`. Pass-ul are shaderele lui
    // (mască, două treceri de blur, compunerea muchiei) plus un `overrideMaterial` de
    // adâncime pe toată scena — nimic din astea nu e un material din scenă, deci
    // `compile()` nu le vede. Se leagă doar randând un cadru REAL cu pass-ul aprins.
    // Fără el, blocajul apare exact la intrarea în actul de pași, adică fix acolo unde
    // se vede cel mai prost: coloana stă pe loc și pocnește.
    // Se randează starea actului de pași (`applyIntro(1)`), cu prima și ultima piesă —
    // două geometrii diferite, ca să intre în cache și variantele de material de mască.
    // Cadrul nu se vede: stratul de preloader acoperă tot până la reveal.
    const warmOutline = () => {
      if (!stepList.length) return;
      // ⚠️ `introProgress` SE REȚINE ÎNAINTE. `applyIntro` îl SCRIE, deci după
      // `applyIntro(1)` de mai jos el e 1, iar o restaurare cu `applyIntro(introProgress)`
      // ar reaplica tot 1 — adică exact starea de încălzire. Scena rămânea parcată pe
      // finalul clipului (coloana explodată, în fața camerei) până prelua scroll-ul, deci
      // reveal-ul arăta switch-ul desfăcut în loc de tastatura de pe birou. Se vedea la
      // ORICE încărcare, inclusiv prima. `updateScroll` nu apuca să corecteze:
      // `if (!revealDone) return;` îl oprește pe toată durata reveal-ului.
      const pWas = introProgress;
      const camWas = renderPass.camera;
      renderPass.camera = blenderCam || cam;
      applyIntro(1);
      outlinePass.enabled = true;
      outlinePass.edgeStrength = GLOW.strength;
      outlinePass.renderCamera = renderPass.camera;
      for (const s of [stepList[0], stepList[stepList.length - 1]]) {
        outlinePass.selectedObjects = [s.mesh];
        composer.render();
      }
      outlinePass.selectedObjects = [];
      outlinePass.enabled = false;
      renderPass.camera = camWas;
      curAct = null;                 // forțează `setAct` să reaplice tot
      applyIntro(pWas);
      applyActBlend(0);
    };

    const doneIntro = () => {
      scrim.visible = scrimWas;
      warmOutline();
      if (outroLight.parent) scene.remove(outroLight);   // intro-ul rulează fără ea
      // ⚠️ Outro-ul se încarcă ÎNCĂ ÎN PRELOADER, nu la 65% din intro. Măsurat pe
      // `renderer.info.programs.length`: precompilarea lui adaugă ~9 programe, iar dacă
      // se întâmplă în timpul animației se simte ca un blocaj de o singură dată. GLB-ul
      // are doar 1,77 MB; preloader-ul există exact ca să acopere așteptarea, iar userul
      // a cerut explicit să bucleze până când site-ul e gata.
      // ⚠️ Pe ecran mic NU se încarcă outro-ul: 1,77 MB + 4969 de taste instanțiate +
      // ~9 programe de shader, pentru o scenă care oricum stă blurată în spatele unui
      // mesaj. Reveal-ul pornește direct.
      if (SMALL) { startReveal(); return; }
      loadOutro(startReveal);
    };
    // Două treceri: cu lumina de outro în scenă și fără. Ambele configurații de lumini
    // ajung în cache-ul de programe, deci nici apariția scrim-ului, nici intrarea
    // outro-ului nu mai compilează nimic în timpul animației.
    if (renderer.compileAsync) {
      scene.add(outroLight);
      renderer.compileAsync(scene, pcam)
        .then(() => { scene.remove(outroLight); return renderer.compileAsync(scene, pcam); })
        .then(doneIntro)
        .catch(() => { renderer.compile(scene, pcam); doneIntro(); });
    } else {
      scene.add(outroLight);
      renderer.compile(scene, pcam);
      scene.remove(outroLight);
      renderer.compile(scene, pcam);
      doneIntro();
    }
  }, (e) => {
    if (e.total) introDownload = e.loaded / e.total;
  });
}
let introDownload = 0;

// Adaugă termenul Fresnel de contur pe un material. Vezi nota de la `RIM`.
// ⚠️ `customProgramCacheKey` e OBLIGATORIU, dar e ACELAȘI pentru toate trei. Sursa de
// shader e identică — diferă doar valorile uniformelor, iar acelea sunt per material
// (three ține `onBeforeCompile`-ul fiecărui material în `materialProperties.uniforms`
// proprii, chiar când programul e partajat). O cheie per piesă ar fi fost risipă:
// măsurat, dădea 12 programe în plus în loc de 4, iar pe SwiftShader se simțeau ca ~2 s
// în plus la preloader. Verificat după unificare că cele trei piese răspund tot
// independent la valori diferite de `uRim`.
// ⚠️ Se patchează `opaque_fragment` (numele din three r176; în versiuni vechi era
// `output_fragment`), adică DUPĂ ce s-a calculat toată iluminarea. Adăugat mai devreme,
// termenul ar fi trecut prin tone mapping de două ori.
const rimUniforms = {};
function addRim(mat, key) {
  const u = {
    uRim: { value: RIM[key] },
    uRimPow: { value: RIM_POW },
    uRimCol: { value: new THREE.Color(LIGHT_COL) },
  };
  rimUniforms[key] = u;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = u.uRim;
    sh.uniforms.uRimPow = u.uRimPow;
    sh.uniforms.uRimCol = u.uRimCol;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>',
        '#include <common>\nuniform float uRim, uRimPow;\nuniform vec3 uRimCol;')
      .replace('#include <opaque_fragment>', [
        '// contur Fresnel: 0 la incidență normală (corpul rămâne negru),',
        '// urcă doar pe siluetă',
        'float rimF = pow( 1.0 - clamp( dot( normalize( normal ),',
        '                 normalize( vViewPosition ) ), 0.0, 1.0 ), uRimPow );',
        'outgoingLight += uRimCol * ( rimF * uRim );',
        '#include <opaque_fragment>'].join('\n'));
  };
  mat.customProgramCacheKey = () => 'rim';
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------- scrim
// Schemele tehnice de pe scrim, cerute de user pe 2026-09-17: „să apară în timp ce dai
// scroll, ca și cum s-ar desena pe fundal în timp ce piesele devin highlight-uite".
//
// Textura e coaptă de `tools/make_scrim_sheet.py` din scanurile REALE de datasheet care
// stau oricum pe pegboard (`source/assets/models/papers_images`), alese după ce s-a
// zoomat în scrim-ul din machetă și s-a citit ce scrie pe el.
// ⚠️ Nu e o imagine, e o hartă de ordine: R = rangul bucății, G = tăria trasăturii.
// De aceea se încarcă fără conversie de spațiu de culoare și FĂRĂ mipmap-uri —
// mipmap-ul ar amesteca ranguri vecine și ar dezvălui bucăți pe jumătate. Textura e
// oricum aproape 1:1 pe ecran, deci n-are nevoie de ele (și economisește ~3,5 MB).
//
// `ink` e intensitatea. Referința Figma are liniile la **+4.0 luminanță** peste fundal
// (mediană +3.0, p99 +10.0) — foarte discrete. Fundalul NOSTRU e însă de ~2,8 ori mai
// închis (G 15.5 față de 43.9), deci același delta absolut se citește mai tare. Valoarea
// de aici e reglată pe ochi pornind de la deltaul măsurat; pârghia live e `__dbg.scrim`.
const SCRIM = {
  // ⚠️ Coborât de la 0.055 la 0.016 pe 2026-09-18, pentru că în actul de pași vine TEXT
  // de info peste fundal. La 0.055 desenele măsurau +6.70 luminanță peste fundal, cu p99
  // +27.9 — concurau cu textul. Valoarea nu e aleasă, e cea care aterizează pe machetă:
  // acolo liniile stau la +4.0 mediu / p99 +10.0, iar 0.016 dă +3.76 / +11.2.
  // Baleiajul măsurat: 0.055 → +6.70/+27.9 · 0.040 → +5.63/+21.6 · 0.030 → +4.85/+17.0
  //                    0.022 → +4.23/+13.8 · 0.016 → +3.76/+11.2
  // ⚠️ p99 contează mai mult decât media pentru lizibilitatea textului: liniile cele mai
  // aprinse sunt cele care deranjează, nu media pe zonă.
  ink: 0.016, col: 0xbfffe4, sheet: MODELS.base + 'textures/scrim_sheet.png',
  // ---- bara de scanner ----
  // ⚠️ A TREIA încercare, și singura care ține. Userul a respins: (1) sortarea pe benzi
  // peste tot colajul — „apar random fără sens"; (2) drumul de creion pe componente —
  // „e ca și cum cineva ar scrie o literă trasând doar o linie, apoi pleacă și revine".
  // Orice ordonare pe BUCĂȚI are aceeași boală: oricât de bun ar fi drumul, două bucăți
  // consecutive în timp pot fi departe în spațiu, iar ochiul citește asta ca salt.
  // Bara de scanner nu poate sări PRIN CONSTRUCȚIE: poziția se calculează din UV, deci
  // dezvăluirea e o funcție monotonă de y. Userul a și cerut-o explicit.
  soft: 0.035,      // cât de moale e marginea din urma barei
  // ⚠️ Bara NU a coborât proporțional cu cerneala. Ea trece și dispare, deci nu stă
  // peste text; cerneala rămasă în urmă stă. Raportul bară/cerneală a crescut de la 2.9
  // la 4.7 anume, ca scanarea să se citească la fel de bine pe un fundal mai discret.
  beam: 0.075,      // cât de tare e dunga de la front; 0 = doar dezvăluire, fără bară
  beamW: 0.030,     // lățimea dungii
  // Momentele trasării, în progresul actului de pași:
  fadeIn: 0.04,     // cerneala urcă de la 0 — altfel primele bucăți pocnesc
  drawn: 0.78,      // aici colajul e complet; restul actului îl poți citi
  fadeOut: 0.86,    // de aici se stinge, ca să fie GOL înainte de cusătură
};
// ⚠️ Trebuie sa fie EXACT raportul panzei tiparit de tools/make_scrim_sheet.py. Daca
// se schimba lista de foi, se schimba si el — altfel desenele se intind sau se strang.
const SHEET_ASPECT = 2048 / 1280;
const SCRIM_TARGET = new THREE.Vector3(0, 0.78, 0);
const scrimMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
  uniforms: {
    // ⚠️ Culoarea scrim-ului e BG-ul scenei, nu `#0c3b38` cum era în preview.html, iar
    // vigneta lui proprie e OPRITĂ. Motivul: la cusătură, fundalul intro-ului ESTE
    // scrim-ul, iar al outro-ului e `scene.background`. Cu două culori diferite,
    // fundalul sărea la tranziție (măsurat: 8.9 vs 16.1 pe verde). Vigneta e oricum
    // aplicată global în GradePass, deci una locală ar dubla închiderea marginilor.
    uOpacity: { value: 0 }, uVig: { value: 0.0 }, uVigR: { value: 0.70 },
    cBase: { value: BG.clone() },
    // ---- schemele tehnice care se trasează pe scrim, în actul de pași ----
    uSheet: { value: null },                 // textura de ordine, vezi SCRIM
    uDraw: { value: 0 },                     // 0..1, progresul trasării
    uInk: { value: SCRIM.ink },
    uInkCol: { value: new THREE.Color(SCRIM.col) },
    uSheetScale: { value: new THREE.Vector2(1, 1) },
    uSheetOff: { value: new THREE.Vector2(0, 0) },
    uSoft: { value: SCRIM.soft },
    uBeam: { value: SCRIM.beam },
    uBeamW: { value: SCRIM.beamW },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform float uOpacity, uVig, uVigR;
    uniform vec3 cBase;
    uniform sampler2D uSheet;
    uniform float uDraw, uInk, uSoft, uBeam, uBeamW;
    uniform vec3 uInkCol;
    uniform vec2 uSheetScale, uSheetOff;
    varying vec2 vUv;
    void main(){
      vec3 col = cBase;

      // ---- desenele tehnice, dezvaluite de o bara de scanner ----
      // ⚠️ FARA backticks in comentariile de aici: shaderul e un template literal,
      // iar un backtick il termina pe loc. A costat un SyntaxError pe toata pagina.
      //
      // Pozitia de scanare se calculeaza DIN UV, nu din textura. Canalul G da doar
      // taria cernelii. Asa bara e perfect dreapta si continua prin constructie —
      // nu exista nicio ordine care sa poata sari. (Canalul R al texturii pastreaza
      // ordinea "de creion" din incercarile anterioare; nu se mai foloseste, dar
      // ramane ca sa se poata reveni fara sa se recoaca textura.)
      vec2 su = vUv * uSheetScale + uSheetOff;
      if ( uDraw > 0.0 && su.x >= 0.0 && su.x <= 1.0 && su.y >= 0.0 && su.y <= 1.0 ) {
        float ink = texture2D( uSheet, su ).g;
        // ⚠️ 1.0 - su.y, nu su.y. In three texturile au flipY = true implicit, deci
        // randul de SUS al imaginii ajunge la v = 1, iar vUv.y creste in sus pe ecran.
        // Cu su.y direct, bara pornea de jos si urca — invers fata de sensul in care
        // derulezi. Se vedea in captura: cerneala aparea intai la baza cadrului.
        float t = 1.0 - su.y;                            // scanare de sus in jos
        float on = 1.0 - smoothstep( uDraw, uDraw + uSoft, t );
        // bara propriu-zisa: o dunga mai aprinsa chiar la frontul de scanare, care
        // aprinde si cerneala aflata cu un pas inaintea ei. Fara ea, efectul se
        // citeste ca o stergere de masca, nu ca un aparat care trece peste foaie.
        float d = ( t - uDraw ) / uBeamW;
        float beam = exp( -d * d );
        col += uInkCol * ( ink * ( on * uInk + beam * uBeam ) );
      }
      vec2 vd = abs( vUv - 0.5 ) * 2.0;
      float vr = pow( pow( vd.x, 4.0 ) + pow( vd.y, 4.0 ), 0.25 );
      col *= 1.0 - smoothstep( uVigR, 1.0, vr ) * uVig;
      gl_FragColor = vec4( col, uOpacity );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
new THREE.TextureLoader().load(SCRIM.sheet, (t) => {
  t.colorSpace = THREE.NoColorSpace;      // R și G sunt DATE, nu culoare
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  scrimMat.uniforms.uSheet.value = t;
  scrimMat.needsUpdate = true;
});

const scrim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), scrimMat);
scrim.renderOrder = -20;
scrim.visible = false;
scene.add(scrim);

// Placa se așază între subiect și planșă, în ADÂNCIME DE CAMERĂ. Pegboard-ul nu e la
// adâncime constantă: cu camera înclinată, partea lui de sus e mai aproape decât o placă
// pusă la distanță radială, deci o ocluzionează și apare o muchie orizontală dură.
const _v8 = new THREE.Vector3(), _mi = new THREE.Matrix4();
function viewDepthRange(objs, c) {
  _mi.copy(c.matrixWorld).invert();
  let near = Infinity, far = -Infinity;
  for (const o of objs) {
    if (!o || !o.visible || !o.geometry) continue;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    for (let i = 0; i < 8; i++) {
      _v8.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      o.localToWorld(_v8).applyMatrix4(_mi);
      const d = -_v8.z;
      if (d < near) near = d;
      if (d > far) far = d;
    }
  }
  return [near, far];
}
function layoutScrim(c) {
  c.updateMatrixWorld();
  const subj = viewDepthRange(Object.values(pieceMeshes), c);
  const bg = viewDepthRange(bgMeshes, c);
  let dist = (isFinite(subj[1]) ? subj[1] : c.position.distanceTo(SCRIM_TARGET)) + 0.12;
  if (isFinite(bg[0])) dist = Math.min(dist, bg[0] - 0.01);
  dist = Math.max(dist, c.near + 0.02);
  const h = 2 * Math.tan(c.fov * 0.5 * Math.PI / 180) * dist;
  const w = h * c.aspect;
  scrim.scale.set(w * 1.02, h * 1.02, 1);
  // Desenul trebuie să-și păstreze proporțiile, altfel se întinde cu fereastra și
  // cotele ies strâmbe. Încadrare de tip „cover": se potrivește pe latura strâmtă și
  // se taie pe cealaltă.
  const A = c.aspect, S = SHEET_ASPECT;
  if (A > S) { scrimMat.uniforms.uSheetScale.value.set(1, S / A);
               scrimMat.uniforms.uSheetOff.value.set(0, (1 - S / A) * 0.5); }
  else       { scrimMat.uniforms.uSheetScale.value.set(A / S, 1);
               scrimMat.uniforms.uSheetOff.value.set((1 - A / S) * 0.5, 0); }
  scrim.quaternion.copy(c.quaternion);
  scrim.position.copy(c.position).addScaledVector(
    new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion), dist);
}

// ---------------------------------------------------------------- starea intro
function applyIntro(p) {
  if (!introLoaded) return;
  introProgress = Math.min(1, Math.max(0, p));
  if (action) { action.time = introProgress * clipDur; mixer.update(0); }

  const t = introProgress * clipDur;
  const k = REVEAL.end > REVEAL.start
    ? THREE.MathUtils.smoothstep(t, REVEAL.start, REVEAL.end) : (t >= REVEAL.start ? 1 : 0);

  scrimMat.uniforms.uOpacity.value = k;
  scrim.visible = k > 0.005;

  // ⚠️ Planșa NU se stinge prin transparență: materialele de fundal au baseColorFactor
  // negru (emisie pură), deci un fade pe opacitate le face negre, cu grila vizibilă prin
  // hârtii. Rămân OPACE, iar emisia coboară doar până la un prag. Scrim-ul le acoperă.
  const bge = BG_EMI_BASE + (BG_EMI_FLOOR - BG_EMI_BASE) * k;
  bgEmissiveMats.forEach(m => { m.emissiveIntensity = bge; });
  bgMeshes.forEach(o => o.visible = k < 0.995);

  const sw = SW_BASE + (SW_TGT - SW_BASE) * k;
  switchMats.forEach(m => m.color.setScalar(sw));
  const kc = KC_BASE + (KC_TGT - KC_BASE) * k;
  keycapMats.forEach(m => m.color.setScalar(kc));
  if (heroCapIntro) heroCapIntro.color.setScalar(kc);
  // ⚠️ Rampa proprie de reveal a intro-ului se ține minte, ca `applyActBlend` să
  // ÎNMULȚEASCĂ valoarea curentă, nu ținta. Fără asta, apelul cu b=0 scria `SW_TGT` peste
  // rampa în curs și piesele porneau direct la 4.0 în loc de 2.0 → 4.0.
  swNow = sw; kcNow = kc;

  revealK = k;   // folosit de applyActBlend pentru câștigul pe B
  for (const [key, mat] of Object.entries(pieceMats)) mat.color.setScalar(sw);
}

// ============================================================================
// ACTUL 3 — OUTRO. Câmpul de taste + hero-ul propriu. Calibrările sunt cele din
// outro_preview.html, aduse la culorile intro-ului (sesiunea 2026-09-14).
// ============================================================================
let outroRoot = null, outroMixer = null, outroAction = null, outroDur = 0;
let outroCam = null, outroLoaded = false, outroLoading = false;
const capMats = new Set();
const swPieceMats = {};
let fieldKeys = [], fieldMeshes = [], geomByLegend = new Map(), nKeys = 0;
let heroCapFieldMat = null, heroCapFieldMesh = null, heroCapLandAnchor = null;

// Culorile plate per piesă, din DESIGN_BRIEF §3. Arcul și contactul pornesc de la un
// negru MAI DESCHIS decât în intro (#0A0C0C / #111A18 sunt practic invizibile), iar
// lizibilitatea vine din luciu, nu din albedo — vezi nota de la DARK_OUT.
const PIECE_COL = {
  'Solid 87': 0x3e534f, 'Solid 154': 0x3e534f, 'Solid 193': 0x3a4d4a,
  'Solid 208': 0x1f5f8a, 'Solid 372': 0x18231f,
  'Pipe': 0x262b2a, 'Solid 368': 0x2a3230,
};
const GLASS_OUT = { 'Solid 87': 1, 'Solid 154': 1, 'Solid 193': 1 };
// Multiplicatorii cu care culorile hero-ului din INTRO ajung la cele ale outro-ului, la
// capătul actului de pași. Se aplică pe `pieceMats` (clonele de piesă ale intro-ului) și
// pe `keycapMats` (atlasul de taste), înmulțind ținta de reveal — vezi applyActBlend.
// Măsurați, nu aleși: cadrul de la capătul pașilor comparat pe pixeli cu primul cadru de
// outro, apoi rezolvat pe curba `display = a·mul^γ` din două puncte per piesă.
// ⚠️ REFERINȚA E ACUM INTRO-UL, nu outro-ul. Userul a cerut explicit look-ul intro-ului
// („în intro piesele par mai detaliate"), iar cele 7 piese sunt oricum același obiect în
// ambele acte (aceeași geometrie, același material — vezi loadOutro). Deci rămâne un
// singur lucru de compensat: schimbarea de LUMINI la cusătură (intro 9/2/0, outro
// 0/0/6.51). Valorile sunt pe canal, nu scalare, pentru că diferența nu e doar de nivel.
//
// ⚠️ DRUMURI RESPINSE, ambele măsurate, nu mai reluați:
//  · culori plate per piesă în outro (DESIGN_BRIEF §3) + două seturi de compensare, câte
//    unul per stare de lumină. Numeric ieșea sub 1.4 pe fiecare piesă, dar piesele arătau
//    PLATE în outro, fără umbra coaptă — exact ce a reclamat userul;
//  · ridicarea arcului și a contactului prin emisie în intro (`INTRO_EMI0`). Nu mai e
//    nevoie: nu se mai potrivește nimic către outro, intro-ul E referința.
// Toate 1: hero-ul e același obiect, cu aceleași lumini, în ambele acte. Nu mai e nimic
// de compensat. Tabelul rămâne ca pârghie, dacă vreodată luminile trebuie să difere iar.
const INTRO_MUL = {
  'Solid 87':  [1, 1, 1], 'Solid 154': [1, 1, 1], 'Solid 193': [1, 1, 1],
  'Solid 208': [1, 1, 1], 'Solid 368': [1, 1, 1], 'Solid 372': [1, 1, 1],
  'Pipe':      [1, 1, 1],
};
// Compensarea CÂMPULUI de taste pentru luminile intro-ului rămase aprinse. Se aplică pe
// materialul lui, care e vizibil doar în outro, deci nu e cuplat cu nimic din intro.
const FIELD_MUL = [1.4, 1.4, 1.4];
// Fracția din lumina proprie a outro-ului care rămâne aprinsă. 0 = outro-ul folosește
// EXACT luminile intro-ului, deci hero-ul e identic pixel cu pixel.
const OUTRO_AREA = 0.0;

// ---- ATERIZAREA KEYCAP-ULUI EROU ÎN CÂMP ----
// Tot ce face hero-ul identic cu intro-ul îl face, la capătul outro-ului, DIFERIT de
// vecinii lui: materialul copt al intro-ului (turcoaz aprins, cu legenda coaptă) și, mai
// ales, `fog = false`. Ceața de outro e FogExp2 la 2.12, deci pe adâncimile câmpului
// (~1.1 unități sub cameră) acoperă aproape tot — tastele de câmp sunt împinse spre
// culoarea fundalului, iar hero-ul, scutit de ea, rămâne singurul obiect nefogat din
// cadru. De aici impresia de „sticker lipit peste câmp".
//
// Soluția NU e o compensare de culoare pe materialul intro-ului: n-ar putea reproduce
// nici legenda de câmp, nici căderea ceții, iar o valoare potrivită la capăt ar strica
// cusătura de la începutul outro-ului. În schimb se ÎNCRUCIȘEAZĂ două mesh-uri, ambele
// purtate de aceeași animație:
//   · dedesubt, hero-ul intro-ului (geometria + `heroCapIntro`) — neatins, deci cusătura
//     de la p=0 rămâne identică pixel cu pixel;
//   · deasupra, varianta PROPRIE a outro-ului (geometria `Plane.087` + o clonă a
//     materialului `Keycaps_Col 1` al câmpului, trecută prin `patchKeycap` și înscrisă în
//     `capMats`). La opacitate 1 e, prin construcție, exact ce e un vecin: același
//     material, același UV, aceeași ceață, același FIELD_MUL scris în fiecare cadru.
// Fereastra e aleasă pe animație, nu din ochi: între p=0.38 și p=0.62 camera își face
// aproape toată rotirea (pitch-ul se mută cu ~40° din cei 67 totali) iar keycap-ul coboară
// de la y=0.246 la y=0.057 din cursa lui — adică momentul în care se uită oricum totul.
// ⚠️ `transparent` INTRĂ în cheia de cache a programului (three r176, `parameters.opaque`,
// layer 17). Deci se pune o SINGURĂ dată, la load, ca programul să se lege în cadrul de
// încălzire de sub preloader; comutat la runtime ar da exact blocajul pe care îl evită
// tot mecanismul de warm-up.
const HERO_LAND = { from: 0.38, to: 0.62 };
const DARK_OUT = { 'Pipe': 1, 'Solid 368': 1 };

// Materialul tastelor de câmp: în Blender Base Color e Mix(Factor = textura, A = alb,
// B = culoare plată). glTF nu poate exporta un graf procedural, deci a păstrat doar
// textura => taste deschise cu legende închise, exact pe dos. Reconstruit în shader.
const FLAT = {
  '1': new THREE.Color().setRGB(0.0000, 0.0437, 0.0482, THREE.LinearSRGBColorSpace),
  '2': new THREE.Color().setRGB(0.0000, 0.0831, 0.0920, THREE.LinearSRGBColorSpace),
  '3': new THREE.Color().setRGB(0.7874, 0.0642, 0.0071, THREE.LinearSRGBColorSpace),
};
function grainTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  let sd = 1234567;
  for (let i = 0; i < size * size; i++) {
    sd = (sd * 1103515245 + 12345) & 0x7fffffff;
    const v = 118 + ((sd >> 9) & 0xff) * 0.16;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  return t;
}
let GRAIN = null;

// Compensarea IBL pentru tastele de câmp. In outro_preview.html reflexia lor vine din
// produsul environmentIntensity 5.0 x envMapIntensity 3.0 = 15.0. Aici environment-ul
// GLOBAL rămâne 0.35 (vezi nota de la setAct), deci produsul se reface pe material:
// 15.0 / 0.35 = 42.86. Aceeași cifră pe care o au, necoincidental, și materialele de
// piesă din intro (43) — dovadă că pârghia corectă e materialul, nu scena.
const FIELD_ENV = 42.86;
// Hero-ul de outro are materiale proprii (vezi nota din loadOutro), deci și propria
// compensare de IBL. Aceeași aritmetică: în outro_preview.html reflexia pieselor venea
// din environmentIntensity 5.0 x envMapIntensity 1.0, iar aici environment-ul global
// rămâne 0.35 => 5.0 / 0.35 = 14.29.
const HERO_OUT_ENV = 14.29;

function patchKeycap(m, flatOverride) {
  const which = (m.name.match(/Keycaps_Col\s*(\d)/) || [, '1'])[1];
  m.color.setRGB(1, 1, 1);          // factorul de bază trebuie neutru; mixul dă culoarea
  m.metalness = 0.0; m.roughness = 0.64;
  m.bumpMap = GRAIN; m.bumpScale = 0.26;
  m.envMapIntensity = FIELD_ENV;
  m.color.setRGB(FIELD_MUL[0], FIELD_MUL[1], FIELD_MUL[2]);
  const uFlat = { value: (flatOverride || FLAT[which] || FLAT['1']).clone() };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlat = uFlat;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlat;')
      .replace('#include <map_fragment>', [
        '#ifdef USE_MAP',
        '  vec3 tex = texture2D( map, vMapUv ).rgb;',
        '  diffuseColor.rgb *= mix( vec3( 1.0 ), uFlat, tex );',
        '#endif'].join('\n'));
  };
  m.customProgramCacheKey = () => 'keycapmix' + which;
  m.needsUpdate = true;
}

// ---- tastare continuă, pe FRACȚIUNE de taste apăsate ----
// ⚠️ Parametrul NU e „apăsări/s": cu ~4969 de taste și apăsări de ~0.53 s, 200/s ține
// apăsate doar 105 taste = 2% din câmp. `duty` = fracțiunea de taste apăsate.
const TYPE = { duty: 0.85, depth: 0.0034, durLo: 0.35, durHi: 0.725 };
const _km = new THREE.Matrix4();
const _frustum = new THREE.Frustum(), _pvm = new THREE.Matrix4();
let visKeys = 0;
const smoothT = x => x * x * (3 - 2 * x);
function pressProfile(u) {
  if (u < 0.18) return -smoothT(u / 0.18);
  if (u < 0.34) return -1;
  if (u < 0.72) return -1 + smoothT((u - 0.34) / 0.38) * 1.28;
  return 0.28 * (1 - smoothT((u - 0.72) / 0.28));
}
function writeKey(k) {
  _km.copy(k.base);
  _km.elements[13] += (k.off || 0);
  k.im.setMatrixAt(k.idx, _km);
  k.im.__dirty = true;
}
function scheduleNext(k, T) {
  if (TYPE.duty <= 0) { k.nextT = 1e9; return; }
  const durAvg = (TYPE.durLo + TYPE.durHi) * 0.5;
  const d = Math.min(TYPE.duty, 0.999);
  k.nextT = T + durAvg * (1 - d) / d * (0.25 + Math.random() * 1.5);
}
function startPress(k, T) {
  k.pressing = true; k.t0 = T;
  k.dur = TYPE.durLo + Math.random() * (TYPE.durHi - TYPE.durLo);
  k.dep = TYPE.depth * (0.65 + Math.random() * 0.35);
}
// Se apasă DOAR tastele din cadru. Partea scumpă nu e logica, e writeKey plus urcarea
// matricelor de instanță. ⚠️ NU adăuga o limită de DISTANȚĂ: toate tastele din cadru au
// peste 16 px lățime, iar distanța camerei la câmp variază de la 1.07 m la 0.47 m, deci
// orice prag fix taie tot câmpul într-o parte a clipului.
function updateTyping(T, c) {
  if (!fieldMeshes.length) return 0;
  c.updateMatrixWorld();
  _pvm.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pvm);
  for (const pl of _frustum.planes) pl.constant += 0.02;
  let active = 0, vis = 0;
  for (const k of fieldKeys) {
    if (!_frustum.containsPoint(k.pos)) {
      if (k.pressing) { k.pressing = false; if (k.off !== 0) { k.off = 0; writeKey(k); } scheduleNext(k, T); }
      continue;
    }
    vis++;
    if (!k.pressing) {
      if (TYPE.duty > 0 && T >= k.nextT) startPress(k, T);
      else continue;
    }
    const u = (T - k.t0) / k.dur;
    if (u >= 1) { k.pressing = false; if (k.off !== 0) { k.off = 0; writeKey(k); } scheduleNext(k, T); }
    else { k.off = pressProfile(u) * k.dep; writeKey(k); active++; }
  }
  for (const im of fieldMeshes) {
    if (im.__dirty) { im.instanceMatrix.needsUpdate = true; im.__dirty = false; }
  }
  visKeys = vis;
  return active;
}

// ---------------------------------------------------------------- ou de Paște: ATWWW
// Cinci taste din câmpul de outro scriu „ATWWW". Tastele sunt alese pe NUME (`K+coloană
// +rând`, din GLB), nu pe poziție de ecran — numele nu se schimbă la redimensionare.
//
// ⚠️ Legenda unei taste ESTE geometria ei: în GLB fiecare capac are propriile UV-uri în
// atlasul de tastatură, iar `geomByLegend` ține maparea. Deci schimbarea literei înseamnă
// doar să-i dai altă geometrie, ceea ce nu costă nimic: cheile astea intră în grupurile
// de instanțe ale literelor respective.
//
// ⚠️ Ce legendă e ce literă NU se poate afla nici din nume (`key_cap.082` nu spune „W"),
// nici din UV-uri: legenda NU e desenată în cutia UV a feței de sus a capacului, iar
// decupajele din atlas după poziția aia dau litera VECINĂ. Două drumuri care par bune și
// nu sunt:
//   · decupat din atlas după cutia UV  -> a dat 042 = „A", dar randat iese „Z";
//   · dedus din numerotare             -> a dat A = 093, dar randat iese „page down".
// Singurul lucru care spune adevărul e RANDAREA. S-a aflat punând pe cele cinci taste
// câte cinci legende consecutive și citind ce scrie pe ele:
//   040=Q 041=A 043=⌘ · 082=W 083=E 084=R 085=T · 088=I 089=O 090=P 091=[ 092=]
//   093=page down · 094=S 095=D 096=F 097=G
// Deci: A = key_cap.041 · T = key_cap.085 · W = key_cap.082.
// ⚠️ Numerotarea NU e continuă pe rânduri: A stă la 041, lângă Q, nu lângă S.
//
// ⚠️ Rândul e +02, nu +03. Proiecția originii unei taste cade cu ~20 px sub litera ei, iar
// după proiecție păreau potrivite cele de pe +03 — dar raza trasă prin literele chiar
// încercuite de user a nimerit `K+09+02`…`K+13+02`. Cele de pe +03 sunt ACOPERITE de ele.
const EGG = {
  'K+09+02': 'key_cap.041',   // A
  'K+10+02': 'key_cap.085',   // T
  'K+11+02': 'key_cap.082',   // W
  'K+12+02': 'key_cap.082',   // W
  'K+13+02': 'key_cap.082',   // W
};

// ~5000 de noduri de tastă împart doar 86 de geometrii. Lăsate așa ies ~5000 draw calls;
// strânse în InstancedMesh ies ~90.
function buildInstances() {
  const groups = new Map();
  for (const k of fieldKeys) {
    const leg = EGG[k.node.name] || k.legend;
    const byLod = leg ? geomByLegend.get(leg) : null;
    let geom = k.node.geometry;
    if (byLod) geom = (k.d < 0.24 ? (byLod.LOD1 || byLod.LOD0) : (byLod.LOD0 || byLod.LOD1));
    const key = geom.uuid + '|' + k.mat.uuid;
    if (!groups.has(key)) groups.set(key, { geom, mat: k.mat, keys: [] });
    groups.get(key).keys.push(k);
  }
  for (const g of groups.values()) {
    const im = new THREE.InstancedMesh(g.geom, g.mat, g.keys.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.visible = false;
    // ⚠️ DRUM RESPINS: `im.layers.set(1)` + `outroLight.layers.enable(1)`, ca luminile
    // intro-ului să nu atingă câmpul la cusătură. NU funcționează — în three.js
    // `light.layers` se testează față de layerele CAMEREI, nu ale fiecărui obiect, deci
    // filtrarea luminii per obiect nu există. Verificat pe pixeli: câmpul a rămas exact
    // la fel de aprins. Stingerea lui se face din albedo + IBL, în applyActBlend.
    g.keys.forEach((k, i) => { k.im = im; k.idx = i; writeKey(k); });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im); fieldMeshes.push(im);
  }
  for (const k of fieldKeys) k.node.visible = false;   // originalele: înlocuite de instanțe
}

let outroReadyCb = null;
function loadOutro(cb) {
  if (cb) { if (outroLoaded) { cb(); return; } outroReadyCb = cb; }
  if (outroLoading || outroLoaded) return;
  outroLoading = true;
  GRAIN = grainTexture();
  // Singura lumină aprinsă din outro. ⚠️ Culoarea e LTINT, nu alb: în Blender lumina
  // „Area" E albă, dar intro-ul luminează cu verdele-mentă, iar albul făcea outro-ul
  // vizibil mai rece. Prioritatea e potrivirea cu intro-ul, nu fidelitatea la Blender.
  // Creată la pornire (vezi nota de acolo); aici doar intră în scenă, iar programele
  // pentru configurația cu ea sunt deja legate.
  if (!outroLight.parent) scene.add(outroLight);

  // ⚠️ NU mai generăm un environment propriu de outro (era un PMREM dintr-o scenă
  // umplută cu BG). Scena păstrează `introEnv` tot timpul, pentru că hero-ul folosește
  // materialele intro-ului; un al doilea environment ar fi schimbat reflexia exact în
  // clipa cusăturii. Câmpul se compensează pe material (FIELD_ENV).

  loader.load(MODELS.outro, (gltf) => {
    outroRoot = gltf.scene;
    outroRoot.visible = false;
    scene.add(outroRoot);
    outroRoot.traverse(o => { if (o.isCamera && !outroCam) outroCam = o; });
    capTextures(outroRoot);
    if (outroCam) {
      outroCam.near = 0.005; outroCam.far = 60;
      outroCam.aspect = innerWidth / innerHeight;
      outroCam.updateProjectionMatrix();
    }

    outroRoot.traverse(o => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m && /Keycaps_Col/.test(m.name) && !capMats.has(m)) { capMats.add(m); patchKeycap(m); }
      }
    });

    // ---- HERO-UL OUTRO ÎȘI PĂSTREAZĂ MATERIALELE LUI ----
    // ⚠️ DRUM RESPINS, cu dovadă: atribuirea materialelor intro-ului pe hero-ul outro.
    // Părea exactă prin construcție („aceleași mesh-uri în ambele GLB-uri"), dar numele de
    // mesh care coincid NU înseamnă UV-uri care coincid. Citit din chunk-urile JSON:
    // keycap-ul erou e `Plane.188` în intro (nod `key_cap.087_Baked`) și `Plane.087` în
    // outro — mesh-uri DIFERITE. Iar la piesele de switch, unde numele chiar coincid,
    // fiecare export a scris drept TEXCOORD_0 stratul UV cerut de materialul LUI: bake-ul
    // în intro, texturile PBR în outro. Deci atlasul copt al intro-ului cade pe UV-urile
    // greșite și citește texeli din altă zonă. Se vedea direct: keycap-ul erou ieșea
    // gri-închis în outro, în timp ce în intro e turcoaz luminos (diferență de luminanță
    // ~61 pe cutia lui, cea mai mare din coloană).
    //
    // Deci: fiecare act își păstrează sistemul lui de material, iar potrivirea se face
    // pe CULOARE, măsurat pe harta de diferențe (scratchpad/diffmap.py).
    //
    // Materialul `switch` din GLB-ul de outro e UNUL pentru toate cele 7 piese, cu
    // `KHR_materials_transmission` la factor 1 (de aici arcul albicios semnalat de user).
    // Îl clonăm per piesă, oprim transmisia și scoatem `map` — culorile plate din
    // DESIGN_BRIEF §3 sunt cele aprobate în outro_preview.html.
    // ⚠️ GLTFLoader sanitizează numele: `H_Solid 87.002` -> `H_Solid_87002`.
    let built = 0;
    outroRoot.traverse(o => {
      if (!o.isMesh) return;
      // Keycap-ul erou primește și el geometria + materialul intro-ului.
      // ⚠️ Are 1226 de vârfuri în outro și 1326 în intro, dar asta NU înseamnă altă
      // formă: măsurat, au același număr de TRIUNGHIURI (1736), aceeași cutie de
      // încadrare la 5 zecimale și aceeași suprafață totală (0.00080437). Diferența de
      // vârfuri vine din cusăturile de UV — o cusătură dublează vârfuri. Suprafața e
      // identică, deci schimbul e sigur.
      if (/^H_keycap$/.test(o.name)) {
        if (heroCapIntro && heroCapMesh) {
          // Varianta „de câmp", păstrată ca STRAT peste cel de intro (vezi HERO_LAND).
          // Se construiește ÎNAINTE de a rescrie `o`, pentru că îi folosește exact
          // geometria și materialul pe care outro-ul le-a exportat pentru tasta asta.
          // Clona materialului, nu materialul însuși: altfel opacitatea pusă aici ar
          // fade-ui tot câmpul. Intră în `capMats`, deci primește FIELD_MUL în fiecare
          // cadru la fel ca vecinii — potrivirea nu e reglată, e aceeași scriere.
          heroCapFieldMat = o.material.clone();
          heroCapFieldMat.name = 'Keycaps_Col_1_heroLand';
          patchKeycap(heroCapFieldMat);
          capMats.add(heroCapFieldMat);
          heroCapFieldMat.transparent = true;    // o singură dată — vezi nota HERO_LAND
          heroCapFieldMat.opacity = 0;
          // Cele două mesh-uri sunt coplanare (aceleași triunghiuri, alt ordin de
          // vârfuri), deci testul de adâncime le-ar da speckle. Stratul de câmp e tras
          // spre cameră cu polygonOffset și nu scrie adâncime, ca să se amestece curat.
          heroCapFieldMat.depthWrite = false;
          heroCapFieldMat.polygonOffset = true;
          heroCapFieldMat.polygonOffsetFactor = -1;
          heroCapFieldMat.polygonOffsetUnits = -1;
          heroCapFieldMesh = new THREE.Mesh(o.geometry, heroCapFieldMat);
          heroCapFieldMesh.name = 'keycap_land_overlay';
          heroCapFieldMesh.renderOrder = 10;
          // ⚠️ Se agață ABIA DUPĂ traversare. `traverse` iterează `children` pe viu, deci
          // un copil adăugat aici e vizitat imediat — iar `H_keycap_land` trecea de
          // `/^H_keycap/` și își făcea la rândul lui un copil, la infinit
          // (`RangeError: Maximum call stack size exceeded` în `Matrix4.compose`).
          // Ancora se ține deoparte; numele copilului nu mai începe cu `H_keycap`, dar
          // nici pe asta nu ne mai bazăm.
          heroCapLandAnchor = o;

          o.geometry = heroCapMesh.geometry;
          o.material = heroCapIntro;
          built++;
        }
        return;
      }
      const mm = o.name.match(/^H_(?:Solid[ _]?(87|154|193|208|368|372)|(Pipe))/);
      if (!mm) return;
      const key = mm[2] ? 'Pipe' : 'Solid ' + mm[1];
      // ---- CELE 7 PIESE FOLOSESC GEOMETRIA ȘI MATERIALUL INTRO-ULUI ----
      // Dovedit la runtime, cu amprentă SENSIBILĂ LA ORDINE: pozițiile, normalele ȘI
      // buffer-ul de indici sunt IDENTICE între cele două GLB-uri pentru toate cele 7
      // piese (3987/1020/315/632/832/306/1840 vârfuri). Singura diferență e stratul UV:
      // fiecare export a scris drept TEXCOORD_0 UV-ul cerut de materialul LUI — bake-ul
      // în intro, texturile PBR în outro (amprente UV diferite, ex. Pipe001 3744.36 vs
      // 3202.60 pe aceeași sumă de poziții).
      //
      // Deci nu doar materialul, ci GEOMETRIA intro-ului se atribuie aici. Așa piesele
      // primesc atlasul copt cu UV-ul lui corect, adică exact detaliul (umbra/AO coaptă)
      // pe care userul îl vedea doar în intro. Înainte aveau culori plate din DESIGN_BRIEF
      // și de aceea arătau mai „netede" și un pic mai luminate.
      // Bonus: o singură geometrie rezidentă în loc de două.
      const srcMesh = pieceMeshes[key];
      if (srcMesh && pieceMats[key]) {
        o.geometry = srcMesh.geometry;
        o.material = pieceMats[key];
        built++;
      }
    });
    // copil cu transformare identitate: ia animația nodului părinte
    if (heroCapLandAnchor && heroCapFieldMesh) heroCapLandAnchor.add(heroCapFieldMesh);
    console.log('hero outro: ' + built + ' piese pe geometria+materialul intro-ului');

    if (gltf.animations.length) {
      outroMixer = new THREE.AnimationMixer(outroRoot);
      outroAction = outroMixer.clipAction(gltf.animations[0]);
      outroAction.play(); outroAction.paused = true;
      outroDur = gltf.animations[0].duration;
    }

    // legătura geometrie -> (legendă, LOD), pentru gruparea în instanțe
    const parser = gltf.parser, json = parser.json;
    const geomInfo = new Map();
    outroRoot.traverse(o => {
      if (!o.isMesh) return;
      const a = parser.associations.get(o);
      if (!a || a.meshes === undefined) return;
      const nm = json.meshes[a.meshes].name || '';
      const mt = nm.match(/^FIELD_(LOD\d)_(.+)$/);
      if (mt) geomInfo.set(o.geometry, { lod: mt[1], legend: mt[2] });
    });
    geomByLegend = new Map();
    for (const [g, i] of geomInfo) {
      if (!geomByLegend.has(i.legend)) geomByLegend.set(i.legend, {});
      geomByLegend.get(i.legend)[i.lod] = g;
    }

    const HOLE = new THREE.Vector3(-0.024, 0.7742, -0.001);
    outroRoot.traverse(o => {
      if (!o.isMesh || !/^K[+-]\d{2}[+-]\d{2}$/.test(o.name)) return;
      o.updateWorldMatrix(true, false);
      const pos = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const gi = geomInfo.get(o.geometry);
      fieldKeys.push({
        node: o, legend: gi ? gi.legend : null, mat: o.material,
        base: o.matrixWorld.clone(), pos,
        d: Math.hypot(pos.x - HOLE.x, pos.z - HOLE.z),
        off: 0, pressing: false, nextT: Math.random() * (TYPE.durLo + TYPE.durHi),
        t0: 0, dur: 0.5, dep: TYPE.depth,
      });
    });
    nKeys = fieldKeys.length;
    buildInstances();

    // ⚠️ Pregătirea shaderelor, altfel se simte un blocaj la trecerea în outro: la primul
    // cadru în care outro-ul devine vizibil, WebGL compilează și leagă programele celor
    // 86 de InstancedMesh + ale materialelor de hero, sincron, într-un singur cadru.
    //
    // Se face în DOI pași, pentru că `compileAsync` singur NU e suficient — măsurat pe
    // `renderer.info.programs`: după el rămâneau exact 8 programe (`physical,STANDARD`,
    // adică cele 7 clone de piesă + placa) care se compilau abia la intrarea în outro.
    // ⚠️ Am crezut că e o problemă de vizibilitate pe lanțul de părinți și am aprins tot
    // subarborele — nu s-a schimbat nimic, tot 8. Nu depindem deci de ce anume alege
    // `compile()` să lege: după el randăm UN CADRU REAL cu outro-ul pe ecran, sub
    // preloader, care prin definiție compilează exact ce are nevoie un cadru real.
    // Cadrul nu se vede: stratul de preloader acoperă tot până la reveal.
    const visWas = [];
    outroRoot.traverse(o => { visWas.push([o, o.visible]); o.visible = true; });
    for (const im of fieldMeshes) im.visible = true;
    const camForCompile = outroCam || renderPass.camera;

    const warmFrame = () => {
      const camWas = renderPass.camera, introWas = introRoot ? introRoot.visible : false;
      const scrimWas2 = scrim.visible;
      if (introRoot) introRoot.visible = false;
      scrim.visible = false;
      outroRoot.visible = true;
      for (const im of fieldMeshes) im.visible = true;
      if (outroCam) renderPass.camera = outroCam;
      applyActBlend(1);
      // Două momente din clip: la 0 și la 0.5. Un singur cadru lăsa încă 5 programe
      // necompilate — materialele cu `PHYSICAL` (transmisie/clearcoat) intră în lanț
      // doar când sunt chiar desenate.
      applyOutro(0);
      composer.render();
      applyOutro(0.5);
      composer.render();
      // înapoi la starea de intro; `curAct = null` forțează `setAct` să reaplice tot
      renderPass.camera = camWas;
      if (introRoot) introRoot.visible = introWas;
      scrim.visible = scrimWas2;
      curAct = null;
      applyIntro(introProgress);
      applyActBlend(0);
    };

    const done = () => {
      // ⚠️ Cadrul de încălzire ÎNAINTE de restaurare: `visWas` reține starea de după
      // load, iar acolo `outroRoot.visible` e deja false. Restaurând mai întâi, cadrul
      // randa un outro invizibil și nu compila nimic — se vedea că tot rămâneau 5
      // programe pentru cusătură.
      warmFrame();
      for (const [o, v] of visWas) o.visible = v;
      outroRoot.visible = false;
      for (const im of fieldMeshes) im.visible = false;
      outroLoaded = true;
      console.log('outro gata:', nKeys, 'taste ->', fieldMeshes.length,
                  'InstancedMesh · shadere legate');
      if (outroReadyCb) { const f = outroReadyCb; outroReadyCb = null; f(); }
    };
    if (renderer.compileAsync) {
      renderer.compileAsync(scene, camForCompile).then(done).catch(() => {
        renderer.compile(scene, camForCompile); done();
      });
    } else {
      renderer.compile(scene, camForCompile);
      done();
    }
  });
}

function applyOutro(p) {
  if (!outroLoaded || !outroAction) return;
  outroAction.time = Math.min(1, Math.max(0, p)) * outroDur;
  outroMixer.update(0);
}

// Încrucișarea hero-ului spre look-ul de câmp. Vezi nota de la HERO_LAND.
// `smoothstep`, nu rampă liniară: capetele unei rampe liniare se văd ca două „praguri",
// mai ales cel de la început, unde keycap-ul e încă mare pe ecran.
function setHeroLand(p) {
  if (!heroCapFieldMesh) return;
  const u = THREE.MathUtils.smoothstep(p, HERO_LAND.from, HERO_LAND.to);
  heroCapFieldMat.opacity = u;
  heroCapFieldMesh.visible = u > 0.002;
}

// ============================================================================
// REVEAL preloader -> intro
// Stratul de preloader își scade opacitatea la 0, iar scena din intro pornește
// blurată (30 px) și se limpezește. Blur-ul stă pe canvas-ul #main, nu pe stratul de
// preloader: efectul citit e „site-ul intră în focus", iar dacă îl vrei pe preloader
// (așa cum se poate citi și cererea), mută filtrul pe #pl și inversează sensul.
// ============================================================================
let revealPhase = 0;          // 0 = nimic, 1 = preloader se stinge, 2 = blur se stinge
let revealT0 = 0, revealDone = false;
// Cât din faza de blur trebuie consumat ca să pornească DOM-ul. Vezi nota de la locul
// unde se folosește: e o pârghie, nu o constantă aleasă din ochi.
const READY_AT = 0.42;
let domReady = false;
function startReveal() {
  if (revealPhase || revealDone) return;
  revealPhase = 1; revealT0 = performance.now();
  renderer.domElement.style.filter = 'blur(' + INTRO_REVEAL.blurPx + 'px)';
}
function updateReveal(now) {
  if (!revealPhase) return;
  if (revealPhase === 1) {
    const u = Math.min(1, (now - revealT0) / INTRO_REVEAL.plMs);
    plEl.style.opacity = String(1 - easeOutQuart(u));
    if (u >= 1) {
      // preloader-ul a dispărut; randerul lui se distruge aici, nu mai are ce desena
      plEl.remove(); plRenderer.dispose();
      revealPhase = 2; revealT0 = now;
    }
    return;
  }
  const u = Math.min(1, (now - revealT0) / INTRO_REVEAL.blurMs);
  const px = (1 - easeOutQuart(u)) * INTRO_REVEAL.blurPx;
  renderer.domElement.style.filter = px > 0.05 ? 'blur(' + px.toFixed(2) + 'px)' : '';
  // ⚠️ DOM-ul pornește ÎNAINTE ca blurul să se termine. Cu semnalul la capăt (u = 1) se
  // simțea un timp mort: scena se limpezea, urma o pauză, apoi porneau textele. Aici
  // `easeOutQuart` a consumat deja 88.7% din blur (30 px → 3.4 px), adică imaginea e
  // practic limpede, dar coada ei se suprapune cu intrarea textelor și mișcarea e
  // continuă. ⚠️ Nu se poate muta mult mai devreme: sub ~0.3 titlul ar apărea peste o
  // scenă încă vizibil neclară și s-ar citi ca o greșeală de încărcare.
  if (u >= READY_AT && !domReady) {
    domReady = true;
    // Semnalul „scena e gata de privit". Pe ecran mic, DE-ABIA acum apare poarta
    // (vezi `html.is-ready` în scene.css) — cerința userului era ca preloaderul să
    // fie primul, iar mesajul să vină peste scena deja blurată.
    document.documentElement.classList.add('is-ready');
    // Ancora pentru nav: de-abia acum camera e cea din Blender și dimensiunile sunt
    // finale. Vezi `publishAnchor`.
    publishAnchor();
    // Al treilea eveniment către DOM. Momentul e același `is-ready`, dar evenimentul e
    // ce așteaptă `ui/` ca să pornească intrarea titlului: clasa se poate observa doar
    // cu un MutationObserver, iar asta ar fi însemnat două mecanisme pentru un moment.
    dispatchEvent(new CustomEvent('keycap:ready'));
    // ⚠️ SCROLL-UL NU SE MAI DEBLOCHEAZĂ AICI. Cerința userului: nu poți derula până nu
    // se termină animația titlului. Deci deblocarea o cere `ui/` prin `keycap:herodone`,
    // iar ceasul de mai jos e plasa: dacă DOM-ul crapă, pagina se deblochează oricum
    // după `HERO_GATE_MS` în loc să rămână înțepenită. Intrarea titlului durează ~2.0 s.
    if (SMALL) unlock();                 // pe ecran mic nu există titlu de așteptat
    else {
      addEventListener('keycap:herodone', unlock, { once: true });
      setTimeout(unlock, HERO_GATE_MS);
    }
  }
  if (u >= 1) {
    revealPhase = 0; revealDone = true;
    renderer.domElement.style.filter = '';
  }
}

// Deblocarea, scoasă din `updateReveal` pentru că acum vine din două locuri (evenimentul
// din DOM sau ceasul de siguranță) și trebuie să se întâmple O SINGURĂ DATĂ.
const HERO_GATE_MS = 5000;
let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  document.body.classList.remove('locked');
  // ⚠️ `#track` tocmai a reapărut (blocarea îl ținea ascuns), deci înălțimea documentului
  // s-a schimbat în cadrul ăsta. Lenis își ține dimensiunile în cache și le reîmprospătează
  // printr-un ResizeObserver, adică ASINCRON — fără `resize()` explicit, primul tick ar
  // lucra cu un document de o singură fereastră.
  if (typeof lenis.resize === 'function') lenis.resize();
  // ⚠️ ÎNAINTE de `start()`: cât timp scroll-ul e blocat, poziția internă a lui Lenis
  // poate fi diferită de 0 (vezi nota de la pornire). Fără asta, primul cadru după
  // deblocare sare în actul unde erai înainte de refresh.
  scrollTo(0, 0);
  lenis.scrollTo(0, { immediate: true, force: true });
  // ⚠️ Pe ecran mic scroll-ul rămâne oprit: `#track` e ascuns din CSS, deci n-ar avea
  // pe ce să se miște, iar `updateScroll` ar citi dreptunghiuri de zero.
  // ⚠️ `modalOpen`: About se poate deschide cât titlul încă intră; atunci deblocarea
  // trebuie să aștepte închiderea lui, altfel scena s-ar mișca sub voal.
  if (!SMALL && !modalOpen) lenis.start();   // de aici scroll-ul preia controlul
}

// Stratul de About (din `ui/`) cere oprirea scroll-ului cât e deschis. Scena îl execută
// pentru că ea deține Lenis-ul; `ui/` nu-l atinge direct.
let modalOpen = false;
let modalFrames = 0;
addEventListener('keycap:modal', (e) => {
  modalOpen = !!e.detail.open;
  modalFrames = 2;
  if (!unlocked || SMALL) return;      // încă blocat de intro: `unlock()` decide mai târziu
  if (modalOpen) lenis.stop(); else lenis.start();
});

// ============================================================================
// SCROLL -> acte. Progresul se derivă din poziția segmentelor, nu din valori vh
// hardcodate: așa lungimile se pot re-regla în CSS (sau în Webflow) fără cod.
// ============================================================================
const segs = { intro: document.getElementById('seg-intro'),
               steps: document.getElementById('seg-steps'),
               outro: document.getElementById('seg-outro') };
let curAct = null;

// ---------------------------------------------------------------- starea per act
// Intro și outro au iluminări, environment și ceață DIFERITE. Un singur renderer și un
// singur lanț de gradare, dar starea scenei se comută la trecerea dintre acte.
// Cusătura e invizibilă pentru că la momentul ei ambele scene arată ACELAȘI obiect în
// aceeași poziție: dreptunghiul de pixeli al coloanei explodate e identic (măsurat:
// 102x647 vs 103x647, același centru). Deci se poate schimba pur și simplu ce e afișat.
function setAct(name) {
  if (curAct === name) return;
  curAct = name;
  // Contractul cu DOM-ul, al doilea eveniment după `keycap:step`. `ui/` are nevoie de el
  // ca să știe ce scrie în nav și în blocul de info din dreapta-jos.
  // ⚠️ `setAct` e chemat și din `warmFrame`, cu `curAct = null` înainte, deci evenimentul
  // poate veni O DATĂ în plus înainte de reveal. Nu deranjează — `ui/` scrie doar text —
  // dar nu te baza pe el ca „userul a ajuns în actul X".
  dispatchEvent(new CustomEvent('keycap:act', { detail: { name } }));
  const isOutro = name === 'outro';

  // Vizibilitatea și camera se comută INSTANT — și e în regulă, pentru că la momentul
  // cusăturii cele două scene arată același obiect, cu ACELEAȘI materiale (vezi nota
  // din loadOutro) și în aceeași încadrare (măsurat: dreptunghiul coloanei e identic,
  // 102x647 vs 103x647, același centru). Deci swap-ul nu se vede.
  if (introRoot) introRoot.visible = !isOutro;
  scrim.visible = !isOutro && scrimMat.uniforms.uOpacity.value > 0.005;
  if (outroRoot) outroRoot.visible = isOutro;
  for (const im of fieldMeshes) im.visible = isOutro;

  if (isOutro && outroCam) renderPass.camera = outroCam;
  else if (!isOutro && blenderCam) renderPass.camera = blenderCam;
}

// ⚠️ environmentIntensity NU se mai comută per act. Rămâne 0.35 tot timpul.
// Motivul, măsurat: hero-ul folosește materialele intro-ului, cu envMapIntensity 43,
// calibrat pentru 0.35. Ridicat la 5.0 pentru outro, piesele primeau de ~14x mai mult
// IBL și săreau vizibil la cusătură (contact +30.8, carcasă inferioară +24.7 pe
// luminanță). Aceeași capcană ca în sesiunea 2026-09-08: environment-ul GLOBAL nu e
// pârghia potrivită. Câmpul primește compensarea pe MATERIALUL lui, vezi loadOutro.
//
// Iluminarea, ceața și câștigul pe B se AMESTECĂ pe primele 15% din trackul de outro,
// nu se comută. Așa, în clipa cusăturii starea e încă cea a intro-ului — deci hero-ul
// randează identic — iar schimbarea se face treptat, peste animația proprie a outro-ului.
// Amestecul se face pe ACTUL DE PAȘI, nu pe începutul outro-ului. Adică INTRO-ul
// converge spre calibrarea outro-ului, și nu invers.
//
// ⚠️ Prima versiune făcea exact pe dos: ținea la cusătură starea intro-ului și se muta
// spre outro pe primele 15% din trackul de outro. Numeric ieșea perfect (Δ luminanță sub
// 2 pe fiecare piesă), dar erau trei consecințe vizibile, toate raportate:
//   1. ceața outro-ului (2.12) apărea DUPĂ cusătură, deci în primele cadre de outro se
//      vedea câmpul de taste pierzându-se în depărtare, nefiresc — în outro-ul real
//      câmpul e complet ascuns de ceață de la primul cadru (măsurat în `outro_preview`:
//      zona de jos e 0.4/16.8/19.1, adică exact fundalul);
//   2. câștigul pe B rămânea 1.28 la cusătură, deci fundalul (scrim-ul) ieșea cu 10% mai
//      albastru decât fundalul outro-ului — măsurat B 22.4 vs 20.4, raport 1.098, exact
//      1.28/1.16;
//   3. switch-ul din intro rămânea la culorile intro-ului până în clipa cusăturii, deci
//      toată schimbarea se întâmpla brusc, acolo.
// Acum ceața, câștigul și culorile ajung la valorile outro-ului ÎNAINTE de cusătură,
// treptat, pe cele 800vh ale actului de pași, unde coloana stă oricum parcată.
function applyActBlend(b) {
  const t = Math.min(1, Math.max(0, b));
  // `holdLights` există doar pentru harness-ul de măsurare (`?dbg=1`): îngheață luminile
  // ca să pot compara două stări fără ca bucla să le rescrie în cadrul următor.
  // ⚠️ keyLight și fillLight rămân APRINSE și în outro, la aceeași intensitate.
  // Asta e diferența care conta de fapt, și se vede doar cu instrumentul potrivit:
  // media luminanței era deja potrivită, dar DEVIAȚIA STANDARD din interiorul pieselor
  // (adică detaliul, umbra pe ele) era cu 15-17% mai mică în outro — pentru că o
  // singură lumină de sus, de suprafață, dă o umbrire mai plată decât două direcționale.
  // Cu aceleași lumini, aceeași geometrie și același material, hero-ul e IDENTIC prin
  // construcție, deci nu mai are nevoie de nicio compensare de culoare.
  // Colateralul e doar pe CÂMPUL de taste, care se luminează în plus — și el se
  // compensează pe materialul lui (FIELD_MUL), fiind vizibil numai în outro.
  if (!(window.__dbg && window.__dbg.holdLights)) {
    keyLight.intensity = 9.0;
    fillLight.intensity = 2.0;
    outroLight.intensity = 6.51 * t * OUTRO_AREA;
  }
  // `holdFog` există doar pentru harness (`?dbg=1`), ca la lumini.
  if (!(window.__dbg && window.__dbg.holdFog))
    scene.fog.density = 0.18 + (2.12 - 0.18) * t;

  // ⚠️ Câștigul pe B se mută de la valoarea intro-ului la cea a outro-ului PE FEREASTRA
  // DE REVEAL (3.00 → 4.60 s), nu la cusătură. Motivul: el schimbă fundalul (scrim-ul),
  // iar în fereastra de reveal fundalul se schimbă oricum — planșa dispare în spatele
  // scrim-ului. Măsurat: 1.28 vs 1.16 dă pe fundal B 22.4 vs 20.4, adică exact diferența
  // de culoare care se vedea la trecerea în outro.
  // ⚠️ `max(t, revealK)`, nu doar `revealK`: în actul de outro `applyIntro` nu se mai
  // apelează, deci `revealK` ar rămâne înghețat pe ultima valoare. Prima versiune scria
  // câștigul direct în `applyIntro` și de aceea, sărind direct în outro, cadrul ieșea cu
  // câștigul intro-ului — se vedea pe B: 93.0 în loc de 84.5 pe keycap.
  gradePass.uniforms.uGainB.value = GRADE.gainB_intro
    + (GRADE.gainB_outro - GRADE.gainB_intro) * Math.max(t, revealK);
  // Cele 7 piese sunt ACELAȘI material în ambele acte, deci singurul lucru de compensat
  // e schimbarea de lumini de la cusătură. `applyIntro` le scrie culoarea în fiecare
  // cadru, deci apelul ăsta trebuie să vină DUPĂ el (vezi updateScroll).
  // ⚠️ `envMapIntensity` NU e o pârghie aici: A/B 43 → 14.29 a dat imagine identică,
  // `introEnv` e prea închis ca să conteze pe piese. De aceea nu mai apare în amestec.
  const mix3 = (base, mul) => [
    base * (1 + (mul[0] - 1) * t),
    base * (1 + (mul[1] - 1) * t),
    base * (1 + (mul[2] - 1) * t)];
  for (const k in pieceMats) {
    const mul = INTRO_MUL[k];
    if (!mul) continue;
    const c = mix3(swNow, mul);
    pieceMats[k].color.setRGB(c[0], c[1], c[2]);
  }
  // Câmpul: scris în fiecare cadru ca reglajul din harness să aibă efect pe loc.
  for (const m of capMats) m.color.setRGB(FIELD_MUL[0], FIELD_MUL[1], FIELD_MUL[2]);
}

function segProgress(el) {
  const r = el.getBoundingClientRect();
  const span = r.height - innerHeight;
  if (span <= 0) return r.top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -r.top / span));
}

// Al patrulea eveniment către DOM: unde ești în actul curent, ca număr între 0 și 1.
// `ui/` are nevoie de el pentru animațiile legate de scroll (titlul care pleacă și se
// întoarce). ⚠️ Pleacă de AICI, din singurul loc care citește trackul — regula din capul
// lui `ui/index.js` spune explicit să nu existe un al doilea cititor de scroll.
// ⚠️ Pragul nu e o optimizare de dragul optimizării: fără el pleacă un eveniment pe
// cadru și când pagina stă pe loc, pentru că `updateScroll` e chemat din buclă, nu din
// `scroll`. 2e-4 din trackul de intro (500vh de span) înseamnă sub un pixel de scroll.
// ⚠️ Pe lângă progresul din ACT pleacă și `total` (cât ai coborât în toată pagina) și `v`
// (viteza lui Lenis). HUD-ul din colț le folosește pentru ALT și SPEED, iar regula „un
// singur cititor de scroll" spune că nu are voie să le ia singur.
// ⚠️ Se emite și când se schimbă doar VITEZA: fără asta, când pagina stă pe loc nu mai
// pleacă nimic, iar HUD-ul ar rămâne cu ultima viteză înghețată pe ecran. Pragul de 0.5
// e acolo doar ca să nu plece un eveniment pe cadru dintr-un zgomot de virgulă.
let lastPName = '', lastPVal = -1, lastV = 0;
function emitProgress(name, p) {
  const v = typeof lenis.velocity === 'number' ? lenis.velocity : 0;
  if (name === lastPName && Math.abs(p - lastPVal) < 2e-4 && Math.abs(v - lastV) < 0.5) return;
  lastPName = name; lastPVal = p; lastV = v;
  const doc = document.documentElement.scrollHeight - innerHeight;
  const total = typeof lenis.progress === 'number' ? lenis.progress
              : (doc > 0 ? scrollY / doc : 0);
  dispatchEvent(new CustomEvent('keycap:progress', { detail: { name, p, total, v } }));
}

let actProgress = 0;
function updateScroll() {
  // ⚠️ `unlocked`, nu `revealDone`. Cele două nu mai coincid: scena e gata (blur stins)
  // cu ~2 s înainte ca scroll-ul să se deblocheze, cât intră titlul. În intervalul ăla
  // `#track` e ASCUNS (așa se blochează scroll-ul, vezi `scene.css`), deci
  // `getBoundingClientRect()` întoarce zerouri și `segProgress` returnează 1 — adică
  // exact capcana de pe 2026-09-18: clipul ar sări pe switch-ul explodat și s-ar
  // încărca outro-ul, în timp ce userul se uită la tastatură.
  if (!revealDone || !unlocked) return;
  // ⚠️ Se alege ULTIMUL act care a început, nu primul care e „îndeajuns pe ecran".
  // Varianta veche cerea `r.bottom > innerHeight * 0.5`, deci pe ultimele 50vh ale
  // FIECĂRUI segment nu se potrivea niciun act și se cădea înapoi pe valoarea
  // implicită, 'intro', cu progres 1. Nu se vedea cât timp actele arătau oricum
  // același cadru parcat — dar desenele de pe scrim, care se resetează în ramura de
  // intro, dispăreau brusc chiar înainte de cusătură. Găsit măsurând uDraw la
  // capătul actului de pași: 0.000 în loc de 1.
  let name = 'intro';
  for (const a of ACTS) {
    const r = segs[a].getBoundingClientRect();
    if (r.top > 1) break;                          // segmentul ăsta încă n-a început
    name = a;                                      // ultimul început câștigă
    if (r.bottom > innerHeight * 0.5) break;       // și e încă bine pe ecran
  }
  setAct(name);
  const p = actProgress = segProgress(segs[name]);

  if (name === 'intro') {
    applyIntro(p);
    applyActBlend(0);
    setHeroLand(0);           // dacă userul derulează înapoi, hero-ul revine la intro
    clearSteps();
    scrimMat.uniforms.uDraw.value = 0;   // hârtia e goală până începe actul de pași
    // Outro-ul se încarcă LAZY, pe la două treimi din trackul de intro: e gata până
    // ajungi la el, dar nu concurează cu cele 8.8 MB ale intro-ului la pornire.
    if (p > 0.65) loadOutro();   // plasă de siguranță; normal e deja încărcat
  } else if (name === 'steps') {
    applyIntro(1);            // clipul rămâne PARCAT la final; scroll-ul avansează pașii
    // ⚠️ 0, nu `p`. Luminile COMUTĂ la cusătură, nu se amestecă: coloana e compensată pe
    // culoare pentru starea de lumină a outro-ului (`INTRO_MUL`), deci arată
    // identic de o parte și de alta. Un amestec gradual ar cere compensare și pentru
    // fiecare stare intermediară — măsurat, interpolarea liniară a celor două seturi
    // depășea cu până la +30 pe luminanță la jumătatea drumului (stem 106.7 vs ținta
    // 76.5), pentru că suma de lumină la mijloc nu e media celor două capete.
    // Iar comutarea nu se vede: luminile nu ating fundalul (măsurat: scrim-ul e nelumin-
    // at), ceața nu atinge coloana (±0.2), iar câmpul apare oricum, fiind alt act.
    applyActBlend(0);         // ⚠️ DUPĂ applyIntro: el rescrie culorile hero-ului
    setHeroLand(0);
    applySteps(p);            // conturul pe cele 8 piese, unul pe rând
    setScrimSheet(p);         // desenele se trasează în paralel cu conturul
    loadOutro();
  } else {
    applyOutro(p);
    applyActBlend(1);         // actul de outro rulează integral în calibrarea lui
    clearSteps();
    setHeroLand(p);           // ⚠️ DUPĂ applyActBlend: el scrie FIELD_MUL pe capMats
  }

  // ⚠️ LA FINAL, nu la început: așa evenimentul pleacă după ce toată starea cadrului a
  // fost calculată, nu dintr-un cadru pe jumătate actualizat.
  emitProgress(name, p);
}
// Nu ascultăm evenimentul `scroll`: cu un scroller interpolat, pozițiile reale se
// schimbă în fiecare cadru, iar evenimentul nu e garantat să vină la fiecare cadru.
// `updateScroll()` e chemat din bucla de randare.

// Punte pentru harness-ul de măsurare. Există DOAR cu `?dbg=1`, deci în site nu
// expune nimic. Fără ea nu se poate citi nimic din modul din exterior (scope de modul).
if (qs.get('dbg') === '1') {
  window.__dbg = {
    THREE, scene,
    get cam() { return renderPass.camera; },
    get act() { return curAct; },
    get mergeStats() { return mergeStats; },
    get texSavedMB() { return Math.round(texSavedMB); },
    get gov() { return PR_GOV; }, get pr() { return prNow; }, setPR, get modalOpen() { return modalOpen; },
    get p() { return actProgress; },
    // Reglajele de convergență, expuse ca să le pot muta LIVE din harness în loc să
    // reîncarc pagina la fiecare încercare (o rulare headless costă ~4 minute).
    mul: INTRO_MUL, fieldMul: FIELD_MUL, renderer, holdLights: false, holdFog: false,
    keyLight, fillLight, outroLight,
    pieceMats, keycapMats, pieceColBase: PIECE_COL, swPieceMats,
    heroLand: HERO_LAND, setHeroLand,
    reveal: INTRO_REVEAL, readyAt: READY_AT,
    glow: GLOW, outlinePass, stepList, scrim: SCRIM, scrimMat,
    // grosimea liniei: `outlinePass.edgeThickness` direct; rezoluția și raza de glow:
    get plPhase() { return plPhase; },
    setGlowRes: (res, radius) => { GLOW.res = res; GLOW.glowRadius = radius; applyGlowRes(); },
    get legends() { return [...geomByLegend.keys()]; },
    get geomByLegend() { return geomByLegend; },
    get fieldKeys() { return fieldKeys; },
    // ⚠️ Se scrie CONSTANTA, nu uniforma: `setScrimSheet` rescrie `uInk` in fiecare
    // cadru din `SCRIM.ink` inmultit cu plicul de fade. Scris direct pe uniforma,
    // reglajul traia un singur cadru si baleiajul iesea plat — masuram de trei ori
    // aceeasi valoare si parea ca parghia nu face nimic. Aceeasi capcana ca la
    // `outlinePass.enabled`, pe care `applySteps` il rescrie la fel.
    setInk: (v) => { SCRIM.ink = v; },
    setBeam: (v) => { SCRIM.beam = v; scrimMat.uniforms.uBeam.value = v; },
    setDraw: (v) => { scrimMat.uniforms.uDraw.value = v; },
    rim: RIM, rimUniforms,
    setRim: (key, v) => { if (rimUniforms[key]) rimUniforms[key].uRim.value = v; },
    setRimPow: (v) => { for (const k in rimUniforms) rimUniforms[k].uRimPow.value = v; },
    grade: GRADE, bg: BG, scrimMat, gradePass,
    // Pârghii LIVE pentru calibrarea de culoare. `BG` e un singur obiect `Color`, dar
    // ajunge în trei locuri, dintre care două prin COPIE: `scene.background` (aceeași
    // referință), `scene.fog.color` (construit din `BG.getHex()`) și `cBase` al
    // scrim-ului (`BG.clone()`). Deci trebuie scrise toate trei, altfel A/B-ul măsoară
    // o scenă pe jumătate schimbată.
    setBG: (r, g, b) => {
      BG.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
      scene.fog.color.copy(BG);
      scrimMat.uniforms.cBase.value.copy(BG);
    },
    getBG: () => BG.toArray(),
    get step() { return curStep; },
    get heroLandMat() { return heroCapFieldMat; },
    get heroCapIntro() { return heroCapIntro; },
    lights: () => ({ key: keyLight.intensity, fill: fillLight.intensity,
                     outro: outroLight.intensity,
                     fog: scene.fog.density, gainB: gradePass.uniforms.uGainB.value,
                     env: scene.environmentIntensity }),
  };
}

// ---------------------------------------------------------------- resize + loop
addEventListener('resize', () => {
  // ⚠️ Trecerea PESTE prag cere o reîncărcare, nu o comutare. `SMALL` a decis deja dacă
  // s-a încărcat outro-ul și dacă bucla mai rulează — lucruri care nu se pot reface din
  // mers fără să reconstruim scena. Aspectul (mesajul, blurul) comută oricum instant din
  // CSS; asta e doar pentru partea de JS. Cazul e rar: cineva care trage marginea
  // ferestrei peste 992 px.
  if (isSmall() !== SMALL) { location.reload(); return; }
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  plRenderer.setSize(innerWidth, innerHeight);
  for (const c of [cam, blenderCam]) {
    if (!c) continue;
    c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix();
  }
  if (plReady) plLayout();
  // ⚠️ DUPĂ actualizarea aspectului camerelor: ancora se calculează prin proiecție, deci
  // cu matricea veche ar ieși poziția de dinainte de redimensionare.
  publishAnchor();
  // ⚠️ Și pasul curent, ca heading-ul piesei să se re-așeze: `box` e în pixeli de ecran.
  boxCache = null;
  if (curStep >= 0) emitStep(curStep, true);
  if (SMALL) smallFrames = 2;      // redesenează la noua dimensiune, apoi se oprește iar
  else updateScroll();
});

const clock = new THREE.Clock();
let plPhase = 0, typeClock = 0, activeKeys = 0;

// ---------------------------------------------------------------- rezoluție adaptivă
// ⚠️ DPR-ul era FIX (`BASE_PR`, max 2), deci un iGPU randa la fel de mulți pixeli ca o
// placă dedicată: la DPR 2 pe 2560x1440, lanțul de post (render + output + contur + grade)
// trece prin ~15 milioane de pixeli pe cadru. Acum, dacă media cadrelor pe o secundă
// scade sub ~45 fps, rezoluția coboară cu un sfert (până la `min`); dacă revine la
// vsync timp de câteva secunde, urcă înapoi.
// ⚠️ Plafonul de revenire: o treaptă de pe care s-a coborât de DOUĂ ori nu mai e
// încercată. Fără el, un dispozitiv la limită oscila la ~5 s între două rezoluții, iar
// fiecare schimbare se vede ca o mică „respirație" a imaginii.
// ⚠️ Nu se evaluează în preloader, nici în primele secunde după reveal (compilări,
// încărcarea outro-ului) și nici cu tab-ul ascuns: sunt goluri care nu țin de GPU.
// Textul e DOM, deci rămâne clar la orice rezoluție a canvas-ului.
const PR_GOV = { on: true, min: 0.75, step: 0.25, slowMs: 22, fastMs: 17.5,
                 winMs: 1000, upAfter: 4, graceMs: 2500, gapS: 0.25 };
let prNow = BASE_PR, govStart = 0, govSum = 0, govN = 0, govFast = 0, govLast = 0;
const govDrops = new Map();          // treaptă -> de câte ori s-a coborât de pe ea
function setPR(pr) {
  prNow = pr;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
}
function govern(now, dt) {
  if (!PR_GOV.on || SMALL || !revealDone || modalOpen || document.hidden) { govStart = 0; return; }
  if (!govLast) govLast = now + PR_GOV.graceMs;       // perioada de grație după reveal
  if (now < govLast) return;
  if (dt > PR_GOV.gapS) return;                       // un gol (tab, compilare), nu un cadru
  if (!govStart) { govStart = now; govSum = 0; govN = 0; }
  govSum += dt * 1000; govN++;
  if (now - govStart < PR_GOV.winMs) return;
  const avg = govSum / govN;
  govStart = 0;
  if (avg > PR_GOV.slowMs && prNow > PR_GOV.min) {
    govDrops.set(prNow, (govDrops.get(prNow) || 0) + 1);
    setPR(Math.max(PR_GOV.min, prNow - PR_GOV.step));
    govFast = 0; govLast = now + 1000;
  } else if (avg < PR_GOV.fastMs && prNow < BASE_PR) {
    const next = Math.min(BASE_PR, prNow + PR_GOV.step);
    if (++govFast >= PR_GOV.upAfter && (govDrops.get(next) || 0) < 2) {
      setPR(next); govFast = 0; govLast = now + 1000;
    }
  } else govFast = 0;
}
// Pe ecran mic scena e ÎNGHEȚATĂ după câteva cadre: nimic nu se mișcă acolo (scroll-ul e
// oprit, clipul e parcat la p=0), deci a randa 60 de cadre pe secundă dintr-o imagine
// statică ar încălzi telefonul degeaba. Singurul lucru care s-ar pierde e granulația
// animată din GradePass — invizibilă sub blur de 18 px. Contorul se reîncarcă la resize.
let smallFrames = 3;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = clock.getDelta();
  govern(now, dt);

  // preloader: buclă continuă cât timp intro-ul nu e gata. NU se oprește la un progres
  // fals — bucla merge până când GLB-ul mare e chiar încărcat.
  if (!revealDone && plReady) {
    // ⚠️ `dt` plafonat: primul cadru îl primește pe cel de la pornirea ceasului, adică
    // tot timpul de încărcare al preloader.glb, și animația pornea deja din mijloc.
    // Plafonat, un cadru lent încetinește animația în loc să o facă să sară.
    plPhase += Math.min(dt, 1 / 30) / 1.5;
    if (plPhase >= PL_FIRST) plFirstDone();
    const cyc = plPhase % 2;
    plSetProgress(cyc < 1 ? cyc : 2 - cyc);
    plNoiseMat.uniforms.uTime.value = now / 1000;
    plRenderer.render(plScene, plCam);
    plRenderer.autoClear = false;
    plRenderer.render(plNoiseScene, plNoiseCam);
    plRenderer.autoClear = true;
  }
  updateReveal(now);

  // Lenis are nevoie de un tick pe cadru. Îl luăm din bucla randerului, ca să nu avem
  // două rAF-uri concurente.
  // ⚠️ Pe ecran mic NU se cheamă deloc scroll-ul. `#track` e ascuns din CSS, deci
  // `getBoundingClientRect()` întoarce zerouri, iar `segProgress` calculează
  // `span = 0 - innerHeight < 0` și returnează `r.top <= 0 ? 1 : 0` — adică **1**.
  // Rezultatul: clipul rămânea parcat pe switch-ul EXPLODAT, nu pe tastatură, și pe
  // deasupra `if (p > 0.65) loadOutro()` încărca outro-ul pe care tocmai îl sărisem.
  // Se vedea direct în captura la 390 px. Clipul rămâne la p = 0, unde `applyIntro(0)`
  // din `loadIntro` l-a lăsat — adică exact biroul cu tastatura.
  if (SMALL) {
    if (revealDone) {
      if (smallFrames <= 0) return;
      smallFrames--;
    }
  } else {
    lenis.raf(now);
    updateScroll();
  }

  if (introLoaded) {
    const c = renderPass.camera;
    if (curAct === 'outro' && outroLoaded) {
      // ceasul tastării e PROPRIU, nu al clipului: apăsările continuă la nesfârșit,
      // inclusiv când scroll-ul e oprit
      typeClock += dt;
      activeKeys = updateTyping(typeClock, c) || 0;
    } else if (scrim.visible) {
      layoutScrim(c);
    }
    gradePass.uniforms.uTime.value = now / 1000;
    // ⚠️ Cât About e deschis, scena e sub un blur de 28 px și un voal de 72%: nu se vede
    // nimic din ea în afară de pete de culoare. A o randa în continuare la 60 fps costa
    // DE DOUĂ ORI: o dată scena cu tot lanțul de post, apoi browserul care recalcula
    // `backdrop-filter` peste un canvas care se schimba în fiecare cadru. Se mai randează
    // două cadre după deschidere (ca blurul să prindă starea curentă), apoi se oprește.
    if (!modalOpen || modalFrames-- > 0) {
      renderer.info.reset();
      composer.render();
    }
  }

  if (document.body.classList.contains('dbg')) {
    dbgEl.textContent =
      `act        ${curAct}  ${(actProgress * 100).toFixed(0)}%\n` +
      `intro      ${(introProgress * 100).toFixed(0)}%  t=${(introProgress * clipDur).toFixed(2)}s\n` +
      `descărcat  ${(introDownload * 100).toFixed(0)}%\n` +
      `preloader  ${plReady ? 'gata' : 'se încarcă'}${revealDone ? ' · reveal terminat' : ''}\n` +
      `outro      ${outroLoaded ? 'gata (' + nKeys + ' taste, ' + fieldMeshes.length + ' IM)'
                    : (outroLoading ? 'se încarcă' : '-')}\n` +
      `pas        ${curStep >= 0 ? (curStep + 1) + '/' + stepList.length + ' ' +
                    stepList[curStep].label + '  contur ' +
                    outlinePass.edgeStrength.toFixed(2) : '-'}\n` +
      `câmp       vizibile ${visKeys}  apăsate ${activeKeys}\n` +
      `tris       ${renderer.info.render.triangles.toLocaleString('ro-RO')}  draw ${renderer.info.render.calls}`;
  }
});
