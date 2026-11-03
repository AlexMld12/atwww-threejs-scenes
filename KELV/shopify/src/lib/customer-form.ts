const PENDING_KEY = 'kelv:customer-form';

interface Pending {
  id: string;
  email: string;
}

// Kept out of what Shopify's script stores for its captcha page, as it does.
const NOT_STORED = ['recaptcha-v3-token', 'g-recaptcha-response', 'h-captcha-response', 'password'];

/**
 * Shopify's storefront script stamps customer forms with a random key as they go, and stores their fields under it:
 * its captcha page fills its own form from them. Stamped first, the script leaves the form alone.
 */
function stamp(form: HTMLFormElement) {
  let input = form.elements.namedItem('form_key') as HTMLInputElement | null;
  if (!input) {
    input = Object.assign(document.createElement('input'), { type: 'hidden', name: 'form_key' });
    form.append(input);
  }
  try {
    if (input.value) sessionStorage.removeItem(input.value);
  } catch {
    // No storage: nothing was stored under the old key either.
  }
  const key = Array.from({ length: 32 }, () => Math.random().toString(36).slice(2, 3) || '0').join('');
  input.value = key;
  const data: Record<string, string> = {};
  for (const [name, value] of new FormData(form))
    if (typeof value === 'string' && !NOT_STORED.includes(name)) data[name] = value;
  try {
    sessionStorage.setItem(key, JSON.stringify({ __shopify_v: 1, action: form.action, data }));
  } catch {
    // Without storage the captcha page cannot fill its form: Shopify's own script has the same limit.
  }
}

function setPending(pending: Pending) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // The note after the captcha is lost, the subscription is not.
  }
}

/**
 * Posts Shopify's customer form in the background, url-encoded with its `form_key` (without it /contact answers 400).
 * Call it from the form's submit event, default prevented. When Shopify asks for its captcha (its pages cannot be
 * framed) or refuses the background post, the page goes to Shopify and comes back with `customer_posted`: see
 * `postedHere`.
 */
export async function postCustomerForm(form: HTMLFormElement) {
  stamp(form);
  const data = new FormData(form);
  const body = new URLSearchParams();
  for (const [name, value] of data) if (typeof value === 'string') body.append(name, value);
  const response = await fetch(form.action, { method: 'POST', body }).catch(() => null);
  // Its captcha, or a refusal in the background (a bot check, the network): the stamped form is posted as a page,
  // as Shopify's own script does, so the address is not lost.
  if (!response?.ok || new URL(response.url).pathname.startsWith('/challenge')) {
    setPending({ id: form.id, email: String(data.get('contact[email]') ?? '') });
    form.submit();
    return new Promise<void>(() => {});
  }
}

/** The address this form sent before Shopify's captcha, once Shopify is back with `customer_posted=true`. */
export function postedHere(form: HTMLFormElement) {
  // The captcha page renders the home under it: the address is kept for the page Shopify comes back to.
  if (location.pathname.startsWith('/challenge')) return null;
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null;
    if (!pending || pending.id !== form.id) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return new URLSearchParams(location.search).get('customer_posted') === 'true' ? pending.email : null;
  } catch {
    return null;
  }
}
