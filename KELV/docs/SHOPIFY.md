# KELV — tema Shopify

Site-ul din `web/` (Next.js, Vercel) devine o **temă Shopify custom** pentru magazinul KELV (nu pentru Theme
Store), în `shopify/`. Comportamentul și aspectul rămân identice cu `web/`, care rămâne referința până la
final. Decizia: 2026-10-29.

## Ce e unde

```
shopify/
  theme/            tema, exact cum ajunge în Shopify (doar folderele standard)
    layout/         theme.liquid: home-ul + straturile (shop, quiz) în același document
    sections/       câte o secțiune per bucată din pagină; home.json = grupul de secțiuni al home-ului
    snippets/       fonts, asset-urls (URL-urile fișierelor încărcate din cod)
    templates/      index, product, collection, page.skin-analysis, 404 … (JSON)
    config/         setările globale ale temei (pragul de livrare gratuită …)
    locales/        textele interfeței și ale editorului
    assets/         imagini, fonturi, GLB-uri, LUT; + kelv.js / kelv.css generate de build (ignorate de git)
  src/              codul (TypeScript, fără React): main.ts, lib/, scene/ (copiat din web/), styles/
  preview/          serverul local care randează tema (Liquid → HTML) cu date de test
```

## Comenzi (în `shopify/`)

| Comandă | Ce face |
|---|---|
| `npm run dev` | previzualizarea pe `http://127.0.0.1:5176/`, cu reîncărcare la orice schimbare (Liquid, TS, CSS) |
| `npm run build` | `src/` → `theme/assets/kelv.js` (doar importă `kelv-app-<hash>.js`) + `kelv-*.js` (bucăți încărcate la nevoie) + `kelv.css` |
| `npm run preview:built` | build + previzualizare pe `:5177` cu fișierele generate (exact ce urcă pe Shopify) |
| `npm run theme-check` | validatorul oficial Shopify pe `theme/` (trebuie să iasă fără erori) |
| `npm run typecheck` / `lint` / `format:check` / `test` | ca în `web/` |

Produsele pe magazin: `npm run seed` (vezi etapa 9). Pe magazin (când există): `npm run build`, apoi `shopify theme dev --path theme --store <magazin>.myshopify.com`
(previzualizare pe datele reale) și `shopify theme push --path theme` (urcare).

## Arhitectura

- **Home-ul e un grup de secțiuni** (`sections/home.json`, tip `custom.home`), randat în `layout/theme.liquid` pe
  orice pagină, ca `<Site />` din `web/`: shop-ul și quiz-ul sunt straturi care alunecă peste el, iar home-ul își
  păstrează starea. Ce randează Shopify pentru URL-ul curent (`content_for_layout`) intră în stratul lui:
  `request.page_type` / `template.suffix` → `html[data-page="shop" | "sa"]`.
- **Navigarea între straturi** e în cod: linkul aduce pagina cu `fetch`, ia conținutul stratului din răspuns și îl
  pune în pagină (`history.pushState`), fără reîncărcare. Intrarea directă pe un URL e randată de Shopify.
- **Fără React.** Markup-ul vine din Liquid (editabil din editorul temei); comportamentul e în clase TS
  (custom elements, ca în temele Shopify), pe aceeași buclă de cadre și Lenis ca în `web/` (`src/lib/scroll.ts`).
- **Fișierele încărcate din cod** (GLB, LUT) se cer prin `assetUrl(nume)` (`src/lib/assets.ts`): URL-urile le
  scrie tema (`snippets/asset-urls.liquid`). JSON-urile scenelor sunt incluse în cod (`src/scene/data/`).
- **Fonturile** sunt în `assets/`, declarate în `snippets/fonts.liquid` (nimic de pe CDN-uri străine).

## Ce poate edita clientul (decis 2026-10-29)

- **Din admin:** produsele (nume, preț, descriere, poze, GLB, stoc), politicile legale, meniurile.
- **Din editorul temei:** textele și imaginile secțiunilor (titluri, paragrafe, FAQ, butoane), pragul de livrare.
- **Fix, în cod:** scenele 3D, animațiile, layout-ul, titlurile mari spațiate literă cu literă.

## Paginile

