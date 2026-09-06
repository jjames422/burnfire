-- Canonical in-game identities and optional single-alliance affiliation.

alter table public.alliances add column if not exists code text;
update public.alliances set code = 'BFA' where slug = 'burnfire' and code is null;
alter table public.alliances alter column code set not null;
alter table public.alliances drop constraint if exists alliances_code_format;
alter table public.alliances add constraint alliances_code_format
  check (code = upper(code) and char_length(code) = 3);
create unique index if not exists alliances_code_unique on public.alliances (code);

alter table public.profiles
  add column if not exists in_game_name text,
  add column if not exists name_changed_at timestamptz;
update public.profiles set in_game_name = display_name where in_game_name is null;
alter table public.profiles alter column in_game_name set not null;
alter table public.profiles alter column alliance drop not null;
alter table public.profiles alter column alliance drop default;
alter table public.profiles alter column display_name drop not null;
alter table public.profiles drop constraint if exists profiles_in_game_name_length;
alter table public.profiles add constraint profiles_in_game_name_length
  check (char_length(trim(in_game_name)) between 1 and 40);

-- A community profile starts unaffiliated. Alliance membership is created
-- later by an invite flow, never implicitly during account setup.
drop trigger if exists profiles_create_initial_membership on public.profiles;
drop policy if exists "users create their own BurnFire profile as a member" on public.profiles;
drop policy if exists "users create their own community profile" on public.profiles;
create policy "users create their own community profile"
on public.profiles for insert to authenticated
with check (
  id = auth.uid()
  and alliance is null
  and permission_role = 'member'
);

create or replace function public.shares_alliance(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.alliance_members mine
    join public.alliance_members theirs on theirs.alliance = mine.alliance
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

drop policy if exists "members read profiles in their alliance" on public.profiles;
drop policy if exists "users read their own or alliance profiles" on public.profiles;
create policy "users read their own or alliance profiles"
on public.profiles for select to authenticated
using (id = auth.uid() or public.shares_alliance(id));

-- Authenticated community members may participate without an alliance.
drop policy if exists "members post comments as themselves" on public.comments;
create policy "community members post comments as themselves"
on public.comments for insert to authenticated
with check (author_id = auth.uid() and status = 'approved');

drop policy if exists "members add their own reactions" on public.guide_reactions;
create policy "community members add their own reactions"
on public.guide_reactions for insert to authenticated
with check (user_id = auth.uid());

create or replace function public.set_comment_author()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare author_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into author_profile from public.profiles where id = auth.uid();
  if not found then raise exception 'Community profile required'; end if;

  new.author_id := auth.uid();
  new.author_name := author_profile.in_game_name;
  new.author_rank := null;
  new.status := 'approved';
  return new;
end;
$$;

create or replace function public.format_member_identity(p_user_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when am.user_id is null then p.in_game_name
    else '[' || a.code || '] ' || p.in_game_name || ' · ' ||
      case
        when am.game_rank = 'r4' and am.alliance_title is not null then
          case am.alliance_title
            when 'diplomat' then 'Diplomat'
            when 'recruiter' then 'Recruiter'
            when 'goddess' then 'Goddess'
            when 'god_of_war' then 'God of War'
            else 'R4 Officer'
          end
        when am.game_rank = 'r5' then 'Alliance Leader'
        when am.game_rank = 'r1' then 'R1 Recruit'
        when am.game_rank = 'r2' then 'R2 Member'
        when am.game_rank = 'r3' then 'R3 Elder'
        else 'R4 Officer'
      end
  end
  from public.profiles p
  left join public.alliance_members am on am.user_id = p.id
  left join public.alliances a on a.slug = am.alliance
  where p.id = p_user_id;
$$;

create or replace function public.get_guide_comments(p_alliance text, p_guide_slug text)
returns table (id uuid, body text, identity_label text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    c.id,
    c.body,
    case
      when c.author_id is null then
        c.author_name || case when c.author_rank is null then '' else ' · ' || c.author_rank end
      else coalesce(public.format_member_identity(c.author_id), 'Former member')
    end,
    c.created_at
  from public.comments c
  where c.status = 'approved'
    and c.alliance = p_alliance
    and c.guide_slug = p_guide_slug
  order by c.created_at desc;
$$;

revoke select on public.comments from anon, authenticated;
grant execute on function public.get_guide_comments(text, text) to anon, authenticated;
revoke execute on function public.format_member_identity(uuid) from public, anon, authenticated;

-- A member may correct their in-game name at most once every 30 days. All
-- content resolves this field dynamically, so one change updates the site.
create or replace function public.update_in_game_name(p_in_game_name text)
returns public.profiles language plpgsql security definer set search_path = public, pg_temp as $$
declare updated_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_in_game_name)) not between 1 and 40 then
    raise exception 'In-game name must be between 1 and 40 characters';
  end if;

  update public.profiles
  set in_game_name = trim(p_in_game_name),
      display_name = trim(p_in_game_name),
      name_changed_at = now()
  where id = auth.uid()
    and (name_changed_at is null or name_changed_at <= now() - interval '30 days')
  returning * into updated_profile;

  if not found then raise exception 'In-game name can only be changed once every 30 days'; end if;
  return updated_profile;
end;
$$;

grant execute on function public.update_in_game_name(text) to authenticated;
