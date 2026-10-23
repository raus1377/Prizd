import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validateSettings, validateOpportunity, normalizeOpportunity, cleanUrl } from '../scripts/model.mjs';
import { buildSite, opportunityTitle, opportunityDescription, esc, clip } from '../scripts/seo.mjs';

const now = Date.parse('2026-10-23T06:00:00Z');
const DAY = 86_400_000;
const organizer = { id: 'o', name: 'Organizer', kind: 'College', prestige: 90, monogram: 'O', color: '#111111', website: 'https://example.com' };
const settings = {
  name: 'PRIZD', brand: 'Prizd', newWindowDays: 7, defaultSort: 'prestige', prizeUsdRates: { USD: 1 },
  categories: ['Hackathon', 'Research internship', 'Design'],
  categoryPages: {
    'Hackathon': { slug: 'hackathons', title: 'Hackathons in {year}', h1: 'Hackathons', intro: 'Intro.' },
    'Research internship': { slug: 'research-internships', title: 'Internships in {year}', h1: 'Internships', intro: 'Intro.' },
    'Design': { slug: 'design-competitions', title: 'Design in {year}', h1: 'Design', intro: 'Intro.' }
  },
  regionPages: { India: { slug: 'india', name: 'India', title: 'India in {year}', h1: 'Opportunities in India', intro: 'Intro.' } }
};
const make = (id, changes = {}) => normalizeOpportunity({
  id, title: `Title ${id}`, category: 'Hackathon', organizerId: 'o', summary: 'A challenge.', deadline: new Date(now + 5 * DAY).toISOString(),
  location: 'Worldwide', format: 'Online', eligibility: 'Students.', team: null, tags: ['AI'], url: 'https://example.com/a?utm_source=x&id=7',
  entryStatus: 'open', notes: [], prize: { amount: 1000, currency: 'USD', kind: 'pool', description: 'Cash.' }, ...changes
}, organizer, settings, '2026-10-01T00:00:00Z', now);
const opportunities = [make('a', { region: 'India' }), make('b', { region: 'India' }), make('c', { region: 'India' }), make('d', { region: 'India', category: 'Research internship', prize: { amount: null, currency: 'USD', kind: 'stipend', description: 'Paid.' } }), make('e', { category: 'Design' })];

