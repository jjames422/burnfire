# Managing roles and channels

There's no admin UI in the app for this (deliberately deferred — see the bottom of this doc).
Both tasks below happen directly in **Supabase's Table Editor**: dashboard for your project →
**Table Editor** in the left sidebar.

## Promoting a member to Officer or Admin

A member's access to gated channels (currently just `#officer`) is controlled entirely by the
`permission_role` column on their row in the **`profiles`** table — nothing else. Changing it
takes effect immediately; the member doesn't need to log out/in, just reload the chat page.

1. Table Editor → **`profiles`** table.
2. Find the row for the person you want to promote. The easiest way to identify them is by
   `display_name` (what they set during onboarding) — if you need to be sure, cross-check against
   **Authentication → Users** in the sidebar, which shows the email tied to each account, and
   matches `profiles.id` to `auth.users.id`.
3. Click into that row's `permission_role` cell → change it from `member` to `officer` or `admin`.
4. Save.

That's it — no other table needs to change. `display_name` and `display_rank` are separate,
self-reported, cosmetic fields; changing `permission_role` doesn't touch them, and vice versa.

**Demoting** someone works the same way in reverse — set `permission_role` back to `member`
(or whatever's appropriate). They'll lose access to gated channels on their next reload.

## Adding a new channel

Channels live in the **`channels`** table. There's no MDX file or code change involved — a new
row is a new channel.

1. Table Editor → **`channels`** table → **Insert row** (or **Insert** → **Insert row**,
   depending on the Table Editor's current layout).
2. Fill in:
   - **`alliance`** — `burnfire` (must match exactly; this is what scopes the channel to this
     alliance and is how a second alliance's channels would stay separate later).
   - **`slug`** — a short, URL-safe identifier, e.g. `events`. Must be unique within the alliance
     (the table has a `unique (alliance, slug)` constraint — a duplicate will be rejected).
   - **`name`** — the display name shown in the sidebar, e.g. `Events`.
   - **`topic`** — optional one-line description shown under the name (e.g.
     `Founding Day and other alliance events`). Can be left blank.
   - **`min_role`** — `member`, `officer`, or `admin`. This is the *minimum* role that can see and
     post in the channel — `officer` also satisfies a `member`-gated channel (roles rank
     numerically, higher always satisfies a lower gate), but not the reverse. Use `member` for a
     normal open channel, `officer` (or `admin`) for a gated one.
   - **`sort_order`** — an integer controlling position in the sidebar (lower shows first). The
     day-one channels use 0-3; pick something outside that range (e.g. `10`) unless you
     specifically want to reorder existing ones too.
3. Save.

The channel appears in every authorized member's sidebar immediately — no deploy, no restart.

**Deleting** a channel: delete its row the same way. Its messages are deleted automatically
(`channel_id` has `on delete cascade`), so consider whether you actually want that before
deleting — there's no undo.

## Why there's no admin UI for this (yet)

This is a deliberate v1 scope decision, not an oversight: building a self-service admin screen
(role management, channel CRUD, with its own permission checks) is meaningfully more work than
this project's alliance-management needs justify right now, and Supabase's Table Editor already
does the job safely (it's protected by your own Supabase account login, separate from the site
entirely). If BurnFire's admin needs grow past "occasionally promote someone or add a channel,"
revisit building a real admin UI then — not preemptively now.
