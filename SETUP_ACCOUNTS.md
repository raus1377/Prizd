# Enable Prizd accounts safely

The site stays public; sign-in is optional. Google OAuth and email magic-link sign-in are implemented but inactive until a Supabase project is configured. Do not put credentials in public commits or send them in chat.

1. Create a Supabase project. In SQL Editor run `supabase/schema.sql` followed by `supabase/security-hardening.sql` as the project database owner. For existing projects, back up and review both scripts first.
2. In Supabase Auth URL Configuration use the exact live HTTPS site root for Site URL and permitted redirect. Enable Google using the Google OAuth client and secret in the Supabase dashboard. Enable email provider and configure SMTP, rate limits and appropriate anti-abuse controls. Keep email verification enabled.
3. In GitHub Settings > Secrets and variables > Actions > Variables set `PRIZD_SUPABASE_URL` and `PRIZD_SUPABASE_PUBLIC_KEY` (publishable or legacy anon key only). Never use service role / secret key. Run Pages workflow. Alerts remain off unless `PRIZD_ALERTS_ENABLED=true` is set after deploying and securing the email functions.
4. In Supabase SQL Editor, run `select * from prizd_private.user_growth;` for verified account counts, recent signups and recent sign-ins. The view is inaccessible to normal users and anonymous browsers. This counts accounts, not unique human visitors or page views; deleted accounts no longer count.
5. Test using two accounts: sign in/out, ensure saved items cannot cross accounts, verify anonymous access is blocked, verify private metrics cannot be read via the public API, and test account deletion. Follow SECURITY.md before opening registration.

Optional email digests require Resend and private server-side credentials. Deploy subscribe, confirm and unsubscribe functions only after reviewing abuse controls. WhatsApp alerts are not enabled. For GitHub mail workflow use Actions secrets SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY and MAIL_FROM; never place these in browser files. Keep `private/` and local .env files outside commits. No private operational data is included in this repository.
