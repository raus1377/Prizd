import { readFile, readdir, mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateSettings, validateOpportunity, gitAddedAt, normalizeOpportunity } from './model.mjs';
import { buildSite, esc } from './seo.mjs';
import '../src/logic.js';

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
const publicCategories = ['Hackathon', 'Research', 'Case competition', 'Others'];
const publicSettings = { ...settings, categories: publicCategories, categoryPages: Object.fromEntries(publicCategories.map(c => [c, settings.categoryPages[c]])), regionPages: {}, keywordPages: [], seoTitle: 'Prizd — Hackathons, Research & Competitions', seoDescription: 'Discover hackathons, research opportunities, case competitions and other contests. Compare eligibility, funding and deadlines, then apply on the official page.' };
function publicListing(o) {
  const labels = [o.category, ...(o.categories || [])].map(c => c === 'Research internship' ? 'Research' : c);
  const category = publicCategories.includes(labels[0]) ? labels[0] : publicCategories.find(c => labels.includes(c));
  const displayCategory = category || (o.category === 'Internship' ? 'Research' : 'Others');
  const page = settings.categoryPages[displayCategory];
  return { ...o, originalCategory: o.category, category: displayCategory, categories: [...new Set(labels.filter(c => publicCategories.includes(c)))], detailPath: (page?.slug || displayCategory.toLowerCase().replace(/[^a-z0-9]+/g,'-')) + '/' + o.id + '/' };
}
const publicOpportunities = opportunities.filter(o => !globalThis.Prizd.isClosed(o, now)).map(publicListing).filter(Boolean);
const publicArchived = archived.map(o => publicListing({...o,entryStatus:'closed'})).filter(Boolean);
const { backend: _privateBackend, ...browserSettings } = publicSettings;
const data = { settings: browserSettings, organizers, opportunities: publicOpportunities, builtAt: new Date(now).toISOString() };
const seoSettings = { ...publicSettings, categories: settings.categories, categoryPages: settings.categoryPages };
const seo = buildSite({ settings: seoSettings, organizers, opportunities: publicOpportunities, archived: publicArchived, now, siteUrl });

const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'src'), dist, { recursive: true });
await writeFile(path.join(dist, 'opportunities.json'), JSON.stringify(data, null, 2));
await writeFile(path.join(dist, 'data.js'), `window.__PRIZD_DATA__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`);
// Public browser config for accounts/alerts. The anon key is meant to be public; row-level security protects the data.
const backend = settings.backend || {};
const supabaseUrl = process.env.PRIZD_SUPABASE_URL || backend.supabaseUrl || '';
const supabaseAnonKey = process.env.PRIZD_SUPABASE_PUBLIC_KEY || backend.supabaseAnonKey || '';
const isPublicKey = key => { if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true; try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { return false; } };
if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey) || (supabaseUrl && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl) || !isPublicKey(supabaseAnonKey)))) throw new Error('Invalid public Supabase configuration; never use a service-role or secret key in browser configuration.');
const publicConfig = supabaseUrl ? { supabaseUrl, supabaseAnonKey, functionsUrl: `${supabaseUrl}/functions/v1`, alertsEnabled: process.env.PRIZD_ALERTS_ENABLED === 'true' } : {};
await writeFile(path.join(dist, 'config.js'), `window.PRIZD_CONFIG = ${JSON.stringify(publicConfig)};\n`);
await writeFile(path.join(dist, '.nojekyll'), '');

let home = await readFile(path.join(root, 'src/index.html'), 'utf8');
home = home
  .replace('{{SEO_TITLE}}', esc(seo.home.title))
  .replace('{{SEO_DESCRIPTION}}', esc(seo.home.description))
  .replace('<!--SEO_HEAD-->', seo.home.head)
  .replace('<!--BROWSE-->', seo.home.browse)
  .replace(/(src|href)="\.\/([\w-]+\.(?:js|css))"/g, (_, attr, asset) => `${attr}="./${asset}?v=${now}"`);
await writeFile(path.join(dist, 'index.html'), home);

// Dedicated full catalog: reuse the accessible filters, without the landing-page hero.
const catalogSource = await readFile(path.join(root, 'src/index.html'), 'utf8');
const catalog = catalogSource
  .replace('{{SEO_TITLE}}', 'All Opportunities | Prizd')
  .replace('{{SEO_DESCRIPTION}}', 'Browse and filter all current opportunities.')
  .replace('<!--SEO_HEAD-->', '<meta name="robots" content="noindex,follow">')
  .replace(/<section id="top" class="hero"[\s\S]*?<\/section>/, '<div id="top"><div id="hero-shortlist" hidden></div></div>')
  .replace(/<div class="band" aria-hidden="true">[\s\S]*?<\/div><\/div>/, '')
  .replace(/<div class="index-heading">[\s\S]*?<\/div>/, '<div class="index-heading"><h2 id="index-title">All <em>opportunities.</em></h2><p><a href="../">← Back to homepage</a></p></div>')
  .replace('<!--BROWSE-->', '')
  .replace(/<section id="about"[\s\S]*?<\/section>/, '')
  .replace(/href="#(?:browse|about)"/g, 'href="../#browse"')
  .replace(/href="#top" class="brand/g, 'href="../" class="brand')
  .replace(/(src|href)="\.\//g, '$1="../')
  .replace(/(src|href)="\.\.\/([\w-]+\.(?:js|css))"/g, (_, attr, asset) => attr + '="../' + asset + '?v=' + now + '"');
await mkdir(path.join(dist, 'opportunities'), {recursive:true});
await writeFile(path.join(dist, 'opportunities/index.html'), catalog);
if (!catalog.includes('All <em>opportunities.</em>') || catalog.includes('id="hero-heading"')) throw new Error('Dedicated catalog page was not generated correctly');

for (const [relative, content] of seo.files) {
  const target = path.join(dist, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
console.log(`Built ${opportunities.length} opportunities (+${archived.length} archived pages) → dist/ (${seo.files.size} generated files, ${seo.hubs.filter(h => h.indexable).length} category pages)`);
