-- BurnFire guide site — Supabase schema.
-- Run this in the Supabase SQL Editor for a freshly created project
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Built up incrementally as milestones land:
--   M3 — comments
--   M4 — reactions + increment_reaction RPC
--   M5 — profiles + auth (this file, so far)
--   M6 — channels + messages
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

alter table public.profiles enable row level security;

-- A user can only ever see their own profile row for now — nothing in M5
-- needs to show another member's identity yet. M6 (chat) will need to widen
-- this so message authors' display_name/display_rank are visible to other
-- channel members; revisit then rather than opening it prematurely now.
drop policy if exists "users read their own profile" on public.profiles;
create policy "users read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

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
