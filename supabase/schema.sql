-- BurnFire guide site — Supabase schema.
-- Run this in the Supabase SQL Editor for a freshly created project
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Built up incrementally as milestones land:
--   M3 — comments
--   M4 — reactions + increment_reaction RPC
--   M5 — profiles + auth
--   M6 — channels + messages (this file, so far)
-- Re-running this whole file after an appended section is safe — every
-- statement is idempotent (create table/policy "if not exists" or
-- drop-then-create).

create extension if not exists pgcrypto with schema extensions;

-- === Comments (M3) ========================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  guide_slug text not null,
  author_name text not null check (char_length(author_name) between 1 and 60),
  author_rank text check (char_length(author_rank) <= 60),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists comments_guide_idx
  on public.comments (alliance, guide_slug, created_at desc);

-- RLS only filters rows a role can already see — the role still needs the
-- underlying table grant to query at all, and Supabase does not grant that
-- automatically for tables created via the SQL Editor. Without this, every
-- request (even ones RLS would allow) fails with 42501 "permission denied"
-- before RLS is ever evaluated.
grant usage on schema public to anon, authenticated;
grant select, insert on public.comments to anon, authenticated;

alter table public.comments enable row level security;

-- Policies target `public` (anon + authenticated), not just `anon`, so
-- logged-in chat members (from M5 onward) can read/post guide comments too
-- without a separate policy.
drop policy if exists "anyone can read approved comments" on public.comments;
create policy "anyone can read approved comments"
on public.comments for select
to public
using (status = 'approved');

drop policy if exists "anyone can post an approved comment" on public.comments;
create policy "anyone can post an approved comment"
on public.comments for insert
to public
with check (status = 'approved');

-- No update or delete policy (and no grant for either), deliberately —
-- Postgres default-denies both once RLS is enabled, which is the entire
-- moderation boundary. Moderation (v1) is a maintainer deleting bad rows
-- directly in Supabase's table editor, authenticated as the project owner,
-- not anon/authenticated.

-- === Reactions (M4) =======================================================

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  guide_slug text not null,
  reaction_type text not null check (reaction_type in ('fire', 'skull', 'heart', 'clap')),
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (alliance, guide_slug, reaction_type)
);

grant select on public.reactions to anon, authenticated;

alter table public.reactions enable row level security;

drop policy if exists "anyone can read reaction counts" on public.reactions;
create policy "anyone can read reaction counts"
on public.reactions for select
to public
using (true);

-- No insert/update/delete policy or grant for anon/authenticated — reactions
-- only ever change through increment_reaction below. It's security definer,
-- so it writes with the privileges of whoever created it (bypassing the
-- grants above), while callers only ever get an EXECUTE grant on the
-- function itself, never direct table access.
create or replace function public.increment_reaction(
  p_alliance text,
  p_guide_slug text,
  p_reaction_type text
)
returns public.reactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.reactions;
begin
  insert into public.reactions (alliance, guide_slug, reaction_type, count)
  values (p_alliance, p_guide_slug, p_reaction_type, 1)
  on conflict (alliance, guide_slug, reaction_type)
  do update set count = public.reactions.count + 1, updated_at = now()
  returning * into result;

  return result;
end;
$$;

grant execute on function public.increment_reaction(text, text, text) to anon, authenticated;

-- === Profiles + auth (M5) =================================================
-- No email/password to manage — Supabase Auth handles magic-link sessions.
-- This just adds the app-side identity/permission row that hangs off
-- auth.users, one per member.

do $$
begin
  create type permission_role as enum ('member', 'officer', 'admin');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  alliance text not null default 'burnfire',
  display_name text not null check (char_length(display_name) between 1 and 40),
  display_rank text check (char_length(display_rank) <= 40),
  permission_role permission_role not null default 'member',
  created_at timestamptz not null default now()
);

grant select, insert on public.profiles to authenticated;

-- role_rank/my_role/my_alliance are security-definer helpers so RLS policies
-- (here and in the channels/messages section below) can check "does this
-- user's role/alliance qualify" without needing a broader read grant on
-- profiles than the policy below actually allows. Defined here, right after
-- profiles exists and before anything references them, since this file runs
-- top-to-bottom.
create or replace function public.role_rank(r permission_role) returns int
language sql immutable as $$
  select case r when 'member' then 1 when 'officer' then 2 when 'admin' then 3 end;
