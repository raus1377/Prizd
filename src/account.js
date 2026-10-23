/* Prizd accounts: Google sign-in, synced shortlist, email signup, alert preferences.
   Works on the home page and the static pages. If no backend is configured (data/settings.json -> backend),
   everything here switches itself off and the site behaves exactly as before. */
(() => {
  'use strict';
  const cfg = window.PRIZD_CONFIG || {};
  const enabled = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const root = document.documentElement;
  const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
  const INTERESTS = ['Hackathons', 'Internships', 'Case comps'];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = (() => { const l = new URL(location.href); l.search = ''; l.hash = ''; return l; })();
  const siteRoot = new URL('.', document.currentScript?.src || location.href).href;

  const api = window.PrizdAccount = {
    enabled, user: null, profile: null, saved: new Set(),
    ready: Promise.resolve(),
    requireAuth: () => true, setSaved: async () => {}, refCode: () => null, open: () => {}, signOut: async () => {}, onChange: () => {}
  };
  if (!enabled) { root.classList.add('no-account'); return; }

  // ---- visits + referral (kept locally, only used if the person signs up)
  try {
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref && /^[a-z0-9]{4,40}$/i.test(ref)) store.set('prizd-ref', ref);
    if (!sessionStorage.getItem('prizd-visit-counted')) { sessionStorage.setItem('prizd-visit-counted', '1'); store.set('prizd-visits', String((Number(store.get('prizd-visits')) || 0) + 1)); }
  } catch { /* ignore */ }

  // ---- toast
  let toastEl, toastTimer;
  function say(message) {
    toastEl ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'account-toast', role: 'status' });
    toastEl.textContent = message; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
  }
  const q = new URLSearchParams(location.search);
  if (q.has('subscribed') || q.has('unsubscribed')) {
    window.addEventListener('DOMContentLoaded', () => say(q.get('subscribed') === '1' ? 'Confirmed. You will get the Prizd digest.' : q.get('subscribed') === '0' ? 'That confirmation link has expired or was already used.' : 'You are unsubscribed. No more emails from us.'));
    const clean = new URL(location.href); ['subscribed', 'unsubscribed'].forEach(k => clean.searchParams.delete(k)); history.replaceState(null, '', clean);
  }

  // ---- supabase client (loaded lazily so the page paints first)
  let client = null; const listeners = new Set();
  const loadClient = async () => {
    if (client) return client;
    const { createClient } = await import(SUPABASE_ESM);
    client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
    return client;
  };
  const emit = () => { for (const fn of listeners) { try { fn(api); } catch (e) { console.warn(e); } } renderHeader(); renderSignups(); };
  api.onChange = fn => listeners.add(fn);
  api.refCode = () => api.profile?.referral_code || null;

  async function loadUserData(user) {
    const sb = await loadClient();
    const [{ data: profile }, { data: rows }] = await Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      sb.from('saved_opportunities').select('opportunity_id').eq('user_id', user.id)
    ]);
    api.profile = profile;
    // First sign-in after the consent box: record when and where.
    const pending = (() => { try { return JSON.parse(store.get('prizd-consent') || 'null'); } catch { return null; } })();
    if (profile && pending?.at && !profile.consent_at) {
      const patch = { consent_at: pending.at, source: pending.source || 'home', ref: store.get('prizd-ref') || null };
      const { data } = await sb.from('profiles').update(patch).eq('id', user.id).select('*').maybeSingle();
      if (data) api.profile = data;
    }
    if (pending) store.del('prizd-consent');
    // Merge the shortlist saved on this device into the account.
    const remote = new Set((rows || []).map(r => r.opportunity_id));
    let local = []; try { local = JSON.parse(store.get('prizd-saved-v1') || store.get('open-call-saved-v1') || '[]').filter(x => typeof x === 'string'); } catch { /* ignore */ }
    const missing = local.filter(id => !remote.has(id));
    if (missing.length) { await sb.from('saved_opportunities').upsert(missing.map(id => ({ user_id: user.id, opportunity_id: id })), { onConflict: 'user_id,opportunity_id', ignoreDuplicates: true }); missing.forEach(id => remote.add(id)); }
    api.saved = remote;
  }

  api.ready = (async () => {
    try {
      const sb = await loadClient();
      const { data } = await sb.auth.getSession();
      if (data.session) { api.user = data.session.user; await loadUserData(api.user); }
      sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session && session.user.id !== api.user?.id) { api.user = session.user; await loadUserData(api.user); emit(); if (event === 'SIGNED_IN') say(`Signed in${api.profile?.name ? ' as ' + api.profile.name.split(' ')[0] : ''}.`); }
        if (event === 'SIGNED_OUT') { api.user = null; api.profile = null; api.saved = new Set(); emit(); }
      });
    } catch (e) { console.warn('Prizd accounts unavailable:', e); root.classList.add('no-account'); api.enabled = false; }
    emit();
  })();

  api.setSaved = async (id, on) => {
    if (!api.user) return;
    const sb = await loadClient();
    const { error } = on ? await sb.from('saved_opportunities').upsert({ user_id: api.user.id, opportunity_id: id }, { onConflict: 'user_id,opportunity_id' }) : await sb.from('saved_opportunities').delete().eq('user_id', api.user.id).eq('opportunity_id', id);
    if (error) { say('Could not sync your shortlist. It is saved on this device.'); return; }
    on ? api.saved.add(id) : api.saved.delete(id);
  };
  api.signOut = async () => { const sb = await loadClient(); await sb.auth.signOut(); account.close(); };

  // ---- dialogs
  const dialog = (id, html) => { const d = document.createElement('dialog'); d.id = id; d.className = 'account-dialog'; d.innerHTML = `<button class="dialog-close" data-close aria-label="Close">×</button>${html}`; d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); }); document.body.appendChild(d); return d; };
  const REASONS = { save: 'Sign in to save opportunities and track their deadlines.', filters: 'Sign in to use filters: organizer, format, team size and entry status.', reminders: 'Sign in to get a reminder 48 hours before a saved deadline.', digest: 'Sign in to set up your weekly digest.', default: 'Sign in to save opportunities, use filters and get deadline reminders.' };
  let authDialog;
  api.requireAuth = (reason = 'default') => {
    if (api.user || !api.enabled) return true;
    authDialog ||= (() => {
      const d = dialog('auth-dialog', `<span class="kicker"><span class="smallburst" aria-hidden="true">✳</span> Welcome</span><h2>Sign in to <em>Prizd</em></h2><p id="auth-reason"></p><label class="consent"><input type="checkbox" id="auth-consent"> <span>I agree to the <a href="${siteRoot}privacy/">privacy policy</a> and to Prizd storing my name, email and shortlist.</span></label><button class="btn google-btn" id="auth-google" disabled><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg> Continue with Google</button><p class="fine">We only use Google to confirm who you are. No password, no posting.</p>`);
      const box = d.querySelector('#auth-consent'), btn = d.querySelector('#auth-google');
      box.addEventListener('change', () => { btn.disabled = !box.checked; });
      btn.addEventListener('click', async () => {
        store.set('prizd-consent', JSON.stringify({ at: new Date().toISOString(), source: d.dataset.source || 'home' }));
        const sb = await loadClient();
        const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: base.href } });
        if (error) say('Google sign-in is not available right now.');
      });
      return d;
    })();
    authDialog.dataset.source = reason;
    authDialog.querySelector('#auth-reason').textContent = REASONS[reason] || REASONS.default;
    authDialog.showModal();
    return false;
  };

  const chips = (selected, name) => INTERESTS.map(i => `<label class="chip"><input type="checkbox" name="${name}" value="${i}"${selected.includes(i) ? ' checked' : ''}><span>${i}</span></label>`).join('');
  const account = { dialog: null, close() { this.dialog?.close(); } };
  function openAccount() {
    const p = api.profile || {}; const saved = api.saved.size; const showPhone = (Number(store.get('prizd-visits')) || 0) >= 2 || saved >= 1 || Boolean(p.phone);
    const invite = p.referral_code ? new URL(siteRoot).origin + new URL(siteRoot).pathname + '?ref=' + p.referral_code : '';
    account.dialog?.remove();
    const d = account.dialog = dialog('account-dialog', `<span class="kicker"><span class="smallburst" aria-hidden="true">✳</span> Your account</span>
      <div class="acct-who">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" width="44" height="44" referrerpolicy="no-referrer">` : ''}<div><strong>${esc(p.name || 'Signed in')}</strong><span>${esc(p.email || api.user?.email || '')}</span></div></div>
      <form id="acct-form">
        <fieldset><legend>Emails</legend>
          <label class="consent"><input type="checkbox" name="digest" ${p.digest_opt_in ? 'checked' : ''}> <span>Weekly digest of open calls</span></label>
          <label class="consent"><input type="checkbox" name="reminders" ${p.reminder_opt_in ? 'checked' : ''}> <span>Remind me 48 hours before a saved deadline</span></label>
          <div class="chips" role="group" aria-label="Interests">${chips(p.interests || [], 'interest')}</div>
        </fieldset>
        ${showPhone ? `<fieldset><legend>WhatsApp</legend><label class="field">WhatsApp me deadline alerts<input type="tel" name="phone" inputmode="tel" autocomplete="tel" placeholder="+91 98765 43210" value="${esc(p.phone || '')}" pattern="\\+[0-9 ]{8,16}"></label><label class="consent"><input type="checkbox" name="wa" ${p.whatsapp_opt_in ? 'checked' : ''}> <span>Yes, send me deadline alerts on WhatsApp</span></label><p class="fine">${p.phone ? (p.phone_verified ? 'Number verified.' : 'Number saved. Alerts start once it is verified by a one-time code.') : 'Optional. We never share your number.'}</p></fieldset>` : ''}
        <div class="acct-actions"><button class="btn" type="submit">Save preferences</button><button class="btn btn-dark" type="button" id="acct-out">Sign out</button></div>
        <p class="signup-msg" id="acct-msg" role="status"></p>
      </form>
      ${invite ? `<div class="invite"><span class="eyebrow">Invite a friend</span><div class="invite-row"><input readonly value="${esc(invite)}" aria-label="Your invite link"><button class="btn btn-dark" type="button" id="acct-copy">Copy</button></div></div>` : ''}
      <details class="danger"><summary>Delete my account and data</summary><p class="fine">This removes your profile, shortlist and reminders for good.</p><button class="btn btn-dark" type="button" id="acct-del">Delete everything</button></details>`);
    d.querySelector('#acct-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget), msg = d.querySelector('#acct-msg');
      const phone = (f.get('phone') || '').toString().replace(/\s+/g, '');
      if (phone && !/^\+[0-9]{8,15}$/.test(phone)) { msg.textContent = 'Use the international format, e.g. +919876543210.'; return; }
      const patch = { digest_opt_in: f.has('digest'), reminder_opt_in: f.has('reminders'), interests: f.getAll('interest') };
      if (showPhone) Object.assign(patch, { phone: phone || null, whatsapp_opt_in: Boolean(phone) && f.has('wa') });
      const sb = await loadClient(); const { data, error } = await sb.from('profiles').update(patch).eq('id', api.user.id).select('*').maybeSingle();
      if (error) { msg.textContent = 'Could not save. Try again.'; return; }
      api.profile = data; msg.textContent = 'Saved.'; emit();
    });
    d.querySelector('#acct-out').addEventListener('click', () => api.signOut());
    d.querySelector('#acct-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(invite); say('Invite link copied'); } catch { d.querySelector('.invite-row input').select(); } });
    d.querySelector('#acct-del').addEventListener('click', async () => {
      if (!confirm('Delete your Prizd account and everything saved with it? This cannot be undone.')) return;
      const sb = await loadClient(); const { error } = await sb.rpc('delete_my_account');
      if (error) { say('Could not delete the account. Please try again.'); return; }
      await sb.auth.signOut().catch(() => {}); ['prizd-saved-v1', 'prizd-consent'].forEach(store.del); d.close(); say('Your account and data are deleted.');
    });
    d.showModal();
  }
  api.open = () => (api.user ? openAccount() : api.requireAuth('default'));

  // ---- header button
  function renderHeader() {
    for (const el of document.querySelectorAll('[data-account-button]')) {
      el.hidden = false;
      if (api.user) { const initial = (api.profile?.name || api.user.email || '?').trim()[0].toUpperCase(); el.innerHTML = `<span class="avatar" aria-hidden="true">${esc(initial)}</span><span class="acct-label">Account</span>`; el.setAttribute('aria-label', 'Your account'); }
      else { el.innerHTML = '<span class="acct-label">Sign in</span>'; el.setAttribute('aria-label', 'Sign in'); }
    }
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-account-button]')) { e.preventDefault(); api.open(); } });

  // ---- email signup (no login). Double opt-in: the confirmation email is what activates it.
  function renderSignups() {
    for (const host of document.querySelectorAll('[data-signup]')) {
      const signed = Boolean(api.user); const state = signed ? 'in' : 'out';
      if (host.dataset.state === state && host.firstElementChild) continue;
      host.dataset.state = state; host.hidden = false;
      const title = host.dataset.title || 'Get the weekly digest';
      if (signed) { host.innerHTML = `<div class="signup-inner"><span class="kicker"><span class="smallburst" aria-hidden="true">✳</span> Alerts</span><h2>${esc(title)}</h2><p>You are signed in. Choose your digest, reminders and WhatsApp alerts in your account.</p><button class="btn" type="button" data-account-open>Manage alerts <span aria-hidden="true">↗</span></button></div>`; continue; }
      host.innerHTML = `<form class="signup-inner" novalidate><span class="kicker"><span class="smallburst" aria-hidden="true">✳</span> Free, weekly</span><h2>${esc(title)}</h2><p>New hackathons, internships and case competitions, picked for you. One email a week.</p><div class="chips" role="group" aria-label="What are you looking for?">${chips([], 'interest')}</div><div class="signup-row"><input type="email" name="email" autocomplete="email" inputmode="email" placeholder="you@college.edu" aria-label="Email address" required><button class="btn" type="submit">Notify me <span aria-hidden="true">↗</span></button></div><label class="consent"><input type="checkbox" name="consent"> <span>Yes, email me this digest. I have read the <a href="${siteRoot}privacy/">privacy policy</a>. I can unsubscribe at any time.</span></label><p class="signup-msg" role="status"></p></form>`;
      host.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault(); const form = e.currentTarget, msg = form.querySelector('.signup-msg'), f = new FormData(form);
        const email = String(f.get('email') || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
        if (!f.has('consent')) { msg.textContent = 'Please tick the box to agree.'; return; }
        const button = form.querySelector('button'); button.disabled = true; msg.textContent = 'Sending…';
        try {
          const res = await fetch(`${cfg.functionsUrl}/subscribe`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: cfg.supabaseAnonKey }, body: JSON.stringify({ email, interests: f.getAll('interest'), consent: true, source: host.dataset.source || 'home', ref: store.get('prizd-ref') }) });
          if (!res.ok) throw new Error(String(res.status));
          form.innerHTML = `<span class="kicker"><span class="smallburst" aria-hidden="true">✳</span> Almost there</span><h2>Check your inbox.</h2><p>We sent a link to <strong>${esc(email)}</strong>. Tap it to confirm. Nothing is sent until you do.</p>`;
        } catch { msg.textContent = 'That did not go through. Please try again in a minute.'; button.disabled = false; }
      });
    }
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-account-open]')) api.open(); });
  window.addEventListener('DOMContentLoaded', () => { renderHeader(); renderSignups(); });
  if (document.readyState !== 'loading') { renderHeader(); renderSignups(); }
})();
