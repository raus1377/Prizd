import { readFile, readdir, mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateSettings, validateOpportunity, gitAddedAt, normalizeOpportunity } from './model.mjs';
import { buildSite, esc } from './seo.mjs';

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

// Archived listings are not shown in the app, but their pages stay online as "Closed" so search engines keep the URLs.
const archived = [];
let archiveFiles = [];
try { archiveFiles = (await readdir(path.join(root, 'data/archive'))).filter(x => x.endsWith('.json')).sort(); } catch { /* no archive yet */ }
for (const file of archiveFiles) {
  const relative = `data/archive/${file}`;
  try {
    const o = await readJson(relative);
    validateOpportunity(o, relative, settings, organizers);
    if (ids.has(o.id)) continue;
    archived.push(normalizeOpportunity(o, organizers.find(x => x.id === o.organizerId), settings, gitAddedAt(root, relative), now));
  } catch (error) { console.warn(`⚠ Skipped archived listing ${relative}: ${error.message}`); }
}

// The public site address: SITE_URL (set by the GitHub Actions workflow) wins over settings.siteUrl.
const siteUrl = (process.env.SITE_URL || settings.siteUrl || '').replace(/\/+$/, '');
if (!siteUrl) console.warn('⚠ No site URL: canonical tags, structured data and sitemap.xml are skipped. Set SITE_URL or "siteUrl" in data/settings.json.');
const seo = buildSite({ settings, organizers, opportunities, archived, now, siteUrl });

const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'src'), dist, { recursive: true });
await writeFile(path.join(dist, 'opportunities.json'), JSON.stringify(data, null, 2));
await writeFile(path.join(dist, 'data.js'), `window.__PRIZD_DATA__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`);
await writeFile(path.join(dist, '.nojekyll'), '');

let home = await readFile(path.join(root, 'src/index.html'), 'utf8');
home = home
  .replace('{{SEO_TITLE}}', esc(seo.home.title))
  .replace('{{SEO_DESCRIPTION}}', esc(seo.home.description))
  .replace('<!--SEO_HEAD-->', seo.home.head)
  .replace('<!--BROWSE-->', seo.home.browse);
await writeFile(path.join(dist, 'index.html'), home);

for (const [relative, content] of seo.files) {
  const target = path.join(dist, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
console.log(`Built ${opportunities.length} opportunities (+${archived.length} archived pages) → dist/ (${seo.files.size} generated files, ${seo.hubs.filter(h => h.indexable).length} category pages)`);