$$;

create or replace function public.my_role(p_alliance text) returns permission_role
language sql stable security definer set search_path = public, pg_temp as $$
  select permission_role from public.profiles where id = auth.uid() and alliance = p_alliance;
$$;

create or replace function public.my_alliance() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select alliance from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;

-- Members can see every profile in their own alliance (not just their own
-- row) — needed from M6 onward so a message list can show who sent each
-- message. Scoped through my_alliance() below rather than a raw subquery on
-- profiles itself, to avoid the policy referencing the table it's attached
-- to (works, but the security-definer helper is the same pattern my_role()
-- already uses and is easier to reason about).
drop policy if exists "users read their own profile" on public.profiles;
drop policy if exists "members read profiles in their alliance" on public.profiles;
create policy "members read profiles in their alliance"
on public.profiles for select
to authenticated
using (alliance = public.my_alliance());

-- with check forces permission_role = 'member' regardless of what a client
-- sends — this is the entire security boundary the plan calls out: without
-- it, anyone could self-grant 'officer'/'admin' on signup by just including
-- that field in their own insert request.
drop policy if exists "users create their own profile as a member" on public.profiles;
create policy "users create their own profile as a member"
on public.profiles for insert
to authenticated
with check (id = auth.uid() and permission_role = 'member');

-- No update/delete policy or grant, deliberately — permission_role changes
-- (promoting a member to officer/admin) happen via Supabase's table editor
-- by an admin, same "moderate via table editor" pattern as comments. No
-- self-service profile editing in v1 either (display_name/display_rank are
-- set once at onboarding).

-- === Channels + messages (M6) ==============================================

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  slug text not null,
  name text not null,
  topic text,
  min_role permission_role not null default 'member',
  sort_order int not null default 0,
  unique (alliance, slug)
);

grant select on public.channels to authenticated;

alter table public.channels enable row level security;

-- role_rank comparison is numeric so higher roles automatically satisfy a
-- lower-gated channel (an officer can see 'member'-gated channels too).
drop policy if exists "members see channels they're allowed in" on public.channels;
create policy "members see channels they're allowed in"
on public.channels for select
to authenticated
using (role_rank(my_role(alliance)) >= role_rank(min_role));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists messages_channel_idx
  on public.messages (channel_id, created_at desc);

grant select, insert, delete on public.messages to authenticated;

alter table public.messages enable row level security;

drop policy if exists "members read messages in channels they can access" on public.messages;
create policy "members read messages in channels they can access"
on public.messages for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.channels c
    where c.id = messages.channel_id
    and role_rank(my_role(c.alliance)) >= role_rank(c.min_role)
  )
);

drop policy if exists "members post in channels they can access" on public.messages;
create policy "members post in channels they can access"
on public.messages for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.channels c
    where c.id = messages.channel_id
    and role_rank(my_role(c.alliance)) >= role_rank(c.min_role)
  )
);

drop policy if exists "authors delete their own messages" on public.messages;
create policy "authors delete their own messages"
on public.messages for delete
to authenticated
using (author_id = auth.uid());

-- Postgres Changes (Realtime) only streams tables explicitly added to this
-- publication — easy to forget, and nothing below breaks without it, it just
-- silently never fires.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

-- BurnFire's day-one channels. ON CONFLICT makes this safe to re-run; it
-- deliberately does not update name/topic/min_role/sort_order on conflict,
-- so hand edits made later via the table editor aren't clobbered by re-runs
-- of this file.
insert into public.channels (alliance, slug, name, topic, min_role, sort_order) values
  ('burnfire', 'general', 'General', 'Alliance-wide chat', 'member', 0),
  ('burnfire', 'pvp', 'PVP', 'Arena and rally coordination', 'member', 1),
  ('burnfire', 'recruitment', 'Recruitment', 'Recruiting and applications', 'member', 2),
  ('burnfire', 'officer', 'Officer', 'Officer+ only', 'officer', 3)
on conflict (alliance, slug) do nothing;
