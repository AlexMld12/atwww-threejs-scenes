// Ecranele paginii Skin Analysis: start → 7 pași → raport. Logica (citirea, profilul,
// planul, ID-ul kitului) e în logic.js; aici doar DOM-ul și mișcarea.
//
// Mișcarea (nu e în Figma — comportamentul e cel al site-ului):
//  · elementele intră cu reveal-ul site-ului (blur + 30 px + 0.96 → clar, 0.8 s,
//    [.76,0,.24,1]), în cascadă; starea finală e `transform: none` → text clar;
//  · între doi pași cardul RĂMÂNE: conținutul vechi se stinge, cardul își animă înălțimea
//    la cea nouă (numărul de opțiuni diferă), conținutul nou intră;
//  · start ↔ card ↔ raport: ecranul vechi se stinge pe loc, cel nou intră;
//  · LIVE READING numără până la valoarea nouă; liniuțele etapelor se aprind una câte una.
import {
  STEPS, STAGES, emptyAnswers, isAnswered, skinReading, fmt, plan, bandLine, calibrated,
  EMAIL_RE, ERR_EMAIL, ERR_CONSENT,
} from './logic.js';
import { initStageTicks } from './ticks.js';
import { initRolls } from '../ui/hover.js';

const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
const STAGGER = 0.06;            // s între elementele unui ecran
const OUT_MS = 260;              // stingerea conținutului vechi
const LETTERS = 'ABCDEF';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const ARROW = '<svg viewBox="0 0 7.58 7" width="8" height="7" aria-hidden="true"><path fill="currentColor" d="M4.08 0L3.58 0.49L6.24 3.15L0 3.15L0 3.85L6.24 3.85L3.59 6.51L4.08 7L7.58 3.5Z"/></svg>';
const ERR_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="4" x2="8" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="12" r="1" fill="currentColor"/></svg>';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const btn = (cls, act, label, { arrow = false, disabled = false } = {}) =>
  `<button class="sa-btn ${cls}" type="button" data-act="${act}" data-roll-host${disabled ? ' disabled' : ''}><span class="roll" data-roll>${label}</span>${arrow ? ARROW : ''}</button>`;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ---- scala din raport: 55 de liniuțe de la 27° la ~36° (END V1) ----
// x(T) în px de machetă față de începutul scalei: 28° la 50 (centrul liniuței 6),
// 34.4° la 362.6 (marcajul) → 48.84 px / grad; 27° la 1.16.
const SCALE_N = 55;
const sx = (t) => 1.16 + (t - 27) * 48.84;
const tickT = (i) => 27 + (i * 8 + 2 - 1.16) / 48.84;
const u = (n) => `calc(${n.toFixed(2)} * var(--sa-u))`;

