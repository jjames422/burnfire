-- Discord-style text chat and payment-provider-neutral premium entitlements.
-- Billing remains disabled until Stripe products/secrets are configured.

-- Channel organization and controls.
create table if not exists public.channel_categories (
  id uuid primary key default gen_random_uuid(),
  alliance text references public.alliances(slug) on delete cascade,
  scope text not null check(scope in ('community','alliance')),
  name text not null check(char_length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check((scope='community' and alliance is null) or (scope='alliance' and alliance is not null))
);
create unique index if not exists channel_categories_unique_name
  on public.channel_categories(coalesce(alliance,'__community__'),lower(name));
alter table public.channel_categories enable row level security;
grant select on public.channel_categories to authenticated;
create policy "users read accessible channel categories" on public.channel_categories
for select to authenticated using(
  scope='community' or public.my_role(alliance) is not null
);

alter table public.channels
  add column if not exists category_id uuid references public.channel_categories(id) on delete set null,
  add column if not exists slow_mode_seconds integer not null default 0,
  add column if not exists is_archived boolean not null default false,
  add column if not exists allow_threads boolean not null default true;
alter table public.channels drop constraint if exists channels_slow_mode_check;
alter table public.channels add constraint channels_slow_mode_check
  check(slow_mode_seconds between 0 and 21600);

-- Replies, threads, edits, searchable text, and soft deletion.
alter table public.messages
  add column if not exists parent_message_id uuid references public.messages(id) on delete set null,
  add column if not exists thread_root_id uuid references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists delete_reason text;
create index if not exists messages_thread_idx on public.messages(thread_root_id,created_at);
create index if not exists messages_author_idx on public.messages(author_id,created_at desc);
create index if not exists messages_search_idx
  on public.messages using gin(to_tsvector('simple',body));

create table if not exists public.message_edit_history (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.messages(id) on delete cascade,
  editor_id uuid references auth.users(id) on delete set null,
  previous_body text not null,
  edited_at timestamptz not null default now()
);
alter table public.message_edit_history enable row level security;
revoke all on public.message_edit_history from anon,authenticated;

create or replace function public.capture_message_edit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.body is distinct from old.body then
    insert into public.message_edit_history(message_id,editor_id,previous_body)
    values(old.id,auth.uid(),old.body);
    new.edited_at:=now();
  end if;
  return new;
end;
$$;
drop trigger if exists messages_capture_edit on public.messages;
create trigger messages_capture_edit before update of body on public.messages
for each row execute function public.capture_message_edit();

-- Emoji reactions support Unicode and approved custom emoji tokens.
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check(char_length(emoji) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key(message_id,user_id,emoji)
);
alter table public.message_reactions enable row level security;
grant select,insert,delete on public.message_reactions to authenticated;
create policy "users read reactions on visible messages" on public.message_reactions
for select to authenticated using(exists(select 1 from public.messages m where m.id=message_id));
create policy "users add their own message reactions" on public.message_reactions
for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id));
create policy "users remove their own message reactions" on public.message_reactions
for delete to authenticated using(user_id=auth.uid());

create table if not exists public.custom_emojis (
  id uuid primary key default gen_random_uuid(),
  alliance text references public.alliances(slug) on delete cascade,
  name text not null check(name ~ '^[a-zA-Z0-9_]{2,32}$'),
  storage_path text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(alliance,name)
);
alter table public.custom_emojis enable row level security;
grant select on public.custom_emojis to authenticated;
create policy "users read community and alliance emoji" on public.custom_emojis
for select to authenticated using(alliance is null or public.my_role(alliance) is not null);

-- Mentions, pins, read positions, preferences, and notification controls.
create table if not exists public.message_mentions (
  message_id uuid not null references public.messages(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(message_id,mentioned_user_id)
);
alter table public.message_mentions enable row level security;
grant select on public.message_mentions to authenticated;
create policy "users read their mentions" on public.message_mentions
for select to authenticated using(mentioned_user_id=auth.uid());

create table if not exists public.pinned_messages (
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key(channel_id,message_id)
);
alter table public.pinned_messages enable row level security;
grant select on public.pinned_messages to authenticated;
create policy "users read pins in visible channels" on public.pinned_messages
for select to authenticated using(exists(select 1 from public.channels c where c.id=channel_id));

create table if not exists public.channel_read_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  last_read_message_id uuid references public.messages(id) on delete set null,
  primary key(user_id,channel_id)
);
alter table public.channel_read_states enable row level security;
grant select,insert,update on public.channel_read_states to authenticated;
create policy "users manage their channel read states" on public.channel_read_states
for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.chat_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allow_direct_messages boolean not null default true,
  notify_mentions boolean not null default true,
  notify_replies boolean not null default true,
  notify_all_messages boolean not null default false,
  show_online_status boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.chat_preferences enable row level security;
