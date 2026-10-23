# Turning on sign-in, alerts and emails

The site works without any of this. Until you finish step 2, the sign-in button, the signup forms and the gating stay hidden and the site behaves as before.

## What you get
- **Google sign-in.** Saving an opportunity and the Filters panel need an account. The list, search, category chips and region toggle stay public (good for SEO).
- **Email signup, no login.** Email + interest chips + an unticked consent box, on the home page, every category page and every listing page. Double opt-in: nothing is sent until the person taps the link in the confirmation email.
- **Account panel.** Weekly digest, deadline reminders 48 hours before a saved deadline, interests, an optional WhatsApp number (shown after a second visit or the first save), an invite link, and a delete-my-account button.
- **Emails.** Weekly digest (Mon 09:00 IST) and daily reminders (09:30 IST) via GitHub Actions + Resend. Every mail has an unsubscribe link and the List-Unsubscribe header.
- **Privacy page** at `/privacy/`, linked from every consent box. Consent time and source are stored.

## Setup (about 45 minutes)
1. **Supabase.** Create a free project. SQL editor → paste `supabase/schema.sql` → run.
2. **Google login.** Google Cloud Console → APIs & Services → Credentials → OAuth client (Web). Authorised redirect URI: `https://<project>.supabase.co/auth/v1/callback`. In Supabase: Authentication → Providers → Google → paste client ID and secret. Authentication → URL Configuration: Site URL = your live site, add the same to Redirect URLs.
3. **Site config.** In `data/settings.json` fill `backend.supabaseUrl` and `backend.supabaseAnonKey` (Settings → API; the anon key is public by design, the database rules protect the data). Fill `contactEmail` too.
4. **Resend.** Create an account, verify your domain, add the SPF, DKIM and DMARC records it shows (without them mail lands in spam), create an API key.
5. **Edge Functions.** Install the Supabase CLI, then:
   ```
   supabase link --project-ref <project>
   supabase secrets set SITE_URL=https://yourdomain RESEND_API_KEY=... MAIL_FROM="Prizd <hello@yourdomain>" ALLOWED_ORIGINS=https://yourdomain
   supabase functions deploy subscribe confirm unsubscribe --no-verify-jwt
   ```
6. **GitHub.** Repo → Settings → Secrets and variables → Actions. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service role key, never put it in the site), `RESEND_API_KEY`, `MAIL_FROM`. Variable: `SITE_URL`. Run the "Send Prizd emails" workflow once by hand to check it (without secrets it does a dry run).

## Not built yet (be honest with users)
- **WhatsApp sending and OTP verification.** The number and consent are stored (`phone`, `whatsapp_opt_in`, `phone_verified=false`), but nothing sends WhatsApp messages. That needs a provider (WhatsApp Business via Twilio or Meta Cloud API) and costs money per message. The panel says alerts start once the number is verified.
- **Referral rewards.** Invite links (`?ref=`) are captured on `profiles.ref` and `subscribers.ref`, so you can count who brought whom. Granting "early access" is a product decision, so it isn't automated.
- **Per-branch / per-skill digest matching.** Digests match the three interest chips only.

## Costs
Supabase free tier and Resend free tier (3,000 mails/month) cover the start. At 5-10k subscribers expect roughly ₹2,000-₹8,000/month for mail and database.
