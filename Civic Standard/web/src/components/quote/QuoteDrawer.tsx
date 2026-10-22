'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  closeQuote,
  configure,
  isQuoteOpen,
  quoteItems,
  removeFromQuote,
  serverQuoteItems,
  setQuantity,
  subscribeQuote,
} from '@/lib/quote';
import { setScrollLocked } from '@/lib/scroll';
import { describe, nameOf } from '../configurator/content';

// Figma's arrow (Quote Open.pdf, the drawer's back button and SEND's)
const BACK_ICON = 'M5.26 10.45 6.02 9.72 2.03 5.72h9.35V4.68H2.03L6.01.7 5.26-.05C3.34 1.87 1.86 3.36.02 5.2z';

const ROLES = ['Municipality', 'Landscape architect', 'Architect', 'Contractor', 'Developer', 'Other'];
const WHEN = ['Within 1 month', 'Within 3 months', 'Within 6 months', 'Not decided yet'];

const FIELDS = [
  { name: 'name', label: 'Your name', placeholder: 'Ana', type: 'text', required: true },
  { name: 'email', label: 'Email', placeholder: 'ana@example.com', type: 'email', required: true },
  { name: 'organisation', label: 'Organisation', placeholder: 'ana@example.com', type: 'text' },
  { name: 'role', label: 'I am a:', options: ROLES },
  { name: 'project', label: 'Project name', placeholder: 'Mauritius', type: 'text' },
  { name: 'when', label: 'Needed by', options: WHEN, initial: WHEN[1] },
] as const;

/** Quote Open.pdf: the list over the page, from the right; the page behind under the paper at 60 %. */
export function QuoteDrawer() {
  const items = useSyncExternalStore(subscribeQuote, quoteItems, serverQuoteItems);
  const open = useSyncExternalStore(subscribeQuote, isQuoteOpen, () => false);
  const pieces = items.reduce((sum, item) => sum + item.qty, 0);

  useEffect(() => {
    if (!open) return;
    setScrollLocked(true);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && closeQuote();
    window.addEventListener('keydown', onKey);
    return () => {
      setScrollLocked(false);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`qd${open ? ' is-open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="qd__veil" onClick={closeQuote} />
      <aside className="qd__panel" role="dialog" aria-modal="true" aria-label="Quote list">
        <header className="qd__head">
          <h2 className="qd__title">Quote list ({items.length})</h2>
          <button type="button" className="qd__close" aria-label="Close the quote list" onClick={closeQuote}>
            <svg viewBox="0 -0.05 11.4 10.5" aria-hidden="true">
              <path d={BACK_ICON} />
            </svg>
          </button>
        </header>

        <form
          className="qd__form"
          onSubmit={(event) => {
            // no address to send it to yet: the browser checks the fields, nothing leaves the page
            event.preventDefault();
          }}
        >
          <div className="qd__scroll" data-lenis-prevent>
            <ul className="qd__items">
              {items.map((item) => (
                <li key={item.key} className="qd__item">
                  <span className="qd__thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the catalogue's render, a thumbnail */}
                    <img src={`/products/${item.id}.webp`} alt="" />
                  </span>
                  <div className="qd__about">
                    <p className="qd__name">{nameOf(item.id)}</p>
                    <p className="qd__spec">{describe(item.id, item.finish)}</p>
                    <div className="qd__actions">
                      <div className="qd__stepper">
                        <button
                          type="button"
                          aria-label="One fewer"
                          onClick={() => setQuantity(item.key, item.qty - 1)}
                          disabled={item.qty <= 1}
                        >
                          -
                        </button>
                        <span aria-live="polite">{item.qty}</span>
                        <button type="button" aria-label="One more" onClick={() => setQuantity(item.key, item.qty + 1)}>
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="qd__link"
                        onClick={() => configure({ id: item.id, finish: item.finish, edit: item.key })}
                      >
                        Edit configuration
                      </button>
                      <button
                        type="button"
                        className="qd__link qd__link--remove"
                        onClick={() => removeFromQuote(item.key)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="qd__details">
              <h3 className="qd__subtitle">Your details</h3>
              <div className="qd__fields">
                {FIELDS.map((field) => (
                  <label key={field.name} className="qd__field">
                    <span className="qd__label">{field.label}</span>
                    {'options' in field ? (
                      <span className="qd__select">
                        <select name={field.name} defaultValue={'initial' in field ? field.initial : undefined}>
                          {field.options.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                        <svg viewBox="0 0 9 5.2" aria-hidden="true">
                          <path d="M0.5 0.5 4.5 4.5 8.5 0.5" />
                        </svg>
                      </span>
                    ) : (
                      <input
                        className="qd__input"
                        name={field.name}
                        type={field.type}
                        placeholder={field.placeholder}
                        required={'required' in field}
                      />
                    )}
                  </label>
                ))}
                <label className="qd__field qd__field--wide">
                  <span className="qd__label">Notes</span>
                  <textarea className="qd__input qd__notes" name="notes" placeholder="Mauritius" />
                </label>
              </div>
              <label className="qd__agree">
                <input type="checkbox" name="agree" required />
                <span>
                  By submitting, you agree to our <em>privacy policy</em>
                </span>
              </label>
            </div>
          </div>

          <footer className="qd__foot">
            <p className="qd__summary">
              {pieces} {pieces === 1 ? 'piece' : 'pieces'} in {items.length}{' '}
              {items.length === 1 ? 'configuration' : 'configurations'}. We reply with a quote in 48hrs. Our team do its
              best to response all the requests
            </p>
            <div className="qd__send">
              <button type="submit" className="qd__submit">
                Send quote request
              </button>
              <button type="submit" className="qd__submit qd__submit--arrow" aria-label="Send quote request">
                <svg viewBox="0 0 12 11.2" aria-hidden="true">
                  <path d="M0 5.6h11M6.2 0.8l4.8 4.8-4.8 4.8" />
                </svg>
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}
