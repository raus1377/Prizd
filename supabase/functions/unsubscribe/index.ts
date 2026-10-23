// GET or POST ?token=<uuid>  ->  unsubscribes a subscriber, or turns off all mail for a signed-in user's profile.
// POST is the one-click List-Unsubscribe header that mail apps use.
import { db, redirect } from '../_shared/lib.ts';
Deno.serve(async req => {
  const token = new URL(req.url).searchParams.get('token') || '';
  const ok = /^[0-9a-f-]{36}$/i.test(token);
  if (ok) {
    const sb = db();
    await sb.from('subscribers').update({ status: 'unsubscribed' }).eq('token', token);
    await sb.from('profiles').update({ digest_opt_in: false, reminder_opt_in: false, whatsapp_opt_in: false }).eq('unsub_token', token);
  }
  if (req.method === 'POST') return new Response('ok', { status: 200 });
  return redirect(ok ? '/?unsubscribed=1' : '/');
});
