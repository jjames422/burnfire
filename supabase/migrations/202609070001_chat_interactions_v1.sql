-- Chat Interaction Update 1: safe mention discovery, validated notifications,
-- owner deletion, and private typing broadcasts.

create or replace function public.get_my_chat_identity()
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(public.format_member_identity(auth.uid()), 'Unknown survivor');
$$;
revoke execute on function public.get_my_chat_identity() from public,anon;
grant execute on function public.get_my_chat_identity() to authenticated;

create or replace function public.get_channel_mention_candidates(
  p_channel_id uuid,
  p_query text default '',
  p_limit integer default 8
)
returns table(user_id uuid, identity_label text, mention_text text)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id, public.format_member_identity(p.id), p.in_game_name
  from public.profiles p
  join public.channels c on c.id=p_channel_id
  left join public.alliance_members am on am.user_id=p.id
  where public.can_access_channel(p_channel_id)
    and (
      (c.scope='community')
      or (c.scope='alliance' and am.alliance=c.alliance)
    )
    and (trim(coalesce(p_query,''))='' or p.in_game_name ilike '%' || trim(p_query) || '%')
  order by
    case when lower(p.in_game_name)=lower(trim(coalesce(p_query,''))) then 0 else 1 end,
    p.in_game_name
  limit least(greatest(p_limit,1),20);
$$;
revoke execute on function public.get_channel_mention_candidates(uuid,text,integer) from public,anon;
grant execute on function public.get_channel_mention_candidates(uuid,text,integer) to authenticated;

create or replace function public.post_channel_message(
  p_channel_id uuid,
  p_body text,
  p_parent_message_id uuid default null,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare message_id uuid; mention_id uuid; ch public.channels;
begin
  if not public.can_access_channel(p_channel_id) then raise exception 'Channel access denied'; end if;
  if char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid message length'; end if;
  select * into ch from public.channels where id=p_channel_id;
  insert into public.messages(channel_id,author_id,body,parent_message_id)
  values(p_channel_id,auth.uid(),trim(p_body),p_parent_message_id) returning id into message_id;
  foreach mention_id in array coalesce(p_mentioned_user_ids,'{}'::uuid[]) loop
    if mention_id<>auth.uid() and exists(
      select 1 from public.profiles p
      left join public.alliance_members am on am.user_id=p.id
      where p.id=mention_id and (ch.scope='community' or (ch.scope='alliance' and am.alliance=ch.alliance))
    ) then
      insert into public.message_mentions(message_id,mentioned_user_id) values(message_id,mention_id) on conflict do nothing;
      insert into public.notifications(user_id,kind,title,body,data)
      values(mention_id,'chat_mention','You were mentioned',
        coalesce(public.format_member_identity(auth.uid()),'Someone') || ' mentioned you in #' || ch.name || '.',
        jsonb_build_object('channel_id',p_channel_id,'message_id',message_id));
    end if;
  end loop;
  if p_parent_message_id is not null then
    insert into public.notifications(user_id,kind,title,body,data)
    select m.author_id,'chat_reply','New reply',
      coalesce(public.format_member_identity(auth.uid()),'Someone') || ' replied to your message.',
      jsonb_build_object('channel_id',p_channel_id,'message_id',message_id)
    from public.messages m where m.id=p_parent_message_id and m.author_id<>auth.uid();
  end if;
  return message_id;
end;
$$;
grant execute on function public.post_channel_message(uuid,text,uuid,uuid[]) to authenticated;

create or replace function public.delete_message(p_message_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.messages
  set deleted_at=now(), deleted_by=auth.uid(), delete_reason='Deleted by author'
  where id=p_message_id and author_id=auth.uid() and deleted_at is null;
  if not found then raise exception 'Message cannot be deleted'; end if;
end;
$$;
revoke execute on function public.delete_message(uuid) from public,anon;
grant execute on function public.delete_message(uuid) to authenticated;

drop policy if exists "members receive private typing" on realtime.messages;
create policy "members receive private typing" on realtime.messages
for select to authenticated using (
  realtime.messages.extension='broadcast'
  and split_part(realtime.topic(),':',1)='typing'
  and public.can_access_channel(split_part(realtime.topic(),':',2)::uuid)
);
drop policy if exists "members send private typing" on realtime.messages;
create policy "members send private typing" on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension='broadcast'
  and split_part(realtime.topic(),':',1)='typing'
  and public.can_access_channel(split_part(realtime.topic(),':',2)::uuid)
);
