-- Authenticated interactions and single-alliance membership foundation.
-- Apply once through the Supabase SQL editor after reviewing the backup plan.

-- The site can host multiple alliances, but each account belongs to exactly
-- one. profiles remains the public identity while permissions live here.
create table if not exists public.alliances (
  slug text primary key,
  name text not null,
  kingdom_number integer,
  created_at timestamptz not null default now()
);

insert into public.alliances (slug, name, kingdom_number)
values ('burnfire', 'BurnFire Alliance', 324)
on conflict (slug) do nothing;

create table if not exists public.alliance_members (
  alliance text not null references public.alliances (slug) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  permission_role permission_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (user_id)
);

insert into public.alliance_members (alliance, user_id, permission_role)
select p.alliance, p.id, p.permission_role
from public.profiles p
join public.alliances a on a.slug = p.alliance
on conflict (user_id) do nothing;

grant select on public.alliances to anon, authenticated;
grant select on public.alliance_members to authenticated;
alter table public.alliances enable row level security;
alter table public.alliance_members enable row level security;

drop policy if exists "anyone reads alliances" on public.alliances;
create policy "anyone reads alliances" on public.alliances
for select to public using (true);

drop policy if exists "members read fellow memberships" on public.alliance_members;
create policy "members read fellow memberships" on public.alliance_members
for select to authenticated using (public.my_role(alliance) is not null);

create or replace function public.my_role(p_alliance text) returns permission_role
language sql stable security definer set search_path = public, pg_temp as $$
  select permission_role
  from public.alliance_members
  where user_id = auth.uid() and alliance = p_alliance;
$$;

-- The current public signup is explicitly BurnFire-only. Additional alliances
-- should onboard through an invite flow, not a client-supplied alliance slug.
drop policy if exists "users create their own profile as a member" on public.profiles;
create policy "users create their own BurnFire profile as a member"
on public.profiles for insert to authenticated
with check (
  id = auth.uid()
  and alliance = 'burnfire'
  and permission_role = 'member'
);

create or replace function public.create_initial_membership()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.alliance_members (alliance, user_id, permission_role)
  values (new.alliance, new.id, new.permission_role)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_create_initial_membership on public.profiles;
create trigger profiles_create_initial_membership
after insert on public.profiles
for each row execute function public.create_initial_membership();

-- Comments remain publicly readable, but only authenticated alliance members
-- may create them. A trigger supplies identity fields from the trusted profile.
alter table public.comments
  add column if not exists author_id uuid references auth.users (id) on delete set null;

revoke insert on public.comments from anon;
grant insert on public.comments to authenticated;
drop policy if exists "anyone can post an approved comment" on public.comments;
drop policy if exists "members post comments as themselves" on public.comments;
create policy "members post comments as themselves"
on public.comments for insert to authenticated
with check (
  author_id = auth.uid()
  and status = 'approved'
  and public.my_role(alliance) is not null
);

create or replace function public.set_comment_author()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare author_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into author_profile
  from public.profiles
  where id = auth.uid() and alliance = new.alliance;

  if not found then
    raise exception 'Alliance membership required';
  end if;

  new.author_id := auth.uid();
  new.author_name := author_profile.display_name;
  new.author_rank := author_profile.display_rank;
  new.status := 'approved';
  return new;
end;
$$;

drop trigger if exists comments_set_author on public.comments;
create trigger comments_set_author
before insert on public.comments
for each row execute function public.set_comment_author();

-- One row per account/reaction replaces localStorage as the uniqueness rule.
create table if not exists public.guide_reactions (
  id uuid primary key default gen_random_uuid(),
  alliance text not null references public.alliances (slug) on delete cascade,
  guide_slug text not null,
  reaction_type text not null check (reaction_type in ('fire', 'skull', 'heart', 'clap')),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (alliance, guide_slug, reaction_type, user_id)
);

grant select, insert, delete on public.guide_reactions to authenticated;
alter table public.guide_reactions enable row level security;

drop policy if exists "users read their own reactions" on public.guide_reactions;
create policy "users read their own reactions" on public.guide_reactions
for select to authenticated using (user_id = auth.uid());

drop policy if exists "members add their own reactions" on public.guide_reactions;
create policy "members add their own reactions" on public.guide_reactions
for insert to authenticated with check (
  user_id = auth.uid() and public.my_role(alliance) is not null
);

drop policy if exists "users remove their own reactions" on public.guide_reactions;
create policy "users remove their own reactions" on public.guide_reactions
for delete to authenticated using (user_id = auth.uid());

create or replace function public.sync_reaction_count()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare source_row public.guide_reactions;
declare delta integer;
begin
  if tg_op = 'DELETE' then
    source_row := old;
    delta := -1;
  else
    source_row := new;
    delta := 1;
  end if;

  insert into public.reactions (alliance, guide_slug, reaction_type, count)
  values (source_row.alliance, source_row.guide_slug, source_row.reaction_type, greatest(delta, 0))
  on conflict (alliance, guide_slug, reaction_type)
  do update set
    count = greatest(0, public.reactions.count + delta),
    updated_at = now();
  return source_row;
end;
$$;

drop trigger if exists guide_reactions_sync_count on public.guide_reactions;
create trigger guide_reactions_sync_count
after insert or delete on public.guide_reactions
for each row execute function public.sync_reaction_count();

revoke execute on function public.increment_reaction(text, text, text) from public, anon, authenticated;

-- Presence topics are private. Only a signed-in member with access to the
-- named channel may receive or send presence events.
alter table realtime.messages enable row level security;

drop policy if exists "members receive alliance presence" on realtime.messages;
create policy "members receive alliance presence"
on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'presence'
  and split_part(realtime.topic(), ':', 1) = 'presence'
  and exists (
    select 1 from public.channels c
    where c.alliance = split_part(realtime.topic(), ':', 2)
      and c.slug = split_part(realtime.topic(), ':', 3)
      and public.role_rank(public.my_role(c.alliance)) >= public.role_rank(c.min_role)
  )
);

drop policy if exists "members send alliance presence" on realtime.messages;
create policy "members send alliance presence"
on realtime.messages for insert to authenticated with check (
  realtime.messages.extension = 'presence'
  and split_part(realtime.topic(), ':', 1) = 'presence'
  and exists (
    select 1 from public.channels c
    where c.alliance = split_part(realtime.topic(), ':', 2)
      and c.slug = split_part(realtime.topic(), ':', 3)
      and public.role_rank(public.my_role(c.alliance)) >= public.role_rank(c.min_role)
  )
);
