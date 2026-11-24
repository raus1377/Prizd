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
for (const id of settings.featured || []) if (!ids.has(id)) console.warn(`⚠ settings.featured lists "${id}" but no active listing has that id; it is ignored.`);


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
const publicCategories = ['Hackathon', 'Research', 'Case competition'];
const publicSettings = { ...settings, categories: publicCategories, categoryPages: Object.fromEntries(publicCategories.map(c => [c, settings.categoryPages[c]])), regionPages: {}, keywordPages: [], seoTitle: 'Prizd — Hackathons, Research Opportunities & Case Competitions', seoDescription: 'Discover hackathons, research opportunities and case competitions. Compare eligibility, funding and deadlines, then apply on the official page.' };
function publicListing(o) {
  const labels = [o.category, ...(o.categories || [])].map(c => c === 'Research internship' ? 'Research' : c);
  const category = publicCategories.includes(labels[0]) ? labels[0] : publicCategories.find(c => labels.includes(c));
  if (!category) return null;
  return { ...o, originalCategory: o.category, category, categories: [...new Set(labels.filter(c => publicCategories.includes(c)))], detailPath: publicSettings.categoryPages[category].slug + '/' + o.id + '/' };
}
const publicOpportunities = opportunities.map(publicListing).filter(Boolean);
const publicArchived = archived.map(publicListing).filter(Boolean);
const data = { settings: publicSettings, organizers, opportunities: publicOpportunities, builtAt: new Date(now).toISOString() };
const seo = buildSite({ settings: publicSettings, organizers, opportunities: publicOpportunities, archived: publicArchived, now, siteUrl });

const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'src'), dist, { recursive: true });
await writeFile(path.join(dist, 'opportunities.json'), JSON.stringify(data, null, 2));
await writeFile(path.join(dist, 'data.js'), `window.__PRIZD_DATA__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`);
// Public browser config for accounts/alerts. The anon key is meant to be public; row-level security protects the data.
const backend = settings.backend || {};
const publicConfig = backend.supabaseUrl && backend.supabaseAnonKey
  ? { supabaseUrl: backend.supabaseUrl, supabaseAnonKey: backend.supabaseAnonKey, functionsUrl: `${backend.supabaseUrl}/functions/v1` }
  : {};
await writeFile(path.join(dist, 'config.js'), `window.PRIZD_CONFIG = ${JSON.stringify(publicConfig)};\n`);
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
