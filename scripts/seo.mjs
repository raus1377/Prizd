/* Static, crawlable pages for search engines: one page per opportunity, one hub per category,
   sitemap.xml, robots.txt, 404.html and the head/browse snippets injected into the home page.
   Pure functions: build.mjs writes the result to dist/. */
await import('../src/logic.js');
const P = globalThis.Prizd;

export const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slugify = value => String(value).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export function clip(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—-]+$/, '') + '…';
}
const jsonLd = graph => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
const IST = 'Asia/Kolkata';
const day = (value, timeZone = IST) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST }).format(new Date(value));
const isoDay = value => (typeof value === 'string' && /^\d{4}-\d\d-\d\d/.test(value)) ? value.slice(0, 10) : null;

export function categoryInfo(settings, category, year) {
  const page = settings.categoryPages?.[category];
  const slug = page?.slug || slugify(category);
  return {
    category,
    slug,
    navName: page?.name || slug.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()),
    title: (page?.title || `${category} opportunities for students in {year}`).replaceAll('{year}', String(year)),
    h1: page?.h1 || category,
    intro: page?.intro || `${category} opportunities, with prize, deadline and eligibility on every listing.`
  };
}

export function deadlineText(o) {
  if (o.deadline) return `${day(o.deadline)}, ${time(o.deadline)} IST`;
  if (o.deadlineDate) return `${day(o.deadlineDate + 'T12:00:00Z', 'UTC')} (exact cutoff time not announced)`;
  return o.opensOn ? `Opens ${day(o.opensOn + 'T12:00:00Z', 'UTC')}` : 'To be confirmed';
}
const shortDeadline = o => o.deadline ? day(o.deadline) : o.deadlineDate ? day(o.deadlineDate + 'T12:00:00Z', 'UTC') : 'Date to confirm';
const prizePhrase = o => {
  if (o.prize.amount === null) return o.prize.kind === 'stipend' ? 'Paid' : o.prize.kind === 'none' ? 'No cash prize' : 'Prize to be announced';
  return `${P.prizeText(o)} ${{ pool: 'prize pool', first: 'first prize', stipend: 'stipend', undisclosed: 'prize', none: 'reward' }[o.prize.kind]}`;
};
const STATUS = { open: 'Open', upcoming: 'Upcoming', check: 'Check entry', closed: 'Closed' };

export function opportunityTitle(o, brand) {
  const long = `${o.title} — Prize & Deadline | ${brand}`;
  if (long.length <= 64) return long;
  const short = `${o.title} | ${brand}`;
  return short.length <= 64 ? short : `${clip(o.title, 64 - brand.length - 3)} | ${brand}`;
}
export function opportunityDescription(o) {
  const summary = o.summary.trim().replace(/[.\s]*$/, '.');
  return clip(`${summary} ${prizePhrase(o)}. Deadline: ${shortDeadline(o)}. Who can apply: ${o.eligibility}`, 158);
}
const lastModified = (o, fallback) => isoDay(o.checkedAt) || isoDay(o.researchAsOf) || isoDay(o.addedAt) || fallback;

