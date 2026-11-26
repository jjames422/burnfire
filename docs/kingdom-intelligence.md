# Kingdom Intelligence and Alliance Command Center

Alliance statistics, Kingdom #324 standings, leadership operations, and integration
monitoring, built into the existing member portal at `/intel`.

## Status

Live in production since 2026-11-26.

| Area | State |
| --- | --- |
| Schema | Applied to production (backup first: `/home/opc/backups/burnfire-db-before-intel-20261126-033559.dump`) |
| Tracker key and secrets | Set in Vercel (Production); secret copies in root-only `/etc/burnfire/` |
| Sync timer | `burnfire-intel-sync.timer` enabled on this host, every 10 minutes |
| BurnFire data | Syncing hourly from the live tracker (first success 2026-11-26) |
| Community bot | `burnfire-tag-bot` posts reports from `intel/index.js` after 14:00 UTC; leadership digest only to the private officer-alert channel (bot backup: `/home/opc/backups/burnfire-tag-bot-before-intel-20261126-040146.tar.gz`) |
| Other alliances | None tracked yet; leadership adds them by tag on the Kingdom page |

## Existing application assessment

- **Stack.** Next.js 16 App Router on Vercel, which auto-deploys `main`. It uses this host's dedicated
  PostgreSQL 16 cluster (port 5433), which is the production database. There is no ORM: the schema
  is one idempotent `db/schema.sql`, and SQL functions take the acting user as their first argument.
- **Auth.** Email code, email link, or passkey. Sessions are host-only cookies. Roles come from
  `alliance_members` (`game_rank` r1–r5, `verified_at`, Regent) plus `platform_admins`. Member
  emails are encrypted at rest.
- **Portal.** Client components fetch the site's own JSON routes. The sidebar navigation lives in
  `PortalShell`. The Command Center (R3+) handles recruits and training.
