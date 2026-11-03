# Formularele de client într-o temă Shopify custom (newsletter, „notify me”, contact)

Lecții din KELV (`KELV/shopify/`, 2026-11-03). Implementarea de referință:
`KELV/shopify/src/lib/customer-form.ts`, folosită de `src/home/join.ts`, `src/shop/email-form.ts` și
`src/analysis/skin-analysis.ts`.

Simptomele pe care le rezolvă:
- pagina se reîncarcă la trimitere (cu preloader cu tot);
- `fetch` spre `/contact` primește **400 „invalid parameters”**;
- după hCaptcha apare **404 Not Found** și clientul nu se salvează.

## Cum funcționează formularul la Shopify

`{% form 'customer' %}` face POST pe `/contact` (`form_type=customer`, `contact[email]`, `contact[tags]`…).
Shopify injectează în `content_for_header` un script inline (`<script id="captcha-bootstrap">`) care face trei lucruri:

1. **Pune un `form_key`.** Ascultă `submit` pe `document` (bubble). Dacă un formular contact/customer nu are
   `form_key`, face `preventDefault()`, generează **în browser** un cod aleator de 32 de caractere (base36) și îl
   adaugă ca `<input type="hidden" name="form_key">`.
2. **Salvează datele.** Le pune în `sessionStorage[form_key]` ca
   `{"__shopify_v":1,"action":form.action,"data":{…toate câmpurile, fără parole și tokenuri captcha}}`.
3. **Trimite formularul nativ** cu `form.submit()`, de unde și refresh-ul.

Dacă formularul **are deja** `form_key` (cu valoare), scriptul nu se mai atinge de el.

Ce răspunde serverul:
- un POST **fără** `form_key` primește 400 „invalid parameters”;
- un POST cu `form_key` primește 302 spre `?customer_posted=true` (succes) sau spre
  `/challenge?form_key=…&form_type=customer&return_path=…` (verificare hCaptcha);
- comutatorul hCaptcha din admin nu oprește asta: Shopify cere verificarea oricând consideră traficul suspect,
  de exemplu după multe teste de pe același IP.

Pagina `/challenge` completează formularul ei din `sessionStorage[form_key]`, apoi îl retrimite. **Fără datele
salvate, verificarea se termină cu 404 și clientul nu se creează.**

Paginile Shopify trimit `X-Frame-Options: DENY` și `frame-ancestors 'none'`, deci **nu se pot încărca într-un
iframe**, nici din același domeniu. Ideea „trimit într-un iframe ascuns / arăt captcha într-un popup” nu merge pe
magazin, chiar dacă merge pe o previzualizare locală.

## Soluția (fără refresh, cu captcha când e cazul)

În handler-ul de `submit` al formularului, cu `event.preventDefault()`:

1. **Pune singur `form_key`, ca Shopify.** Generează cele 32 de caractere și salvează datele în `sessionStorage`
   exact în formatul de mai sus, inclusiv câmpul `form_key`.
2. **Trimite cu `fetch`.** Folosește `fetch(form.action, { method: 'POST', body: new URLSearchParams(...) })`, adică
   urlencoded, ca browserul.
3. **Citește răspunsul:**
   - `response.ok` și `response.url` fără `/challenge`: succes, afișezi „you're on the list”, fără refresh;
   - `response.url` pe `/challenge`, sau `!response.ok`: notezi în `sessionStorage` ce formular și ce adresă au plecat
     (pentru mesajul de după întoarcere) și chemi `form.submit()`. E drumul nativ al Shopify: verificare, apoi
     întoarcere pe `return_path?customer_posted=true`.
4. **La încărcarea paginii,** dacă URL-ul are `customer_posted=true` și există nota de la pasul 3, afișezi mesajul
   de succes pe formularul acela. Nu consuma nota pe `/challenge`: dacă tema randează home-ul sub orice pagină,
   componenta montată pe pagina de verificare ar șterge-o.

Pagina de verificare se poate stiliza: `request.page_type == 'captcha'`, cu markup-ul Shopify
`.shopify-challenge__container`, `.shopify-challenge__message` și `form` cu `[type=submit]`. Conținutul centrat,
pentru că așa îl așază Shopify.

## Cum testezi

- **Pe telefon, pe date mobile:** un IP „curat” arată cazul fără captcha. Pe laptopul cu zeci de teste apare
  aproape mereu verificarea, deci testează și drumul cu captcha cap-coadă (clientul trebuie să apară în
  Customers cu tag-ul lui).
- **Un browser automat nu ajunge la `/contact`:** Chrome-ul headless și proxy-ul `shopify theme dev` primesc 403
  „Verifying your connection” de la Cloudflare. Pe magazin testează doar omul. Ca să citești scriptul Shopify,
  ia HTML-ul unei pagini prin `theme dev` (GET-urile trec) și caută `form_key`.
- **Previzualizarea locală** (dacă ai una) trebuie să refuze POST-urile fără `form_key` cu 400 și să răspundă cu
  302 ca Shopify. KELV: `KELV/shopify/preview/server.ts`, unde o adresă cu `+challenge` simulează verificarea.
- **DevTools → Network → Keep log:** rândul `contact` de tip `fetch` arată statusul, iar Payload-ul arată dacă
  pleacă `form_key`.
