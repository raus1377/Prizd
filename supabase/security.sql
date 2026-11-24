-- Account security and private aggregate signup analytics. No secrets in this file.
-- Apply as the database owner after schema.sql.
begin;
alter table public.profiles enable row level security;
alter table public.saved_opportunities enable row level security;
alter table public.subscribers enable row level security;
alter table public.reminders_sent enable row level security;
revoke all on public.profiles, public.saved_opportunities, public.subscribers, public.reminders_sent from anon;
revoke all on public.subscribers, public.reminders_sent from authenticated;
revoke all on public.profiles from authenticated;
grant select (id,email,name,avatar_url,created_at,consent_at,source,ref,referral_code,interests,digest_opt_in,reminder_opt_in) on public.profiles to authenticated;
grant update (name,interests,digest_opt_in,reminder_opt_in,consent_at,source,ref) on public.profiles to authenticated;
revoke all on public.saved_opportunities from authenticated;
grant select,insert,delete on public.saved_opportunities to authenticated;
-- Upsert of saved items requires update permission; RLS still restricts the owner.
grant update on public.saved_opportunities to authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.keep_first_consent() from public,anon,authenticated;
create schema if not exists prizd_private;
revoke all on schema prizd_private from public,anon,authenticated;
create or replace view prizd_private.signup_metrics as
select count(*) filter (where email_confirmed_at is not null) as verified_accounts,
       count(*) filter (where email_confirmed_at is not null and created_at >= now() - interval '24 hours') as new_24h,
       count(*) filter (where email_confirmed_at is not null and created_at >= now() - interval '7 days') as new_7d,
       count(*) filter (where email_confirmed_at is not null and created_at >= now() - interval '30 days') as new_30d,
       count(*) filter (where email_confirmed_at is not null and last_sign_in_at >= now() - interval '30 days') as signed_in_30d
from auth.users;
revoke all on prizd_private.signup_metrics from public,anon,authenticated;
create or replace view prizd_private.daily_signups as
select (created_at at time zone 'UTC')::date as signup_day, count(*) as verified_signups
from auth.users where email_confirmed_at is not null group by 1;
revoke all on prizd_private.daily_signups from public,anon,authenticated;
-- Remove unused contact data and prohibit collecting new phone numbers from browser.
update public.profiles set phone=null, whatsapp_opt_in=false, phone_verified=false
where phone is not null or whatsapp_opt_in or phone_verified;
commit;