test('every opportunity gets a page, hubs with 3+ listings are indexable, thin hubs are noindex and out of the sitemap', () => {
  const site = buildSite({ settings, organizers: [organizer], opportunities, now, siteUrl: 'https://prizd.example/' });
  for (const o of opportunities) assert.ok(site.files.has(`${site.pathOf(o)}index.html`), o.id);
  assert.match(site.files.get('hackathons/index.html'), /<h1>Hackathons<\/h1>/);
  assert.doesNotMatch(site.files.get('hackathons/index.html'), /noindex/);
  assert.match(site.files.get('design-competitions/index.html'), /<meta name="robots" content="noindex,follow">/);
  const sitemap = site.files.get('sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/prizd\.example\/hackathons\/a\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/prizd\.example\/hackathons\/<\/loc>/);
  assert.doesNotMatch(sitemap, /design-competitions\/<\/loc>/);
  assert.match(site.files.get('robots.txt'), /Sitemap: https:\/\/prizd\.example\/sitemap\.xml/);
});

test('listings without an official link, archived listings and the India page are handled', () => {
  const noLink = make('nolink', { url: null });
  const old = make('old-edition', { deadline: new Date(now - 30 * DAY).toISOString() });
  const site = buildSite({ settings, organizers: [organizer], opportunities: [...opportunities, noLink], archived: [old, make('a')], now, siteUrl: 'https://prizd.example' });
  assert.match(site.files.get('hackathons/nolink/index.html'), /Official link coming soon/);
  assert.doesNotMatch(site.files.get('hackathons/nolink/index.html'), /href="null"|href="undefined"/);
  const archivedPage = site.files.get('hackathons/old-edition/index.html');
  assert.match(archivedPage, /status-closed/);
  assert.match(site.files.get('sitemap.xml'), /hackathons\/old-edition\//);
  assert.match(site.files.get('hackathons/index.html'), /Past and closed[\s\S]*old-edition/);
  assert.equal([...site.files.keys()].filter(k => k.includes('/a/index.html')).length, 1); // an archived duplicate id never replaces the active listing
  const india = site.files.get('india/index.html');
  assert.match(india, /<h1>Opportunities in India<\/h1>/);
  assert.match(india, /region=India#opportunities/);
  assert.match(site.files.get('sitemap.xml'), /prizd\.example\/india\//);
});

test('canonical, social tags and valid JSON-LD are present with a site URL; all are skipped without one', () => {
  const withUrl = buildSite({ settings, organizers: [organizer], opportunities, now, siteUrl: 'https://prizd.example' });
  const page = withUrl.files.get('hackathons/a/index.html');
  assert.match(page, /<link rel="canonical" href="https:\/\/prizd\.example\/hackathons\/a\/">/);
  assert.match(page, /og:image" content="https:\/\/prizd\.example\/og-image\.png"/);
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.equal(blocks.length, 1);
  const graph = JSON.parse(blocks[0][1])['@graph'];
  assert.equal(graph[0]['@type'], 'WebPage');
  assert.equal(graph[0].breadcrumb.itemListElement.length, 3);
  const without = buildSite({ settings, organizers: [organizer], opportunities, now, siteUrl: '' });
  const bare = without.files.get('hackathons/a/index.html');
  assert.doesNotMatch(bare, /rel="canonical"|ld\+json|og:url/);
  assert.equal(without.files.has('sitemap.xml'), false);
  assert.doesNotMatch(without.files.get('robots.txt'), /Sitemap/);
});

test('titles stay short and unique, descriptions stay within snippet length', () => {
  const long = make('long', { title: 'An extraordinarily long competition title that keeps going well past any sensible search result width' });
  assert.ok(opportunityTitle(long, 'Prizd').length <= 64);
  assert.ok(opportunityTitle(make('x'), 'Prizd').includes('Prize & Deadline'));
  assert.ok(opportunityDescription(make('y', { eligibility: 'x'.repeat(400) })).length <= 158);
  const site = buildSite({ settings, organizers: [organizer], opportunities, now, siteUrl: 'https://prizd.example' });
  const titles = [...site.files].filter(([k]) => k !== '404.html' && k.endsWith('.html')).map(([, h]) => h.match(/<title>(.*?)<\/title>/)[1]);
  assert.equal(new Set(titles).size, titles.length);
});

test('listing text is HTML-escaped and cannot break out of JSON-LD', () => {
  const evil = make('evil', { title: '<script>alert(1)</script> "Cup"', summary: 'x</script><b>y' });
  const site = buildSite({ settings, organizers: [organizer], opportunities: [evil, ...opportunities], now, siteUrl: 'https://prizd.example' });
  const page = site.files.get('hackathons/evil/index.html');
  assert.doesNotMatch(page, /<script>alert/);
  assert.equal([...page.matchAll(/<script/g)].length, 2); // JSON-LD + page.js only
  assert.equal(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  assert.ok(clip('word '.repeat(50), 40).endsWith('…'));
});

test('tracking parameters are removed from outbound links but real parameters stay', () => {
  assert.equal(cleanUrl('https://example.com/a?utm_source=chatgpt.com&id=7&UTM_medium=x'), 'https://example.com/a?id=7');
  assert.equal(cleanUrl('https://example.com/?utm_source=chatgpt.com'), 'https://example.com/');
  assert.equal(cleanUrl('not a url'), 'not a url');
  assert.equal(opportunities[0].url, 'https://example.com/a?id=7');
});

test('settings validation rejects a bad site URL and colliding category slugs', () => {
  const base = { ...settings, siteUrl: '' };
  assert.doesNotThrow(() => validateSettings({ ...base, siteUrl: 'https://prizd.in' }, [organizer]));
  assert.throws(() => validateSettings({ ...base, siteUrl: 'prizd.in' }, [organizer]), /siteUrl/);
  assert.throws(() => validateSettings({ ...base, categoryPages: { ...settings.categoryPages, Design: { ...settings.categoryPages.Design, slug: 'hackathons' } } }, [organizer]), /unique lowercase slug/);
  assert.throws(() => validateSettings({ ...base, categoryPages: { ...settings.categoryPages, Design: { ...settings.categoryPages.Design, slug: 'sitemap' } } }, [organizer]), /unique lowercase slug/);
  assert.throws(() => validateSettings({ ...base, regionPages: { Mars: settings.regionPages.India } }, [organizer]), /unknown region/);
  assert.throws(() => validateSettings({ ...base, regionPages: { India: { ...settings.regionPages.India, slug: 'hackathons' } } }, [organizer]), /unique lowercase slug/);
});

test('the real repository data builds into pages whose internal links all resolve', async () => {
  const read = async relative => JSON.parse(await readFile(new URL(`../${relative}`, import.meta.url), 'utf8'));
  const realSettings = await read('data/settings.json');
  const organizers = await read('data/organizers.json');
  validateSettings(realSettings, organizers);
  const real = [];
  for (const file of (await readdir(new URL('../data/opportunities/', import.meta.url))).filter(f => f.endsWith('.json'))) {
    const o = await read(`data/opportunities/${file}`);
    validateOpportunity(o, file, realSettings, organizers);
    real.push(normalizeOpportunity(o, organizers.find(x => x.id === o.organizerId), realSettings, null, now));
  }
  const archived = [];
  for (const file of (await readdir(new URL('../data/archive/', import.meta.url))).filter(f => f.endsWith('.json'))) {
    const o = await read(`data/archive/${file}`);
    validateOpportunity(o, file, realSettings, organizers);
    archived.push(normalizeOpportunity(o, organizers.find(x => x.id === o.organizerId), realSettings, null, now));
  }
  const site = buildSite({ settings: realSettings, organizers, opportunities: real, archived, now, siteUrl: 'https://prizd.example' });
  assert.equal([...site.files.keys()].filter(k => /\/.+\/index\.html$/.test(k)).length, real.length + archived.length);
  const keys = new Set(site.files.keys());
  for (const [file, html] of site.files) {
    if (!file.endsWith('.html')) continue;
    const dir = file.split('/').slice(0, -1);
    for (const [, href] of html.matchAll(/(?:href|src)="([^"#?:]+)(?:[?#][^"]*)?"/g)) {
      if (/^(https?|mailto)/.test(href)) continue;
      const parts = [...dir];
      for (const seg of href.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
      const target = parts.join('/');
      const ok = href.endsWith('/') ? keys.has(`${target}/index.html`) || (target === '' && true) : keys.has(target) || /\.(css|js|svg|png)$/.test(target);
      assert.ok(ok, `${file} links to missing ${href}`);
    }
  }
});
