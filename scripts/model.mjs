import { execFileSync } from 'node:child_process';

export const DAY = 86_400_000;
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
}
export function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function safeUrl(value) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
export function validateSettings(settings, organizers) {
  if (!settings.name || !Array.isArray(settings.categories) || !settings.categories.length) throw new Error('settings: name and categories are required');
  if (!Number.isInteger(settings.newWindowDays) || settings.newWindowDays < 1) throw new Error('settings: newWindowDays must be a positive integer');
  if (!['prestige','prize','deadline','newest'].includes(settings.defaultSort)) throw new Error('settings: invalid defaultSort');
  for (const [currency, rate] of Object.entries(settings.prizeUsdRates || {})) if (!/^[A-Z]{3}$/.test(currency) || !(Number.isFinite(rate) && rate > 0)) throw new Error('settings: invalid prize exchange rate');
  const ids = new Set();
  for (const o of organizers) {
    if (!o.id || ids.has(o.id) || !o.name || !['Company','College','Organization','Community'].includes(o.kind) || !Number.isFinite(o.prestige) || o.prestige < 0 || o.prestige > 100) throw new Error(`Invalid or duplicate organizer: ${o.id}`);
    if ((o.website !== undefined && o.website !== null && !safeUrl(o.website)) || !/^#[a-f\d]{6}$/i.test(o.color)) throw new Error(`Invalid URL or color for organizer: ${o.id}`);
    ids.add(o.id);
  }
}
export function validateOpportunity(o, file, settings, organizers) {
  const fail = message => { throw new Error(`${file}: ${message}`); };
  for (const key of ['id','title','category','organizerId','summary','location','format','eligibility']) if (typeof o[key] !== 'string' || !o[key].trim()) fail(`${key} is required`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(o.id)) fail('id must be a lowercase slug');
  if (!settings.categories.includes(o.category)) fail(`category must be one of ${settings.categories.join(', ')}`);
  if (!organizers.some(x => x.id === o.organizerId)) fail(`unknown organizerId: ${o.organizerId}; add it to data/organizers.json`);
  if (!['Online','In person','Hybrid','To confirm'].includes(o.format)) fail('format must be Online, In person, Hybrid, or To confirm');
  if (o.url !== undefined && o.url !== null && !safeUrl(o.url)) fail('url must be null or use https:// or http://');
  if (o.sourceUrl !== undefined && !safeUrl(o.sourceUrl)) fail('sourceUrl must use https:// or http://');
  if (o.deadline !== null && !validDate(o.deadline)) fail('deadline must be null or a timestamp with timezone, e.g. 2026-11-02T18:00:00+05:30');
  if (o.addedAt !== undefined && !validDate(o.addedAt)) fail('addedAt must be an ISO timestamp with timezone');
  if (o.deadlineDate !== undefined && !validDay(o.deadlineDate)) fail('deadlineDate must be a real YYYY-MM-DD date');
  if (o.opensOn !== undefined && !validDay(o.opensOn)) fail('opensOn must be a real YYYY-MM-DD date');
  if (o.eventEndDate !== undefined && !validDay(o.eventEndDate)) fail('eventEndDate must be a real YYYY-MM-DD date');
  if (o.entryStatus !== undefined && !['open','upcoming','check','closed'].includes(o.entryStatus)) fail('entryStatus must be open, upcoming, check, or closed');
  if (o.deadlineTimezone !== undefined) { try { new Intl.DateTimeFormat('en',{timeZone:o.deadlineTimezone}).format(); } catch { fail('deadlineTimezone must be a valid timezone'); } }
  if (o.eventTimezone !== undefined) { try { new Intl.DateTimeFormat('en',{timeZone:o.eventTimezone}).format(); } catch { fail('eventTimezone must be a valid timezone'); } }
  if (o.notes !== undefined && (!Array.isArray(o.notes) || o.notes.some(n => typeof n !== 'string'))) fail('notes must be an array of strings');
  if (o.categories !== undefined && (!Array.isArray(o.categories) || o.categories.some(c => !settings.categories.includes(c)))) fail('categories must contain configured category labels');
  if (!Array.isArray(o.tags) || o.tags.some(t => typeof t !== 'string')) fail('tags must be an array of strings');
  if (o.team !== null && (!o.team || !Number.isInteger(o.team.min) || o.team.min < 1 || (o.team.max !== null && (!Number.isInteger(o.team.max) || o.team.max < o.team.min)))) fail('team must be null, or have positive min and max (max can be null if unknown)');
  if (!o.prize || !['pool','first','none','undisclosed'].includes(o.prize.kind)) fail('prize.kind must be pool, first, none, or undisclosed');
  if (typeof o.prize.description !== 'string' || !o.prize.description.trim()) fail('prize.description is required');
  if (o.prize.amount !== null && (!Number.isFinite(o.prize.amount) || o.prize.amount < 0)) fail('prize.amount must be null or a nonnegative number');
  if (!/^[A-Z]{3}$/.test(o.prize.currency || '')) fail('prize.currency must be a three-letter code');
  if (o.prize.usdEquivalent !== undefined && (!Number.isFinite(o.prize.usdEquivalent) || o.prize.usdEquivalent < 0)) fail('prize.usdEquivalent must be nonnegative');
  if (o.prize.amount !== null && o.prize.usdEquivalent === undefined && !settings.prizeUsdRates[o.prize.currency]) fail('add an exchange rate for prize.currency or set prize.usdEquivalent');
}
export function gitAddedAt(root, relativePath) {
  try {
    const values = execFileSync('git', ['log','--follow','--diff-filter=A','--format=%cI','--',relativePath], { cwd: root, encoding:'utf8', stdio:['ignore','pipe','ignore'] }).trim().split('\n').filter(Boolean);
    return values.at(-1) || null;
  } catch { return null; }
}
export function normalizeOpportunity(o, organizer, settings, addedAt, now) {
  return {
    ...o,
    organizer,
    addedAt: addedAt || o.addedAt || new Date(now).toISOString(),
    prizeUsd: o.prize.usdEquivalent ?? (o.prize.amount === null ? 0 : o.prize.amount * settings.prizeUsdRates[o.prize.currency])
  };
}