export function initAnalysis({ root, toTop }) {
  const body = root.querySelector('[data-sa-body]');
  const live = root.querySelector('[data-sa-live]');
  const stageEls = [...root.querySelectorAll('.sa-stage')];
  const ticks = initStageTicks(root.querySelector('[data-sa-stages]'));

  let a = emptyAnswers();
  let screen = 'start';          // 'start' | 0…6 | 'report'
  const done = new Set();        // pașii trecuți cu Continue
  let current = null;            // elementul ecranului curent
  const isQ = (s) => typeof s === 'number';

  // =========================================================================
  // LIVE READING
  // =========================================================================
  let shown = null, liveRaf = 0;
  function updateLive(animate = true) {
    const t = skinReading(a);
    cancelAnimationFrame(liveRaf);
    if (t == null) { shown = null; live.textContent = '––.–'; return; }
    if (shown == null || !animate || reduce.matches) { shown = t; live.textContent = fmt(t); return; }
    const from = shown, t0 = performance.now(), dur = 450;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      shown = from + (t - from) * easeOut(k);
      live.textContent = fmt(Math.round(shown * 10) / 10);
      if (k < 1) liveRaf = requestAnimationFrame(step);
      else shown = t;
    };
    liveRaf = requestAnimationFrame(step);
  }

  // =========================================================================
  // PROGRESUL — o etapă se umple cu jumătate de pas când pasul curent are răspuns și cu
  // un pas întreg după Continue (documentul de logică)
  // =========================================================================
  function unit(i) {
    if (screen === 'report') return 1;
    if (i === 7) return 0;
    if (done.has(i)) return 1;
    return i === screen && isAnswered(a, STEPS[i].key) ? 0.5 : 0;
  }
  function updateProgress(instant = false) {
    ticks.set(STAGES.map((st) => st.units.reduce((s, i) => s + unit(i), 0) / st.units.length), instant);
    const active = screen === 'start' ? -1 : screen === 'report' ? 3 : STAGES.findIndex((st) => st.units.includes(screen));
    stageEls.forEach((el, i) => el.classList.toggle('is-active', i === active));
  }

  // =========================================================================
  // ECRANELE
  // =========================================================================
  const startHTML = () => `
    <section class="sa-screen sa-start">
      <h1 class="sa-start__title" aria-label="Take your skin reading today!">
        <span class="sa-start__cond" data-sa-in aria-hidden="true">Take your</span>
        <span class="sa-start__exp" data-sa-in aria-hidden="true">Skin reading</span>
        <span class="sa-start__cond" data-sa-in aria-hidden="true">Today!</span>
      </h1>
      <p class="sa-start__text mono" data-sa-in>Seven quick questions about your skin and the heat it lives with: sun, training, saunas, screens and city air.</p>
      <p class="sa-start__text mono" data-sa-in>At the end you get a reading and a routine for the three steps of the KELV° recovery kit.</p>
      <p class="sa-start__note mono" data-sa-in>Takes about two minutes. No photo needed.</p>
      <div data-sa-in>${btn('sa-btn--primary sa-start__btn', 'start', 'Start the reading', { arrow: true })}</div>
    </section>`;

  function stepBodyHTML(i) {
    const st = STEPS[i];
    const head = `
      <h2 class="sa-q__title" data-sa-in>${esc(st.title)}</h2>
      <p class="sa-q__sub" data-sa-in>${esc(st.sub)}</p>`;
    if (st.kind === 'form') {
      return `${head}
      <div class="sa-field" data-sa-in>
        <label class="sa-field__label" for="sa-name">Your name</label>
        <input class="sa-field__input" id="sa-name" name="name" autocomplete="given-name" value="${esc(a.name)}">
      </div>
      <div class="sa-field" data-sa-in data-field="email">
        <label class="sa-field__label" for="sa-email">Email</label>
        <input class="sa-field__input" id="sa-email" name="email" type="email" inputmode="email" autocomplete="email" value="${esc(a.email)}">
        <p class="sa-err" role="alert" hidden>${ERR_ICON}<span></span></p>
      </div>
      <label class="sa-consent" data-sa-in>
        <input type="checkbox" name="consent"${a.consent ? ' checked' : ''}>
        <span>By submitting, you agree to our <a href="#privacy">Privacy policy</a></span>
      </label>
      <p class="sa-err" role="alert" data-consent-err hidden>${ERR_ICON}<span></span></p>
      <p class="sa-form__info" data-sa-in>We only use your email for your reading and the reminders you choose.<br>You can unsubscribe at any time.</p>
      <div class="sa-nav" data-sa-in>
        ${btn('sa-btn--ghost', 'back', 'Back')}
        ${btn('sa-btn--blue', 'submit', 'See my reading')}
      </div>`;
    }
    const multi = st.kind === 'multi';
    const sel = (o) => (multi ? a[st.key].includes(o.key) : a[st.key] === o.key);
    const opts = st.options.map((o, k) => `
        <li data-sa-in><button class="sa-opt" type="button" data-opt="${k}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${sel(o)}">
          <span class="sa-opt__key" aria-hidden="true">${LETTERS[k]}</span><span>${esc(o.label)}</span>
        </button></li>`).join('');
    return `${head}
      <div class="sa-why" data-sa-in>
        <button class="sa-why__btn" type="button" aria-expanded="false" aria-controls="sa-why-${i}">
          <img class="sa-why__icon" src="/images/sa-why.svg" alt="" width="16" height="16">Why we ask
        </button>
        <div class="sa-why__panel" id="sa-why-${i}"><p>${esc(st.why)}</p></div>
      </div>
      <ul class="sa-opts" role="${multi ? 'group' : 'radiogroup'}" aria-label="${esc(st.title)}">${opts}</ul>
      <div class="sa-nav" data-sa-in>
        ${btn('sa-btn--ghost', 'back', 'Back')}
        ${btn('sa-btn--primary', 'next', 'Continue', { arrow: true, disabled: !isAnswered(a, st.key) })}
      </div>
      <p class="sa-hint" data-sa-in>PRESS a letter to choose, ENTER to continue.</p>`;
  }

  const stepHTML = (i) => `
    <section class="sa-screen sa-qwrap${STEPS[i].kind === 'form' ? ' sa-form' : ''}">
      <div class="sa-card">
        <div class="sa-card__head mono"><span data-sa-in data-step-label>Step ${i + 1} of ${STEPS.length}</span></div>
        <div class="sa-card__body" data-card-body>${stepBodyHTML(i)}</div>
      </div>
    </section>`;

  function reportHTML() {
    const p = plan(a);
    const t = p.reading;
    const name = a.name.trim();
    const ticksHTML = Array.from({ length: SCALE_N }, () => '<i></i>').join('');
    // reperele: 28°, 32° și citirea; 32° dispare când s-ar suprapune peste citire
    const labels = [[28, '28°'], ...(Math.abs(t - 32) >= 0.9 ? [[32, '32°']] : []), [t, `${fmt(t)}°`]]
      .map(([v, s]) => `<span style="--x:${u(sx(v))}">${s}</span>`).join('');
    const row = (k, v, ink = false) => `<div class="sa-cal__row"><dt${ink ? ' class="is-ink"' : ''}>${k}</dt><dd>${esc(v)}</dd></div>`;
    return `
    <section class="sa-screen sa-report">
      <div class="sa-report__card sa-report__card--read">
        <p class="sa-rep__label mono" data-sa-in>Your skin reading</p>
        <p class="sa-rep__value" data-sa-in aria-label="${fmt(t)}°C"><span class="sa-rep__num" data-rep-num>${fmt(t)}</span><i class="sa-rep__deg" aria-hidden="true"></i><span aria-hidden="true">C</span></p>
        <p class="sa-rep__line" data-sa-in>${esc(bandLine(t, name))}</p>
        <p class="sa-rep__profile" data-sa-in>Profile: ${esc(p.profile)}. ${esc(p.type.desc)}</p>
        <div data-sa-in>
          <div class="sa-scale" data-scale style="--x:${u(sx(t))}" aria-hidden="true">
            <div class="sa-scale__ticks">${ticksHTML}</div>
            <span class="sa-scale__mark"></span>
          </div>
          <div class="sa-scale__labels" aria-hidden="true">${labels}</div>
        </div>
        <div class="sa-cal mono" data-sa-in>
          <p class="sa-cal__title">Calibration</p>
          <dl class="sa-cal__rows">
            ${name ? row('For', name.toUpperCase(), true) : ''}
            ${row('Skin reading', `${fmt(t)}°C`)}
            ${row('Target', '28.0°C')}
            ${row('Profile', p.profile)}
            ${row('Calibrated', calibrated())}
            ${row('Kit ID', p.kitId)}
          </dl>
        </div>
      </div>
      <div class="sa-report__card sa-report__card--plan">
        <h2 class="sa-plan__title" data-sa-in>Your recovery routine</h2>
        <p class="sa-plan__sub" data-sa-in>${esc(p.focus)}</p>
        <ul class="sa-kits">
          ${p.products.map((k) => `
          <li class="sa-kit" data-sa-in>
            <img class="sa-kit__icon" src="/images/sa-kit.svg" alt="" width="62" height="62">
            <p class="sa-kit__name">${k.code} ${esc(k.name)}</p>
            <p class="sa-kit__when">${esc(k.when)}</p>
            <p class="sa-kit__text">${esc(k.text)}</p>
          </li>`).join('')}
        </ul>
        <ul class="sa-notes" data-sa-in>${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        ${p.subscription ? `<label class="sa-consent sa-sub-opt" data-sa-in><input type="checkbox" data-sub><span>Refill every 28 days and save</span></label>` : ''}
        <div class="sa-buy" data-sa-in>
          ${btn('sa-btn--primary', 'cart', 'Add the recovery kit to cart')}
          ${btn('sa-btn--ghost', 'retake', 'Retake the reading')}
        </div>
        ${p.k2Offer ? `<div data-sa-in>${btn('sa-btn--ghost sa-offer', 'k2', 'Already have a routine? Start with K2 Active Serum')}</div>` : ''}
        <p class="sa-disclaimer" data-sa-in>This reading is a guide based on your answers, not a medical diagnosis. If your skin reacts strongly, talk to a dermatologist.</p>
      </div>
    </section>`;
  }

  function build(s) {
    const tpl = document.createElement('template');
    tpl.innerHTML = (s === 'start' ? startHTML() : s === 'report' ? reportHTML() : stepHTML(s)).trim();
    return tpl.content.firstElementChild;
  }

  // ---- intrarea: cascada reveal-ului; două cadre ca starea ascunsă să fie desenată ----
  function reveal(el, delay = 0) {
    const items = [...el.querySelectorAll('[data-sa-in]')];
    items.forEach((it) => it.classList.remove('is-in'));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      items.forEach((it, k) => {
        it.style.setProperty('--d', `${(delay + Math.min(k, 12) * STAGGER).toFixed(2)}s`);
        it.classList.add('is-in');
      });
    }));
    if (el.querySelector('[data-rep-num]')) countReport(el, delay + 0.25);
  }

  function swapScreen(next, instant) {
    const old = current;
    current = next;
    if (old) {
      old.classList.add('is-leaving');
      setTimeout(() => old.remove(), instant ? 0 : OUT_MS + 80);
    }
    body.appendChild(next);
    initRolls(next);
    reveal(next, old && !instant ? OUT_MS / 1000 : 0);
  }

  // între doi pași: același card, conținut nou, înălțimea animată
  function swapCard(i) {
    const card = current.querySelector('.sa-card');
    const cb = card.querySelector('[data-card-body]');
    const label = card.querySelector('[data-step-label]');
    current.classList.toggle('sa-form', STEPS[i].kind === 'form');
    const h0 = card.getBoundingClientRect().height;
    card.style.height = `${h0}px`;
    cb.classList.add('is-out');
    label.classList.add('is-out-label');
    const token = (card._swap = (card._swap || 0) + 1);
    setTimeout(() => {
      if (card._swap !== token) return;
      cb.classList.remove('is-out');
      label.classList.remove('is-out-label');
      cb.innerHTML = stepBodyHTML(i);
      label.textContent = `Step ${i + 1} of ${STEPS.length}`;
      initRolls(cb);
      card.style.height = 'auto';
      const h1 = card.getBoundingClientRect().height;
      card.style.height = `${h0}px`;
      void card.offsetHeight;
      card.style.transition = `height 0.6s ${EASE}`;
      card.style.height = `${h1}px`;
      const end = () => { if (card._swap === token) { card.style.height = ''; card.style.transition = ''; } };
      card.addEventListener('transitionend', end, { once: true });
      setTimeout(end, 700);
      reveal(card, 0.05);
    }, OUT_MS);
  }

  function go(next, { instant = false } = {}) {
    const prev = screen;
    screen = next;
    if (current && isQ(prev) && isQ(next) && !instant) swapCard(next);
    else swapScreen(build(next), instant);
    updateProgress(instant);
    if (!instant && scrollY > 0) toTop();
  }

  // =========================================================================
  // RAPORTUL: citirea numără 28.0 → valoare în 900 ms; scala se aprinde odată cu ea
  // =========================================================================
  function countReport(el, delay) {
    const num = el.querySelector('[data-rep-num]');
    const scale = el.querySelector('[data-scale]');
    const tks = [...scale.querySelectorAll('.sa-scale__ticks i')];
    const t = skinReading(a);
    const paint = (v) => {
      num.textContent = fmt(Math.round(v * 10) / 10);
      scale.style.setProperty('--x', u(sx(v)));
      tks.forEach((tk, i) => { const ti = tickT(i); tk.classList.toggle('is-on', ti >= 27.95 && ti < v - 0.05); });
    };
    if (reduce.matches) { paint(t); return; }
    paint(28);
    setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        paint(28 + (t - 28) * easeOut(k));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay * 1000);
  }

  // =========================================================================
  // INTERACȚIUNI
  // =========================================================================
  function choose(k) {
    const st = STEPS[screen];
    const o = st.options[k];
    if (!o) return;
    if (st.kind === 'single') a[st.key] = o.key;
    else {
      const set = new Set(a[st.key]);
      if (set.has(o.key)) set.delete(o.key);
      else {
        if (o.exclusive) set.clear();
        else st.options.filter((x) => x.exclusive).forEach((x) => set.delete(x.key));
        set.add(o.key);
      }
      // ordinea opțiunilor, nu a click-urilor: ID-ul kitului depinde de ea
      a[st.key] = st.options.filter((x) => set.has(x.key)).map((x) => x.key);
    }
    current.querySelectorAll('.sa-opt').forEach((b, j) => {
      const ok = st.kind === 'single' ? a[st.key] === st.options[j].key : a[st.key].includes(st.options[j].key);
      b.setAttribute('aria-checked', ok);
    });
    const next = current.querySelector('[data-act="next"]');
    if (next) next.disabled = !isAnswered(a, st.key);
    updateLive();
    updateProgress();
  }

  function fieldError(field, msg) {
    const f = current.querySelector(field);
    const err = f.matches('.sa-err') ? f : f.querySelector('.sa-err');
    (f.closest('.sa-field') || f).classList.toggle('is-error', !!msg && f.matches('.sa-field'));
    err.hidden = !msg;
    if (msg) err.querySelector('span').textContent = msg;
  }
  function validate() {
    const email = a.email.trim();
    const bad = email && !EMAIL_RE.test(email);
    fieldError('[data-field="email"]', bad ? ERR_EMAIL : '');
    const noEmail = a.consent && !email;
    fieldError('[data-consent-err]', noEmail ? ERR_CONSENT : '');
    return !bad && !noEmail;
  }

  function cart(extra = {}) {
    // ⚠️ Fără Shopify încă (se decide la final). Proprietățile liniei din coș, exact cum
    // le cere documentul — gata de trimis la /cart/add.js când există magazinul.
    const p = plan(a);
    const { name, email, consent, ...answers } = a;
    const props = {
      'Skin reading': `${fmt(p.reading)}°C`,
      'Kit ID': p.kitId,
      Calibrated: calibrated(),
      Profile: p.profile,
      _k2_schedule: p.k2,
      _answers: JSON.stringify(answers),
    };
    const detail = { product: 'recovery-kit', subscription: !!current.querySelector('[data-sub]')?.checked, properties: props, ...extra };
    document.dispatchEvent(new CustomEvent('kelv:add-to-cart', { detail }));
    console.info('[KELV] add to cart', detail);
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], .sa-opt, .sa-why__btn');
    if (!t || !current || !current.contains(t) || current.classList.contains('is-leaving')) return;
    if (t.matches('.sa-opt')) return choose(+t.dataset.opt);
    if (t.matches('.sa-why__btn')) {
      const open = t.getAttribute('aria-expanded') !== 'true';
      t.setAttribute('aria-expanded', open);
      t.parentElement.classList.toggle('is-open', open);
      return;
    }
    switch (t.dataset.act) {
      case 'start': return go(0);
      case 'back': return go(screen === 0 ? 'start' : screen - 1);
      case 'next':
        if (!isAnswered(a, STEPS[screen].key)) return;
        done.add(screen);
        return go(screen + 1);
      case 'submit':
        if (!validate()) return;
        done.add(screen);
        return go('report');
      case 'retake':
        a = emptyAnswers();
        done.clear();
        updateLive(false);
        return go('start');
      case 'cart': return cart();
      case 'k2': return cart({ product: 'k2-active-serum' });
    }
  });

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.name === 'name') a.name = el.value;
    else if (el.name === 'email') {
      a.email = el.value;
      // eroarea dispare imediat ce adresa devine validă (apare abia la ieșirea din câmp)
      if (current.querySelector('[data-field="email"].is-error') && EMAIL_RE.test(a.email.trim())) fieldError('[data-field="email"]', '');
    } else if (el.name === 'consent') a.consent = el.checked;
    else return;
    if (!a.consent || a.email.trim()) fieldError('[data-consent-err]', '');
    updateProgress();
  });
  root.addEventListener('focusout', (e) => {
    if (e.target.name === 'email' && a.email.trim() && !EMAIL_RE.test(a.email.trim())) fieldError('[data-field="email"]', ERR_EMAIL);
  });

  // tastatura: o literă alege, ENTER continuă (indiciul de sub butoane)
  document.addEventListener('keydown', (e) => {
    const html = document.documentElement;
    if (!html.classList.contains('sa-on') || html.classList.contains('sa-anim')) return;
    if (e.metaKey || e.ctrlKey || e.altKey || !current || current.classList.contains('is-leaving')) return;
    const typing = e.target.matches?.('input, textarea');
    if (e.key === 'Enter') {
      if (screen === 6 && typing) { e.preventDefault(); return current.querySelector('[data-act="submit"]').click(); }
      if (e.target.matches?.('button, a')) return;            // ENTER pe un buton = click-ul lui
      if (screen === 'start') return current.querySelector('[data-act="start"]').click();
      if (isQ(screen) && screen < 6) current.querySelector('[data-act="next"]').click();
      return;
    }
    if (typing || !isQ(screen) || screen >= 6) return;
    const k = LETTERS.indexOf(e.key.toUpperCase());
    if (k >= 0 && e.key.length === 1 && k < STEPS[screen].options.length) {
      e.preventDefault();
      choose(k);
    }
  });

  // primul ecran, fără reveal (îl pornește `enter`)
  current = build('start');
  body.appendChild(current);
  initRolls(current);

  return {
    // la fiecare intrare în analiză: liniuțele se măsoară (ascunse, aveau lățime zero)
    // și ecranul curent își rejoacă intrarea, după `delay` (tranziția de pagină)
    enter(delay = 0) {
      ticks.refresh();
      updateProgress(true);
      updateLive(false);
      reveal(current, delay);
    },
  };
}