grant select,insert,update on public.chat_preferences to authenticated;
create policy "users manage their chat preferences" on public.chat_preferences
for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Timeouts and bans are scoped to an alliance or the community.
create table if not exists public.chat_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alliance text references public.alliances(slug) on delete cascade,
  kind text not null check(kind in ('timeout','ban')),
  reason text check(char_length(reason)<=500),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);
create unique index if not exists chat_restrictions_one_active
  on public.chat_restrictions(user_id,coalesce(alliance,'__community__'),kind)
  where revoked_at is null;
alter table public.chat_restrictions enable row level security;
grant select on public.chat_restrictions to authenticated;
create policy "users and moderators read chat restrictions" on public.chat_restrictions
for select to authenticated using(user_id=auth.uid() or public.is_platform_admin() or public.my_role(alliance) in ('officer','admin'));

create or replace function public.is_chat_restricted(p_user_id uuid,p_alliance text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.chat_restrictions r where r.user_id=p_user_id
    and (r.alliance is null or r.alliance=p_alliance) and r.revoked_at is null
    and (r.expires_at is null or r.expires_at>now()));
$$;
revoke execute on function public.is_chat_restricted(uuid,text) from public,anon;
grant execute on function public.is_chat_restricted(uuid,text) to authenticated;

create or replace function public.enforce_message_rules()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ch public.channels; declare latest timestamptz;
begin
  select * into ch from public.channels where id=new.channel_id;
  if ch.id is null or ch.is_archived then raise exception 'Channel is not available'; end if;
  if public.is_chat_restricted(auth.uid(),ch.alliance) then raise exception 'Chat access is restricted'; end if;
  if ch.slow_mode_seconds>0 then
    select max(created_at) into latest from public.messages where channel_id=ch.id and author_id=auth.uid();
    if latest is not null and latest + make_interval(secs=>ch.slow_mode_seconds)>now()
    then raise exception 'Slow mode is active'; end if;
  end if;
  if new.parent_message_id is not null then
    if not ch.allow_threads then raise exception 'Replies are disabled in this channel'; end if;
    if not exists(select 1 from public.messages p where p.id=new.parent_message_id and p.channel_id=new.channel_id)
    then raise exception 'Reply target is not in this channel'; end if;
    new.thread_root_id:=coalesce((select p.thread_root_id from public.messages p where p.id=new.parent_message_id),new.parent_message_id);
  end if;
  return new;
end;
$$;
drop trigger if exists messages_enforce_rules on public.messages;
create trigger messages_enforce_rules before insert on public.messages
for each row execute function public.enforce_message_rules();

create or replace function public.edit_message(p_message_id uuid,p_body text)
returns public.messages language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.messages;
begin
  if char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid message length'; end if;
  update public.messages set body=trim(p_body) where id=p_message_id and author_id=auth.uid()
    and deleted_at is null and created_at>now()-interval '24 hours' returning * into result;
  if not found then raise exception 'Message cannot be edited'; end if;
  return result;
end;
$$;
grant execute on function public.edit_message(uuid,text) to authenticated;

