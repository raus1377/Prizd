// Tells Bing and other IndexNow search engines about pages that changed recently, so new listings get crawled within hours.
//   node scripts/indexnow.mjs https://your-site.example      (run after the site is deployed)
// Reads the live sitemap, picks URLs whose <lastmod> is within the last 2 days (use --all for everything) and posts them.
// Never fails the deploy: problems are printed as warnings.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export function recentUrls(sitemapXml, now = Date.now(), days = 2) {
  const out = [];
  for (const [, block] of sitemapXml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    if (!loc) continue;
    if (!lastmod || Date.parse(lastmod) >= now - days * 86_400_000) out.push(loc.replace(/&amp;/g, '&'));
  }
  return out;
}

export async function main(siteArg, { all = false, now = Date.now() } = {}) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const settings = JSON.parse(await readFile(path.join(root, 'data/settings.json'), 'utf8'));
  const key = settings.indexNowKey;
  const site = String(siteArg || '').replace(/\/+$/, '');
  if (!key || !site) { console.log('IndexNow skipped: needs settings.indexNowKey and a site URL.'); return 0; }
  try {
    const res = await fetch(`${site}/sitemap.xml`);
    if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`);
    const urls = all ? recentUrls(await res.text(), now, Infinity) : recentUrls(await res.text(), now);
    if (!urls.length) { console.log('IndexNow: nothing changed recently.'); return 0; }
    const post = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList: urls.slice(0, 10000) })
    });
    console.log(`IndexNow: submitted ${Math.min(urls.length, 10000)} URL(s), response ${post.status}.`);
  } catch (error) { console.warn(`IndexNow warning: ${error.message}`); }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main(process.argv[2], { all: process.argv.includes('--all') });