| `web/` | Shopify | Template |
|---|---|---|
| `/` | `/` | `index.json` (gol: home-ul e grupul `home`) |
| `/products` | `/collections/all` | `collection.json` |
| `/products/[slug]` | `/products/<handle>` | `product.json` |
| `/skin-analysis` | `/pages/skin-analysis` | `page.skin-analysis.json` (pagina se creează în admin) |
| `/privacy-policy`, `/terms-of-use` | `/policies/privacy-policy`, `/policies/terms-of-service` | randate de Shopify; textele în Settings → Policies |
| — | coș: sertarul + `/cart` | `cart.json` |

## Etapele portării (secțiune cu secțiune, ca la `web/`)

Fiecare etapă: portare → verificare vizuală față de `web/` (capturi la aceleași poziții de scroll, 1440 + mobil)
→ aprobarea userului. Fără commit până la final (cererea userului, 2026-10-29).

1. [x] Scheletul: `shopify/`, build-ul, previzualizarea Liquid, `theme check` curat.
2. [x] Nucleul + Hero (aprobat 2026-10-29): Lenis + bucla de cadre, preloader-ul, reveal-urile, header-ul
   și CTA-urile, Hero (+ scena 3D, snap-ul).
3. [~] Home (2026-10-29, în review): Pillars, Galerie (+ scena REF_129), Join (newsletter Shopify), zona 8 +
   produsul care călătorește, Footer, bucla. Comparat cu `web/` la 1440 × 900 (17 poziții), 1280 × 800,
   390 × 844, 375 × 667, 768 × 1024, 844 × 390: aceleași poziții ale secțiunilor, pixeli identici (rest:
   ≤ 0.04 %, cadrul 3D / o liniuță a barei); bucla footer → hero dă aceleași poziții; build-ul de producție idem.
   Aprobat 2026-10-29, cu o cerere nouă: newsletter-ul confirmă abonarea și refuză o adresă deja abonată.
4. [x] Straturile (aprobat 2026-11-01): navigarea fără reîncărcare (`src/lib/page-layers.ts`,
   `src/lib/router.ts`), cortina, Back, schimbarea paginii în shop cu fade; header-ul și footer-ul shop-ului
   (grupurile `shop-header-group`, `shop-footer-group`; numele unui grup nu poate fi al unei secțiuni); politicile Shopify ca pagini legale (`kelv-policy`). Verificat:
   home → Privacy → Back revine la aceeași poziție, Privacy → Terms (fade), logo → home, Back din nou.
5. [x] Shop (aprobat 2026-11-01): colecția (`main-collection`: tab-uri, goals, categorii + coming soon), pagina de
   produs (`main-product` + `product-discover` + `product-more-info`: viewer 3D, stepper, acordeoane, coloana
   sticky, FAQ cu bara). Comparat cu `web/` la 1440 × 900, 1280 × 800, 390 × 844, 375 × 667, 768 × 1024,
   844 × 390 și după clicuri (tab Serum, goal, How to use, stepper, zoom): aceleași poziții, ≤ 0.06 % pixeli, în
   afară de pozele din carduri (vezi Capcane). Navigarea home → shop → produs → Back → Back: fără erori.
   Add to cart / Buy it now sunt deocamdată formularul nativ (`/cart/add`, `return_to=/checkout`); etapa 6 le preia.
6. [x] Coșul (aprobat 2026-11-01): secțiunea `cart-drawer` (în layout, peste orice pagină), pe API-ul Ajax al
   Shopify; Add to cart (orice formular de produs) deschide sertarul, Buy it now și Proceed to checkout merg la
   checkout-ul Shopify. Comparat cu `web/` după add / + / remove și gol, la 1440 și 390: identic (0.000 %). Testat și
   pe build: Escape și scroll-ul după, contorul din header pe o pagină luată din cache, miniatura → produsul,
   `/cart` direct (sertarul deschis), Buy it now → `/checkout`.
7. [x] Quiz-ul (aprobat 2026-11-01): secțiunea `main-skin-analysis` + `src/analysis/` (fără React). Comparat cu
   `web/` la start, o întrebare multi, formular și raport, la 1440 × 900 și 390 × 844 (sus și la 700): 0.000 %,
   raportul ≤ 0.05 % (câteva glife). Testat și pe build: home → quiz, Back în card, logo → home → Forward (răspunsurile
   rămân), kit-ul în coș (sertarul se deschide), Retake.
