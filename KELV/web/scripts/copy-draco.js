// Copiaza decoderul Draco din node_modules in public/, ca sa NU mai depindem de
// gstatic.com la runtime. Motivul e masurat: in auditul de compatibilitate desktop,
// un proxy care blocheaza gstatic omora tot site-ul — fara decoder niciun GLB nu se
// incarca, iar pagina ramane pe preloader la nesfarsit, cu scroll blocat.
// Ruleaza automat inainte de `dev` si de `build` (vezi package.json).
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco');
const to = join(here, '..', 'public', 'draco');

if (!existsSync(from)) {
  console.error('[draco] lipseste ' + from + ' — ruleaza `npm install` intai.');
  process.exit(1);
}
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log('[draco] copiat in public/draco/');
