# BurnFire Guide Site

The guide + live chat site for BurnFire, an alliance in *Last Asylum: Plague*. Live at
[lastasylumplague.org](https://lastasylumplague.org).

Built to run at **$0 ongoing cost**, maintainable by one developer, and structured so a second
alliance could get its own guide section and chat channels later without a rebuild. The original
implementation plan (`quizzical-questing-starlight.md`, repo root) has the full reasoning behind
every architectural decision below — read that first for *why*, this README is the *what/how*.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript, deployed on **Vercel** (auto-builds from
  GitHub on every push to `main`).
- **Tailwind CSS v4** (CSS-first `@theme`, no `tailwind.config.ts`).
- Content is **git-based MDX** — guides are files in `content/<alliance>/guides/`, not a hosted
  CMS.
- **Supabase** (free tier) for everything dynamic: comments/reactions (authenticated), auth
  (magic-link), chat (channels/messages/presence) — all called directly from the browser with the
  anon key, secured by Row Level Security, not by a backend server.
- **Resend** for outbound auth emails (magic-link), so they send from the real domain instead of
  Supabase's generic shared sender.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in the values below
npm run dev
```

`.env.local` needs:

| Var | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page — the anon/publishable key (safe to expose; RLS is the real boundary) |
Without Supabase configured, comments/reactions/chat gracefully show a "not configured" state
instead of crashing — the guide content itself works with zero env vars.

For a new database, run `supabase/schema.sql` and then every file in `supabase/migrations/` in
filename order. For an existing database, apply only migrations that have not already been run.
Review and back up production data before applying a migration.

## Architecture

**Multi-tenancy seam:** `config/alliances/<slug>.ts` holds one alliance's identity (name, theme
colors, domain). `config/site.ts` picks the active one — every component reads through `site`,
never a literal alliance name or hardcoded color. Routing stays single-alliance (`/guides/[slug]`,
not `/[alliance]/guides/[slug]`) for now; see `docs/adding-an-alliance.md` for what onboarding a
second alliance actually involves.

**Content model:** `content/<alliance>/guides/*.mdx`, frontmatter validated with `zod`
(`lib/content/types.ts`), loaded via `lib/content/guides.ts`. Custom MDX components
(`components/mdx/`) handle Callout/Figure/table/heading-anchor rendering — see
`docs/adding-a-guide.md` for the author-facing side of this.

**Design system:** dark, flat-corner (no `border-radius` anywhere, deliberately), gritty theme —
see the design-system notes inline in `app/globals.css` and `components/mdx/Callout.tsx` for the
specific rules (they exist because a plain color-token table alone kept producing a generic,
default-Tailwind look).

**Supabase tables** (all in `supabase/schema.sql`, RLS-locked, no custom backend server):
`comments`/`guide_reactions` (guide-scoped and auth-required), `alliances`/`alliance_members`, and
`profiles`/`channels`/`messages` (chat, requires magic-link auth). Public visitors may only read
approved comments and aggregate reaction counts. See `docs/managing-roles-and-channels.md` for promoting a member to
officer/admin or adding a channel — both are Table Editor operations, not code changes.

## Deploy model

- Code is developed and committed from wherever you're working, pushed to
  [github.com/jjames422/burnfire](https://github.com/jjames422/burnfire).
- Vercel auto-builds and deploys `main` on every push — no manual deploy step or static-export
  workaround (this runs as a real Next.js app, so `next/image` works natively).
- Domains: `lastasylumplague.org` is canonical (`config/alliances/burnfire.ts` → `domain`);
  `.us`/`.store`/`.info` are configured in Vercel's dashboard as redirects to `.org`. DNS lives at
  the registrar (IONOS), pointed at Vercel via A records — not migrated to Vercel's nameservers.
- Supabase Auth's Site URL / Redirect URLs must include the production domain (and `localhost` for
  dev) or magic-link sign-in breaks on whichever one is missing.

**Honest limits, stated plainly (not blockers, just worth knowing):** Vercel's free Hobby tier is
scoped for non-commercial use. Supabase's free tier caps at 200 concurrent Realtime connections and
pauses a project after 7 days of zero traffic (auto-resumes, first request after is just slow).
Comfortable for one alliance; the metric to watch if this ever hosts several at once is concurrent
connections.

## Other docs

- `docs/adding-a-guide.md` — writing and publishing a guide (non-developer-facing).
- `docs/adding-an-alliance.md` — onboarding a second alliance (developer-facing).
- `docs/managing-roles-and-channels.md` — promoting members, adding chat channels.
