/** Privacy policy and terms of use: no design or final text yet, a draft to be reviewed by the client's lawyer. */

export interface LegalDoc {
  path: string;
  title: [string, string];
  heading: string;
  updated: string;
  sections: { id: string; title: string; paragraphs: string[] }[];
}

const UPDATED = '8 October 2026';

export const PRIVACY: LegalDoc = {
  path: '/privacy-policy',
  title: ['Privacy', 'Policy'],
  heading: 'Privacy Policy',
  updated: UPDATED,
  sections: [
    {
      id: 'who-we-are',
      title: 'Who we are',
      paragraphs: [
        'KELV Inc. ("KELV", "we", "us") runs this website and sells the KELV skincare products. This policy explains what personal data we collect when you visit the site, take the skin reading or buy from us, why we collect it and what rights you have over it.',
      ],
    },
    {
      id: 'what-we-collect',
      title: 'What we collect',
      paragraphs: [
        'Data you give us: your email address when you join the club, subscribe to updates or ask to be notified about a product; your first name and email if you add them at the end of the skin reading; your answers to the skin reading; and, when you order, your name, delivery address, phone number and order details.',
        'Data collected automatically: basic technical information such as your browser, device type, pages visited and the time of your visit. We use it to keep the site working and to understand how it is used.',
        'Payment details are entered directly with our payment provider. We never see or store your full card number.',
      ],
    },
    {
      id: 'how-we-use-it',
      title: 'How we use it',
      paragraphs: [
        'To process and deliver your orders and to answer your questions (performance of a contract).',
        'To send you updates, product news and launch notifications, only when you have asked for them (consent). Every email has an unsubscribe link.',
        'To show you a routine based on your skin reading. The reading is calculated in your browser; your answers are attached to your order only if you add the recommended kit to your cart.',
        'To keep the site secure, prevent fraud and meet our legal and accounting obligations (legitimate interest and legal obligation).',
      ],
    },
    {
      id: 'sharing',
      title: 'Who we share it with',
      paragraphs: [
        'We share personal data only with the companies that help us run the shop: our e-commerce and payment providers, our email service and our delivery partners. They act on our instructions and may not use your data for their own purposes. We do not sell your personal data.',
      ],
    },
    {
      id: 'retention',
      title: 'How long we keep it',
      paragraphs: [
        'Order records are kept for as long as accounting and tax law requires. Marketing data is kept until you unsubscribe or ask us to delete it. Skin reading answers that are not attached to an order are not stored by us.',
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies',
      paragraphs: [
        'The site uses only the cookies and local storage it needs to work, such as keeping the contents of your cart. If we add analytics or marketing cookies, we will ask for your consent first and update this policy.',
      ],
    },
    {
      id: 'your-rights',
      title: 'Your rights',
      paragraphs: [
        'You can ask to access, correct, delete or export your personal data, object to its use or withdraw your consent at any time. You also have the right to complain to your local data protection authority.',
        'To exercise any of these rights, write to us using the contact details on this site. We answer within one month.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes',
      paragraphs: [
        'We may update this policy when our services or the law change. The date at the top of the page shows when it was last updated.',
      ],
    },
  ],
};

export const TERMS: LegalDoc = {
  path: '/terms-of-use',
  title: ['Terms', 'Of use'],
  heading: 'Terms of Use',
  updated: UPDATED,
  sections: [
    {
      id: 'about',
      title: 'About these terms',
      paragraphs: [
        'These terms apply to your use of the KELV website and to every order you place with KELV Inc. By using the site or placing an order you accept them. Please read them together with our Privacy Policy.',
      ],
    },
    {
      id: 'products',
      title: 'Products and skin reading',
      paragraphs: [
        'KELV products are cosmetics for external use. Read the ingredient list before use and stop using a product if irritation occurs.',
        'The skin reading is a guide to choosing a routine, not a medical or dermatological diagnosis. If you have a skin condition, ask a doctor or dermatologist for advice.',
      ],
    },
    {
      id: 'orders',
      title: 'Orders and prices',
      paragraphs: [
        'Prices are shown in euro and include VAT. Shipping costs, when they apply, are shown at checkout before you pay. An order is accepted when we send you the order confirmation email.',
        'We may refuse or cancel an order if a product is out of stock, if the price shown was clearly wrong or if we suspect fraud. If you have already paid, we refund you in full.',
      ],
    },
    {
      id: 'shipping',
      title: 'Shipping',
      paragraphs: [
        'We ship to the countries listed at checkout. Delivery times are estimates and start from the moment your order is confirmed. Orders above the free-shipping threshold shown in the cart ship free.',
      ],
    },
    {
      id: 'refunds',
      title: 'Returns and refunds',
      paragraphs: [
        'You can withdraw from your order within 14 days of delivery without giving a reason. For hygiene reasons, products can be returned only unopened and with their seal intact.',
        'To start a return, contact us with your order number. We refund the price of the returned products, and the standard delivery cost, within 14 days of receiving them, using the same payment method.',
        'If a product arrives damaged or faulty, contact us within 14 days of delivery and we will replace or refund it at no cost to you.',
      ],
    },
    {
      id: 'site',
      title: 'Using the site',
      paragraphs: [
        'The content of this site — texts, images, the KELV name and logo — belongs to KELV Inc. and may not be copied or reused without our written permission. You agree not to misuse the site or interfere with how it works.',
      ],
    },
    {
      id: 'liability',
      title: 'Liability',
      paragraphs: [
        'Nothing in these terms limits your statutory rights as a consumer. Except where the law does not allow it, we are not liable for indirect losses or for losses caused by events outside our reasonable control.',
      ],
    },
    {
      id: 'law',
      title: 'Governing law and changes',
      paragraphs: [
        'These terms are governed by the law of the country where KELV Inc. is registered, without affecting the mandatory consumer protection rules of the country where you live. We may update these terms; the version in force when you place an order applies to that order.',
      ],
    },
  ],
};

export const LEGAL_DOCS = [PRIVACY, TERMS];

export function legalByPath(path: string) {
  return LEGAL_DOCS.find((doc) => doc.path === path);
}
