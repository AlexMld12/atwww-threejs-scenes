// Comprimă GLB-urile produselor pentru web: geometrie Draco, texturi WebP de 2048 px.
// 6.6 MB → 0.85 MB; randarea comparată cu originalele: diferență medie 0.14 / 255.
// Extensiile de material (transmisia, IOR-ul și volumul capacului K1, specular) rămân.
// ⚠️ Fără simplify / join / flatten / instance: geometria și piesele (Body, Collar,
// Actuator, Cap) rămân cum le-a exportat colegul.
// Sursa: pachetul de packshot (în afara repo-ului). Alt folder: KELV_GLB_SRC=<cale>.
//   npm run models
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.env.KELV_GLB_SRC || 'C:/ATWWW/KELV/KELV_PACKSHOT_PREVIEW_DEVELOPER/KELV_PACKSHOT_PREVIEW/assets';
const out = join(here, '..', 'public', 'models');
for (const f of ['K1_COOL_Foam', 'K2_CALM_Serum', 'K3_SEAL_Cream']) {
  execFileSync('npx', ['gltf-transform', 'optimize', `${src}/${f}.glb`, join(out, `${f}.glb`),
    '--compress', 'draco', '--texture-compress', 'webp', '--texture-size', '2048',
    '--simplify', 'false', '--join', 'false', '--flatten', 'false', '--instance', 'false'],
  { stdio: 'inherit', shell: true });
}
