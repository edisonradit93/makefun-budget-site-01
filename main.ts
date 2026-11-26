import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const appOut = join(out, 'app');
const screenshotsOut = join(out, 'screenshots');

mkdirSync(out, { recursive: true });
rmSync(appOut, { recursive: true, force: true });
rmSync(screenshotsOut, { recursive: true, force: true });

cpSync(resolve('app'), appOut, { recursive: true });

if (existsSync(resolve('screenshots'))) {
  cpSync(resolve('screenshots'), screenshotsOut, { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});

writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`Built dossier (${dossier.byteLength} bytes) in ${out}`);
