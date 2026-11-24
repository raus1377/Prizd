# Enable Prizd sign-in securely

The public website does not require an account for browsing or filters. Google OAuth is optional for a synced shortlist. Never put private credentials or user records in GitHub.

1. Create a Supabase project in your own account. In SQL Editor run `supabase/schema.sql`, then `supabase/security.sql`.
2. Configure Google OAuth in Google Cloud and Supabase Authentication > Providers. Use the callback URL shown by Supabase; set your exact HTTPS site URL and allowed redirects in Supabase. Keep the Google client secret in Supabase, not GitHub.
3. GitHub repository > Settings > Secrets and variables > Actions > Variables: create `PRIZD_SUPABASE_URL` and `PRIZD_SUPABASE_PUBLIC_KEY` (publishable key or legacy anon key only). These are public client configuration, not credentials with privileged access. Never use a service role or secret key.
4. Run the Pages workflow on main and test sign-in and sign-out. Confirm a second account cannot read or change the first account's data. Enable MFA for your Supabase and GitHub administrator accounts.
5. In the private Supabase SQL Editor run `select * from prizd_private.signup_metrics;` or `select * from prizd_private.daily_signups order by signup_day desc;` to track verified accounts and growth. Do not expose the private schema through the API. Counts represent retained verified accounts, not lifetime signups or unique visitors.

Email subscriptions are disabled by default until mail delivery, abuse prevention and consent controls are separately configured. No phone or location collection is needed. See SECURITY.md for the checklist. Do not deploy public email endpoints until reviewed.
