/** URLs of the files the code loads itself, written by the theme (snippets/asset-urls.liquid). */

let urls: Record<string, string> | null = null;

export function assetUrl(name: string) {
  urls ??= JSON.parse(document.getElementById('kelv-assets')?.textContent ?? '{}');
  const url = urls![name];
  if (!url) throw new Error(`No URL for asset ${name} (snippets/asset-urls.liquid)`);
  return url;
}
