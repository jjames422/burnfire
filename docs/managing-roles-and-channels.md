# Managing roles and channels

There's no admin UI in the app for this (deliberately deferred — see the bottom of this doc).
Both tasks below happen directly in **Supabase's Table Editor**: dashboard for your project →
**Table Editor** in the left sidebar.

## Verifying a member's game rank and title

A new account starts at `R1 · Recruit`. Rank and title are stored on the member's row in
**`alliance_members`**, not accepted from the signup form.
Each authenticated account can have exactly one membership and therefore belong to only one
alliance; the database enforces this with `user_id` as the membership's primary key.

1. Find the person in **`profiles`** and copy their `id`. Cross-check it against
   **Authentication → Users** if needed.
2. Open **`alliance_members`** and find the row with the matching `user_id` and alliance.
3. Set `game_rank` to `r1`, `r2`, `r3`, `r4`, or `r5`.
4. Optionally set `alliance_title`. R4 members may be `diplomat`, `recruiter`, `goddess`, or
   `god_of_war`. The R5 must have `alliance_leader`. Every title and R5 are unique per alliance;
   the database rejects a second holder.
5. Set `verified_at` to the current time and `verified_by` to the verifying officer's user ID.
6. Set website access in `permission_role`: normally `member` for R1-R3, `officer` for R4, and
   `admin` for the R5 Alliance Leader.
7. Save.

The in-game rank and website permission are separate fields deliberately. This preserves an
audit-friendly distinction between what someone is in the game and what they may administer on
the site.

## Changing website access

Channel access is controlled by `permission_role` on **`alliance_members`**. Change it to
`member`, `officer`, or `admin`; the change takes effect after the member reloads chat.

1. Table Editor → **`alliance_members`**.
2. Find the member's alliance/user row.
3. Change `permission_role`.
4. Save.

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