export function buildSite({ settings, organizers, opportunities, archived = [], now, siteUrl = '' }) {
  const brand = settings.brand || settings.name;
  const year = new Date(now).getUTCFullYear();
  const site = String(siteUrl || '').replace(/\/+$/, '');
  const abs = rel => site ? `${site}/${rel}` : null;
  const ogImage = abs('og-image.png');
  const today = new Date(now).toISOString().slice(0, 10);
  const seoTitle = settings.seoTitle || `${brand} — ${settings.tagline || 'The Opportunity Index'}`;
  const seoDescription = settings.seoDescription || settings.description;
  const activeIds = new Set(opportunities.map(o => o.id));
  const archivedOnly = new Set(archived.filter(o => !activeIds.has(o.id)).map(o => o.id));
  const all = [...opportunities, ...archived.filter(o => archivedOnly.has(o.id))]; // archived listings keep their URL as "Closed" pages
  const status = o => archivedOnly.has(o.id) ? 'closed' : P.entryStatus(o, now);
  const inCategory = category => all.filter(o => o.category === category || (o.categories || []).includes(category));
  const hubs = settings.categories.map(c => ({ ...categoryInfo(settings, c, year), list: inCategory(c) })).filter(h => h.list.length > 0);
  for (const hub of hubs) hub.indexable = hub.list.length >= 3; // thin pages stay out of the index
  const regionHubs = Object.entries(settings.regionPages || {}).map(([region, page]) => ({
    category: null, region, slug: page.slug, navName: page.name || region, title: page.title.replaceAll('{year}', String(year)), h1: page.h1, intro: page.intro,
    list: all.filter(o => (o.region || 'Global') === region)
  })).filter(h => h.list.length > 0);
  for (const hub of regionHubs) hub.indexable = hub.list.length >= 3;
  const allHubs = [...hubs, ...regionHubs];
  const hubFor = category => hubs.find(h => h.category === category);
  const navHubs = [...regionHubs.filter(h => h.indexable), ...hubs.filter(h => h.indexable).sort((a, b) => b.list.length - a.list.length).slice(0, 3)];
  const pathOf = o => `${hubFor(o.category).slug}/${o.id}/`;
  const files = new Map();

  const crumbs = items => ({
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: abs(item.path) }))
  });

  function layout({ base, title, description, path, robots, jsonld = [], body }) {
    const canonical = abs(path);
    const tags = [
      `<meta charset="utf-8">`,
      `<meta name="viewport" content="width=device-width,initial-scale=1">`,
      `<meta name="theme-color" content="#281B38">`,
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}">`,
      robots ? `<meta name="robots" content="${robots}">` : '',
      canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '',
      `<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">`,
      `<meta property="og:site_name" content="${esc(brand)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '',
      ogImage ? `<meta property="og:image" content="${esc(ogImage)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${esc(ogImage)}">` : '',
      `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`,
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(description)}">`,
      `<link rel="stylesheet" href="${base}styles.css">`,
      `<link rel="stylesheet" href="${base}pages.css">`,
      `<link rel="stylesheet" href="${base}account.css">`,
      site && jsonld.length ? jsonLd(jsonld) : '',
      `<script defer src="${base}page.js"></script>`,
      `<script defer src="${base}config.js"></script>`,
      `<script defer src="${base}account.js"></script>`
    ].filter(Boolean).join('\n');
    return `<!doctype html>
<html lang="en">
<head>
${tags}
</head>
<body class="page">
<a class="skip-link" href="#main">Skip to content</a>
<div class="topline" aria-hidden="true"></div>
<header class="page-head"><a class="page-brand" href="${base}" aria-label="${esc(brand)} home">${esc(brand.toLowerCase())}<em>.</em></a><nav class="page-nav" aria-label="Main">${navHubs.map(h => `<a href="${base}${h.slug}/">${esc(h.navName)}</a>`).join('')}<a href="${base}#opportunities">Search the index ↗</a></nav></header>
<main id="main">
${body}
</main>
<footer class="page-foot"><a class="page-brand" href="${base}">${esc(brand.toLowerCase())}<em>.</em></a><nav aria-label="Browse by type">${allHubs.filter(h => h.indexable).map(h => `<a href="${base}${h.slug}/">${esc(h.navName)}</a>`).join('')}</nav><p>An independent index. Always confirm rules and deadlines on the official page.</p></footer>
</body>
</html>
`;
  }

  const row = (o, base) => {
    const s = status(o);
    return `<li class="row"><a class="row-title" href="${base}${pathOf(o)}">${esc(o.title)}</a><span class="row-org">${esc(o.organizer.name)}</span><span class="row-prize">${esc(prizePhrase(o))}</span><span class="row-date"><span class="status status-${s}">${STATUS[s]}</span> ${esc(shortDeadline(o))}</span></li>`;
  };

  // ---- one page per opportunity (active and archived)
  for (const o of all) {
    const hub = hubFor(o.category);
    const s = status(o);
    const closes = o.deadline && s === 'open' ? ` data-closes="${esc(o.deadline)}"` : '';
    const checked = isoDay(o.checkedAt) || isoDay(o.researchAsOf);
    const related = P.rank(inCategory(o.category).filter(x => x.id !== o.id && status(x) !== 'closed')).slice(0, 4);
    const title = opportunityTitle(o, brand);
    const description = opportunityDescription(o);
    const path = pathOf(o);
    const modified = lastModified(o, today);
    const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../../">${esc(brand)}</a><span aria-hidden="true">/</span><a href="../">${esc(hub.navName)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(o.title)}</span></nav>
<article class="opp">
<p class="kicker"><span class="organizer-icon" style="color:${esc(o.organizer.color)}" aria-hidden="true">${esc(o.organizer.monogram)}</span>${esc(o.organizer.name)} · ${esc(o.category)} <span class="status status-${s}"${closes}>${STATUS[s]}</span></p>
<h1>${esc(o.title)}</h1>
<p class="lede">${esc(o.summary)}</p>
<dl class="facts">
<div><dt>${esc(P.prizeKind(o))}</dt><dd>${esc(P.prizeText(o))}</dd></div>
<div><dt>Reward details</dt><dd>${esc(o.prize.description)}</dd></div>
<div><dt>${esc(o.deadlineLabel || 'Entry deadline')}</dt><dd>${o.deadline ? `<time datetime="${esc(o.deadline)}">${esc(deadlineText(o))}</time>` : esc(deadlineText(o))}</dd></div>
<div><dt>Format &amp; location</dt><dd>${esc(o.format)} · ${esc(o.location)}</dd></div>
<div><dt>Who can apply</dt><dd>${esc(o.eligibility)}</dd></div>
<div><dt>Team size</dt><dd>${esc(P.teamText(o))}</dd></div>
</dl>
${o.notes?.length ? `<section class="notes"><h2>Entry notes</h2><ul>${o.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
${o.tags?.length ? `<ul class="tags" aria-label="Tags">${o.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
<p class="actions">${o.url ? `<a class="cta" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Visit the official page <span aria-hidden="true">↗</span></a>` : '<span class="cta cta-off">Official link coming soon</span>'}${o.sourceUrl && o.sourceUrl !== o.url ? `<a class="text-link" href="${esc(o.sourceUrl)}" target="_blank" rel="noopener noreferrer">Rules / source <span aria-hidden="true">↗</span></a>` : ''}<a class="text-link" href="../../?category=${encodeURIComponent(o.category)}#opportunities">More ${esc(hub.navName.toLowerCase())} <span aria-hidden="true">↗</span></a></p>
<p class="fineprint">Added ${esc(day(o.addedAt))}${checked ? ` · Details checked ${esc(day(checked + 'T12:00:00Z', 'UTC'))}` : ''} · Always confirm the rules and deadline on the official page before you apply.</p>
</article>
<section class="signup-band" data-signup data-source="listing:${esc(o.id)}" data-title="Get alerts like this one." hidden></section>
${related.length ? `<section class="related"><h2>More ${esc(hub.navName.toLowerCase())}</h2><ul class="rows">${related.map(r => row(r, '../../')).join('')}</ul></section>` : ''}`;
    files.set(`${path}index.html`, layout({
      base: '../../', title, description, path, body,
      jsonld: [
        { '@type': 'WebPage', '@id': abs(path), url: abs(path), name: title, description, isPartOf: { '@id': abs('#website') }, datePublished: isoDay(o.addedAt) || today, dateModified: modified, breadcrumb: crumbs([{ name: brand, path: '' }, { name: hub.navName, path: `${hub.slug}/` }, { name: o.title, path }]) }
      ]
    }));
  }

  // ---- one hub per category
  for (const hub of allHubs) {
    const ranked = P.rank(hub.list);
    const filterQuery = hub.region ? `region=${encodeURIComponent(hub.region)}` : `category=${encodeURIComponent(hub.category)}`;
    const active = ranked.filter(o => status(o) !== 'closed');
    const past = ranked.filter(o => status(o) === 'closed');
    const description = clip(`${hub.intro} ${active.length} open now.`, 158);
    const path = `${hub.slug}/`;
    const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">${esc(brand)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(hub.navName)}</span></nav>
<h1>${esc(hub.h1)}</h1>
<p class="lede">${esc(hub.intro)}</p>
<p class="counts"><b>${active.length}</b> open or upcoming · <b>${past.length}</b> past · ranked by organizer priority, then prize and deadline</p>
<p class="actions"><a class="cta" href="../?${filterQuery}#opportunities">Filter and search ${esc(hub.navName.toLowerCase())} <span aria-hidden="true">↗</span></a></p>
${active.length ? `<ul class="rows">${active.map(o => row(o, '../')).join('')}</ul>` : '<p class="empty">No open listings right now. Check the past entries below or come back soon.</p>'}
${past.length ? `<h2>Past and closed</h2><ul class="rows">${past.map(o => row(o, '../')).join('')}</ul>` : ''}
<section class="signup-band" data-signup data-source="hub:${esc(hub.slug)}" data-title="Get ${esc(hub.navName.toLowerCase())} in your inbox." hidden></section>
<section class="related"><h2>Browse other types</h2><ul class="tags">${allHubs.filter(h => h.indexable && h !== hub).map(h => `<li><a href="../${h.slug}/">${esc(h.navName)}</a></li>`).join('')}</ul></section>`;
    files.set(`${path}index.html`, layout({
      base: '../', title: `${hub.title} | ${brand}`.length <= 64 ? `${hub.title} | ${brand}` : hub.title, description, path, body,
      robots: hub.indexable ? '' : 'noindex,follow',
      jsonld: [
        { '@type': 'CollectionPage', '@id': abs(path), url: abs(path), name: hub.title, description, isPartOf: { '@id': abs('#website') }, breadcrumb: crumbs([{ name: brand, path: '' }, { name: hub.navName, path }]) },
        { '@type': 'ItemList', itemListElement: ranked.map((o, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(pathOf(o)), name: o.title })) }
      ]
    }));
  }

  // ---- privacy page (linked from every consent box)
  const contact = settings.contactEmail ? `Questions or requests: <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>.` : 'You can unsubscribe from any email with its unsubscribe link, and delete your account and data yourself from the Account panel.';
  files.set('privacy/index.html', layout({
    base: '../', title: `Privacy | ${brand}`, description: `What ${brand} collects, why, and how to remove it.`, path: 'privacy/', robots: 'noindex,follow',
    body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">${esc(brand)}</a><span aria-hidden="true">/</span><span aria-current="page">Privacy</span></nav>
<div class="privacy">
<h1>Privacy</h1>
<p class="lede">${esc(brand)} is a free index of hackathons, case competitions and internships. We keep as little about you as we can, and only what a feature needs.</p>
<h2>What we collect</h2>
<ul>
<li><b>If you sign in with Google:</b> your name, email address and profile picture, and the opportunities you save.</li>
<li><b>If you leave an email:</b> your email address and the topics you ticked (hackathons, internships, case comps).</li>
<li><b>If you add a WhatsApp number:</b> that number, only for deadline alerts you asked for.</li>
<li><b>When you agree:</b> the time you agreed and the page you agreed on, so we can show your consent was given.</li>
<li>If you arrive through a friend's invite link, we note the invite code.</li>
</ul>
<h2>Why</h2>
<ul>
<li>To keep your shortlist across devices and unlock filters.</li>
<li>To send the weekly digest and deadline reminders you opted into. We never send anything else, and we never sell or rent your data.</li>
</ul>
<h2>Who handles it</h2>
<p>Google confirms your identity. Supabase stores the data. Resend delivers email. Each acts only on our instructions to run the service.</p>
<h2>Your choices</h2>
<ul>
<li>Every email has an unsubscribe link, and it works at once.</li>
<li>Email signups are double opt-in: nothing is sent until you tap the link in the confirmation email.</li>
<li>Signed-in users can change preferences or delete their account and data from the Account panel at any time.</li>
</ul>
<p>${contact}</p>
</div>`
  }));

  // ---- 404, robots, sitemap
  files.set('404.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | ${esc(brand)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#ecebea;color:#111110;font-family:Arial,Helvetica,sans-serif;text-align:center;padding:24px}h1{font-size:clamp(48px,12vw,140px);letter-spacing:-.06em;line-height:.9;margin:0 0 24px}a{color:#111110;font-weight:700;border-bottom:1px solid #111110}</style></head>
<body><main><h1>404<span style="color:#d04476">.</span></h1><p>That page has moved or never existed.</p><p><a href="${esc(site || '.')}/">Back to ${esc(brand)}</a></p></main></body></html>
`);
  if (site) {
    files.set('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
    const urls = [{ loc: abs(''), lastmod: today }];
    for (const hub of allHubs) if (hub.indexable) urls.push({ loc: abs(`${hub.slug}/`), lastmod: today });
    for (const o of all) urls.push({ loc: abs(pathOf(o)), lastmod: lastModified(o, today) });
    files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  } else {
    files.set('robots.txt', 'User-agent: *\nAllow: /\n');
  }

  // ---- snippets for the home page
  const newest = [...opportunities].filter(o => status(o) !== 'closed').sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt)).slice(0, 8);
  const browse = `<section id="browse" class="browse-section" aria-labelledby="browse-title">
      <span class="kicker"><span class="smallburst" aria-hidden="true">✳</span> Browse by type</span>
      <h2 id="browse-title">Every type,<br><em>one page.</em></h2>
      <div class="browse-grid">${allHubs.filter(h => h.indexable).map(h => `<a href="${h.slug}/"><span>${esc(h.navName)}</span><b>${h.list.length}</b></a>`).join('')}</div>
      <h3 class="browse-sub">Latest additions</h3>
      <ul class="browse-latest">${newest.map(o => `<li><a href="${pathOf(o)}">${esc(o.title)}</a><span>${esc(o.organizer.name)} · ${esc(prizePhrase(o))}</span></li>`).join('')}</ul>
    </section>`;
  const homeHead = [
    abs('') ? `<link rel="canonical" href="${esc(abs(''))}">` : '',
    `<meta property="og:site_name" content="${esc(brand)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(seoTitle)}"><meta property="og:description" content="${esc(seoDescription)}">`,
    abs('') ? `<meta property="og:url" content="${esc(abs(''))}">` : '',
    ogImage ? `<meta property="og:image" content="${esc(ogImage)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${esc(ogImage)}">` : '',
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(seoTitle)}"><meta name="twitter:description" content="${esc(seoDescription)}">`,
    site ? jsonLd([
      { '@type': 'WebSite', '@id': abs('#website'), url: abs(''), name: brand, description: seoDescription, publisher: { '@id': abs('#org') } },
      { '@type': 'Organization', '@id': abs('#org'), name: brand, url: abs(''), logo: abs('og-image.png') }
    ]) : ''
  ].filter(Boolean).join('\n  ');

  return { files, home: { title: seoTitle, description: seoDescription, head: homeHead, browse }, hubs: allHubs.map(h => ({ slug: h.slug, category: h.category || h.region, count: h.list.length, indexable: h.indexable })), pathOf };
}
