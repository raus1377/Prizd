-- Apply after schema.sql. Safe to re-run; execute as project database owner.
begin;
revoke all on public.profiles, public.saved_opportunities, public.subscribers, public.reminders_sent from anon, public;
revoke all on public.profiles, public.saved_opportunities, public.subscribers, public.reminders_sent from authenticated;
grant select (id,email,name,avatar_url,created_at,consent_at,source,ref,referral_code,interests,digest_opt_in,reminder_opt_in) on public.profiles to authenticated;
grant update (name,interests,digest_opt_in,reminder_opt_in,consent_at,source,ref) on public.profiles to authenticated;
grant select,insert,delete on public.saved_opportunities to authenticated;
-- Upsert uses UPDATE privileges; row ownership policy still applies.
grant update (opportunity_id) on public.saved_opportunities to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.keep_first_consent() from public, anon, authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
-- Backfill profiles for existing email or OAuth accounts; do not overwrite existing profiles.
insert into public.profiles (id,email,name,avatar_url)
select id,email,coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name'),raw_user_meta_data->>'avatar_url' from auth.users where email is not null
on conflict (id) do nothing;
-- Private admin analytics. No public RPC, API exposure or individual email export.
create schema if not exists prizd_private;
revoke all on schema prizd_private from public, anon, authenticated;
create or replace view prizd_private.user_growth as
select count(*) filter (where email_confirmed_at is not null) as verified_users,
 count(*) filter (where email_confirmed_at is not null and created_at >= now() - interval '1 day') as verified_new_24h,
 count(*) filter (where email_confirmed_at is not null and created_at >= now() - interval '7 days') as verified_new_7d,
 count(*) filter (where email_confirmed_at is not null and created_at >= now() - interval '30 days') as verified_new_30d,
 count(*) filter (where last_sign_in_at >= now() - interval '7 days') as signed_in_7d
from auth.users;
revoke all on prizd_private.user_growth from public, anon, authenticated;
commit;
