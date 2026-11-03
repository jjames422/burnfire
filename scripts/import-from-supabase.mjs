#!/usr/bin/env node
/**
 * One-time import of community data from the old Supabase project into the
 * local burnfire database.
 *
 * Usage (after unpausing the Supabase project at supabase.com):
 *
 *   SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' \
 *     node scripts/import-from-supabase.mjs
 *
 * Reads the local DATABASE_URL from .env.local automatically. Safe to re-run:
 * every insert is `on conflict do nothing`.
 *
 * Not migrated: storage files (chat attachments / fan art images). Their
 * database rows are skipped because the files themselves live in Supabase
 * Storage; re-upload anything important through the site.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";

const supabaseUrl = process.env.SUPABASE_DB_URL;
if (!supabaseUrl) {
  console.error("Set SUPABASE_DB_URL to the Supabase Postgres connection string.");
  process.exit(1);
}

const envFile = await readFile(new URL("../.env.local", import.meta.url), "utf8");
const localUrl = envFile.match(/^DATABASE_URL=(.+)$/m)?.[1];
if (!localUrl) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const source = new pg.Client({ connectionString: supabaseUrl, ssl: { rejectUnauthorized: false } });
const target = new pg.Client({ connectionString: localUrl });
await source.connect();
await target.connect();

async function rows(sql) {
  return (await source.query(sql)).rows;
}

async function copy(label, list, insertSql, toParams) {
  let copied = 0;
  for (const row of list) {
    const result = await target.query(insertSql, toParams(row));
    copied += result.rowCount ?? 0;
  }
  console.log(`${label}: ${copied}/${list.length} imported`);
}

await target.query("begin");
try {
  // Accounts (auth.users is Supabase's internal schema).
  await copy(
    "users",
    await rows(`select id, lower(email) as email, created_at from auth.users where email is not null`),
    `insert into users (id, email, created_at) values ($1, $2, $3) on conflict do nothing`,
    (r) => [r.id, r.email, r.created_at],
  );

  await copy(
    "alliances",
    await rows(`select slug, name, code, kingdom_number, created_at from public.alliances`),
    `insert into alliances (slug, name, code, kingdom_number, created_at)
     values ($1, $2, $3, $4, $5) on conflict do nothing`,
    (r) => [r.slug, r.name, r.code, r.kingdom_number, r.created_at],
  );

  await copy(
    "profiles",
    await rows(`select * from public.profiles`),
    `insert into profiles (id, alliance, display_name, in_game_name, display_rank, permission_role, created_at, name_changed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
    (r) => [r.id, r.alliance, r.display_name, r.in_game_name, r.display_rank, r.permission_role, r.created_at, r.name_changed_at],
  );

  await copy(
    "alliance_members",
    await rows(`select * from public.alliance_members`),
    `insert into alliance_members (alliance, user_id, permission_role, game_rank, alliance_title, verified_at, verified_by, joined_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
    (r) => [r.alliance, r.user_id, r.permission_role, r.game_rank, r.alliance_title, r.verified_at, r.verified_by, r.joined_at],
  );

  await copy(
    "platform_admins",
    await rows(`select * from public.platform_admins`),
    `insert into platform_admins (user_id, created_at) values ($1, $2) on conflict do nothing`,
    (r) => [r.user_id, r.created_at],
  );

  // Channels: the local database is pre-seeded, so match by (alliance, slug)
  // and remap old channel ids onto the local ones for messages/pins.
  const sourceChannels = await rows(`select * from public.channels`);
  const channelMap = new Map();
  for (const channel of sourceChannels) {
    const existing = await target.query(
      `select id from channels
       where coalesce(alliance, '__community__') = coalesce($1, '__community__') and slug = $2`,
      [channel.alliance, channel.slug],
    );
    if (existing.rows[0]) {
      channelMap.set(channel.id, existing.rows[0].id);
    } else {
      await target.query(
        `insert into channels (id, alliance, slug, name, topic, min_role, sort_order, scope, slow_mode_seconds, is_archived, allow_threads)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict do nothing`,
        [channel.id, channel.alliance, channel.slug, channel.name, channel.topic, channel.min_role,
         channel.sort_order, channel.scope ?? "alliance", channel.slow_mode_seconds ?? 0,
         channel.is_archived ?? false, channel.allow_threads ?? true],
      );
      channelMap.set(channel.id, channel.id);
    }
  }
  console.log(`channels: ${channelMap.size} mapped`);

  const messages = await rows(`select * from public.messages order by created_at`);
  await copy(
    "messages",
    messages,
    `insert into messages (id, channel_id, author_id, body, created_at, deleted_at, edited_at, parent_message_id, thread_root_id, deleted_by, delete_reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict do nothing`,
    (r) => [r.id, channelMap.get(r.channel_id) ?? r.channel_id, r.author_id, r.body, r.created_at,
      r.deleted_at, r.edited_at, r.parent_message_id, r.thread_root_id, r.deleted_by, r.delete_reason],
  );

  await copy(
    "message_reactions",
    await rows(`select * from public.message_reactions`),
    `insert into message_reactions (message_id, user_id, emoji, created_at)
     values ($1, $2, $3, $4) on conflict do nothing`,
    (r) => [r.message_id, r.user_id, r.emoji, r.created_at],
  );

  await copy(
    "message_mentions",
    await rows(`select * from public.message_mentions`),
    `insert into message_mentions (message_id, mentioned_user_id, created_at)
     values ($1, $2, $3) on conflict do nothing`,
    (r) => [r.message_id, r.mentioned_user_id, r.created_at],
  );

  await copy(
    "pinned_messages",
    await rows(`select * from public.pinned_messages`),
    `insert into pinned_messages (channel_id, message_id, pinned_by, pinned_at)
     values ($1, $2, $3, $4) on conflict do nothing`,
    (r) => [channelMap.get(r.channel_id) ?? r.channel_id, r.message_id, r.pinned_by, r.pinned_at],
  );

  await copy(
    "notifications",
    await rows(`select * from public.notifications`),
    `insert into notifications (id, user_id, kind, title, body, data, read_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
    (r) => [r.id, r.user_id, r.kind, r.title, r.body, r.data, r.read_at, r.created_at],
  );

  await copy(
    "alliance_invitations",
    await rows(`select * from public.alliance_invitations`),
    `insert into alliance_invitations (id, alliance, invitee_id, invited_by, game_rank, alliance_title, permission_role, status, expires_at, created_at, responded_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict do nothing`,
    (r) => [r.id, r.alliance, r.invitee_id, r.invited_by, r.game_rank, r.alliance_title,
      r.permission_role, r.status, r.expires_at, r.created_at, r.responded_at],
  );

  await copy(
    "user_blocks",
    await rows(`select * from public.user_blocks`),
    `insert into user_blocks (blocker_id, blocked_id, created_at) values ($1, $2, $3) on conflict do nothing`,
    (r) => [r.blocker_id, r.blocked_id, r.created_at],
  );

  await copy(
    "comments",
    await rows(`select * from public.comments`),
    `insert into comments (id, alliance, guide_slug, author_id, author_name, author_rank, body, status, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`,
    (r) => [r.id, r.alliance, r.guide_slug, r.author_id, r.author_name, r.author_rank, r.body, r.status, r.created_at],
  );

  // guide_reactions has a sync trigger that rebuilds the `reactions` counts.
  await copy(
    "guide_reactions",
    await rows(`select * from public.guide_reactions`),
    `insert into guide_reactions (id, alliance, guide_slug, reaction_type, user_id, created_at)
     values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
    (r) => [r.id, r.alliance, r.guide_slug, r.reaction_type, r.user_id, r.created_at],
  );

  await copy(
    "content_reports",
    await rows(`select * from public.content_reports`),
    `insert into content_reports (id, reporter_id, target_type, target_id, reason, status, resolved_by, resolved_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`,
    (r) => [r.id, r.reporter_id, r.target_type, r.target_id, r.reason, r.status, r.resolved_by, r.resolved_at, r.created_at],
  );

  await target.query("commit");
  console.log("\nImport complete. Users sign in with the same email and get their history back.");
} catch (error) {
  await target.query("rollback");
  console.error("Import failed — nothing was changed locally.");
  throw error;
} finally {
  await source.end();
  await target.end();
}
