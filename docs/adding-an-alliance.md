# Adding an alliance

Developer-facing. The data layer and Supabase schema are already multi-tenant-ready — every
table/query is scoped by an `alliance` column/parameter. What's **not** ready yet is routing: this
app currently serves exactly one alliance per deployment, picked by `config/site.ts`. Read the
"Current limitation" section before assuming you can just add a config file and have two alliances
live side by side.

## What's ready today

### 1. Config

Add `config/alliances/<slug>.ts` matching the `Alliance` interface in `config/alliances/index.ts`:

```ts
import type { Alliance } from "./index";

export const yourAlliance: Alliance = {
  slug: "your-alliance",
  name: "Your Alliance",
  tagline: "...",
  gameName: "Last Asylum: Plague",
  domain: "youralliance.example",
  logo: "/images/your-alliance/logo.svg",
  theme: {
    colorBg: "#...",
    // ...every field the Alliance interface requires
  },
};
```

Register it in `config/alliances/index.ts`'s `alliances` object. This is also where the whole look
of the site comes from — swapping which alliance is active swaps every color with zero component
edits, since components only ever read through `site.alliance.theme`, never a literal hex value.

### 2. Content folder

`content/<slug>/guides/*.mdx` — same structure as `content/burnfire/guides/`, see
`docs/adding-a-guide.md`. Each guide's frontmatter `alliance` field must match the new slug.

### 3. Supabase rows

No schema or RLS change needed — `alliance` is already a column on `comments`, `reactions`,
`profiles`, and `channels` (and transitively on `messages`, via `channels`). Onboarding a new
alliance in the database means:

- Insert its day-one channel rows into `public.channels` (copy the pattern at the bottom of
  `supabase/schema.sql`, just with the new `alliance` value).
- New members' `profiles` rows get the right `alliance` automatically, since `ProfileSetupModal`
  is passed `alliance` from `site.activeAlliance` — as long as `config/site.ts` is pointed at the
  new alliance (see below), new signups land correctly scoped.

## Current limitation: one alliance per deployment

`config/site.ts` has a single `ACTIVE_ALLIANCE` constant — the whole app (routing, metadata,
theme) is built around exactly one alliance being "live" at a time. Concretely, that means there
are two real options today, not one:

**Option A — separate deployment per alliance (works right now, zero code changes beyond config):**
point a new Vercel project (or reuse this one on a different branch) at a copy of this repo with
`ACTIVE_ALLIANCE` changed and that alliance's domain configured. Can share the same Supabase
project (the `alliance` scoping already keeps data separate) or use a different one. This is the
"no rebuild" promise in practice today — it's a redeploy, not a rewrite, but it is still a second
deployment to maintain.

**Option B — one deployment serving multiple alliances (needs the routing migration below):**
genuinely useful if you want `lastasylumplague.org/burnfire/guides/...` and
`otheralliance.example/guides/...` (or similar) served from the same running app and the same
`next build`.

### The `/[alliance]/...` migration (not built, this is the design note)

`lib/content/guides.ts` already takes an `allianceSlug` parameter on every function — this was
deliberate, so this migration is additive routing work, not a data-layer rewrite. The shape of it:

1. Move `app/guides/page.tsx` and `app/guides/[slug]/page.tsx` under `app/[alliance]/guides/...`,
   same for `app/chat/page.tsx` → `app/[alliance]/chat/page.tsx`.
2. Each page resolves `alliance` from the route param instead of `site.activeAlliance`, and calls
   `getAlliance(alliance)` (already handles unknown slugs — decide whether that should 404 or fall
   back).
3. `config/site.ts`'s single `ACTIVE_ALLIANCE` constant goes away, or becomes a fallback for the
   bare `/` homepage (which alliance's homepage shows at the root domain, if any).
4. Multi-domain routing: Vercel supports multiple custom domains per project, so each alliance's
   own domain can map to `/[their-slug]/...` — either via `next.config.ts` rewrites keyed on the
   request's `Host` header, or Vercel's domain-to-path redirect features. This is the part that
   needs the most care; get the domain→alliance mapping right before touching page code.
5. Comments/reactions/chat components don't need to change — they already take `alliance` as a
   prop, not a global.
6. `app/layout.tsx` (root layout) currently reads `site.alliance` directly for the page's theme
   CSS variables and metadata (title/OG tags) — that's the one spot not covered by moving routes
   under `[alliance]`, since the root layout wraps every route including ones outside it. Fixing
   this means moving the per-alliance theme/metadata into a nested layout at
   `app/[alliance]/layout.tsx` instead, and deciding what the root layout falls back to for routes
   with no alliance in the path (or removing the bare root routes entirely in favor of always
   having an alliance segment).

Don't build this preemptively for a hypothetical second alliance — it's real, non-trivial routing
work, and Option A above already delivers "a second alliance without a rebuild" for whenever an
actual second alliance shows up.