8. [x] Editorul temei (aprobat 2026-11-01): toate textele vizibile sunt setări de secțiune (implicit = Figma,
   dovedit de paginile identice cu `web/`) sau în `locales/` (etichetele repetate); fixe în cod rămân scenele 3D,
   animațiile, titlurile mari și logica quiz-ului. În editor (`request.design_mode`): fără preloader, fără home sub
   paginile de shop (bara laterală arată doar secțiunile paginii), reveal-urile pornesc imediat și se rejoacă în
   secțiunea re-randată (`shopify:section:load`). Testat în previzualizare cu `?design_mode=1`: produs, colecție,
   politică, quiz, home, plus re-randarea secțiunii de produs (viewer-ul 3D repornește). De verificat în editorul
   real la etapa 9: selectarea unei secțiuni din bara laterală (scroll-ul) peste Lenis și snap-ul hero-ului.
9. [x] Pe dev store `kelv-gjmitdio.myshopify.com` (2026-11-02/03). Tema „KELV” (id 188044181722) e **publicată**
   din 2026-11-03 (Horizon rămâne nepublicată); magazinul de dezvoltare rămâne cu parolă (nu se poate scoate fără
   plan plătit). Showcase: fără plăți și fără abonamente (decizia userului). `theme dev` pe 9292.
   `npm run seed -- --policies` pune doar politicile (fără să reîncarce pozele produselor).
   - `SHOPIFY_STORE=kelv-gjmitdio.myshopify.com npm run seed`: definițiile `kelv.*`, cele trei produse (fără stoc
     urmărit), colecția `all` (manuală, în ordinea pașilor; înlocuiește colecția automată, care era alfabetică),
     pagina `skin-analysis`, cele patru politici din `docs/policies/`. Fără token merge prin `shopify store execute`,
     după un `shopify store auth` (scopurile sunt în capul scriptului). API 2026-10.
   - Privacy policy NU se poate pune până nu se oprește „Gestionare automată” la ea în Settings → Policies; apoi
     se rulează din nou seed-ul.
   - Verificat (HTML normalizat + capturi pixel cu pixel față de 5176, la 1440, 1280, 768, 390, 375, 844×390, în 5
     puncte de scroll): identic, în afară de monedă (magazinul e în USD) și de pozele cardurilor (redimensionate de
     CDN-ul Shopify). Coșul (adăugare, +/−) și quiz-ul cap-coadă (kit în coș cu proprietățile pe linie) merg pe
     API-ul real.
   - Formularele de client (JOIN, RECEIVE UPDATES, NOTIFY ME, quiz) merg în fundal, fără refresh, prin
     `src/lib/customer-form.ts`: `form_key` + datele în `sessionStorage` ca scriptul Shopify, apoi `fetch`; la
     hCaptcha, `form.submit()` și mesajul la întoarcere (`customer_posted=true`). Testate de user pe telefon și
     laptop (2026-11-03). Tot mecanismul și capcanele: `../docs/shopify-custom-theme-forms.md` (rădăcina repo-ului).
     În headless și prin proxy-ul `theme dev`, Cloudflare dă 403 la `/contact`: se testează de mână.

## Cum e construit codul

- Fiecare bucată cu comportament e un custom element (`KelvElement`, `src/lib/element.ts`): pornește în `mount()`,
  iar tot ce pornește se oprește prin `cleanup()` când editorul temei înlocuiește secțiunea.
- Elementele se definesc în `src/main.ts` DUPĂ `startScroll()` (cele deja în pagină se conectează chiar atunci).
- Reveal-urile: atribute în Liquid (`data-reveal`, `="lines"`, `="blur"`, `data-reveal-delay`), pornite de
  `observeReveals()` (`src/ui/reveal.ts`); copiile statice (hero-ul de la final) nu au atributele.
- Preloader-ul așteaptă sarcinile adăugate de elementele 3D (`addTasks`, `src/lib/preload.ts`), nu o listă fixă.
- Secțiunile se găsesc între ele prin id (`#hero`, `#join`, `#travel`, `#footer`), căutate din nou după
  orice schimbare de layout (editorul le poate re-randa). Bucla (`sections/loop.liquid`) copiază `#hero` din
  pagină, ca să aibă mereu textele lui.
- Pillars: textele și fundalurile sunt blocuri (max. 3); produsul 3D, poziția și cercurile fiecărui pas sunt
  fixe în `src/home/pillars.ts`, în ordinea K1, K2, K3.
