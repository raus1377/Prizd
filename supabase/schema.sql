-- Prizd accounts, saved shortlist, email list. Run once in the Supabase SQL editor.
create extension if not exists pgcrypto;

-- One row per signed-in user (created automatically on first Google sign-in).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  consent_at timestamptz,                 -- when they ticked the privacy/consent box
  source text,                            -- where they came from: home, listing:<id>, save, filters...
  ref text,                               -- referral code that brought them in
  referral_code text unique default substr(replace(gen_random_uuid()::text,'-',''),1,8),
  interests text[] not null default '{}',
  digest_opt_in boolean not null default false,
  reminder_opt_in boolean not null default false,
  phone text,                             -- E.164, e.g. +919876543210
  whatsapp_opt_in boolean not null default false,
  phone_verified boolean not null default false,
  unsub_token uuid not null default gen_random_uuid()
);

create table if not exists public.saved_opportunities (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id text not null check (char_length(opportunity_id) <= 160),
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

-- Visitors who only left an email. Never readable from the browser: only the Edge Functions
-- (service role) touch this table. status moves pending -> confirmed (double opt-in) -> unsubscribed.
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  interests text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','confirmed','unsubscribed')),
  token uuid not null default gen_random_uuid(),
  consent_at timestamptz not null,
  source text,
  ref text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_confirmation_sent_at timestamptz
);

-- Stops the same deadline reminder going out twice.
create table if not exists public.reminders_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table public.profiles enable row level security;
alter table public.saved_opportunities enable row level security;
alter table public.subscribers enable row level security;
alter table public.reminders_sent enable row level security;

-- Users can read and change only their own rows. No delete on profiles (use delete_my_account).
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "own saved" on public.saved_opportunities;
create policy "own saved" on public.saved_opportunities for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- subscribers and reminders_sent: RLS on, no policies => only the service role can use them.

-- Column-level guard: users may edit preferences, not identity, consent history or verification flags.
revoke update on public.profiles from authenticated;
grant update (name, interests, digest_opt_in, reminder_opt_in, phone, whatsapp_opt_in, consent_at, source, ref) on public.profiles to authenticated;

-- Create the profile when someone signs in with Google for the first time.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- consent_at can be set once (first consent) and never moved or cleared from the browser.
create or replace function public.keep_first_consent() returns trigger
language plpgsql as $$
begin
  if old.consent_at is not null then new.consent_at := old.consent_at; end if;
  if old.source is not null then new.source := old.source; end if;
  if old.ref is not null then new.ref := old.ref; end if;
  -- a changed phone number is unverified again
  if new.phone is distinct from old.phone then new.phone_verified := false; end if;
  return new;
end $$;
drop trigger if exists profiles_keep_first_consent on public.profiles;
create trigger profiles_keep_first_consent before update on public.profiles for each row execute function public.keep_first_consent();

-- "Delete my account": removes the auth user; profile, saved items and reminders cascade.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
