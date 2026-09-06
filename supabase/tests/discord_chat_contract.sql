-- Read-only contract checks for Discord-style chat and premium scaffolding.
do $$
begin
  assert to_regclass('public.message_reactions') is not null, 'message reactions missing';
  assert to_regclass('public.message_mentions') is not null, 'mentions missing';
  assert to_regclass('public.channel_read_states') is not null, 'read states missing';
  assert to_regclass('public.direct_conversations') is not null, 'direct messages missing';
  assert to_regclass('public.chat_restrictions') is not null, 'chat restrictions missing';
  assert to_regclass('public.subscriptions') is not null, 'subscriptions missing';
  assert to_regclass('public.plan_entitlements') is not null, 'entitlements missing';
  assert not public.billing_is_enabled(), 'billing activated before Stripe configuration';
  assert not has_table_privilege('authenticated','public.billing_customers','SELECT'), 'billing identifiers exposed';
  assert not has_table_privilege('authenticated','public.subscriptions','INSERT'), 'client can forge subscriptions';
  assert has_function_privilege('authenticated','public.create_direct_conversation(uuid[],text)','EXECUTE'), 'DM creation unavailable';
end $$;
