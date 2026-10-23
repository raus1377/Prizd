import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesInterests, pickForDigest, dueReminders, renderDigest, renderReminder, deadlineMs } from '../scripts/digest.mjs';

const now = Date.parse('2026-10-23T06:00:00Z');
const H = 3_600_000, D = 24 * H;
const org = { name: 'Org & Co', prestige: 80 };
const make = (id, o = {}) => ({ id, title: `Title ${id}`, category: 'Hackathon', categories: [], organizer: org, summary: 's', url: `https://example.com/${id}?a=1&b=2`, entryStatus: 'open', deadline: new Date(now + 5 * D).toISOString(), addedAt: new Date(now - 30 * D).toISOString(), prizeUsd: 100, prize: { description: 'Win $1,000. More.' }, ...o });

test('interest chips map to categories; no chips means everything', () => {
  assert.equal(matchesInterests(make('a'), []), true);
  assert.equal(matchesInterests(make('a'), ['Hackathons']), true);
  assert.equal(matchesInterests(make('a'), ['Internships']), false);
  assert.equal(matchesInterests(make('b', { category: 'Research internship' }), ['Internships']), true);
  assert.equal(matchesInterests(make('c', { category: 'Finance' }), ['Case comps']), true);
  assert.equal(matchesInterests(make('d', { category: 'Design', categories: ['Finance'] }), ['Case comps']), true);
});

test('digest picks open listings only, new ones first, capped, with an official link', () => {
  const items = [make('old'), make('new', { addedAt: new Date(now - D).toISOString(), organizer: { name: 'X', prestige: 10 } }), make('closed', { deadline: new Date(now - D).toISOString() }), make('nolink', { url: null }), make('intern', { category: 'Internship' })];
  const picked = pickForDigest(items, ['Hackathons'], now);
  assert.deepEqual(picked.map(o => o.id), ['new', 'old']);
  assert.equal(pickForDigest(Array.from({ length: 20 }, (_, i) => make(`m${i}`)), [], now).length, 8);
  assert.deepEqual(pickForDigest(items, ['Internships'], now).map(o => o.id), ['intern']);
});

test('reminders: only saved listings closing within 48h, once each', () => {
  const opps = [make('soon', { deadline: new Date(now + 30 * H).toISOString() }), make('later', { deadline: new Date(now + 60 * H).toISOString() }), make('past', { deadline: new Date(now - H).toISOString() }), make('nodate', { deadline: null }), make('sent', { deadline: new Date(now + 10 * H).toISOString() })];
  const saved = ['soon', 'later', 'past', 'nodate', 'sent', 'unknown'].map(id => ({ user_id: 'u1', opportunity_id: id }));
  const due = dueReminders(saved, opps, [{ user_id: 'u1', opportunity_id: 'sent' }], now);
  assert.deepEqual(due.map(d => d.opportunity.id), ['soon']);
  assert.equal(dueReminders([{ user_id: 'u2', opportunity_id: 'sent' }], opps, [{ user_id: 'u1', opportunity_id: 'sent' }], now).length, 1);
});

test('date-only deadlines run to the end of the day in India', () => {
  assert.equal(deadlineMs(make('x', { deadline: null, deadlineDate: '2026-10-24' })), Date.parse('2026-10-24T23:59:59+05:30'));
});

test('every email carries an unsubscribe link and escapes listing text', () => {
  const evil = make('e', { title: '<img src=x onerror=1> & more' });
  const d = renderDigest([evil], { unsubscribeUrl: 'https://f.example/unsubscribe?token=t', siteUrl: 'https://prizd.example', name: 'Asha Rao' });
  assert.match(d.html, /Unsubscribe/); assert.match(d.html, /unsubscribe\?token=t/); assert.match(d.text, /Unsubscribe: https:\/\/f\.example/);
  assert.doesNotMatch(d.html, /<img src=x/); assert.match(d.html, /Hi Asha/); assert.match(d.subject, /1 open call for you/);
  assert.match(d.html, /href="https:\/\/example\.com\/e\?a=1&amp;b=2"/);
  const r = renderReminder([{ opportunity: make('s'), deadlineAt: now + 20 * H }], { unsubscribeUrl: 'https://f.example/unsubscribe?token=t', siteUrl: 'https://prizd.example' });
  assert.match(r.subject, /^Closing soon: Title s/); assert.match(r.html, /within 48 hours/); assert.match(r.html, /Unsubscribe/);
});
