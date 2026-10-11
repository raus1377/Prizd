import { readFile, readdir, mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateSettings, validateOpportunity, gitAddedAt, normalizeOpportunity } from './model.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const settings = await readJson('data/settings.json');
const organizers = await readJson('data/organizers.json');
validateSettings(settings, organizers);
const now = Date.now();
const opportunities = [];
const ids = new Set();
for (const file of (await readdir(path.join(root, 'data/opportunities'))).filter(x => x.endsWith('.json')).sort()) {
  const relative = `data/opportunities/${file}`;
  const o = await readJson(relative);
  validateOpportunity(o, relative, settings, organizers);
  if (ids.has(o.id)) throw new Error(`${relative}: duplicate id ${o.id}`);
  ids.add(o.id);
  opportunities.push(normalizeOpportunity(o, organizers.find(x => x.id === o.organizerId), settings, gitAddedAt(root, relative), now));
}
const data = { settings, organizers, opportunities, builtAt: new Date(now).toISOString() };
await rm(path.join(root, 'dist'), { recursive:true, force:true });
await mkdir(path.join(root, 'dist'), { recursive:true });
await cp(path.join(root, 'src'), path.join(root, 'dist'), { recursive:true });
await writeFile(path.join(root, 'dist/opportunities.json'), JSON.stringify(data, null, 2));
await writeFile(path.join(root, 'dist/data.js'), `window.__OPEN_CALL_DATA__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`);
await writeFile(path.join(root, 'dist/.nojekyll'), '');
console.log(`Built ${opportunities.length} opportunities → dist/`);
