-- Read-only post-deployment contract checks. Run as postgres in SQL Editor.
do $$
begin
  assert (select code='BFA' from public.alliances where slug='burnfire'), 'BurnFire code missing';
  assert (select count(*)=0 from public.profiles where in_game_name is null), 'canonical names missing';
  assert to_regclass('public.alliance_invitations') is not null, 'invitations missing';
  assert to_regclass('public.notifications') is not null, 'notifications missing';
  assert to_regclass('public.fan_art') is not null, 'fan art missing';
  assert to_regclass('public.content_reports') is not null, 'reports missing';
  assert to_regclass('public.audit_events') is not null, 'audit trail missing';
  assert not has_table_privilege('anon','public.alliance_members','INSERT'), 'anon can alter membership';
  assert not has_table_privilege('authenticated','public.alliance_members','INSERT'), 'client can alter membership';
  assert not has_table_privilege('anon','public.interaction_events','SELECT'), 'rate events exposed';
  assert has_function_privilege('authenticated','public.respond_to_alliance_invitation(uuid,boolean)','EXECUTE'), 'invitation response unavailable';
  assert has_function_privilege('authenticated','public.transfer_alliance_leadership(uuid)','EXECUTE'), 'leadership transfer unavailable';
  assert not has_table_privilege('authenticated','public.notifications','UPDATE'), 'notification contents are client-editable';
end $$;