- **Design.** Dark theme, ember accent (#ff9059), Oswald display type, IBM Plex Sans body.
  The new screens reuse these tokens (`components/intel/intel.css`).
- **Localization.** 16 locales. Every interface string must exist in every catalog
  (`npm run check:localization`). `scripts/translate-ui.mjs` fills new strings through the same
  Gemini endpoint the guide translator uses.
- **Background work.** No job runner existed. This host already uses systemd timers, and the
  Discord bots run under PM2 here (`burnfire-tag-bot`, the main bot).
- **Members already submit a player ID** (`academy_enrollments.game_identifier`). This drives link
  suggestions between site accounts and in-game characters.
- **Constraints kept.** The schema checker rejects the word "discord" in SQL files, so report
  storage uses neutral names.

## Verified data availability

Checked on 2026-11-26 against `https://api.lastasylumtracker.com/docs` and `/openapi.json`.

| Need | Source | Available | Notes |
| --- | --- | --- | --- |
| Alliance name, tag, level, member count | `GET /v1/alliances/{id}` | Yes | Key required (`401 missing_api_key` confirmed) |
| Member uid, name, power, sanctuary level | Same roster | Yes | uid is stable across renames |
| Weekly activity, daily honor, daily tech | Same roster | Yes | "Daily" counters; weekly totals are built from daily peaks |
| Member joined_at, last_online_at | Same roster | **Field present, values empty** | Every live answer so far sends null. Inactivity review therefore relies on power growth and weekly activity, which can only raise "needs review". Values are picked up automatically if the tracker starts sending them. |
| Member x/y, online flag | Same roster | Yes | **Deliberately discarded** at the provider boundary |
| Alliance lookup by kingdom + tag | `GET /v1/alliances/{server}/{tag}` | Yes | Used when leadership adds an alliance |
| Quota | Response body and `X-RateLimit-*` headers | Yes | 1,000/day free (2,000 Patreon), resets 00:00 UTC |
| Freshness | `cached`, `age_seconds`, `refreshing`, `X-Cache` | Yes | Copies over 60 min are refreshed in the background; `?fresh=1` waits for a live read at the same cost |
| Max membership / capacity | `capacity` | Yes | Synced; leadership can still set it if absent |
| Alliance power total | `power` | Yes | Preferred over summing members |
| Member in-game rank | `members[].rank_label` | Yes | Shown in the roster |
| `rank.rank` / `rank.score` | Alliance answer | Present | Scope (kingdom or global) is undocumented, so it is not shown as a kingdom rank |
| Kingdom list, king, ruling alliance, age, throne history | Tracker website only | **No** | Served by undocumented `/api/` routes that robots.txt disallows. Not used. Kingdom facts are leadership records. |
| Official kingdom alliance ranking (top 100) | Tracker website only | **No** | Standings cover tracked alliances only and are labeled that way |
| Kingdom map, events, KvK results | — | No | Leadership records |
| Response schema | — | **Unpublished** | Verified from live answers on 2026-11-26: alliance id is `union_id`, kingdom is `sid`, member name is `nick_name`, timestamps are Unix seconds. Field names and timestamp formats (never values) of every answer are recorded on the Integration page. |
| Terms of use / data retention terms | — | **None published** | `/terms`, `/tos`, `/privacy` return 404. Confirm acceptable use with the tracker operator before production ingestion. |

## Architecture

```
host timer (10 min) ──POST /api/intel/cron──┐            leadership / admin UI
                                            ▼                     │
                lib/intel/sync.ts  ◄─────── route handlers ◄──────┘
                 │ claims due alliance (row lock + 15-min lease)
                 │ checks quota budget (reserve for home alliance)
                 ▼
     IntelProvider interface (lib/intel/types.ts)
       ├─ LastAsylumTracker (lib/intel/lat.ts): bearer key, timeout, 3 attempts with backoff,
       │    zod validation, normalization, drops coordinates/online, records field names
       └─ FixtureProvider (lib/intel/fixture.ts): SYNTHETIC TEST DATA, never in production
                 ▼
     writeResult: one transaction → snapshots, identities, players, memberships
```

- **Provider boundary.** The site never sees a provider's raw shape. Adding a provider means
  implementing `fetchAlliance` and `findAlliance`. Data is stored per provider id, so test data and
  real data never mix.
- **Scheduling.** The home alliance syncs hourly and asks for a live read (`fresh=1`). Others sync
  every 6 hours and reuse the tracker's cache. Each call handles at most 8 due alliances. The cost
  at 50 tracked alliances is about 24 + 200 requests a day, a fifth of the free quota.
- **Overlap and recovery.** Claiming uses `for update skip locked` and pushes `next_sync_at` 15
  minutes forward, so concurrent runs never fetch the same alliance. Runs abandoned by a crash are
  closed on the next pass and retried after the lease.
- **Failures.** Transient errors back off exponentially (capped at a day). A rate limit, missing
  key, or rejected key pauses every alliance on that provider until the quota reset or an hour,
  without blocking other providers. Errors are stored with keys and tokens redacted.
- **Deduplication.** An answer whose observation time is within 90 s of a stored snapshot is
  recorded as "already recorded" and writes no history. Manual refresh within 5 minutes of a
  success reuses it without a request.
- **Provenance.** Each snapshot stores `observed_at` (fetch time minus the provider's
  `age_seconds`) and links to its run. The UI shows game-data age and the last successful sync. If
  the provider is down, pages keep showing the last verified values with a warning.
- **Identity.** Players and alliances are keyed by provider id. Names and tags are history rows,
  so renames never duplicate or split history. An out-of-order older answer cannot revert a
  current name. Alliance renames create a verified, derived kingdom record.
- **Membership.** Departures are inferred only from a complete roster. A partial answer never
  removes anyone.

## Privacy and access

| Data | Visitor | Verified member | R4/R5 of the same alliance | Platform admin only |
| --- | --- | --- | --- | --- |
| Tracked standings, public kingdom records | Only if leadership publishes | Yes | Yes | No |
| Roster: power, growth, sanctuary | No | Yes | Yes | No |
| Contributions, weekly activity | No | Own only | Yes | No |
| Last online, activity flags, reviews, absences | No | No | Yes | No |
| Diplomacy, treaties, contacts, notes | No | No | Yes | No |
| Integration health, intervals, retention | No | No | No | Yes |

- The tenant always comes from the viewer's own verified membership, never from the request.
- Leadership records are keyed by tenant. `intel_is_leadership()` deliberately ignores platform
  admin status, so running the platform does not open another alliance's records.
- Other alliances keep **aggregates only**: no member rows, no names, no locations.
- Coordinates and online status are never stored. `last_online_at` is kept only as the latest
  value for current own members and is cleared when someone leaves.
- Retention (editable by the platform admin):
  - Hourly member detail is kept for 14 days, then one row per day.
  - Member history is deleted after 365 days.
  - A departed member's history is deleted 90 days after they leave.
  - Alliance totals are thinned to daily after 30 days.
- Inactivity: flat power alone raises at most "needs review". Only a fresh provider last-online
  value beyond the policy (7 days) shows "inactive per last seen", and that is still only a
  prompt. New members, members on approved absences, and members without enough data are never
  flagged. The site never removes, demotes, or messages anyone.
- Fairness: member comparisons use percentage growth, never absolute power.
- Every leadership and admin change is written to `intel_audit_log`.

## Community bot reports

`GET /api/intel/reports?kind=daily|weekly|kingdom|leadership&claim=1` takes
`Authorization: Bearer $INTEL_REPORT_SECRET` and returns `{ audience, title, lines, url }`.
- `alliance` reports never name anyone for inactivity. `leadership` reports belong only in
  restricted officer channels.
- `claim=1` records the period, so a second call for the same period returns 409.
- Every report links back to the matching portal page.

**Bot side (`burnfire-tag-bot/intel/index.js`, live).**
- The module checks every 10 minutes. After 14:00 UTC it posts the daily summary and the
  leadership digest; from Monday it posts the weekly performance and kingdom standings.
- Alliance reports go to `INTEL_ALLIANCE_CHANNEL_ID`, defaulting to the bot's daily-posts channel.
- The leadership digest goes to `INTEL_LEADERSHIP_CHANNEL_ID`, defaulting to the officer-alert
  channel chosen with `/serverhelper setup`. It is posted only if that channel passes the
  helper's private-officer check, and is otherwise withheld and logged.
- Messages mention nobody. The module is off without `INTEL_REPORT_SECRET` in the bot's `.env`.
  `INTEL_REPORTS=daily,weekly` limits which kinds are posted, and `INTEL_REPORT_UTC` changes the
  posting time.
- Reports are English with the portal link; the universal translator bot handles channel
  translation.

## Roster verification and rank sync

The hourly roster sync also drives membership:

- **Website applications.** The submitted player ID or name, profile name, and requested rank are
  checked against the roster.
  - A typo, a name mismatch, or a wrong rank returns an error so the applicant can correct it.
    "Send to an officer for review" covers members promoted or recruited within the last hour.
  - Officers see a roster evidence box on every pending member, and approving links the account to
    its character.
- **Site rank sync.** For linked accounts, in-game promotions, demotions, and renames update the
  site on each sync and are recorded in membership history with source `roster`.
  - Titles follow the schema's rank rules: they are cleared below R4.
  - Changes into or out of **R5 are never automatic**. They are logged as
    `leader_change_needs_officer` for an officer to confirm.
- **Discord verification (`burnfire-tag-bot/roster/index.js`).**
  - The typed name or player ID must be on the roster. The rank role comes from the game, and only
    R4s pick an officer title, which officers are asked to confirm.
  - A character already claimed by another Discord account is refused and reported.
  - If the roster is unavailable or more than six hours old, nobody is admitted, and officers are
    alerted to verify by hand.
- **Discord rank sync.** Every 15 minutes, rank roles and nicknames follow the game.
  - Titles are removed below R4, and Leader changes are flagged rather than applied.
  - Departures are reported, never acted on.
  - Members verified before this feature are linked once by an exact, unique name match.
- **Limits.** A roster match shows the details agree with the game, not who submitted them,
  because character IDs are public. The game reports some in-game titles inside the rank label
  ("R4 · Militarist"). They are shown but not mapped to site titles, because the names differ.

## Server progression

The server day is computed from the kingdom's opening date, with day 1 as the opening day on UTC
days. Leadership maintains milestones (events, unlocks, seasons) with a confirmed or estimated
flag on the Kingdom page, along with the king and ruling alliance. The provider exposes none of
these.

## Configuration and deployment

Environment variables (server only; also listed in `.env.local.example`):

| Variable | Purpose |
| --- | --- |
| `LAT_API_KEY` | Tracker key. Create at api.lastasylumtracker.com/account (Patreon login). |
| `INTEL_CRON_SECRET` | Secret for the scheduler endpoint (≥ 32 characters). |
| `INTEL_REPORT_SECRET` | Secret for the reports endpoint (≥ 32 characters). |
| `INTEL_FIXTURES=1` | Development only: synthetic provider. Ignored when `NODE_ENV=production`. |

Release order (each step needs the owner's go-ahead because it touches production):

1. Back up: `pg_dump` of the burnfire database.
2. Apply the schema: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql`. This is additive
   and idempotent. It seeds the provider, Kingdom #324, BF2 (alliance id 67111261, hourly), and
   default settings.
3. Set `LAT_API_KEY`, `INTEL_CRON_SECRET`, and `INTEL_REPORT_SECRET` in Vercel (Production).
4. Merge and deploy.
5. Install the timer on this host:
   `sudo install -m 600 deploy/intel/intel-sync.env.example /etc/burnfire/intel-sync.env` (then
   edit it), then copy `deploy/intel/*.service` and `*.timer` to `/etc/systemd/system/` and run
   `systemctl enable --now burnfire-intel-sync.timer`.
6. On the Integration page, run "Sync now" for BF2 and review the recorded response fields.
7. Leadership: link accounts, set capacity, track other alliances by tag.

Rollback: disable the timer, revert the release, and only on an explicit decision run
`db/rollback/intel.sql` after a backup (it deletes intelligence data only).

Development: run a separate PostgreSQL database whose name ends in `_dev` on a port other than
5432/5433, apply the schema, then
`node --experimental-strip-types scripts/intel-seed-fixtures.mjs` and run `next dev` with
`INTEL_FIXTURES=1`.

## Testing

- `tests/intel-provider.test.mjs`: validation, malformed/duplicate/out-of-range data, privacy
  stripping, bearer header, quota parsing, missing key, 401/404/409/429 handling, retry with
  backoff, secret redaction.
- `tests/intel-analytics.test.mjs`: growth windows and gap detection, contributions, fairness
  percentile, tracked standings, the inactivity rules, quota reserve, backoff.
- `tests/intel-reports.test.mjs`: report audiences, honest labels, period dedup, secret check,
  axis ticks.
- `tests/intel-database.test.mjs` (needs `BURNFIRE_TEST_DATABASE_URL`, runs in a rolled-back
  schema): schema reruns, name changes, departures, rejoins, partial rosters, out-of-order
  answers, cached-copy dedup, aggregate-only storage for other alliances, tag-change records,
  failure backoff, rate-limit and key pauses per provider, abandoned-run recovery, tenant and
  role isolation, retention.
- Live checks against a dev server with synthetic data:
  - Anonymous access is refused everywhere.
  - Members cannot read leadership, admin, or other members' private fields.
  - No coordinate or online field appears in any payload.
  - Publishing exposes only aggregates.
  - The scheduler and reports reject bad secrets.
  - Every screen was rendered at 1440, 834, and 390 px with no horizontal page overflow and no
    console errors.

## Decisions

1. **Portal, not public site.** Intelligence is member data, so it lives under `/intel` in the
   portal shell, with one sidebar entry and in-page sections (Alliance, Kingdom, Leadership,
   Integration) shown by role.
2. **Host timer instead of Vercel Cron.** This is free, already the pattern on this host, and
   runs more often than Vercel's free tier allows.
3. **Tracked standings, not rankings.** The API has no kingdom endpoint. Leadership chooses which
   alliances to track (up to 60), and every view says the order is not official.
4. **Aggregates only for other alliances.** Kingdom intelligence never needs another alliance's
   members, so none are stored.
5. **Kingdom facts are leadership records.** They are labeled "Leadership record" and
   "Verified/Reported", never presented as synced.
6. **Single founding tenant, multi-tenant schema.** Every leadership table is keyed by tenant.
   Public multi-alliance registration is not enabled.

## Unresolved dependencies

- **Tracker terms.** No terms or retention policy is published. Ask the operator about storing
  history before production ingestion.
- **Game rules on third-party tools.** Not verified here; owner to confirm.
- **Translation review.** The new interface strings were machine-translated (Gemini free tier,
  validated for placeholders only). Terminology drifts between batches; for example, German uses
  both "Zuflucht" and "Sanctuary", and both "Stärke" and "Macht". A native-speaker or glossary
  pass is recommended.
