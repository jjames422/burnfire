# Adding a guide

A guide is one file. There's no CMS login, no admin screen — you write a text file, commit it,
push it, and it's live within a minute or two (Vercel auto-deploys `main`).

## Where the file goes

`content/burnfire/guides/<your-slug>.mdx` — the filename (minus `.mdx`) becomes the URL,
`/guides/<your-slug>`. Use lowercase words separated by hyphens, e.g. `rally-defense-101.mdx` →
`/guides/rally-defense-101`.

## Frontmatter template

Every guide starts with a frontmatter block (the part between `---` lines) before any actual
content. Copy this and fill it in:

```yaml
---
title: "Your Guide's Title"
slug: "your-guide-slug"
tags: ["Building"]
summary: "One sentence — shows on guide cards and the homepage. Make it count."
heroImage: "/images/guides/your-guide-slug/hero.png"
author: "Your Name"
authorRank: "Officer"
publishedAt: "2026-09-05"
alliance: "burnfire"
draft: false
---
```

Field by field:

- **`title`** — shown as the big heading on the guide page and in browser tabs.
- **`slug`** — must exactly match the filename (minus `.mdx`). This is checked at build time, not
  auto-derived, so a typo here breaks the page.
- **`tags`** — one or more of: `Hero`, `Building`, `Clinic`, `PVP`, `PVE`, `Alliance`, `Events`,
  `Patch Notes`. These are fixed — this list can't be extended from a guide file, only by editing
  `lib/content/types.ts` (a developer task, not an author one).
- **`summary`** — one sentence, shows on the card/homepage listing. Not the same as the guide's
  first paragraph — write it as a hook, not an intro.
- **`heroImage`** *(optional)* — path to an image under `public/images/guides/<slug>/`. Only
  matters if you actually reference it with a `<Figure>` in the body (see below) — setting it here
  alone doesn't display anything by itself yet.
- **`author`** / **`authorRank`** *(rank optional)* — shown under the title.
- **`publishedAt`** — `YYYY-MM-DD`. Drives sort order on the homepage's "Most Recent" rail and the
  tag groupings — always use this exact format, not a human-readable date.
- **`updatedAt`** *(optional)* — same format, if you significantly revise a guide later.
- **`alliance`** — always `"burnfire"` right now (there's only one alliance live). Leave it as-is.
- **`draft`** — `true` hides it from the homepage/`/guides` listing, but the page is still
  reachable directly if you know the URL (useful for sharing a link before it's "officially"
  published). Set to `false` when ready.

## Screenshots

1. Put image files in `public/images/guides/<your-slug>/` — create the folder if it doesn't exist.
2. Reasonable size: guides so far use 1200×675px (16:9) screenshots. Not a hard requirement, but
   keeps the framed treatment looking consistent.
3. Reference them in the body with `<Figure>` (see below), not a plain Markdown `![]()` image — the
   custom component gives it the framed/captioned treatment the rest of the site uses.

## MDX component cheat sheet

These are available directly in the guide body, no import needed.

**Callout** — an admonition box. Three variants, each with its own color/icon:

```mdx
<Callout variant="tip" title="Optional custom title">
  Body text — supports **bold**, links, multiple paragraphs.
</Callout>

<Callout variant="warning" title="Don't do this">
  ...
</Callout>

<Callout variant="lore" title="From the archives">
  ...
</Callout>
```

`title` is optional — omit it and it falls back to "Tip"/"Warning"/"Lore".

**Figure** — a framed, captioned image:

```mdx
<Figure
  src="/images/guides/your-guide-slug/hero.png"
  alt="Describe what's in the image, for accessibility"
  caption="One-line caption shown under the image"
  credit="Optional — e.g. a screenshotter's name"
/>
```

`alt` is required. `caption`/`credit` are optional.

**Tables** — plain GitHub-flavored Markdown tables work and get the site's styling automatically:

```markdown
| Structure | Scrap | Build time |
| --- | --- | --- |
| Water Reclaimer | 120 | 4h |
| Perimeter Wall | 60 | 3h |
```

**Headings** — plain Markdown `##`/`###` (not `#` — that's reserved for the title). Anchors and
slugified ids are generated automatically; don't add your own `id` attributes.

## Publishing

There's no separate "publish" button — commit the `.mdx` file (and any images) and push to `main`.
Vercel picks it up automatically. If you want to stage something without it going live yet, set
`draft: true`, push, and flip it to `false` (then push again) when ready.
