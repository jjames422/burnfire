-- Safe client API for cross-alliance community chat.
create or replace function public.can_access_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.channels c where c.id=p_channel_id and not c.is_archived and (
    (c.scope='community' and exists(select 1 from public.profiles p where p.id=auth.uid()))
    or (c.scope='alliance' and public.role_rank(public.my_role(c.alliance))>=public.role_rank(c.min_role))
  ));
$$;
revoke execute on function public.can_access_channel(uuid) from public,anon;
grant execute on function public.can_access_channel(uuid) to authenticated;

create or replace function public.get_channel_messages(p_channel_id uuid,p_limit integer default 100)
returns table(id uuid,channel_id uuid,author_id uuid,body text,created_at timestamptz,edited_at timestamptz,
  parent_message_id uuid,thread_root_id uuid,identity_label text,reactions jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,m.channel_id,m.author_id,m.body,m.created_at,m.edited_at,m.parent_message_id,m.thread_root_id,
    coalesce(public.format_member_identity(m.author_id),'Former member'),
    coalesce((select jsonb_object_agg(x.emoji,x.total) from
      (select r.emoji,count(*) total from public.message_reactions r where r.message_id=m.id group by r.emoji) x),'{}'::jsonb)
  from public.messages m where m.channel_id=p_channel_id and m.deleted_at is null
    and public.can_access_channel(p_channel_id) and not public.is_blocked_pair(m.author_id)
  order by m.created_at desc limit least(greatest(p_limit,1),100);
$$;
grant execute on function public.get_channel_messages(uuid,integer) to authenticated;

create or replace function public.post_channel_message(p_channel_id uuid,p_body text,p_parent_message_id uuid default null,
  p_mentioned_user_ids uuid[] default '{}'::uuid[])
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare message_id uuid; mention_id uuid;
begin
  if not public.can_access_channel(p_channel_id) then raise exception 'Channel access denied'; end if;
  if char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid message length'; end if;
  insert into public.messages(channel_id,author_id,body,parent_message_id)
  values(p_channel_id,auth.uid(),trim(p_body),p_parent_message_id) returning id into message_id;
  foreach mention_id in array coalesce(p_mentioned_user_ids,'{}'::uuid[]) loop
    if mention_id<>auth.uid() then
      insert into public.message_mentions(message_id,mentioned_user_id) values(message_id,mention_id) on conflict do nothing;
      insert into public.notifications(user_id,kind,title,body,data)
      values(mention_id,'chat_mention','You were mentioned','Someone mentioned you in chat.',
        jsonb_build_object('channel_id',p_channel_id,'message_id',message_id));
    end if;
  end loop;
  if p_parent_message_id is not null then
    insert into public.notifications(user_id,kind,title,body,data)
    select m.author_id,'chat_reply','New reply','Someone replied to your message.',
      jsonb_build_object('channel_id',p_channel_id,'message_id',message_id)
    from public.messages m where m.id=p_parent_message_id and m.author_id<>auth.uid();
  end if;
  return message_id;
end;
$$;
grant execute on function public.post_channel_message(uuid,text,uuid,uuid[]) to authenticated;

create or replace function public.search_channel_messages(p_channel_id uuid,p_query text)
returns table(id uuid,body text,created_at timestamptz,identity_label text)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,m.body,m.created_at,coalesce(public.format_member_identity(m.author_id),'Former member')
  from public.messages m where m.channel_id=p_channel_id and m.deleted_at is null
    and public.can_access_channel(p_channel_id) and not public.is_blocked_pair(m.author_id)
    and to_tsvector('simple',m.body) @@ plainto_tsquery('simple',p_query)
  order by m.created_at desc limit 50;
$$;
grant execute on function public.search_channel_messages(uuid,text) to authenticated;