create or replace function public.pin_message(p_message_id uuid,p_pin boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare ch public.channels;
begin
  select c.* into ch from public.messages m join public.channels c on c.id=m.channel_id where m.id=p_message_id;
  if ch.id is null then raise exception 'Message not found'; end if;
  if not(public.is_platform_admin() or (ch.alliance is not null and public.my_role(ch.alliance) in ('officer','admin')))
  then raise exception 'Moderator required'; end if;
  if p_pin then insert into public.pinned_messages(channel_id,message_id,pinned_by)
    values(ch.id,p_message_id,auth.uid()) on conflict do nothing;
  else delete from public.pinned_messages where channel_id=ch.id and message_id=p_message_id; end if;
end;
$$;
grant execute on function public.pin_message(uuid,boolean) to authenticated;

create or replace function public.restrict_chat_user(p_user_id uuid,p_alliance text,p_kind text,p_reason text,p_expires_at timestamptz)
returns public.chat_restrictions language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.chat_restrictions;
begin
  if not(public.is_platform_admin() or (p_alliance is not null and public.my_role(p_alliance) in ('officer','admin')))
  then raise exception 'Moderator required'; end if;
  if p_kind not in ('timeout','ban') then raise exception 'Invalid restriction'; end if;
  insert into public.chat_restrictions(user_id,alliance,kind,reason,expires_at,created_by)
  values(p_user_id,p_alliance,p_kind,p_reason,p_expires_at,auth.uid()) returning * into result;
  insert into public.audit_events(actor_id,alliance,action,target_type,target_id,details)
  values(auth.uid(),p_alliance,'chat.'||p_kind,'profile',p_user_id::text,jsonb_build_object('reason',p_reason,'expires_at',p_expires_at));
  return result;
end;
$$;
grant execute on function public.restrict_chat_user(uuid,text,text,text,timestamptz) to authenticated;

-- Private attachments. Access follows visibility of the owning message.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-attachments','chat-attachments',false,26214400,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),message_id uuid references public.messages(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,storage_path text not null unique,
  file_name text not null,mime_type text not null,size_bytes bigint not null check(size_bytes between 1 and 26214400),
  created_at timestamptz not null default now()
);
alter table public.chat_attachments enable row level security;
grant select,insert,delete on public.chat_attachments to authenticated;
create policy "users read attachments on visible messages" on public.chat_attachments
for select to authenticated using(exists(select 1 from public.messages m where m.id=message_id));
create policy "users stage their own attachments" on public.chat_attachments
for insert to authenticated with check(uploader_id=auth.uid() and storage_path like auth.uid()::text||'/%');
create policy "users remove their attachments" on public.chat_attachments
for delete to authenticated using(uploader_id=auth.uid());
create policy "users upload chat attachments" on storage.objects for insert to authenticated
with check(bucket_id='chat-attachments' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users read visible chat attachments" on storage.objects for select to authenticated
using(bucket_id='chat-attachments' and exists(select 1 from public.chat_attachments a
  join public.messages m on m.id=a.message_id where a.storage_path=name));
create policy "users delete their chat attachments" on storage.objects for delete to authenticated
using(bucket_id='chat-attachments' and (storage.foldername(name))[1]=auth.uid()::text);

-- Direct and group messages.
create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),name text check(char_length(name)<=80),
  is_group boolean not null default false,created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.direct_conversation_members (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),last_read_at timestamptz,
  primary key(conversation_id,user_id)
);
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,parent_message_id uuid references public.direct_messages(id) on delete set null,
  body text not null check(char_length(trim(body)) between 1 and 2000),created_at timestamptz not null default now(),
  edited_at timestamptz,deleted_at timestamptz
);
create index if not exists direct_messages_conversation_idx on public.direct_messages(conversation_id,created_at desc);
alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_members enable row level security;
alter table public.direct_messages enable row level security;
grant select on public.direct_conversations,public.direct_conversation_members to authenticated;
grant select,insert on public.direct_messages to authenticated;

create or replace function public.is_direct_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.direct_conversation_members
    where conversation_id=p_conversation_id and user_id=auth.uid());
$$;
revoke execute on function public.is_direct_conversation_member(uuid) from public,anon;
grant execute on function public.is_direct_conversation_member(uuid) to authenticated;

create policy "members read direct conversations" on public.direct_conversations for select to authenticated
using(public.is_direct_conversation_member(id));
create policy "members read direct participants" on public.direct_conversation_members for select to authenticated
using(public.is_direct_conversation_member(conversation_id));
create policy "members read direct messages" on public.direct_messages for select to authenticated
using(deleted_at is null and public.is_direct_conversation_member(conversation_id) and not public.is_blocked_pair(author_id));
create policy "members send direct messages" on public.direct_messages for insert to authenticated
with check(author_id=auth.uid() and public.is_direct_conversation_member(conversation_id));
drop trigger if exists direct_messages_rate_limit on public.direct_messages;
create trigger direct_messages_rate_limit before insert on public.direct_messages
for each row execute function public.enforce_interaction_rate('direct_message','30','1 minute');

