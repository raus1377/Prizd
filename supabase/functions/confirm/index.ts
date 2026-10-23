// GET ?token=<uuid>  ->  marks the subscriber confirmed and returns them to the site.
import { db, redirect } from '../_shared/lib.ts';
Deno.serve(async req => {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) return redirect('/?subscribed=0');
  const { data } = await db().from('subscribers').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('token', token).neq('status', 'unsubscribed').select('id');
  return redirect(data?.length ? '/?subscribed=1' : '/?subscribed=0');
});
