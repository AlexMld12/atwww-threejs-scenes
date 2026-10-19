// Preloader → scene handover. Under the preloader's mask the scene's glass replaces the lines while the page loads;
// once both are complete the preloader hands over and the scene's own intro starts.
type Listener = () => void;

/** The preloader's mask in client px, and how much of the glass has come in under it (0…1). */
export const loaderMask = { x: 0, y: 0, radius: 0, glass: 0 };

const loadedListeners = new Set<Listener>();
const handoverListeners = new Set<Listener>();
let loaded = false;
let handedOver = false;
let sceneShown = false;

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

/** The tube's rows start coming up: the navbar comes in with them. */
export function sceneIn() {
  if (sceneShown) return;
  sceneShown = true;
  document.documentElement.classList.add('is-scene-in');
}
