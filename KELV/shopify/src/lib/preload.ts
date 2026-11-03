/**
 * What the preloader waits for: each 3D element adds its tasks when it is connected, weighted by size in MB.
 * Elements are connected before the preloader starts counting, so the total never grows under it.
 */

export type PreloadTask = string;

const weights = new Map<PreloadTask, number>();
const done = new Map<PreloadTask, number>();
const requests = new Map<string, Promise<Blob>>();

export function addTasks(tasks: Record<PreloadTask, number>) {
  for (const [task, weight] of Object.entries(tasks)) {
    if (weights.has(task)) continue;
    weights.set(task, weight);
    done.set(task, 0);
  }
}

/** Loaded share of all tasks, 0…1 (1 when there is nothing to load). */
export function preloadProgress() {
  let total = 0;
  let loaded = 0;
  for (const [task, weight] of weights) {
    total += weight;
    loaded += weight * (done.get(task) ?? 0);
  }
  return total > 0 ? loaded / total : 1;
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
