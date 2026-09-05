# BurnFire Guide Site — Implementation Plan

## Context

BurnFire (an alliance in the mobile game *Last Asylum: Plague*) currently shares guides as plain unformatted text in Discord, and coordinates alliance chat in Discord too. The goal, after two scope revisions below, is a real, professional-looking website for guides (headings, tables, callouts, framed/captioned screenshots, tag categories) with a lightweight anonymous comment/reaction layer, **plus** a live, multi-channel, role-gated chat with real accounts meant to fully replace Discord for BurnFire (voice stays on Discord — not being rebuilt). It must run on $0 ongoing cost, be maintainable long-term by one developer, work well on mobile, and be structured so a second alliance could get its own guide section and channel set later without a rebuild.

Domains already owned: `lastasylumplague.org` / `.us` / `.store` / `.info` (DNS not yet pointed).

**Decisions locked in with the user so far:**
- Framework: **Next.js (App Router)** — chosen over Astro for familiarity.
- Content lives as **git-based MDX files** (no hosted CMS account to run/pay for).
- Comments/reactions: **Supabase free tier**, called directly from the browser with the anon key + Row Level Security.
- Comments post **instantly/publicly**; moderation = maintainer deletes bad ones via Supabase's built-in table editor (no admin UI to build). This is documented as a one-column flip if stricter pre-approval is ever wanted.
- Canonical domain default: **lastasylumplague.org**, with `.us/.store/.info` redirected to it — flagged as an easy-to-change config value, not hardcoded.
- We will **not** create any third-party accounts (Vercel, Supabase, GitHub, Turnstile) on the user's behalf, and will not touch the user's Oracle server ourselves — the plan includes exact human steps for those; implementation happens in a session run directly on the Oracle server, by the user.

The working directory is currently empty (no repo). This is a from-scratch build.

**Scope revision 1:** after seeing the wireframes, the user asked for live, multi-channel chat to be added as a core feature — intended to fully replace Discord for BurnFire, with real accounts (email magic-link login), role-gated channels (e.g. an Officer-only channel), and online-presence indicators, while staying structured so a second alliance can get its own channel set later without a rebuild. This directly reverses the original brief's non-goals (which excluded live chat and presence) — a deliberate, confirmed change, not scope creep. Guide comments stay anonymous/no-login as originally designed; only chat requires an account. This roughly doubles the build (see updated milestones) but stays on the same free stack: Supabase's free tier includes Auth and Realtime alongside the Postgres/RLS already planned for comments, so no new service or budget is needed.

**Scope revision 2 — hosting/workflow:** the user has an Oracle Cloud server they want in the loop, and specified the actual shipping model: source code lives and is developed on that Oracle server, gets pushed to a GitHub repo, and **Vercel** (not Cloudflare Pages) builds/deploys the live frontend from GitHub on every push. The Oracle server already runs a database; the user explicitly left the choice of backend service open ("choose another free alternative if you think that is better"). Decision: **keep Supabase** (free tier) for auth/database/realtime rather than the self-hosted DB on the Oracle box — reasoning below. Switching the deploy target to Vercel is also a simplification: Vercel runs real Next.js (SSR/Route Handlers) for free on its Hobby tier, so the project no longer needs the `output:'export'` static workaround or a separate Cloudflare Pages Function for Turnstile verification — that becomes a normal Next.js API route. **Important logistics note:** this planning session is running locally on the user's Mac, not on the Oracle server — the actual implementation work described below should happen in a Claude Code (or editor) session started directly on the Oracle server (the user SSHing in and running it there), so file edits and `git`/build commands land on the machine that's actually the source of truth.

