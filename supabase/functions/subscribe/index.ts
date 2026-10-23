// POST { email, interests[], consent: true, source?, ref? }  ->  stores a *pending* subscriber and sends the confirmation mail.
import { db, cors, json, isEmail, esc, sendMail, FUNCTIONS_URL, INTERESTS } from '../_shared/lib.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'method' }, 405);
  let body: any; try { body = await req.json(); } catch { return json(req, { error: 'bad_json' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!isEmail(email)) return json(req, { error: 'email' }, 400);
  if (body.consent !== true) return json(req, { error: 'consent' }, 400);
  const interests = (Array.isArray(body.interests) ? body.interests : []).filter((x: unknown) => INTERESTS.includes(x as string)).slice(0, 3);
  const clean = (v: unknown, n: number) => typeof v === 'string' && v ? v.slice(0, n) : null;

  const sb = db();
  const { data: existing } = await sb.from('subscribers').select('id,status,token,last_confirmation_sent_at').eq('email', email).maybeSingle();
  let token: string;
  if (existing) {
    // Already confirmed: say OK without revealing it (and without sending more mail).
    if (existing.status === 'confirmed') { await sb.from('subscribers').update({ interests }).eq('id', existing.id); return json(req, { ok: true }); }
    // Re-sends are limited to one per 10 minutes per address.
    const last = existing.last_confirmation_sent_at ? Date.parse(existing.last_confirmation_sent_at) : 0;
    if (Date.now() - last < 10 * 60_000) return json(req, { ok: true });
    token = existing.token;
    await sb.from('subscribers').update({ interests, status: 'pending', consent_at: new Date().toISOString(), last_confirmation_sent_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    const { data, error } = await sb.from('subscribers').insert({ email, interests, consent_at: new Date().toISOString(), source: clean(body.source, 80), ref: clean(body.ref, 40), last_confirmation_sent_at: new Date().toISOString() }).select('token').single();
    if (error) return json(req, { error: 'db' }, 500);
    token = data.token;
  }
  const link = `${FUNCTIONS_URL}/confirm?token=${token}`;
  try {
    await sendMail(email, 'Confirm your Prizd alerts',
      `<p>Tap to confirm you want hackathon, internship and case-competition alerts from Prizd${interests.length ? ' (' + esc(interests.join(', ')) + ')' : ''}.</p><p><a href="${link}" style="background:#ff805e;color:#281b38;padding:12px 18px;text-decoration:none;font-weight:bold">Confirm my email</a></p><p style="color:#63576d;font-size:12px">If you didn't ask for this, ignore this email and nothing will be sent.</p>`,
      `Confirm your Prizd alerts: ${link}\n\nIf you didn't ask for this, ignore this email.`);
  } catch (e) { console.error(e); return json(req, { error: 'mail' }, 502); }
  return json(req, { ok: true });
});
