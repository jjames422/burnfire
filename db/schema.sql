-- BurnFire community — local PostgreSQL schema.
-- Runs against the dedicated burnfire cluster (port 5433), never the
-- instance that hosts other sites. Apply with:
--   psql "$DATABASE_URL" -f db/schema.sql
-- Every statement is idempotent so the file can be re-run safely.
--
-- Security model: unlike the old Supabase schema there is no RLS and no
-- client-side database access. Only the Next.js server connects, and every
-- function that acts on behalf of a user takes the acting user id
-- (p_actor) as its first argument. API routes resolve p_actor from the
-- session cookie before calling anything here.

-- === Enums =================================================================

do $$ begin
  create type permission_role as enum ('member', 'officer', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type game_rank as enum ('r1', 'r2', 'r3', 'r4', 'r5');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alliance_title as enum
    ('diplomat', 'recruiter', 'goddess', 'god_of_war', 'alliance_leader');
exception when duplicate_object then null; end $$;

-- === Auth ==================================================================

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- Six-digit email login codes, hashed at rest.
create table if not exists login_codes (
  id bigint generated always as identity primary key,
  email text not null check (email = lower(email)),
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_codes_email_idx on login_codes (email, created_at desc);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists auth_links (
  token_hash text primary key,
  email text not null,
  return_to text not null default '/portal',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_links_email_idx on auth_links (email, created_at desc);

create table if not exists passkeys (
  credential_id text primary key,
  user_id uuid not null references users (id) on delete cascade,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text not null,
  backed_up boolean not null default false,
  name text not null default 'My passkey',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_user_idx on passkeys (user_id);

create table if not exists auth_challenges (
  token_hash text primary key,
  challenge text not null,
  purpose text not null check (purpose in ('registration', 'authentication')),
  user_id uuid references users (id) on delete cascade,
  session_hash text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_challenges_expiry_idx on auth_challenges (expires_at);

-- === Alliances and identity ===============================================

create table if not exists alliances (
  slug text primary key,
  name text not null,
  code text not null unique check (code = upper(code) and char_length(code) = 3),
  kingdom_number integer,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references users (id) on delete cascade,
  alliance text references alliances (slug) on delete set null,
  display_name text,
  in_game_name text not null check (char_length(trim(in_game_name)) between 1 and 40),
  display_rank text check (char_length(display_rank) <= 40),
  permission_role permission_role not null default 'member',
  created_at timestamptz not null default now(),
  name_changed_at timestamptz
);

create table if not exists alliance_members (
  alliance text not null references alliances (slug) on delete cascade,
  user_id uuid primary key references users (id) on delete cascade,
  permission_role permission_role not null default 'member',
  game_rank game_rank not null default 'r1',
  alliance_title alliance_title,
  verified_at timestamptz,
  verified_by uuid references users (id) on delete set null,
  joined_at timestamptz not null default now()
);

create table if not exists platform_admins (
  user_id uuid primary key references users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists membership_requests (
  user_id uuid primary key references users (id) on delete cascade,
  requested_rank game_rank not null,
  requested_title alliance_title,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references users (id) on delete set null,
  reviewed_at timestamptz,
  approved_rank game_rank,
  approved_title alliance_title,
  check (
    (requested_rank in ('r1','r2','r3') and requested_title is null)
    or (requested_rank = 'r4' and (requested_title is null or requested_title in ('diplomat','recruiter','goddess','god_of_war')))
    or (requested_rank = 'r5' and requested_title = 'alliance_leader')
  )
);
create index if not exists membership_requests_pending_idx
  on membership_requests (created_at) where status = 'pending';

create table if not exists alliance_invitations (
  id uuid primary key default gen_random_uuid(),
  alliance text not null references alliances (slug) on delete cascade,
  invitee_id uuid not null references users (id) on delete cascade,
  invited_by uuid not null references users (id) on delete cascade,
  game_rank game_rank not null default 'r1',
  alliance_title alliance_title,
  permission_role permission_role not null default 'member',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (
    (game_rank in ('r1','r2','r3') and alliance_title is null)
    or (game_rank = 'r4' and (alliance_title is null or alliance_title in ('diplomat','recruiter','goddess','god_of_war')))
    or (game_rank = 'r5' and alliance_title = 'alliance_leader')
  )
);
create unique index if not exists alliance_invitations_one_pending_per_user
  on alliance_invitations (invitee_id) where status = 'pending';

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);

create table if not exists user_blocks (
  blocker_id uuid not null references users (id) on delete cascade,
  blocked_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- === Channels and messages =================================================

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  alliance text references alliances (slug) on delete cascade,
  slug text not null,
  name text not null,
  topic text,
  min_role permission_role not null default 'member',
  sort_order integer not null default 0,
  scope text not null default 'alliance' check (scope in ('community', 'alliance')),
  category_id uuid,
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 21600),
  is_archived boolean not null default false,
  allow_threads boolean not null default true,
  check ((scope = 'alliance' and alliance is not null) or (scope = 'community' and alliance is null))
);
create unique index if not exists channels_alliance_slug_unique
  on channels (coalesce(alliance, '__community__'), slug);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels (id) on delete cascade,
  author_id uuid not null references users (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  edited_at timestamptz,
  parent_message_id uuid references messages (id) on delete set null,
  thread_root_id uuid references messages (id) on delete set null,
  deleted_by uuid references users (id) on delete set null,
  delete_reason text
);
create index if not exists messages_channel_idx on messages (channel_id, created_at desc);
create index if not exists messages_thread_idx on messages (thread_root_id, created_at);
create index if not exists messages_author_idx on messages (author_id, created_at desc);
create index if not exists messages_search_idx
  on messages using gin (to_tsvector('simple', body));

create table if not exists message_edit_history (
  id bigint generated always as identity primary key,
  message_id uuid not null references messages (id) on delete cascade,
  editor_id uuid references users (id) on delete set null,
  previous_body text not null,
  edited_at timestamptz not null default now()
);

create table if not exists message_reactions (
  message_id uuid not null references messages (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists message_mentions (
  message_id uuid not null references messages (id) on delete cascade,
  mentioned_user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, mentioned_user_id)
);

create table if not exists pinned_messages (
  channel_id uuid not null references channels (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade,
  pinned_by uuid not null references users (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (channel_id, message_id)
);

create table if not exists chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages (id) on delete cascade,
  uploader_id uuid not null references users (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  created_at timestamptz not null default now()
);
-- File bytes live in the database so the serverless-hosted site has no
-- dependency on this server's filesystem.
alter table chat_attachments add column if not exists data bytea;

-- Live presence per channel, written by the SSE stream handlers. No FKs —
-- rows are ephemeral heartbeats pruned by age.
create unlogged table if not exists channel_presence (
  channel_id uuid not null,
  user_id uuid not null,
  identity_label text not null,
  last_seen_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists chat_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  alliance text references alliances (slug) on delete cascade,
  kind text not null check (kind in ('timeout', 'ban')),
  reason text check (char_length(reason) <= 500),
  expires_at timestamptz,
  created_by uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references users (id) on delete set null
);
create unique index if not exists chat_restrictions_one_active
  on chat_restrictions (user_id, coalesce(alliance, '__community__'), kind)
  where revoked_at is null;

-- === Guide comments and reactions ==========================================

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  guide_slug text not null,
  author_id uuid references users (id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 60),
  author_rank text check (char_length(author_rank) <= 60),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists comments_guide_idx
  on comments (alliance, guide_slug, created_at desc);

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  guide_slug text not null,
  reaction_type text not null check (reaction_type in ('fire', 'skull', 'heart', 'clap')),
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (alliance, guide_slug, reaction_type)
);

create table if not exists guide_reactions (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  guide_slug text not null,
  reaction_type text not null check (reaction_type in ('fire', 'skull', 'heart', 'clap')),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (alliance, guide_slug, reaction_type, user_id)
);

create or replace function sync_reaction_count()
returns trigger language plpgsql as $$
declare source_row guide_reactions; delta integer;
begin
  if tg_op = 'DELETE' then source_row := old; delta := -1;
  else source_row := new; delta := 1; end if;
  insert into reactions (alliance, guide_slug, reaction_type, count)
  values (source_row.alliance, source_row.guide_slug, source_row.reaction_type, greatest(delta, 0))
  on conflict (alliance, guide_slug, reaction_type)
  do update set count = greatest(0, reactions.count + delta), updated_at = now();
  return source_row;
end;
$$;
drop trigger if exists guide_reactions_sync_count on guide_reactions;
create trigger guide_reactions_sync_count
after insert or delete on guide_reactions
for each row execute function sync_reaction_count();

-- === Moderation ============================================================

create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id) on delete cascade,
  target_type text not null check (target_type in ('comment', 'message', 'fan_art')),
  target_id uuid not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create table if not exists fan_art (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users (id) on delete cascade,
  storage_path text not null unique,
  title text not null check (char_length(trim(title)) between 1 and 100),
  caption text check (char_length(caption) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderation_note text,
  moderated_by uuid references users (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

-- === BurnFire recruit academy and command center ===========================

create table if not exists command_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) <= 254),
  token_hash text not null unique,
  created_by uuid not null references users (id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '14 days'),
  opened_at timestamptz,
  redeemed_by uuid unique references users (id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists command_invitations_email_idx
  on command_invitations (email, created_at desc);
create unique index if not exists command_invitations_one_active_email
  on command_invitations (email) where redeemed_at is null and revoked_at is null;

create table if not exists academy_enrollments (
  user_id uuid primary key references users (id) on delete cascade,
  invitation_id uuid unique references command_invitations (id) on delete set null,
  game_identifier text check (game_identifier is null or char_length(trim(game_identifier)) between 2 and 80),
  communication_preference text check (communication_preference in ('external_chat', 'website', 'both')),
  alliance_mail_help boolean,
  officer_interest text check (officer_interest in ('yes', 'later', 'no')),
  identity_status text not null default 'pending'
    check (identity_status in ('pending', 'verified')),
  identity_verified_by uuid references users (id) on delete set null,
  identity_verified_at timestamptz,
  assigned_officer uuid references users (id) on delete set null,
  current_step integer not null default 0 check (current_step >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((identity_status = 'pending') or (identity_verified_at is not null))
);
alter table academy_enrollments add column if not exists game_identifier text;
create index if not exists academy_enrollments_assigned_idx
  on academy_enrollments (assigned_officer, started_at desc);

create table if not exists membership_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  changed_by uuid references users (id) on delete set null,
  previous_rank game_rank,
  new_rank game_rank not null,
  created_at timestamptz not null default now()
);

create table if not exists recruit_assignment_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  changed_by uuid references users (id) on delete set null,
  previous_officer uuid references users (id) on delete set null,
  new_officer uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists academy_identity_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  changed_by uuid references users (id) on delete set null,
  previous_status text not null check (previous_status in ('pending', 'verified')),
  new_status text not null check (new_status in ('pending', 'verified')),
  note text check (char_length(note) <= 1000),
  changed_at timestamptz not null default now()
);
create index if not exists academy_identity_history_user_idx
  on academy_identity_history (user_id, changed_at desc);

create table if not exists user_recovery_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  actor_id uuid references users (id) on delete set null,
  action text not null check (action in
    ('academy_reset', 'resolve_followups', 'revoke_sessions', 'remove_passkeys', 'reset_identity')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists user_recovery_history_user_idx
  on user_recovery_history (user_id, created_at desc);

create table if not exists academy_content (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  version integer not null check (version > 0),
  content_type text not null check (content_type in ('rule', 'module', 'announcement')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null check (char_length(body) between 1 and 30000),
  required boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  verification_status text not null default 'verified'
    check (verification_status in ('verified', 'leadership_review')),
  created_by uuid references users (id) on delete set null,
  published_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (slug, version)
);
create unique index if not exists academy_content_one_published
  on academy_content (slug) where status = 'published';
create index if not exists academy_content_published_idx
  on academy_content (content_type, slug) where status = 'published';

create table if not exists academy_questions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references academy_content (id) on delete cascade,
  slug text not null,
  prompt text not null check (char_length(trim(prompt)) between 1 and 1000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  correct_index integer not null check (correct_index between 0 and 7),
  explanation text not null check (char_length(trim(explanation)) between 1 and 1000),
  sort_order integer not null default 0,
  unique (content_id, slug)
);

create table if not exists academy_progress (
  user_id uuid not null references users (id) on delete cascade,
  content_id uuid not null references academy_content (id) on delete restrict,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'needs_assistance')),
  current_step integer not null default 0 check (current_step >= 0),
  needs_assistance boolean not null default false,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, content_id),
  check ((status = 'completed') = (completed_at is not null))
);
create index if not exists academy_progress_content_idx
  on academy_progress (content_id, status, updated_at desc);

create table if not exists academy_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  content_id uuid not null references academy_content (id) on delete restrict,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  correct_count integer not null check (correct_count >= 0),
  question_count integer not null check (question_count > 0),
  passed boolean not null,
  created_at timestamptz not null default now(),
  check (correct_count <= question_count)
);
create index if not exists academy_quiz_attempts_user_idx
  on academy_quiz_attempts (user_id, content_id, created_at desc);

create table if not exists academy_acknowledgments (
  user_id uuid not null references users (id) on delete cascade,
  content_id uuid not null references academy_content (id) on delete restrict,
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table if not exists command_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  issue_key text not null check (char_length(trim(issue_key)) between 1 and 100),
  content_id uuid references academy_content (id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  status text not null default 'open'
    check (status in ('open', 'contacted', 'awaiting_response', 'resolved')),
  assigned_to uuid references users (id) on delete set null,
  created_by uuid references users (id) on delete set null,
  officer_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists command_followups_one_unresolved_issue
  on command_followups (user_id, issue_key) where status <> 'resolved';
create index if not exists command_followups_queue_idx
  on command_followups (status, assigned_to, created_at desc);

create table if not exists command_followup_history (
  id bigint generated always as identity primary key,
  followup_id uuid not null references command_followups (id) on delete cascade,
  editor_id uuid references users (id) on delete set null,
  previous_status text not null,
  previous_notes text not null,
  previous_assigned_to uuid references users (id) on delete set null,
  edited_at timestamptz not null default now()
);

create table if not exists command_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  author_id uuid not null references users (id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists command_notes_user_idx
  on command_notes (user_id, created_at desc);

create table if not exists command_note_history (
  id bigint generated always as identity primary key,
  note_id uuid not null references command_notes (id) on delete cascade,
  editor_id uuid references users (id) on delete set null,
  previous_body text not null,
  edited_at timestamptz not null default now()
);

-- === Helper functions ======================================================

create or replace function role_rank(r permission_role) returns integer
language sql immutable as $$
  select case r when 'member' then 1 when 'officer' then 2 when 'admin' then 3 end;
$$;

create or replace function user_role(p_actor uuid, p_alliance text) returns permission_role
language sql stable as $$
  select case when exists (select 1 from platform_admins where user_id = p_actor)
    then 'admin'::permission_role
    else (
      select case when game_rank = 'r5' then 'admin'::permission_role
                  when game_rank in ('r3', 'r4') then 'officer'::permission_role
                  else 'member'::permission_role end
      from alliance_members
      where user_id = p_actor and alliance = p_alliance and verified_at is not null
    ) end;
$$;

create or replace function sync_membership_access() returns trigger
language plpgsql as $$
begin
  new.permission_role := case when new.game_rank = 'r5' then 'admin'::permission_role
    when new.game_rank in ('r3', 'r4') then 'officer'::permission_role
    else 'member'::permission_role end;
  update profiles set alliance = new.alliance,
    permission_role = case when exists (select 1 from platform_admins where user_id = new.user_id)
      then 'admin'::permission_role else new.permission_role end
    where id = new.user_id;
  if new.alliance = 'burnfire' then
    insert into academy_enrollments
      (user_id, identity_status, identity_verified_by, identity_verified_at)
    values (new.user_id, case when new.verified_at is null then 'pending' else 'verified' end,
      new.verified_by, new.verified_at)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists alliance_members_sync_access on alliance_members;
create trigger alliance_members_sync_access
before insert or update on alliance_members
for each row execute function sync_membership_access();

create or replace function is_platform_admin(p_actor uuid) returns boolean
language sql stable as $$
  select exists (select 1 from platform_admins where user_id = p_actor);
$$;

create or replace function is_blocked_pair(p_actor uuid, p_other uuid) returns boolean
language sql stable as $$
  select exists (select 1 from user_blocks
    where (blocker_id = p_actor and blocked_id = p_other)
       or (blocker_id = p_other and blocked_id = p_actor));
$$;

create or replace function is_chat_restricted(p_actor uuid, p_alliance text) returns boolean
language sql stable as $$
  select exists (select 1 from chat_restrictions r where r.user_id = p_actor
    and (r.alliance is null or r.alliance = p_alliance) and r.revoked_at is null
    and (r.expires_at is null or r.expires_at > now()));
$$;

create or replace function can_access_channel(p_actor uuid, p_channel_id uuid) returns boolean
language sql stable as $$
  select exists (select 1 from channels c where c.id = p_channel_id and not c.is_archived and (
    (c.scope = 'community' and exists (select 1 from profiles p where p.id = p_actor))
    or (c.scope = 'alliance' and role_rank(user_role(p_actor, c.alliance)) >= role_rank(c.min_role))
  ));
$$;

create or replace function format_member_identity(p_user_id uuid) returns text
language sql stable as $$
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
  from profiles p
  left join alliance_members am on am.user_id = p.id
  left join alliances a on a.slug = am.alliance
  where p.id = p_user_id;
$$;

-- === Chat API ==============================================================

create or replace function get_my_chat_identity(p_actor uuid) returns text
language sql stable as $$
  select coalesce(format_member_identity(p_actor), 'Unknown survivor');
$$;

create or replace function get_channel_messages(p_actor uuid, p_channel_id uuid, p_limit integer default 100)
returns table(id uuid, channel_id uuid, author_id uuid, body text, created_at timestamptz,
  edited_at timestamptz, parent_message_id uuid, thread_root_id uuid,
  identity_label text, reactions jsonb)
language sql stable as $$
  select m.id, m.channel_id, m.author_id, m.body, m.created_at, m.edited_at,
    m.parent_message_id, m.thread_root_id,
    coalesce(format_member_identity(m.author_id), 'Former member'),
    coalesce((select jsonb_object_agg(x.emoji, x.total) from
      (select r.emoji, count(*) total from message_reactions r where r.message_id = m.id group by r.emoji) x),
      '{}'::jsonb)
  from messages m
  where m.channel_id = p_channel_id and m.deleted_at is null
    and can_access_channel(p_actor, p_channel_id)
    and not is_blocked_pair(p_actor, m.author_id)
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function post_channel_message(
  p_actor uuid, p_channel_id uuid, p_body text,
  p_parent_message_id uuid default null,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
) returns uuid language plpgsql as $$
declare message_id uuid; mention_id uuid; ch channels; latest timestamptz; root uuid;
begin
  if not can_access_channel(p_actor, p_channel_id) then raise exception 'Channel access denied'; end if;
  if char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid message length'; end if;
  select * into ch from channels where id = p_channel_id;
  if is_chat_restricted(p_actor, ch.alliance) then raise exception 'Chat access is restricted'; end if;
  if ch.slow_mode_seconds > 0 then
    select max(created_at) into latest from messages where channel_id = ch.id and author_id = p_actor;
    if latest is not null and latest + make_interval(secs => ch.slow_mode_seconds) > now()
    then raise exception 'Slow mode is active'; end if;
  end if;
  if p_parent_message_id is not null then
    if not ch.allow_threads then raise exception 'Replies are disabled in this channel'; end if;
    if not exists (select 1 from messages p where p.id = p_parent_message_id and p.channel_id = ch.id)
    then raise exception 'Reply target is not in this channel'; end if;
    root := coalesce((select p.thread_root_id from messages p where p.id = p_parent_message_id), p_parent_message_id);
  end if;
  insert into messages (channel_id, author_id, body, parent_message_id, thread_root_id)
  values (p_channel_id, p_actor, trim(p_body), p_parent_message_id, root)
  returning messages.id into message_id;
  foreach mention_id in array coalesce(p_mentioned_user_ids, '{}'::uuid[]) loop
    if mention_id <> p_actor and exists (
      select 1 from profiles p
      left join alliance_members am on am.user_id = p.id
      where p.id = mention_id and (ch.scope = 'community' or (ch.scope = 'alliance' and am.alliance = ch.alliance))
    ) then
      insert into message_mentions (message_id, mentioned_user_id)
      values (message_id, mention_id) on conflict do nothing;
      insert into notifications (user_id, kind, title, body, data)
      values (mention_id, 'chat_mention', 'You were mentioned',
        coalesce(format_member_identity(p_actor), 'Someone') || ' mentioned you in #' || ch.name || '.',
        jsonb_build_object('channel_id', p_channel_id, 'message_id', message_id));
    end if;
  end loop;
  if p_parent_message_id is not null then
    insert into notifications (user_id, kind, title, body, data)
    select m.author_id, 'chat_reply', 'New reply',
      coalesce(format_member_identity(p_actor), 'Someone') || ' replied to your message.',
      jsonb_build_object('channel_id', p_channel_id, 'message_id', message_id)
    from messages m where m.id = p_parent_message_id and m.author_id <> p_actor;
  end if;
  return message_id;
end;
$$;

create or replace function search_channel_messages(p_actor uuid, p_channel_id uuid, p_query text)
returns table(id uuid, body text, created_at timestamptz, identity_label text)
language sql stable as $$
  select m.id, m.body, m.created_at, coalesce(format_member_identity(m.author_id), 'Former member')
  from messages m
  where m.channel_id = p_channel_id and m.deleted_at is null
    and can_access_channel(p_actor, p_channel_id)
    and not is_blocked_pair(p_actor, m.author_id)
    and to_tsvector('simple', m.body) @@ plainto_tsquery('simple', p_query)
  order by m.created_at desc limit 50;
$$;

create or replace function get_channel_mention_candidates(
  p_actor uuid, p_channel_id uuid, p_query text default '', p_limit integer default 8
) returns table(user_id uuid, identity_label text, mention_text text)
language sql stable as $$
  select p.id, format_member_identity(p.id), p.in_game_name
  from profiles p
  join channels c on c.id = p_channel_id
  left join alliance_members am on am.user_id = p.id
  where can_access_channel(p_actor, p_channel_id)
    and ((c.scope = 'community') or (c.scope = 'alliance' and am.alliance = c.alliance))
    and (trim(coalesce(p_query, '')) = '' or p.in_game_name ilike '%' || trim(p_query) || '%')
  order by
    case when lower(p.in_game_name) = lower(trim(coalesce(p_query, ''))) then 0 else 1 end,
    p.in_game_name
  limit least(greatest(p_limit, 1), 20);
$$;

create or replace function edit_message(p_actor uuid, p_message_id uuid, p_body text)
returns void language plpgsql as $$
declare old_body text;
begin
  if char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid message length'; end if;
  select body into old_body from messages
    where id = p_message_id and author_id = p_actor
      and deleted_at is null and created_at > now() - interval '24 hours'
    for update;
  if not found then raise exception 'Message cannot be edited'; end if;
  if old_body is distinct from trim(p_body) then
    insert into message_edit_history (message_id, editor_id, previous_body)
    values (p_message_id, p_actor, old_body);
    update messages set body = trim(p_body), edited_at = now() where id = p_message_id;
  end if;
end;
$$;

create or replace function delete_message(p_actor uuid, p_message_id uuid)
returns void language plpgsql as $$
begin
  update messages
  set deleted_at = now(), deleted_by = p_actor, delete_reason = 'Deleted by author'
  where id = p_message_id and author_id = p_actor and deleted_at is null;
  if not found then raise exception 'Message cannot be deleted'; end if;
end;
$$;

create or replace function pin_message(p_actor uuid, p_message_id uuid, p_pin boolean)
returns void language plpgsql as $$
declare ch channels;
begin
  select c.* into ch from messages m join channels c on c.id = m.channel_id where m.id = p_message_id;
  if ch.id is null then raise exception 'Message not found'; end if;
  if not (is_platform_admin(p_actor)
    or (ch.alliance is not null and user_role(p_actor, ch.alliance) in ('officer', 'admin')))
  then raise exception 'Moderator required'; end if;
  if p_pin then
    insert into pinned_messages (channel_id, message_id, pinned_by)
    values (ch.id, p_message_id, p_actor) on conflict do nothing;
  else
    delete from pinned_messages where channel_id = ch.id and message_id = p_message_id;
  end if;
end;
$$;

create or replace function toggle_message_reaction(p_actor uuid, p_message_id uuid, p_emoji text)
returns boolean language plpgsql as $$
declare ch_id uuid; removed boolean;
begin
  select channel_id into ch_id from messages where id = p_message_id and deleted_at is null;
  if ch_id is null or not can_access_channel(p_actor, ch_id) then
    raise exception 'Message not found';
  end if;
  delete from message_reactions
  where message_id = p_message_id and user_id = p_actor and emoji = p_emoji;
  removed := found;
  if not removed then
    insert into message_reactions (message_id, user_id, emoji) values (p_message_id, p_actor, p_emoji);
  end if;
  return not removed;
end;
$$;

-- === Account API ===========================================================

create or replace function mark_notification_read(p_actor uuid, p_notification_id uuid)
returns void language sql as $$
  update notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = p_actor;
$$;

create or replace function respond_to_alliance_invitation(p_actor uuid, p_invitation_id uuid, p_accept boolean)
returns void language plpgsql as $$
declare invitation alliance_invitations;
begin
  select * into invitation from alliance_invitations
    where id = p_invitation_id and invitee_id = p_actor and status = 'pending' for update;
  if not found then raise exception 'Pending invitation not found'; end if;
  if invitation.expires_at <= now() then
    update alliance_invitations set status = 'expired', responded_at = now() where id = invitation.id;
    return;
  end if;
  if p_accept then
    insert into alliance_members
      (alliance, user_id, permission_role, game_rank, alliance_title, verified_at, verified_by)
    values (invitation.alliance, p_actor, invitation.permission_role, invitation.game_rank,
      invitation.alliance_title, now(), invitation.invited_by);
    if invitation.alliance = 'burnfire' then
      insert into academy_enrollments
        (user_id, identity_status, identity_verified_by, identity_verified_at, started_at)
      values (p_actor, 'verified', invitation.invited_by, now(), now())
      on conflict (user_id) do nothing;
    end if;
  end if;
  update alliance_invitations
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = invitation.id;
end;
$$;

-- === Guide comments and reactions API ======================================

create or replace function get_guide_comments(p_alliance text, p_guide_slug text)
returns table (id uuid, body text, identity_label text, created_at timestamptz)
language sql stable as $$
  select c.id, c.body,
    case
      when c.author_id is null then
        c.author_name || case when c.author_rank is null then '' else ' · ' || c.author_rank end
      else coalesce(format_member_identity(c.author_id), 'Former member')
    end,
    c.created_at
  from comments c
  where c.status = 'approved' and c.alliance = p_alliance and c.guide_slug = p_guide_slug
  order by c.created_at desc;
$$;

create or replace function post_guide_comment(p_actor uuid, p_alliance text, p_guide_slug text, p_body text)
returns uuid language plpgsql as $$
declare author_profile profiles; comment_id uuid;
begin
  select * into author_profile from profiles where id = p_actor;
  if not found then raise exception 'Community profile required'; end if;
  if char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid comment length'; end if;
  insert into comments (alliance, guide_slug, author_id, author_name, author_rank, body, status)
  values (p_alliance, p_guide_slug, p_actor, author_profile.in_game_name, null, trim(p_body), 'approved')
  returning comments.id into comment_id;
  return comment_id;
end;
$$;

create or replace function add_guide_reaction(p_actor uuid, p_alliance text, p_guide_slug text, p_reaction_type text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from profiles where id = p_actor) then
    raise exception 'Community profile required';
  end if;
  insert into guide_reactions (alliance, guide_slug, reaction_type, user_id)
  values (p_alliance, p_guide_slug, p_reaction_type, p_actor);
end;
$$;

-- === Seed data =============================================================

insert into alliances (slug, name, code, kingdom_number)
values ('burnfire', 'BurnFire Alliance', 'BFA', 324)
on conflict (slug) do nothing;

insert into academy_enrollments
  (user_id, identity_status, identity_verified_by, identity_verified_at, started_at)
select am.user_id,
       case when am.verified_at is null then 'pending' else 'verified' end,
       am.verified_by, am.verified_at, am.joined_at
from alliance_members am
join profiles p on p.id = am.user_id
where am.alliance = 'burnfire'
on conflict (user_id) do nothing;

insert into academy_content
  (slug, version, content_type, title, body, required, status, verification_status)
values
  ('rule-01-alliance-communication', 1, 'rule', 'Alliance Communication',
   'Welcome to BurnFire (BF2)! Read alliance chat regularly. Important announcements, event strategies, operational instructions, and leadership notices are communicated there. Members are responsible for staying informed and following applicable alliance instructions.',
   true, 'published', 'verified'),
  ('rule-02-communication-platforms', 1, 'rule', 'Website and Optional Chat',
   'BF2 provides alliance guides, event strategies, announcements, questions and answers, leadership communication, recruitment assistance, and training resources through its website and optional external chat server. External chat participation is encouraged, not mandatory. No member may be penalized for choosing website-based communication instead. Choose your preference: external chat, BF2 Website, or Both.',
   true, 'published', 'verified'),
  ('rule-03-alliance-mail', 1, 'rule', 'Mandatory Alliance Mail',
   'Reading alliance mail is mandatory. Alliance mail is separate from other in-game notices and alliance chat and is used to distribute important instructions consistently. Learn where it is located, how to open it, why it must be read, and how to recognize official instructions. The website cannot detect whether in-game mail was opened. If you need help finding alliance mail, request officer assistance.',
   true, 'published', 'verified'),
  ('rule-04-identity-and-conduct', 1, 'rule', 'Player Identity and Conduct',
   'Maintain a recognizable, unique gamer name. Generic or repeated names such as "Doctor" make member identification and alliance administration difficult. Bullying, harassment, threatening or abusive conduct, unnecessary interpersonal drama, and sharing another member''s private information without permission are not acceptable. Keep alliance communication respectful and constructive.',
   true, 'published', 'verified'),
  ('rule-05-server-rules', 1, 'rule', 'Server Rules and Protected Alliances',
   'Observe applicable server rules. Do not rob caravans or Special Ops originating from your own server. Do not recruit or poach members from Top 10 alliances, and do not attack Top 10 alliances. Permitted cross-server activity is different from prohibited same-server activity. Follow current alliance policy and ask leadership when eligibility is unclear.',
   true, 'published', 'verified'),
  ('rule-06-conflict-and-diplomacy', 1, 'rule', 'Conflict Management and Diplomacy',
   'Members are not authorized to initiate wars or issue threats on behalf of BF2. If another player or alliance creates a problem, contact alliance leadership before escalating. Do not represent yourself as speaking for BF2 leadership without authorization.',
   true, 'published', 'verified'),
  ('rule-07-cross-server-targets', 1, 'rule', 'Cross-Server Caravans and Special Ops',
   'Understand the difference between targets from your own server, targets from another server, targets protected by server rules, and targets permitted by current alliance policy. Do not rob caravans or Special Ops originating from your own server. The game-interface navigation and eligibility details require leadership verification before they can be published as authoritative instructions. Ask an officer for help if you are unsure.',
   true, 'published', 'leadership_review'),
  ('rule-08-alliance-location', 1, 'rule', 'Alliance Location and Assembly',
   'Remain reasonably close to the BF2 alliance marker and assembly area. If you are far away, use the supplied in-game path: Alliance → Assembly Point → Relocate. The website cannot independently verify in-game relocation. Request help if you cannot find the assembly point.',
   true, 'published', 'verified'),
  ('rule-09-direct-relocates', 1, 'rule', 'Direct Relocates',
   'Direct Relocates may be available through the Alliance Store. Learn where to find them and when repositioning may be appropriate. Spending real money is not required.',
   true, 'published', 'verified'),
  ('rule-10-rallies-and-digs', 1, 'rule', 'Rallies and Alliance Digs',
   'When you begin a rally or Alliance Dig, announce it in alliance chat so other members have an opportunity to participate. Communicate, cooperate, invite alliance participation, and support shared progress. Do not quietly perform Alliance Digs alone when alliance participation should be offered.',
   true, 'published', 'verified'),
  ('rule-11-weekly-research', 1, 'rule', 'Weekly Alliance Research',
   'The weekly alliance research contribution minimum is 3,200. Donate to the research selected by alliance leadership. Use Alliance Help, join rallies when possible, participate in alliance activities, and support research progression. Diamonds and real-money purchases are never required.',
   true, 'published', 'verified'),
  ('rule-12-ranks-and-advancement', 1, 'rule', 'Alliance Ranks and Advancement',
   'Ranks are earned through participation and contribution, including research donations, Alliance Help, rally and Alliance Dig participation, activity, cooperation, and leadership involvement. R2 is a standard alliance member; R3 and above are leadership roles. Website activity or quiz completion does not automatically promote anyone. You may express interest in becoming a future R3 officer; interest is not an application approval or promotion.',
   true, 'published', 'verified'),
  ('cross-server-plundering-covert-ops', 1, 'module', 'Cross-Server Plundering & Covert Ops Protocol',
   'Core policy: never share a Covert Ops target after it has already been hit twice. Before sharing any target, verify its server, eligibility, and attack or hit information. Do not plunder caravans from your own server. Do not attack or share targets that are ineligible under server rules or current alliance policy. If you have a dispute, contact leadership; do not threaten another alliance on BF2''s behalf. Use the BF2 training resources or ask an officer if you need help. Detailed game-interface navigation and target mechanics are marked for leadership review because they have not been independently verified.',
   true, 'published', 'leadership_review')
on conflict (slug, version) do nothing;

insert into academy_questions
  (content_id, slug, prompt, options, correct_index, explanation, sort_order)
select c.id, q.slug, q.prompt, q.options::jsonb, q.correct_index, q.explanation, q.sort_order
from (values
  ('rule-01-alliance-communication', 'check-chat', 'What are members expected to do with alliance chat?',
   '["Read it regularly","Read it only after an officer messages them","Ignore it if they use the website"]', 0,
   'Important announcements, strategies, instructions, and leadership notices are shared in alliance chat.', 1),
  ('rule-02-communication-platforms', 'check-preference', 'Is external chat mandatory for BF2 members?',
   '["Yes, it is required","No. It is encouraged, and website communication remains an option","Only for recruits"]', 1,
   'External chat is encouraged but not mandatory, and members must not be penalized for preferring the website.', 1),
  ('rule-03-alliance-mail', 'check-mail', 'You do not know how to open alliance mail. What should you do?',
   '["Ignore alliance mail","Request help and use the provided guide","Assume the website can confirm you opened it"]', 1,
   'Alliance mail is mandatory. The website cannot detect in-game mail reads; request help if needed.', 1),
  ('rule-04-identity-and-conduct', 'check-conduct', 'Which conduct is expected in alliance communication?',
   '["Respectful and constructive communication","Threats when another player disagrees","Sharing private member information"]', 0,
   'Members must communicate respectfully and must not harass or share private information without permission.', 1),
  ('rule-05-server-rules', 'check-own-server', 'You find a caravan originating from your own server. What should you do?',
   '["Do not rob it","Rob it if no one is watching","Ask another member to rob it"]', 0,
   'BF2 members must not rob caravans from their own server.', 1),
  ('rule-05-server-rules', 'check-protected-alliance', 'May you attack or recruit members from a Top 10 alliance?',
   '["Yes, if you ask first","No","Only during an event"]', 1,
   'Attacking Top 10 alliances and recruiting or poaching their members are prohibited.', 2),
  ('rule-06-conflict-and-diplomacy', 'check-diplomacy', 'A player from another alliance causes a problem. What should you do?',
   '["Threaten their alliance on BF2''s behalf","Contact alliance leadership before escalating","Declare a war yourself"]', 1,
   'Members cannot initiate wars or make threats for BF2. Contact leadership.', 1),
  ('rule-07-cross-server-targets', 'check-target-server', 'What must you verify before interacting with a possible cross-server target?',
   '["Its server and eligibility under current rules","Only whether it looks valuable","Nothing if another member shared it"]', 0,
   'Check the target server and current eligibility; ask leadership if the game mechanics or rules are unclear.', 1),
  ('rule-08-alliance-location', 'check-assembly', 'What in-game path is supplied for returning to the assembly area?',
   '["Alliance → Assembly Point → Relocate","Map → Store → Buy","Chat → Profile → Move"]', 0,
   'The supplied path is Alliance → Assembly Point → Relocate. The website cannot verify the relocation.', 1),
  ('rule-09-direct-relocates', 'check-relocate-purchase', 'Are real-money purchases required to reposition?',
   '["Yes","No","Only for recruits"]', 1,
   'Direct Relocates may be available in the Alliance Store; spending real money is not required.', 1),
  ('rule-10-rallies-and-digs', 'check-announcement', 'What should you do when you begin a rally or Alliance Dig?',
   '["Announce it in alliance chat so others can join","Keep it private","Wait until it ends to mention it"]', 0,
   'Announcing rallies and digs gives members an opportunity to participate and supports shared progress.', 1),
  ('rule-11-weekly-research', 'check-research-minimum', 'What is the weekly alliance research contribution minimum?',
   '["320","3,200","32,000"]', 1,
   'The minimum is 3,200. Diamonds and real-money purchases are never required.', 1),
  ('rule-12-ranks-and-advancement', 'check-promotion', 'Does completing the website quiz automatically promote a member?',
   '["Yes, to R3","No. Rank is earned through participation and contribution","Yes, if they use external chat"]', 1,
   'Website activity and quiz completion do not automatically promote members.', 1),
  ('cross-server-plundering-covert-ops', 'check-own-caravan', 'You locate a caravan belonging to your own server. What should you do?',
   '["Do not plunder it","Share it for others to plunder","Attack it before checking"]', 0,
   'Same-server caravans must not be plundered.', 1),
  ('cross-server-plundering-covert-ops', 'check-two-hits', 'A Covert Ops target has already been hit twice. Should you share it?',
   '["Yes, immediately","No","Only with officers"]', 1,
   'Do not share a Covert Ops target after it has already been hit twice.', 2),
  ('cross-server-plundering-covert-ops', 'check-target-checks', 'What should you verify before sharing a possible cross-server target?',
   '["Eligibility, server, and relevant attack or hit information","Only the target name","Whether it is already popular"]', 0,
   'Check its eligibility and server, plus relevant attack or hit information.', 3),
  ('cross-server-plundering-covert-ops', 'check-threats', 'Should you threaten another alliance on BF2''s behalf?',
   '["No. Contact leadership","Yes, if you are upset","Yes, if the other player started it"]', 0,
   'Members are not authorized to threaten others or initiate wars for BF2.', 4),
  ('cross-server-plundering-covert-ops', 'check-request-help', 'A recruit does not know how to access cross-server Special Ops. What should they do?',
   '["Use the BF2 training guide or ask an officer","Guess until it works","Ask someone to share an unverified target"]', 0,
   'Use approved BF2 training or ask an officer for help.', 5)
) as q(content_slug, slug, prompt, options, correct_index, explanation, sort_order)
join academy_content c on c.slug = q.content_slug and c.version = 1
on conflict (content_id, slug) do nothing;

insert into channels (alliance, slug, name, topic, min_role, sort_order, scope)
select v.* from (values
  (null::text, 'community-general', 'Community General', 'All Last Asylum players', 'member'::permission_role, 0, 'community'),
  (null, 'community-help', 'Game Help', 'Questions, guides, and answers', 'member', 1, 'community'),
  (null, 'fan-art', 'Fan Art', 'Share community creations', 'member', 2, 'community'),
  ('burnfire', 'general', 'General', 'Alliance-wide chat', 'member', 0, 'alliance'),
  ('burnfire', 'pvp', 'PVP', 'Arena and rally coordination', 'member', 1, 'alliance'),
  ('burnfire', 'recruitment', 'Recruitment', 'Recruiting and applications', 'member', 2, 'alliance'),
  ('burnfire', 'officer', 'Officer', 'Officer+ only', 'officer', 3, 'alliance')
) as v(alliance, slug, name, topic, min_role, sort_order, scope)
where not exists (
  select 1 from channels c
  where coalesce(c.alliance, '__community__') = coalesce(v.alliance, '__community__')
    and c.slug = v.slug
);