create or replace function public.create_direct_conversation(p_member_ids uuid[],p_name text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare conversation_id uuid; declare member_id uuid; declare unique_members uuid[];
begin
  select array_agg(distinct x) into unique_members from unnest(p_member_ids||auth.uid()) x;
  if array_length(unique_members,1) not between 2 and 10 then raise exception 'Conversations require 2 to 10 members'; end if;
  if exists(select 1 from unnest(unique_members) x where public.is_blocked_pair(x)) then raise exception 'A member is blocked'; end if;
  if exists(select 1 from unnest(unique_members) x left join public.profiles p on p.id=x where p.id is null)
  then raise exception 'Every member needs a community profile'; end if;
  insert into public.direct_conversations(name,is_group,created_by)
  values(nullif(trim(p_name),''),array_length(unique_members,1)>2,auth.uid()) returning id into conversation_id;
  foreach member_id in array unique_members loop
    insert into public.direct_conversation_members(conversation_id,user_id) values(conversation_id,member_id);
  end loop;
  return conversation_id;
end;
$$;
grant execute on function public.create_direct_conversation(uuid[],text) to authenticated;

-- Subscription and entitlement layer. No card data is stored here.
create table if not exists public.subscription_plans (
  id text primary key,name text not null,description text not null,active boolean not null default false,
  stripe_product_id text unique,stripe_price_id text unique,created_at timestamptz not null default now()
);
create table if not exists public.plan_entitlements (
  plan_id text not null references public.subscription_plans(id) on delete cascade,
  entitlement_key text not null,value integer not null default 1,primary key(plan_id,entitlement_key)
);
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
  id text primary key,user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text references public.subscription_plans(id),status text not null,
  current_period_end timestamptz,cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.entitlement_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,entitlement_key text not null,value integer not null,
  expires_at timestamptz,reason text,created_by uuid references auth.users(id) on delete set null,
  primary key(user_id,entitlement_key)
);
create table if not exists public.stripe_webhook_events (
  event_id text primary key,event_type text not null,processed_at timestamptz not null default now(),payload jsonb not null
);
alter table public.subscription_plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlement_overrides enable row level security;
alter table public.stripe_webhook_events enable row level security;
grant select on public.subscription_plans,public.plan_entitlements to authenticated;
grant select on public.subscriptions to authenticated;
create policy "users read active plans" on public.subscription_plans for select to authenticated using(active or public.is_platform_admin());
create policy "users read plan benefits" on public.plan_entitlements for select to authenticated
using(exists(select 1 from public.subscription_plans p where p.id=plan_id and (p.active or public.is_platform_admin())));
create policy "users read their subscriptions" on public.subscriptions for select to authenticated using(user_id=auth.uid());
revoke all on public.billing_customers,public.entitlement_overrides,public.stripe_webhook_events from anon,authenticated;
revoke insert,update,delete on public.subscription_plans,public.plan_entitlements,public.subscriptions from anon,authenticated;

insert into public.subscription_plans(id,name,description,active) values
  ('free','Community','Core chat, guides, comments, and fan art',true),
  ('supporter','Supporter','Cosmetic identity and expanded personal limits',false),
  ('alliance-pro','Alliance Pro','Expanded alliance branding, channels, emoji, and storage',false)
on conflict(id) do nothing;
insert into public.plan_entitlements(plan_id,entitlement_key,value) values
  ('free','upload_mb',10),('free','custom_emoji',0),('free','animated_profile',0),
  ('supporter','upload_mb',25),('supporter','custom_emoji',20),('supporter','animated_profile',1),
  ('alliance-pro','alliance_channels',100),('alliance-pro','custom_emoji',100),('alliance-pro','alliance_storage_gb',25)
on conflict(plan_id,entitlement_key) do update set value=excluded.value;

create or replace function public.entitlement_value(p_key text)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
  with subscribed as (
    select coalesce(max(e.value),0) value from public.subscriptions s
    join public.plan_entitlements e on e.plan_id=s.plan_id
    where s.user_id=auth.uid() and s.status in ('active','trialing') and e.entitlement_key=p_key
  ), free_value as (
    select coalesce(max(value),0) value from public.plan_entitlements where plan_id='free' and entitlement_key=p_key
  ), override_value as (
    select value from public.entitlement_overrides where user_id=auth.uid() and entitlement_key=p_key
      and (expires_at is null or expires_at>now())
  ) select coalesce((select value from override_value),greatest((select value from subscribed),(select value from free_value)));
$$;
grant execute on function public.entitlement_value(text) to authenticated;

-- Billing is deliberately off until Stripe secrets and live price IDs exist.
create or replace function public.billing_is_enabled()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.subscription_plans where active and id<>'free'
    and stripe_product_id is not null and stripe_price_id is not null);
$$;
grant execute on function public.billing_is_enabled() to anon,authenticated;

-- Direct-message and premium authority tables are function/webhook managed.
revoke insert,update,delete on public.direct_conversations,public.direct_conversation_members from anon,authenticated;
