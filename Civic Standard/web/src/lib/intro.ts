// Preloader → scene handover. The preloader says when everything is loaded; the scene takes the lines over in the
// same frame it first draws them, so the page never shows a cut between the two.
type Listener = () => void;

const loadedListeners = new Set<Listener>();
const handoverListeners = new Set<Listener>();
let loaded = false;
let handedOver = false;

function subscribe(set: Set<Listener>, done: boolean, listener: Listener) {
  if (done) listener();
  else set.add(listener);
  return () => set.delete(listener);
}

export const onLoaded = (listener: Listener) => subscribe(loadedListeners, loaded, listener);
export const onHandover = (listener: Listener) => subscribe(handoverListeners, handedOver, listener);

export function markLoaded() {
  if (loaded) return;
  loaded = true;
  loadedListeners.forEach((listener) => listener());
  loadedListeners.clear();
}

export function handOver() {
  if (handedOver) return;
  handedOver = true;
  document.documentElement.classList.add('is-handed-over');
  handoverListeners.forEach((listener) => listener());
  handoverListeners.clear();
}
