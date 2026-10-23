// Sends the weekly digest and 48-hour deadline reminders.
//   node scripts/digest.mjs weekly      one mail per confirmed subscriber / opted-in user, matched to their interests
//   node scripts/digest.mjs reminders   saved opportunities closing within 48 hours, once each
// Needs a built site (npm run build) so it can read dist/opportunities.json.
// Without SUPABASE_SERVICE_KEY + RESEND_API_KEY it is a dry run that only prints what it would send.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import '../src/logic.js';

const HOUR = 3_600_000;
export const INTEREST_CATEGORIES = {
  'Hackathons': ['Hackathon'],
  'Internships': ['Internship', 'Research internship'],
  'Case comps': ['Case competition', 'Consulting', 'Finance', 'Marketing', 'Economics', 'Product', 'Sales', 'Psychology', 'Policy']
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Deadline as a timestamp. Date-only deadlines count until the end of that day in India. */
export function deadlineMs(o) {
  if (o.deadline) return Date.parse(o.deadline);
  if (o.deadlineDate) return Date.parse(`${o.deadlineDate}T23:59:59+05:30`);
  return null;
}

/** Does this listing fit the chosen chips? No chips means everything. */
export function matchesInterests(o, interests) {
  if (!interests || !interests.length) return true;
  const cats = new Set([o.category, ...(o.categories || [])]);
  return interests.some(i => (INTEREST_CATEGORIES[i] || []).some(c => cats.has(c)));
}

/** Up to `limit` open listings for one person: new ones first, then the highest-ranked, region-agnostic. */
export function pickForDigest(opportunities, interests, now, { limit = 8, windowDays = 7 } = {}) {
  const { rank, isActionable, isNew } = globalThis.Prizd;
  const open = rank(opportunities.filter(o => o.url && isActionable(o, now) && matchesInterests(o, interests)));
  const fresh = open.filter(o => isNew(o, now, windowDays));
  const rest = open.filter(o => !fresh.includes(o));
  return [...fresh, ...rest].slice(0, limit);
}

/** Saved listings whose deadline is within the next 48 hours and which have not been reminded yet. */
export function dueReminders(saved, opportunities, alreadySent, now) {
  const byId = new Map(opportunities.map(o => [o.id, o]));
  const sent = new Set(alreadySent.map(r => `${r.user_id}|${r.opportunity_id}`));
  const out = [];
  for (const row of saved) {
    const o = byId.get(row.opportunity_id);
    if (!o || !o.url || sent.has(`${row.user_id}|${row.opportunity_id}`)) continue;
    const at = deadlineMs(o);
    if (at === null || at <= now || at - now > 48 * HOUR) continue;
    out.push({ userId: row.user_id, opportunity: o, deadlineAt: at });
  }
  return out;
}

const when = at => new Date(at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
const prizeLine = o => (o.prize?.description || '').split('.')[0].slice(0, 110);
const shell = (inner, unsubscribeUrl, siteUrl) => `<!doctype html><html><body style="margin:0;background:#f7f3eb;font-family:Arial,Helvetica,sans-serif;color:#281b38"><div style="max-width:600px;margin:0 auto;padding:28px 20px"><p style="font-family:Georgia,serif;font-size:34px;font-weight:bold;letter-spacing:-2px;margin:0 0 22px">prizd<span style="color:#ff805e">.</span></p>${inner}<hr style="border:0;border-top:1px solid #281b382b;margin:30px 0 16px"><p style="font-size:12px;line-height:1.6;color:#63576d">You get this because you opted in on <a href="${esc(siteUrl)}" style="color:#63576d">${esc(siteUrl)}</a>. <a href="${esc(unsubscribeUrl)}" style="color:#63576d">Unsubscribe</a> any time. Always confirm rules and deadlines on the official page.</p></div></body></html>`;
const link = (o, siteUrl) => o.url;
const row = (o, siteUrl) => `<tr><td style="padding:14px 0;border-bottom:1px solid #281b3820"><a href="${esc(link(o, siteUrl))}" style="font-family:Georgia,serif;font-size:20px;color:#281b38;text-decoration:none;letter-spacing:-.5px">${esc(o.title)}</a><div style="font-size:12px;color:#63576d;margin-top:5px">${esc(o.organizer.name)} · ${esc(o.category)} · closes ${esc(o.deadline ? when(Date.parse(o.deadline)) : o.deadlineDate ? when(deadlineMs(o)).replace(/,? \d\d:\d\d IST/, '') : 'date to confirm')}</div>${prizeLine(o) ? `<div style="font-size:13px;margin-top:5px">${esc(prizeLine(o))}</div>` : ''}</td></tr>`;

export function renderDigest(items, { unsubscribeUrl, siteUrl, name }) {
  const subject = `${items.length} open call${items.length === 1 ? '' : 's'} for you this week — Prizd`;
  const html = shell(`<p style="font-size:16px;margin:0 0 6px">${name ? `Hi ${esc(name.split(' ')[0])}, here` : 'Here'} are the best open calls right now.</p><table style="width:100%;border-collapse:collapse">${items.map(o => row(o, siteUrl)).join('')}</table><p style="margin:24px 0 0"><a href="${esc(siteUrl)}" style="background:#ff805e;color:#281b38;padding:12px 18px;text-decoration:none;font-weight:bold">See everything on Prizd</a></p>`, unsubscribeUrl, siteUrl);
  const text = `${items.map(o => `- ${o.title} (${o.organizer.name})\n  ${o.url}`).join('\n')}\n\nAll listings: ${siteUrl}\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject, html, text };
}

export function renderReminder(due, { unsubscribeUrl, siteUrl, name }) {
  const subject = `Closing soon: ${due.map(d => d.opportunity.title).slice(0, 1)[0]}${due.length > 1 ? ` +${due.length - 1} more` : ''}`;
  const html = shell(`<p style="font-size:16px;margin:0 0 6px">${name ? `Hi ${esc(name.split(' ')[0])}, ` : ''}${due.length === 1 ? 'a listing on your shortlist closes' : 'listings on your shortlist close'} within 48 hours.</p><table style="width:100%;border-collapse:collapse">${due.map(d => row(d.opportunity, siteUrl)).join('')}</table>`, unsubscribeUrl, siteUrl);
  const text = `${due.map(d => `- ${d.opportunity.title} — closes ${when(d.deadlineAt)}\n  ${d.opportunity.url}`).join('\n')}\n\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject, html, text };
}

// ---------------- I/O ----------------
async function rest(env, table, query = '', init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}${query}`, { ...init, headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return init.method && init.method !== 'GET' ? null : res.json();
}
async function send(env, to, mail, unsubscribeUrl) {
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to, subject: mail.subject, html: mail.html, text: mail.text, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }) });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
const pause = ms => new Promise(r => setTimeout(r, ms));

export async function main(mode, env = process.env, now = Date.now()) {
  if (!['weekly', 'reminders'].includes(mode)) throw new Error('usage: node scripts/digest.mjs weekly|reminders');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const data = JSON.parse(await readFile(path.join(root, 'dist/opportunities.json'), 'utf8'));
  const siteUrl = (env.SITE_URL || data.settings.siteUrl || '').replace(/\/+$/, '');
  const functionsUrl = (env.FUNCTIONS_URL || (env.SUPABASE_URL ? `${env.SUPABASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
  const live = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY && env.RESEND_API_KEY && env.MAIL_FROM && siteUrl);
  if (!live) console.log('Dry run: set SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY and MAIL_FROM to send for real.');
  const unsubFor = token => `${functionsUrl || siteUrl}/unsubscribe?token=${token}`;
  let sent = 0, failed = 0;
  const deliver = async (to, mail, token) => {
    if (!live) { console.log(`[dry] ${to}: ${mail.subject}`); sent++; return true; }
    try { await send(env, to, mail, unsubFor(token)); sent++; await pause(250); return true; } catch (e) { failed++; console.error(`✗ ${to}: ${e.message}`); return false; }
  };

  if (mode === 'weekly') {
    if (!live) { console.log(`${pickForDigest(data.opportunities, [], now).length} listings would qualify for an all-interests digest.`); return { sent: 0, failed: 0 }; }
    const subs = await rest(env, 'subscribers', '?status=eq.confirmed&select=email,interests,token');
    const users = await rest(env, 'profiles', '?digest_opt_in=eq.true&select=email,name,interests,unsub_token');
    const recipients = [...subs.map(s => ({ email: s.email, interests: s.interests, token: s.token })), ...users.map(u => ({ email: u.email, name: u.name, interests: u.interests, token: u.unsub_token }))];
    const seen = new Set();
    for (const r of recipients) {
      const key = r.email.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
      const items = pickForDigest(data.opportunities, r.interests, now);
      if (!items.length) continue;
      await deliver(r.email, renderDigest(items, { unsubscribeUrl: unsubFor(r.token), siteUrl, name: r.name }), r.token);
    }
  } else {
    if (!live) { console.log('Reminders need the database; nothing to preview in a dry run.'); return { sent: 0, failed: 0 }; }
    const users = await rest(env, 'profiles', '?reminder_opt_in=eq.true&select=id,email,name,unsub_token');
    if (users.length) {
      const ids = users.map(u => u.id).join(',');
      const saved = await rest(env, 'saved_opportunities', `?user_id=in.(${ids})&select=user_id,opportunity_id`);
      const already = await rest(env, 'reminders_sent', `?user_id=in.(${ids})&select=user_id,opportunity_id`);
      const due = dueReminders(saved, data.opportunities, already, now);
      for (const u of users) {
        const mine = due.filter(d => d.userId === u.id);
        if (!mine.length) continue;
        if (await deliver(u.email, renderReminder(mine, { unsubscribeUrl: unsubFor(u.unsub_token), siteUrl, name: u.name }), u.unsub_token)) {
          await rest(env, 'reminders_sent', '', { method: 'POST', body: JSON.stringify(mine.map(d => ({ user_id: u.id, opportunity_id: d.opportunity.id }))) });
        }
      }
    }
  }
  console.log(`${mode}: ${sent} sent, ${failed} failed${live ? '' : ' (dry run)'}`);
  if (failed) process.exitCode = 1;
  return { sent, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main(process.argv[2]);
