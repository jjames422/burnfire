-- Model Last Asylum's actual alliance ranks and one-holder titles.

do $$
begin
  create type game_rank as enum ('r1', 'r2', 'r3', 'r4', 'r5');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type alliance_title as enum (
    'diplomat',
    'recruiter',
    'goddess',
    'god_of_war',
    'alliance_leader'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.alliance_members
  add column if not exists game_rank game_rank not null default 'r1',
  add column if not exists alliance_title alliance_title,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users (id) on delete set null;

-- R1-R3 cannot hold a special title; R4 may hold one of the four officer
-- titles; R5 is the Alliance Leader. Existing rows safely satisfy this as R1.
alter table public.alliance_members
  drop constraint if exists alliance_members_rank_title_check;
alter table public.alliance_members
  add constraint alliance_members_rank_title_check check (
    (game_rank in ('r1', 'r2', 'r3') and alliance_title is null)
    or (game_rank = 'r4' and (alliance_title is null or alliance_title in ('diplomat', 'recruiter', 'goddess', 'god_of_war')))
    or (game_rank = 'r5' and alliance_title = 'alliance_leader')
  );

-- The game permits exactly one holder of each title and at most one R5 in
-- an alliance. Partial unique indexes enforce those rules during every write.
create unique index if not exists alliance_members_one_title_holder
  on public.alliance_members (alliance, alliance_title)
  where alliance_title is not null;

create unique index if not exists alliance_members_one_r5
  on public.alliance_members (alliance)
  where game_rank = 'r5';

-- Comments receive a trusted snapshot of the verified membership label.
create or replace function public.set_comment_author()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare author_profile public.profiles;
declare author_membership public.alliance_members;
declare rank_name text;
declare title_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into author_profile
  from public.profiles
  where id = auth.uid();

  select * into author_membership
  from public.alliance_members
  where user_id = auth.uid() and alliance = new.alliance;

  if author_profile is null or author_membership is null then
    raise exception 'Alliance membership required';
  end if;

  rank_name := case author_membership.game_rank
    when 'r1' then 'Recruit'
    when 'r2' then 'Member'
    when 'r3' then 'Elder'
    when 'r4' then 'Officer'
    when 'r5' then 'Alliance Leader'
  end;

  title_name := case author_membership.alliance_title
    when 'diplomat' then 'Diplomat'
    when 'recruiter' then 'Recruiter'
    when 'goddess' then 'Goddess'
    when 'god_of_war' then 'God of War'
    else null
  end;

  new.author_id := auth.uid();
  new.author_name := author_profile.display_name;
  new.author_rank := upper(author_membership.game_rank::text) || ' · ' || rank_name
    || case when title_name is null then '' else ' · ' || title_name end;
  new.status := 'approved';
  return new;
end;
$$;
