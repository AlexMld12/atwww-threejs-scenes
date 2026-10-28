// Everything the preloader waits for, weighted by its size in MB.
const TASKS = {
  'scene-code': 0.7,
  'view-curve': 0.01,
  logo: 0.05,
  backdrop: 0.2,
  environment: 1.7,
  pictures: 1,
  bench: 0.44,
  compile: 0.3,
  configurator: 2.4,
} as const;

export type PreloadTask = keyof typeof TASKS;

const done = new Map<PreloadTask, number>(Object.keys(TASKS).map((key) => [key as PreloadTask, 0]));
const totalWeight = Object.values(TASKS).reduce((sum: number, weight) => sum + weight, 0);

/** Loaded share of all tasks, 0…1. */
export function preloadProgress() {
  let loaded = 0;
  for (const [key, fraction] of done) loaded += TASKS[key] * fraction;
  return loaded / totalWeight;
}

export function reportProgress(task: PreloadTask, fraction: number) {
  done.set(task, Math.max(done.get(task) ?? 0, Math.min(1, fraction)));
}

export const isFinished = (task: PreloadTask) => done.get(task) === 1;

/** Marks a task finished, also when it failed: the page must not wait forever. */
export function finishTask(task: PreloadTask) {
  reportProgress(task, 1);
}

/** Gives up on whatever is left (no WebGL, a failed request): the preloader still hands the page over. */
export function finishAll() {
  for (const key of done.keys()) finishTask(key);
}

/** fetch() that reports the downloaded share of the body. */
export async function fetchWithProgress(url: string, onProgress: (fraction: number) => void) {
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
    if (total) onProgress(loaded / total);
  }
  onProgress(1);
  return new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? '' });
}