**Why Supabase over the existing Oracle-hosted DB:** the hard part of the chat feature was never "a database" — it's Auth (magic-link sessions) and Realtime (live messages + presence), both of which Supabase provides managed and free. Self-hosting on the Oracle DB instead would mean: exposing it safely to the internet so Vercel's serverless functions can reach it (it can't stay `localhost`-only once the app lives on Vercel), adding connection pooling (e.g. PgBouncer) so serverless invocations don't exhaust Postgres connections, and building the realtime/auth layers from scratch (WebSocket server, session/token handling) — real, ongoing sysadmin work for one developer, for a feature Supabase already gives away free. The Oracle server stays free for other use (or as a future self-hosting target if Supabase's free-tier limits are ever actually hit — see the connection-count note in the chat section below). If there's a specific reason to use the existing DB instead (data already lives there, a firm preference to stay fully self-hosted), say so and this section gets revised — this is a judgment call made in the user's stated absence of a preference, not a hard constraint.

## Approach

### Stack
- Next.js 15 (App Router) + React 19 + TypeScript, deployed to **Vercel** (not a static export) — guide pages still use `generateStaticParams()` for SSG since content is git-based MDX, but the project runs as a normal Next.js app, so `next/image` optimization works natively and API routes (Route Handlers) are available for the one piece that genuinely needs a server: Turnstile verification (see Comments section).
- Tailwind CSS v4 (CSS-first `@theme`, no `tailwind.config.ts` to maintain).
- MDX pipeline: **hand-rolled** `gray-matter` (frontmatter) + `zod` (validation) + `next-mdx-remote/rsc` (`compileMDX` as an async Server Component). Rejected Contentlayer (unmaintained) and Velite/`@next/mdx` (more machinery than a few dozen guides justifies, and `@next/mdx` fights the multi-tenant content layout).
- `@supabase/supabase-js` for comments/reactions, called client-side.
- `github-slugger` for heading anchors, `clsx` for conditional classes.

### Multi-tenancy seam (the "openness" requirement)
- `config/alliances/burnfire.ts` holds all BurnFire identity: name, tagline, logo, domain, theme color tokens, game name.
- `config/site.ts` picks the active alliance (`burnfire` today) — **every component reads through this**, never a literal "BurnFire" string or hardcoded hex color.
- Content lives at `content/burnfire/guides/*.mdx`; a second alliance later just adds `content/<slug>/guides/` + a config file.
- The data layer (`lib/content/guides.ts`) already takes an `allianceSlug` parameter even though routing stays single-alliance (`/guides/[slug]`) for now — moving to `/[alliance]/guides/[slug]` later is additive, not a rewrite. Document this deferred step in `docs/adding-an-alliance.md`.
- Every Supabase row carries an `alliance` column, so comments/reactions are already partitioned per-alliance.

### Guide content model
Frontmatter (validated with zod): `title, slug, tags[] (Hero|Building|Clinic|PVP|PVE|Alliance|Events|Patch Notes), summary, heroImage?, author, authorRank?, publishedAt, updatedAt?, alliance, draft`.

Custom MDX components:
- `<Callout variant="tip"|"warning"|"lore" title?>` — styled admonition box, variant drives accent color/icon.
- `<Figure src alt caption credit?>` — real `<figure>/<figcaption>` framed-screenshot treatment (never a bare `<img>`).
- Table element overrides (zebra-striped, dark-surface).
- `h2`/`h3` overrides with slugified anchor ids.

Homepage/`/guides` index: `getAllGuides('burnfire')` returns lightweight metadata; homepage groups by the fixed tag list + a "Most Recent" rail; `/guides` uses a small client component for tag filtering (data passed as a prop, filtered with local state — no server query-param handling needed at this content scale).

### Design system
Dark, post-apocalyptic/plague-doctor palette expressed as CSS variables consumed by Tailwind utilities (`bg-background`, `text-primary`, `border-accent`, etc.), set once in `app/layout.tsx` from `site.theme` so swapping the active alliance swaps the whole look with no component edits:

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#0B0D0A` | page background |
| `--color-surface` / `--color-surface-raised` | `#1A1C14` / `#232519` | cards, comment box |
| `--color-border` | `#33351F` | muted olive borders |
| `--color-text-primary` / `secondary` | `#E8E4D8` / `#A8A38C` | parchment / muted khaki |
| `--color-accent` / `accent-bright` | `#C4491D` / `#F2762E` | rust/ember CTA, "fire" reaction |
| `--color-toxic` | `#7C9A3F` | sickly plague green, used sparingly (tag chips) |
| `--color-tip` / `warning` / `lore` | `#4E8B6B` / `#D97706` / `#5B4A6B` | Callout variants |

Fonts via `next/font/google` (free, self-hosted, no subscriptions): **Oswald** for headings (industrial/condensed, stays legible at guide length — reserve a distressed/typewriter face only for small flavor accents if wanted), **IBM Plex Sans** for body (more technical/utilitarian character than Inter, fits a survival-guide site).

**M1 note (added after reviewing the first build):** the color/font tokens above are necessary but not sufficient — a token table alone reliably produces a generic, flat result (default rounded corners, fallback fonts, a left-border-strip callout instead of an actual designed one). The rules below are non-negotiable specifics, not suggestions, and apply globally from M1 onward:

- **No border-radius anywhere in the UI**, on anything — buttons, chips, cards, inputs, callouts. This is deliberate (fits the gritty/industrial theme, avoids the generic "rounded-lg everywhere" look), not an oversight to "improve" later. If a component renders with rounded corners, that's a bug.
- **Verify the fonts are actually applying**, don't just import them. next/font/google must bind Oswald and IBM Plex Sans to CSS variables in app/layout.tsx, and app/globals.css's Tailwind @theme block must map a --font-display / --font-body token to those variables, with every heading element actually using the font-display utility (or equivalent). After building, zoom into a heading and confirm it visibly reads as condensed/industrial, not a default system bold — if it looks like Arial/Helvetica Bold, the font isn't wired up.
- **Callout component — full bordered box, never a colored left-border strip.** A left-border-accent-color box is the single most common generic/AI-template pattern; do not use it. Structure:
  <div style="border: 1px solid var(--callout-color); background: color-mix(in srgb, var(--callout-color) 7%, transparent); padding: 18px 20px;">
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
      [icon] <span style="color: var(--callout-color); font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">Tip / Warning / Lore</span>
    </div>
    <div>[callout body text]</div>
  </div>
  The color (border + tinted background + label) comes from the variant; there is no separate accent stripe.
- **Heading anchors must not render as an underlined link wrapping the whole heading.** The heading text itself keeps normal heading styling (no text-decoration, no link color); only a small "#" anchor glyph appears, positioned after the heading text, visible on hover only (or always at low opacity), linking to the slugified id. If a heading looks like a plain blue/accent-colored underlined hyperlink, that's the anchor implementation wrapping the entire heading in an <a> with default link styles — fix by styling the anchor <a> to inherit the heading's own color/no-underline and only the small "#" glyph gets accent styling.
- **Tag chips/pills are flat rectangles, not fully-rounded pills** — small padding, 1px border, no border-radius, uppercase small text with letter-spacing.
- **Base atmosphere, applied once in app/layout.tsx or globals.css so every page inherits it automatically** (not something each component reinvents): a fixed, full-viewport, low-opacity (~0.04–0.05) film-grain overlay (feTurbulence SVG data-URI background, mix-blend-mode: overlay, pointer-events: none) plus a subtle radial vignette (radial-gradient(ellipse at 50% 0%, transparent 45%, rgba(0,0,0,0.4) 100%)), both as position: fixed; inset: 0; pseudo-elements or wrapper divs above z-index of content but with pointer-events: none. Buttons/cards get a hover state: transform: translateY(-2px) + border brightening + a soft box-shadow glow in the accent color, transition 150–200ms — flat, static components with no hover feedback read as unfinished.

After each milestone that touches UI, take a screenshot (or describe what rendered) and check it against this list before moving on — matching the color hex values is not the same as matching the design.

### Comments + reactions (Supabase)
Two tables, RLS-locked, no custom backend server:

```sql
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  guide_slug text not null,
  author_name text not null check (char_length(author_name) between 1 and 60),
  author_rank text check (char_length(author_rank) <= 60),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'approved' check (status in ('approved','pending','rejected')),
  created_at timestamptz not null default now()
);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  guide_slug text not null,
  reaction_type text not null default 'fire' check (reaction_type in ('fire','skull','heart','clap')),
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (alliance, guide_slug, reaction_type)
);
-- + increment_reaction(alliance, guide_slug, reaction_type) security-definer RPC for atomic +1
```

RLS: public `select` on approved comments / all reactions; public `insert` on comments restricted to the `approved` default + length checks; **no** update/delete policy for `anon` (Postgres default-denies both) — that's the whole moderation boundary. Reactions only write through the RPC (no direct insert policy).

Reaction dedup is **cosmetic only** (localStorage flag before calling the RPC) — not a security boundary, which is the right amount of engineering for an unauthenticated fire-count.

**Spam mitigation:** Cloudflare Turnstile (free, works fine as a widget regardless of who hosts the app) on the comment form. Its secret key can't be verified from the browser, so verification happens server-side via a Next.js Route Handler (`app/api/verify-turnstile/route.ts`), running as a Vercel serverless function using a server-only env var (`TURNSTILE_SECRET_KEY`, never `NEXT_PUBLIC_`). It holds no Supabase credentials — the browser still inserts the comment directly with the anon key after Turnstile passes. No separate hosting platform needed for this anymore now that the app runs on Vercel proper.

### Live chat + membership accounts

Runs on the same Supabase free project as comments/reactions — Auth and Realtime are both included, no new service.

**Two identity fields, kept deliberately separate — do not conflate them:**
- `display_name` / `display_rank` — free text, self-reported (same idea as today's comment name+rank fields), cosmetic only, shown next to messages.
- `permission_role` (`member | officer | admin`) — controls which channels a user can even see, defaults to `member` on signup, and can **only** be changed by an admin directly in Supabase's table editor (v1 — no self-service admin UI to build, same "moderate via table editor" pattern as comments). This matters: without the split, a user could just type "Officer" into a free-text field and grant themselves access to a gated channel.

**Auth:** Supabase Auth, email magic link (`signInWithOtp`) — passwordless, no password-reset flow to build. First login redirects to a one-time "complete your profile" step (in-game name + rank/title text; alliance pre-selected as `burnfire`) that inserts the `profiles` row; later logins skip straight to chat.

**Schema (extends `supabase/schema.sql`):**
```sql
create type permission_role as enum ('member','officer','admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  alliance text not null default 'burnfire',
  display_name text not null check (char_length(display_name) between 1 and 40),
  display_rank text check (char_length(display_rank) <= 40),
  permission_role permission_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  alliance text not null,
  slug text not null,
  name text not null,
  topic text,
  min_role permission_role not null default 'member',
  sort_order int not null default 0,
  unique (alliance, slug)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index messages_channel_idx on public.messages (channel_id, created_at desc);
```

**Role-check helper + RLS** (role hierarchy compared numerically so "officer" also satisfies a "member"-gated channel):
```sql
create or replace function public.role_rank(r permission_role) returns int
language sql immutable as $$
  select case r when 'member' then 1 when 'officer' then 2 when 'admin' then 3 end;
$$;

create or replace function public.my_role(p_alliance text) returns permission_role
language sql stable security definer set search_path = public as $$
  select permission_role from public.profiles where id = auth.uid() and alliance = p_alliance;
$$;

alter table public.channels enable row level security;
create policy "members see channels they're allowed in"
on public.channels for select to authenticated
using (role_rank(my_role(alliance)) >= role_rank(min_role));

alter table public.messages enable row level security;
create policy "members read messages in channels they can access"
on public.messages for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.channels c
    where c.id = messages.channel_id
    and role_rank(my_role(c.alliance)) >= role_rank(c.min_role)
  )
);
create policy "members post in channels they can access"
on public.messages for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.channels c
    where c.id = messages.channel_id
    and role_rank(my_role(c.alliance)) >= role_rank(c.min_role)
  )
);
create policy "authors delete their own messages"
on public.messages for delete to authenticated
using (author_id = auth.uid());
```

**BurnFire's day-one channels** (multiple topic channels, per the user's direction):
```sql
insert into public.channels (alliance, slug, name, topic, min_role, sort_order) values
  ('burnfire', 'general', 'General', 'Alliance-wide chat', 'member', 0),
  ('burnfire', 'pvp', 'PVP', 'Arena and rally coordination', 'member', 1),
  ('burnfire', 'recruitment', 'Recruitment', 'Recruiting and applications', 'member', 2),
  ('burnfire', 'officer', 'Officer', 'Officer+ only', 'officer', 3);
```

**Presence:** Supabase Realtime Presence on a per-channel topic (`presence:<alliance>:<channel-slug>`) — client tracks `{user_id, display_name, display_rank}` on join; Supabase broadcasts join/leave/sync to everyone subscribed. Fully ephemeral, no table needed.

**Multi-alliance readiness:** identical pattern to the guide content side — `alliance` is a column on `profiles`, `channels`, and (transitively, via `channels`) `messages`. Onboarding a second alliance later means inserting its channel rows and pointing its members' profiles at its slug — no schema or RLS change, matching the "no rebuild" requirement.

**Comments are unaffected** — they stay anonymous/no-login as originally designed, so a casual guide reader isn't forced to create an account just to leave feedback. Only chat requires signing in. (Optional nicety, not required for v1: prefill the comment name/rank fields from a signed-in user's profile.)

**Free-tier ceiling, stated honestly:** Supabase's free tier caps at 200 concurrent Realtime connections and pauses a project after 7 days with zero traffic (auto-resumes on the next request, but that first request is slow). Comfortable for one alliance's day-to-day chat; if this later hosts several alliances at once, concurrent-connection count is the metric to watch and the trigger for reassessing (paid Supabase tier, still cheap) — not a v1 blocker, just an honest limit of the "zero budget" constraint.

**New client components:** `AuthGate` (magic-link sign-in form + "check your email" state), `ProfileSetupModal` (first-login onboarding), `ChannelSidebar` (role-filtered channel list), `MessageList` (Realtime Postgres Changes subscription per channel), `MessageComposer`, `PresenceList`. New route: `app/chat/page.tsx`, still statically exported — like comments, all chat data loads client-side after auth, the static shell just hosts the client components.

**Deferred, not built in v1:** a self-service admin UI for promoting members/managing channels (v1 uses Supabase's table editor directly, documented in `docs/managing-roles-and-channels.md`); voice (Discord already provides this for free — no reason to rebuild it, and neither Cloudflare's nor Supabase's free tiers support it anyway).

### Deployment + DNS
**Workflow:** code is developed on the user's Oracle server, pushed to a GitHub repo, and **Vercel** auto-builds/deploys from GitHub on every push to `main` — standard, well-documented, zero-config for Next.js (same company). No static-export workaround, no separate Functions platform.

Human steps (documented in README, not performed by us — no third-party accounts created on the user's behalf):
1. On the Oracle server: `git init`, create the GitHub repo (`gh repo create` or via github.com), push.
2. Create a free Vercel account (or log in with GitHub) → New Project → import the GitHub repo. Vercel auto-detects Next.js; no build-command overrides needed.
3. Set Vercel project env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public) and `TURNSTILE_SECRET_KEY` (server-only — Vercel keeps non-`NEXT_PUBLIC_` vars out of the client bundle automatically).
4. Vercel → Project → Domains → add `lastasylumplague.org` as primary; add `.us`/`.store`/`.info` and set each to redirect to `.org` — Vercel handles this natively in one dashboard (DNS can stay at the current registrar or Cloudflare, just pointed at Vercel per its on-screen instructions; Cloudflare is not required for this setup, though the user can still proxy through it for extra CDN/DDoS coverage if wanted — optional, not needed for the plan to work).
5. Supabase (human): create free project → SQL Editor → run `supabase/schema.sql` → copy URL/anon key into Vercel env vars → in Authentication settings, set Site URL to `https://lastasylumplague.org` and add it (plus `http://localhost:3000` for dev) to Redirect URLs, so magic-link emails send people back to the right place.
6. Turnstile (human): register site in the Cloudflare dashboard (a free Turnstile account, unrelated to hosting) → copy site key (public) / secret key (Vercel env var only).
7. Every subsequent update: commit on the Oracle server → `git push` → Vercel builds and deploys automatically. No manual deploy step.

`site.domain` in config is the single source of truth for canonical URLs/OG tags — changing the primary domain later is a one-line edit.

**Honest limit:** Vercel's free Hobby tier is scoped for personal/non-commercial projects — fine for an alliance guide/chat site with no monetization, but worth knowing if BurnFire ever adds e.g. a merch store or paid perks, at which point Vercel Pro (paid) would technically apply.

### File structure
```
app/
  layout.tsx, globals.css, page.tsx, not-found.tsx
  guides/page.tsx, guides/[slug]/page.tsx
  chat/page.tsx
  api/verify-turnstile/route.ts
components/
  layout/{Header,Footer}.tsx
  mdx/{Callout,Figure,MdxTable,Heading}.tsx
  guides/{GuideCard,GuideIndex,TagChip}.tsx
  comments/{CommentSection,ReactionBar}.tsx   # "use client"
  auth/{AuthGate,ProfileSetupModal}.tsx       # "use client"
  chat/{ChannelSidebar,MessageList,MessageComposer,PresenceList}.tsx  # "use client"
config/
  site.ts
  alliances/{index.ts,burnfire.ts}
content/burnfire/guides/*.mdx
lib/
  content/{types.ts,guides.ts,tags.ts}
  supabase/{client.ts,types.ts}
public/images/{burnfire/,guides/<slug>/}
supabase/schema.sql
next.config.ts, tsconfig.json, .env.local.example
README.md
docs/{adding-a-guide.md,adding-an-alliance.md,managing-roles-and-channels.md}
```

### Build order (milestones, each independently verifiable)
1. **M1 — Static shell + design system**: scaffold Next.js on the Oracle server, Tailwind theme tokens, fonts, `Callout`/`Figure`/table components, one sample guide renders; `npm run build` succeeds, `npm run dev` works locally on the server.
2. **M2 — Full content model**: catalog loader + zod validation, 3–5 real guides across different tags, homepage category/recency listing, `/guides` tag filter, heading anchors.
3. **M3 — Comments**: Supabase project (human step) + schema + RLS, `CommentSection` wired up, verify update/delete are blocked from the browser.
4. **M4 — Reactions**: `increment_reaction` RPC, `ReactionBar`, localStorage dedup, verify shared counts across two browser sessions.
5. **M5 — Auth + profiles**: Supabase Auth magic-link flow, `profiles` table + RLS, first-login "complete your profile" onboarding.
6. **M6 — Channels + messaging**: `channels`/`messages` tables + RLS, seed BurnFire's 4 channels, `ChannelSidebar` + `MessageList`/`MessageComposer` wired to Realtime Postgres Changes, verify a role-gated (Officer) channel is invisible to a `member`-role test account.
7. **M7 — Presence**: Realtime Presence per channel, online-member list, verify it updates live across two browser sessions.
8. **M8 — Role administration docs**: document promoting a member to officer and adding a channel via Supabase's table editor (`docs/managing-roles-and-channels.md`); explicitly note a self-service admin UI as future/deferred, not built now.
9. **M9 — Turnstile + deployment + DNS**: Turnstile registration (human), GitHub repo pushed from the Oracle server, Vercel project import, env vars, custom domain, 3 redirects, Supabase Auth redirect URLs, live end-to-end comment and chat test on the real domain.
10. **M10 — Maintainer docs**: `README.md` (setup, architecture, deploy model), `docs/adding-a-guide.md` (non-developer-facing: file location, annotated frontmatter template, screenshot workflow, MDX component cheat-sheet, publish flow), `docs/adding-an-alliance.md` (developer-facing: new config + content folder + channel set, the deferred `/[alliance]/...` routing migration), `docs/managing-roles-and-channels.md` (from M8).

### Critical files
- `config/site.ts`, `config/alliances/burnfire.ts` — the multi-tenancy seam everything reads through.
- `lib/content/guides.ts`, `lib/content/types.ts` — MDX/frontmatter catalog layer.
- `supabase/schema.sql` — tables, RLS policies, `increment_reaction` RPC, plus `profiles`/`channels`/`messages`, `role_rank`/`my_role` helpers, and channel/message RLS.
- `app/api/verify-turnstile/route.ts` — the one server-side exception, isolated and credential-scoped.
- `app/layout.tsx`, `app/globals.css` — where alliance theme tokens become CSS variables.
- `components/auth/AuthGate.tsx`, `components/auth/ProfileSetupModal.tsx` — magic-link sign-in and the `display_name`/`display_rank` vs. `permission_role` split (the security-relevant seam of the chat feature).
- `components/chat/ChannelSidebar.tsx`, `MessageList.tsx` — where role-gated channel visibility and the Realtime subscription live.

## Verification
- `npm run build` succeeds on the Oracle server; `npm run dev` and click through homepage → guide → tag index on desktop and a mobile viewport.
- Lighthouse/manual check: guide page renders headings, a table, all 3 Callout variants, and a framed `<Figure>` correctly in the dark theme.
- Post a test comment through Turnstile locally (Turnstile's documented always-pass test key for local dev) and confirm it lands in Supabase with `status='approved'`; confirm an anon `update`/`delete` call against the row fails (RLS proof).
- Click a reaction twice in the same browser → count increments once (localStorage dedup), then again in a private/incognito window → increments again (confirms it's cosmetic, not a real duplicate-prevention system, as designed).
- Sign in with a test email via magic link, complete profile onboarding, confirm the `profiles` row lands with `permission_role = 'member'` by default.
- With a `member`-role test account, confirm the Officer channel does not appear in the sidebar and a direct Postgres request for its messages returns nothing (RLS proof, not just a hidden UI element). Manually flip that account to `officer` in Supabase's table editor and confirm the channel appears.
- Open the same channel in two browser sessions signed in as different test accounts: send a message in one, confirm it appears live in the other without a refresh; confirm both show up in each other's presence/online list, and disappear from it after closing the tab.
- After the Vercel deploy: load `lastasylumplague.org` live, confirm `.us/.store/.info` redirect to it, confirm the live comment flow end-to-end (Turnstile route → Supabase insert → re-render), and confirm a magic-link email received on the live domain signs the user in and lands them back on the site (not `localhost`).