- Newsletter-ul (Join) e formularul `customer` al Shopify (`contact[tags]=newsletter`): trimis cu `fetch`;
  dacă Shopify cere captcha (`/challenge`), formularul se trimite normal. După trimitere câmpul se golește
  (Figma nu are o stare de succes).
- Link-urile de politici din footer vin din Settings → Policies (refund / shipping apar doar dacă există).
- Newsletter (Join): confirmare după trimitere; adresele abonate din browser (`localStorage`
  `kelv:newsletter`) și clientul logat care primește deja emailuri nu se mai pot trimite („already on the
  list"). Când Shopify cere captcha, adresa se confirmă la întoarcere (`?customer_posted=true`).
- Straturile: doar linkurile cu `data-page-link` trec prin router; pagina vine din `fetch(url)`, iar stratul
  ei e `<html data-page>` din răspuns. Conținutul unui strat se înlocuiește doar dacă e altă pagină (quiz-ul își
  păstrează răspunsurile). Intrarea în strat e evenimentul `kelv:layer-enter` pe panou (`detail.delay`): îl
  ascultă reveal-urile (`kelv-reveals` din straturi pornesc doar la el). În editorul temei linkurile rămân normale.
- **Produsele ca date** (de creat în admin la etapa 9). Titlul = numele (`Foam Cleanser`), descrierea = textul de
  sub titlu, poza principală = packshot-ul, prețul = al variantei. Restul sunt metafields `kelv.*`:
  | cheie | tip | unde |
  |---|---|---|
  | `display_title` | single line text | titlurile (`Foam  Cleanser`, cu două spații ca în Figma) |
  | `code` | single line text | linia din coș (`K1/COOL`, etapa 6) |
  | `step` | integer | „Step N/3” |
  | `summary` | multi-line text | rândul din card |
  | `active`, `when`, `size` | single line text | tabelul din card |
  | `details` | multi-line text | Details |
  | `specs` | JSON `[{label, value}]` | tabelul de pe pagină (la `Size`, ce e înainte de virgulă e bold) |
  | `how_to` | listă single line text | How to use |
  | `inci`, `pairs` | multi-line / single line text | acordeonul INCI, Pairs with |
  | `faq` | JSON `[{question, answer}]` | More Informations (fără el, secțiunea nu apare) |
  | `notes` | JSON `["…"]` | coloana din dreapta a More Informations |
  | `model` | single line text | GLB-ul viewer-ului (`K1_COOL_Foam`…; fără el, doar poza) |
  | `image_centre` | decimal | centrul sticlei în poză (0.516 / 0.544), ca să stea centrată în card |
- **Colecția:** blocuri `Category` (nume + „produsele acestei pagini” sau altă colecție) și `Coming soon`; un bloc
  Coming soon aparține categoriei de deasupra lui. Tab-urile sunt categoriile; goals sunt doar butoane (ca în `web/`).
  NOTIFY ME = formularul `customer`, cu tag-ul `notify-<nume>`.
- Etichetele repetate pe fiecare produs (Add to cart, Details, How to use…) sunt în `locales/` (editabile din
  „Edit default theme content”); titlurile secțiunilor sunt setări ale secțiunilor.
- **Coșul:** butoanele din sertar și Add to cart cer `/cart/add.js` / `/cart/change.js` cu `sections: cart-drawer`;
  Shopify răspunde cu sertarul randat din nou (Section Rendering API), din care se ia doar panoul (sertarul rămâne
  deschis). Cererile merg una după alta. Un refuz (stoc epuizat) trimite formularul normal: mesajul e al Shopify.
  Buy it now = același formular cu `return_to=/checkout`. Contorul din header („Cart [ N ]”) vine din randarea
  sertarului (`data-link-label`) și se pune din nou la fiecare intrare de strat (`kelv:layer-enter` face bubble),
  fiindcă paginile aduse de router pot fi din cache. `/cart` (unde ajunge un formular fără script) = Discover +
  sertarul deschis. Pragul de livrare gratuită: Theme settings → Cart.
- Previzualizarea ține un coș în memorie (`preview/cart.ts`), comun pentru tot serverul: `/cart.js`,
  `/cart/add(.js)`, `/cart/change(.js)`, `?sections=`, `return_to`. Se golește la repornirea serverului.
- **Quiz-ul:** întrebările, citirea și rutina sunt în cod (`src/analysis/logic.ts`, identic cu `web/`, cu testele
  lui); ecranele se desenează din el (`question-card.ts`, `report.ts`). Din editor: titlul din header, LIVE READING,
  ecranul de start (markup-ul lui e un `<template>` în secțiune) și produsul kit-ului. Răspunsurile stau în element,
  deci rămân când stratul pleacă și revine; fiecare intrare rejoacă ecranul curent.
- **Kit-ul în coș** (documentul quiz-ului): produsul „Recovery kit” ales în secțiune sau, fără el, cele trei produse
  cu `kelv.step` 1–3; K2 singur pentru oferta „Already have a routine?”. Proprietăți pe linie: `Skin reading`,
  `Kit ID`, `Calibrated`, `Profile`, `_k2_schedule`, `_answers` (cele cu `_` nu apar în checkout). „Refill every 28
  days” folosește primul selling plan al produsului, dacă are (cere o aplicație de abonamente). Liniile cu proprietăți
  sunt separate de cele adăugate din shop (regula Shopify).
- **Contactul din quiz** (decis 2026-11-01): doar cu checkbox-ul bifat, numele și emailul devin client în admin, cu
  acord de email marketing (formularul `customer`, ascuns în secțiune), tag-uri `skin-analysis` + Kit ID. Trimis în
  fundal; dacă Shopify cere captcha, nu se salvează. Textul și linkul checkbox-ului sunt setări; linkul duce la
  subpunctul „Marketing emails” al Privacy Policy (`#marketing-emails`), pe care clientul trebuie să-l aibă în
  textul politicii (e în ciorna din `preview/fixtures/policies.json`).
- **Ancorele** (`/policies/…#sectiune`): după intrarea stratului, după schimbarea paginii și la încărcarea directă,
  pagina se duce la secțiune (−120 px, ca în `web/`); Lenis își remăsoară întâi înălțimea.
- **Editorul:** `src/lib/design-mode.ts` (`window.Shopify.designMode`); router-ul e oprit acolo (editorul arată o
  pagină odată), deci straturile nu primesc `kelv:layer-enter`: `kelv-reveals` pornește singur, după `whenReady`
  (politica își construiește markup-ul la conectare). Previzualizarea: `?design_mode=1` pune `request.design_mode`
  și `window.Shopify.designMode`.
- Politicile: Shopify le randează cu markup-ul lui (`.shopify-policy__container`); `kelv-policy` îl reface ca
  pagina legală din `web/` (fiecare titlu din text = o secțiune numerotată). „Last updated": Shopify nu
  dă data, așa că vine din Theme settings → Policies, câte o dată pe politică, goală = ascunsă (decis
  2026-11-01), iar titlurile sunt ale Shopify („Privacy policy", „Terms of service").

## Capcane

- ⚠️ **Formularele de client:** fără `form_key`, `/contact` dă 400; fără datele în `sessionStorage[form_key]`,
  pagina de hCaptcha dă 404; paginile Shopify nu se pot pune în iframe (`frame-ancestors 'none'`). Detalii:
  `../docs/shopify-custom-theme-forms.md`.
- ⚠️ `shopify theme package` scrie zip-ul ÎN `theme/`: mutat afară (`shopify/*.zip` e ignorat), altfel ajunge la
  următorul push. Push-ul cu `--nodelete` lasă pe magazin build-urile vechi; un push fără el le șterge (întâi
  `theme pull` și comparat JSON-urile, ca să nu pierzi modificări făcute din editor).

- ⚠️ **Magazinul real validează mai mult decât theme check și previzualizarea** (2026-11-02, primul push):
  un `url` nu poate avea ca default un link extern (valoarea se pune în JSON-ul grupului); tipul unui grup
  nu acceptă cratimă (`custom.shop_header`); fișierul unui grup nu poate purta numele unei secțiuni
  (`shop-header-group.json`, deci clasa `shopify-section-group-shop-header-group`).
- ⚠️ **Liquid-ul Shopify (Ruby) a lăsat spații între literele din BEYOND / ALWAYS / STATEOFMIND**, pe care
  liquidjs nu le lasă (confirmat în HTML-ul magazinului: un `\n` după fiecare `</i>`): goluri de ~1 spațiu. Rândurile sunt `display: flex`, care ignoră spațiile
  (verificat: aceleași poziții cu și fără spații inserate). Orice text compus literă cu literă din
  `inline-block` trebuie să nu depindă de spațiile albe.
- ⚠️ **Spațiul dintre cuvinte (`words.liquid`) dispărea pe Shopify:** `{%- unless … %} {% endunless -%}` iese gol
  în Ruby. Un spațiu care contează se scrie ca output, `{{ ' ' }}`, pe care niciun `-` nu îl taie.
- ⚠️ **`t` escapează deja traducerile** (în afară de cheile `_html`): `| t | escape` dădea `&amp;#39;`.
  Previzualizarea escapează acum la fel.
- ⚠️ **Aplicația rula de DOUĂ ori pe magazin** (două Lenis: bucla footer → hero rămânea pornită în shop, click-uri
  și preloader greoaie). Shopify încarcă intrarea ca `kelv.js?v=…`, iar chunk-urile 3D o importau ca
  `./kelv.js`: alt URL, alt modul. Acum `kelv.js` (`src/boot.ts`) doar importă `kelv-app-<hash>.js`, pe care îl
  importă toate chunk-urile. Previzualizarea pune și ea `?v=` pe asset-uri, ca bug-ul să se vadă local.
- **Unealta de verificare:** `shopify theme dev --store-password …` (port 9292) randează Liquid-ul real; HTML-ul
  normalizat (spații comprimate, URL-uri de asset și id-uri de secțiune scoase) se compară cu cel de pe 5176.
- ⚠️ **Shopify pune linia nouă din coș SUS** (Next o punea la coadă): sertarul parcurge `cart.items reversed`, iar
  coșul previzualizării adaugă și el sus, ca să rămână identic cu magazinul.
- ⚠️ **Sesiunea `theme dev` pe storefront expiră** (după ~1 h, sau după un POST respins de anti-bot): toate
  paginile dau 302 → `/password`. Se repornește `theme dev`.
- ⚠️ Cât rulează `theme dev`, nu `sed -i` în `theme/`: fișierul temporar al lui sed e sincronizat și blochează
  serverul (500) până la repornire.
- ⚠️ **Fonturile Google descărcate cu user-agent de Windows vin cu hinting** și se randează altfel (ClearType
  colorat). Fișierele din `assets/` sunt cele fără hinting, identice cu ce servea `next/font`.
- ⚠️ `HTMLElement.part` există deja: helper-ul pentru `data-part` se numește `ref()`. La fel, câmpurile unui
  element nu se pot numi `title`, `id`, `hidden`, `role`… (ar suprascrie atributele elementului).
- ⚠️ **Shopify învelește fiecare secțiune într-un `div.shopify-section`**: un `position: sticky` din secțiune
  rămâne lipit doar în containerul ei. Header-ul shop-ului: `.shopify-section-group-shop-header-group { display: contents }`.
- ⚠️ **Starea ascunsă a reveal-urilor se pune cu tranzițiile oprite** (`observeReveals`): în React clasele erau
  din prima randare; adăugate pe un element deja afișat, textul întâi se stingea animat, apoi apărea.
- ⚠️ Spațiile din Liquid contează între elemente inline (`<b>01</b>/03`): se scriu pe un rând; Prettier
  păstrează sensul (mută `>` pe rândul următor).

- ⚠️ Pozele din carduri ies în previzualizare cu alt filtru de micșorare decât în `web/` (aceeași poziție, același
  fișier; 0.2–0.3 % pixeli, doar pe modelul de puncte al etichetei, invizibil la zoom). Nu e de la `width`/`height`,
  `decoding` sau content-type (verificate). De reverificat pe magazin, unde pozele vin de la CDN-ul Shopify.
- ⚠️ Un grup ascuns cu `hidden` rămâne frate în DOM: `.group + .group` a devenit `.group:not([hidden]) ~ .group`.
- ⚠️ Previzualizarea: `image_tag` pune `width`/`height` din obiectul pozei (ca Shopify), iar `{% form 'product',
  product %}` acceptă obiectul după tip.

## De verificat pe magazin

Închise 2026-11-03: `.glb` / `.bin` merg din `assets/`; banii sunt în USD (`$45.54`, politicile spun la fel); pozele
din carduri, coșul, quiz-ul și formularele sunt verificate pe magazin. Rutele fără template (`/search`,
`/collections`) primesc pagina de rezervă a Shopify (nu sunt în Figma și nu le leagă nimic).
