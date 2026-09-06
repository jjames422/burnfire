-- Allow authenticated profiles to use presence in community channels while
-- preserving alliance rank checks for private alliance channels.

drop policy if exists "members receive alliance presence" on realtime.messages;
create policy "members receive alliance presence"
on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'presence'
  and split_part(realtime.topic(), ':', 1) = 'presence'
  and exists (
    select 1
    from public.channels c
    where c.slug = split_part(realtime.topic(), ':', 3)
      and (
        (
          c.scope = 'community'
          and split_part(realtime.topic(), ':', 2) = 'community'
          and exists (select 1 from public.profiles p where p.id = auth.uid())
        )
        or (
          c.scope = 'alliance'
          and c.alliance = split_part(realtime.topic(), ':', 2)
          and public.role_rank(public.my_role(c.alliance)) >= public.role_rank(c.min_role)
        )
      )
  )
);

drop policy if exists "members send alliance presence" on realtime.messages;
create policy "members send alliance presence"
on realtime.messages for insert to authenticated with check (
  realtime.messages.extension = 'presence'
  and split_part(realtime.topic(), ':', 1) = 'presence'
  and exists (
    select 1
    from public.channels c
    where c.slug = split_part(realtime.topic(), ':', 3)
      and (
        (
          c.scope = 'community'
          and split_part(realtime.topic(), ':', 2) = 'community'
          and exists (select 1 from public.profiles p where p.id = auth.uid())
        )
        or (
          c.scope = 'alliance'
          and c.alliance = split_part(realtime.topic(), ':', 2)
          and public.role_rank(public.my_role(c.alliance)) >= public.role_rank(c.min_role)
        )
      )
  )
);

-- Message reactions are interactive writes and receive their own transactional
-- rate limit instead of sharing a client-only throttle.
drop trigger if exists message_reactions_rate_limit on public.message_reactions;
create trigger message_reactions_rate_limit
before insert on public.message_reactions
for each row execute function public.enforce_interaction_rate(
  'message_reaction',
  '60',
  '1 minute'
);
