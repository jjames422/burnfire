# Managing roles and channels

## Member management in the portal

Use **Members & oversight** in the portal, **Members & roles** from chat, or the corresponding
Command Center tab. R4 can approve R1-R3, R5 can manage lower ranks, and site administrators
can manage all alliance ranks. Confirming a rank updates the shared membership used by chat,
academy, and command; there are no separate feature-specific role assignments.

The database synchronizes website permissions from rank: R1/R2 are members, R3/R4 are
officers, and R5 is alliance admin. Site administration is independent in `platform_admins`;
an R4 site administrator retains R4 identity with full website access.

Officer workload cards and the rank-change timeline support leadership oversight. Recruit
reassignment is restricted to R4/R5 or site administrators and is recorded separately.

## Server-side setup

Initial site administration and channel creation still require server access. Database commands
must target only the dedicated BurnFire instance. If your terminal has not loaded the environment,
use an explicit connection (the password is prompted, not printed):

```bash
cd /home/opc/websites/burnfire-site
psql -h 127.0.0.1 -p 5433 -U burnfire_app -d burnfire -W
```

That connects to the site's dedicated PostgreSQL instance (its own cluster on port 5433 — not
shared with any other site on this server).

## Verifying a member's game rank and title

A new account starts as an unaffiliated community member. It becomes `R1 Recruit` only when an
alliance accepts or invites it and creates a row in **`alliance_members`**. Rank and title are
never accepted from the signup form.
Each authenticated account can have exactly one membership and therefore belong to only one
alliance; the database enforces this with `user_id` as the membership's primary key.

1. Find the person in **`profiles`** and copy their `id`. Cross-check it against the **`users`**
   table (email addresses) if needed.
2. Open **`alliance_members`** and find the row with the matching `user_id` and alliance.
3. Set `game_rank` to `r1`, `r2`, `r3`, `r4`, or `r5`.
4. Optionally set `alliance_title`. R4 members may be `diplomat`, `recruiter`, `goddess`, or
   `god_of_war`. The R5 must have `alliance_leader`. Every title and R5 are unique per alliance;
   the database rejects a second holder.
5. Set `verified_at` to the current time and `verified_by` to the verifying officer's user ID.
6. Website access is synchronized from the rank automatically: `member` for R1/R2, `officer`
   for R3/R4, and `admin` for R5. Use the portal for normal approvals so the action is recorded.
7. Save.

The site builds the public label from this live membership data. An unaffiliated profile appears
as `InGameName`; a member appears as `[TAG] InGameName · Rank`. For an R4 with a unique title, the
title replaces `R4 Officer`. R5 always appears as `Alliance Leader`. Updating this row updates the
label on existing chat messages and comments too.

The in-game rank and website permission are separate fields deliberately. This preserves an
audit-friendly distinction between what someone is in the game and what they may administer on
the site.

## Changing website access

Channel access is derived from verified membership rank, with an independent site-admin override.
Change the member's rank in the portal rather than editing `permission_role`; direct permission
changes are overwritten by the synchronization trigger. Subsequent requests use the new rank;
reload chat to refresh the visible channel list.

## Adding a new channel

Channels live in the **`channels`** table. There's no MDX file or code change involved — a new
row is a new channel.

1. Connect with psql as above, then insert a row:

   ```sql
   insert into channels (alliance, slug, name, topic, min_role, sort_order, scope)
   values ('burnfire', 'events', 'Events', 'Founding Day and other alliance events', 'member', 10, 'alliance');
   ```
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

Channel creation and site-admin appointments remain server-managed. The member approval UI
does not grant site-admin privileges, even when assigning R5.
