// Punctul de intrare al site-ului. Tine DOAR ordinea de pornire; logica sta in
// `scene/` (WebGL) si `ui/` (DOM). Cele doua comunica printr-un singur contract:
// evenimentul `keycap:step` si `document.body.dataset.step` — vezi `docs/SITE_FLOW.md` §5.
import './styles/index.css';

// ---------------------------------------------------------------- poarta de desktop
// ⚠️ Sub prag NU SE INCARCA NIMIC: nici three, nici GLB-urile, nici preloaderul, nici
// DOM-ul paginii. Decizia userului (2026-09-22): pe telefon se vede doar mesajul, peste
// o imagine statica a scenei, blurata — vezi `#gate` in `scene.css`.
// Inainte, modulul de scena se incarca si pe telefon: pornea preloaderul, descarca cele
// 8,8 MB ale intro-ului si desena cateva cadre doar ca sa fie blurate, iar mesajul
// statea peste nav si titlu, care se citeau prin el. Acum importurile sunt DINAMICE,
// deci sub prag nu se cere nici macar fisierul.
// ⚠️ Pragul e scris in TREI locuri: aici, in `GATE_W` din scena si in media query-ul din
// `scene.css`. Daca il schimbi, schimba-l in toate.
const GATE_W = 992;

// ---------------------------------------------------------------- fara WebGL 2
// ⚠️ three r176 cere WebGL 2 (WebGL 1 a fost scos in r163). Fara el, randerul arunca la
// nivel de modul, iar pagina ramanea pe ecranul de preloader, cu scroll-ul blocat pentru
// totdeauna si fara niciun mesaj — asa era pana acum (auditul din 2026-09-17, punctul 3).
// Cazurile reale: accelerare hardware oprita, GPU pe lista neagra a browserului, masini
// virtuale / desktop la distanta, browsere vechi.
// Se arata ACEEASI poarta ca pe mobil (imaginea statica a scenei, blurata), cu alt text.
function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (gl) { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
    return !!gl;
  } catch { return false; }
}
function showNoGL(msg) {
  const p = document.querySelector('#gate p');
  if (p) p.innerHTML = msg;
  document.body.classList.remove('locked');
  const pl = document.getElementById('pl');
  if (pl) pl.remove();
  document.documentElement.classList.add('is-ready', 'no-webgl');
}
const NO_GL = 'This experience needs<br>WebGL 2 &mdash; try turning on<br>hardware acceleration';
const GL_LOST = 'The graphics card<br>stopped responding<br>&mdash; please reload';

if (innerWidth >= GATE_W && !hasWebGL2()) {
  showNoGL(NO_GL);
} else if (innerWidth >= GATE_W) {
  // ⚠️ `ui` inaintea scenei, ca ascultatorii lui sa fie legati inainte de primul
  // eveniment. In practica scena emite abia dupa ce se incarca GLB-ul (secunde), dar
  // ordinea explicita costa nimic si scoate o presupunere din joc.
  // ⚠️ `catch`: daca randerul tot nu poate fi creat (contextul exista, dar crapa la
  // initializare) sau un modul nu se incarca, userul vede mesajul, nu un ecran gol.
  Promise.all([import('./ui/index.js'), import('./scene/index.js')])
    .catch((e) => { console.error(e); showNoGL(NO_GL); });
  // Contextul pierdut in timpul sesiunii (driver resetat, GPU scos din priza pe laptop
  // cu doua placi). three nu reface texturile din GLB, deci singura iesire e reincarcarea.
  // ⚠️ DOAR pentru canvas-ul scenei: preloader-ul isi elibereaza randerul la reveal.
  addEventListener('webglcontextlost', (e) => {
    if (e.target && e.target.closest && e.target.closest('#main')) showNoGL(GL_LOST);
  }, true);
} else {
  // Poarta se arata imediat: nu mai exista preloader dupa care sa astepte.
  document.documentElement.classList.add('is-ready');
  // ⚠️ Trecerea PESTE prag cere o reincarcare, exact ca in sens invers (handler-ul de
  // `resize` din scena): aici nu s-a incarcat nimic din experienta, deci nu e nimic de
  // pornit din mers. Cazul e rar — cineva care roteste tableta sau trage fereastra.
  addEventListener('resize', () => {
    if (innerWidth >= GATE_W) location.reload();
  });
}
