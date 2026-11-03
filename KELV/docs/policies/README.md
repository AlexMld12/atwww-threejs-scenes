# Politicile KELV, gata de pus în Shopify

Patru fișiere, câte unul pe politică, în HTML (același text pe care l-am testat în temă):

| Fișier | În Shopify | Ancore folosite de temă |
|---|---|---|
| `privacy-policy.html` | Settings → Policies → Privacy policy | `#marketing-emails` (checkbox-ul din quiz) |
| `terms-of-service.html` | Settings → Policies → Terms of service | `#shipping` (linkul „shipping” din coș, dacă nu există Shipping policy) |
| `refund-policy.html` | Settings → Policies → Refund policy | — |
| `shipping-policy.html` | Settings → Policies → Shipping policy | — |

## Cum se pun

1. În editorul politicii, butonul `<>` (Show HTML), apoi se lipește conținutul fișierului și se salvează.
2. Fiecare titlu (`<h2>`) devine în site o secțiune numerotată (01, 02, …). Ancora unei secțiuni e titlul ei scris
   cu litere mici și cratime: „Marketing emails” → `#marketing-emails`. Dacă un titlu se schimbă, se schimbă și
   ancora; cea din quiz se reglează din editorul temei (Skin analysis → Section of the privacy policy).
3. „Last updated” de deasupra fiecărei politici: Online Store → Themes → Customize → Theme settings → Policies.
   Se schimbă data de fiecare dată când se schimbă textul (Shopify nu o ține singur).

## De verificat de client (sau de un jurist) înainte de lansare

Textele sunt o ciornă scrisă pentru site, nu un text juridic verificat.

- **Cine e firma:** peste tot apare „KELV Inc.”. Trebuie numele juridic real, adresa și un email de contact
  (politicile spun „contact us”, dar nu dau adresa).
- **Legea aplicabilă:** termenii spun „the law of the country where KELV Inc. is registered”; trebuie țara exactă.
- **Livrarea și retururile:** termenele (14 zile), țările de livrare și pragul de livrare gratuită (100 €, setat în
  Theme settings → Cart) trebuie să fie cele reale.
- **Emailurile de marketing:** subpunctul „Marketing emails” descrie ce face tema: cu bifa din quiz (sau abonarea
  la updates) numele și emailul se salvează ca client care acceptă emailuri, cu Kit ID-ul citirii.
- **Cookie-urile:** politica spune că site-ul folosește doar ce îi trebuie ca să funcționeze. Dacă se adaugă
  analytics (Shopify Analytics, Google, Meta), textul și bannerul de consimțământ trebuie actualizate.
