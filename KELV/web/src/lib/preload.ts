// Everything the preloader waits for, weighted by its size in MB; products' GLBs join this list.
const TASKS = {
  'hero-code': 0.9,
  'hero-data': 0.05,
  'hero-model': 2.1,
  'hero-lut': 2.2,
  'hero-compile': 0.3,
  'wisdom-code': 0.05,
  'wisdom-data': 0.09,
  'wisdom-model': 1.84,
  'wisdom-compile': 0.3,
  'product-k1': 0.87,
  'product-k2': 0.38,
  'product-k3': 0.38,
  'pillars-compile': 0.15,
  'travel-compile': 0.1,
} as const;

export type PreloadTask = keyof typeof TASKS;

const done = new Map<PreloadTask, number>(Object.keys(TASKS).map((key) => [key as PreloadTask, 0]));
const totalWeight = Object.values(TASKS).reduce((sum: number, weight) => sum + weight, 0);
const requests = new Map<string, Promise<Blob>>();

/** Loaded share of all tasks, 0…1. */
export function preloadProgress() {
  let loaded = 0;
  for (const [key, fraction] of done) loaded += TASKS[key] * fraction;
  return loaded / totalWeight;
}

export function reportProgress(task: PreloadTask, fraction: number) {
  const before = done.get(task) ?? 0;
  done.set(task, Math.max(before, Math.min(1, fraction)));
  if (before < 1 && fraction >= 1) performance.mark(`preload:${task}`);
}

/** Marks a task finished, also when it failed: the page must not wait forever. */
export function finishTask(task: PreloadTask) {
  reportProgress(task, 1);
}

/** fetch() that reports the downloaded share of the body; one request per URL (parallel ones fail in Chrome's cache). */
export function fetchWithProgress(url: string, task: PreloadTask) {
  let request = requests.get(url);
  if (!request) {
    request = download(url, task);
    requests.set(url, request);
    request.catch(() => requests.delete(url));
  }
  return request;
}

async function download(url: string, task: PreloadTask) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    chunks.push(value);
    loaded += value.length;
    if (total) reportProgress(task, loaded / total);
  }
  finishTask(task);
  return new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? '' });
}
