-- Reverses the "Kingdom intelligence" section of db/schema.sql.
-- DESTRUCTIVE: deletes every synchronized snapshot and every leadership
-- record (reviews, diplomacy, notes). Take a backup first:
--   pg_dump "$DATABASE_URL" -t 'intel_*' -Fc -f intel-backup.dump
-- Run only on an explicit owner decision. Nothing outside intel_* is touched.
begin;
drop function if exists intel_apply_retention(text);
drop function if exists intel_is_leadership(uuid, text);
drop function if exists intel_is_member(uuid, text);
drop table if exists intel_audit_log, intel_report_deliveries, intel_kingdom_events, intel_leadership_notes,
  intel_contacts, intel_treaties, intel_relation_history, intel_relations, intel_review_events, intel_reviews,
  intel_absences, intel_settings, intel_player_links, intel_member_snapshots, intel_memberships,
  intel_player_names, intel_players, intel_alliance_snapshots, intel_sync_runs, intel_alliance_identities,
  intel_alliances, intel_kingdoms, intel_providers;
commit;
