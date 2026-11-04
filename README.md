# Last Asylum: Plague Community

An unofficial community site for *Last Asylum: Plague*, brought to you by **BurnFire Alliance — Kingdom #324**.

## About the community

This project is being built as a polished gathering place for players and alliances. It brings useful game knowledge, community conversation, and creative work together in one experience.

Planned and evolving areas include:

- Strategy guides and hero information
- Game updates, known bugs, and community discoveries
- Alliance spaces with channels and live chat
- BF2 recruit academy and officer Command Center
- Comments, reactions, and fan art
- Interactive visuals, motion, and chibi hero artwork

The recruit and officer workflows are documented in
[docs/command-center.md](./docs/command-center.md).
The member headquarters is available at `/portal` locally and is prepared for
`portal.burnfire2.com`. It connects academy, chat, shared membership approvals, and officer
tools with email-code, email-link, and passkey sign-in.

## Community access

Visitors may browse public information without an account. Posting, reacting, chatting, or submitting community content requires a verified sign-in.

The public header keeps language, navigation, and portal access in separate responsive
groups. Signed-out visitors see **Sign in**; browsers without a remembered account also
see **Create account**. Both use the existing verified-email flow, which reuses an
account when the email is already registered. Successful sign-in (or loading an existing
session) sets the non-identifying `bf_account_known` cookie for one year, shared between
the public and portal subdomains. It survives sign-out and only hides the registration
prompt; it never authenticates anyone. Session cookies remain host-only. A new browser,
cleared cookies, or blocked cookies cannot establish whether someone already has an account.

Each account belongs to one alliance. In-game rank and special alliance titles are managed separately from a member's public display name.

## Languages

Localization is enabled on the public site and member portal. To enable it on a new deployment, set
`NEXT_PUBLIC_LOCALIZATION_ENABLED=true` when building and running the deployment,
then rebuild and redeploy. Leaving it unset or `false` keeps the English-only
experience. The language selector reads this flag at build time.

The supported language set is English, Russian, Filipino, French, Simplified Chinese, Traditional
Chinese, Japanese, Spanish, German, Korean, Portuguese, and Arabic. The first page is
rendered in the best supported language from the browser's `Accept-Language` header;
no location lookup or external translation service is used. A visible language selector
overrides that choice and saves the `bf_locale` preference for one year. On
`burnfire2.com`, that preference is shared with the portal subdomain. Existing URLs,
sign-in sessions, quiz answers, and permissions do not change when choosing a language.

Interface translations are stored in `lib/i18n/ui`, with server/API message translations
in `lib/i18n/messages`. Member-written chat messages, names, and other user-authored
text are not translated. Arabic uses right-to-left layout; email addresses and code
fields remain left-to-right.
Hero, skill, and exclusive-weapon proper names stay in their canonical game spelling
so dossier headings and skill-priority lists match. Rarity/stat abbreviations stay
canonical; faction, role, tier labels, narratives, and skill explanations are translated.

All 19 public guides have stored MDX translations in every supported non-English
language under `content/burnfire/locales`. Each locale's manifest binds its guides
to the exact English source hash; source edits invalidate the translation and
display an explicit English fallback. All 31 heroes have stored narrative and skill
translations in every supported non-English language, bound to their current source
hashes. Future source edits require refreshing the corresponding translations.

Run `npm run check:localization` to check dictionary coverage and interpolation
placeholders. It is included in `npm run ci`. The locale negotiation tests run with the
normal test suite; live rendering tests additionally require `BURNFIRE_API_TEST_URL`
pointing to the local development server.
The content tests compile all 209 translated guides as MDX and enforce complete guide
and hero inventories across all 11 non-English catalogs.
Hero checks compare current source hashes, paragraph/upgrade coverage, numeric
percentages, and the actual localized loader output. For live checks, build and start
the app with `NEXT_PUBLIC_LOCALIZATION_ENABLED=true`, then run:

```sh
BURNFIRE_API_TEST_URL=http://127.0.0.1:3000 NEXT_PUBLIC_LOCALIZATION_ENABLED=true \
  node --experimental-strip-types --test tests/localization-api.test.mjs
```

Local acceptance checks cover all 12 server-rendered languages, selector persistence
through reloads and navigation, blocked-cookie errors, mobile language controls,
Arabic right-to-left portal layout, and authenticated academy content and quizzes.
Production acceptance checks also verify all 12 negotiated languages and the language
selector on both `www.burnfire2.com` and `portal.burnfire2.com`.

## Disclaimer

This is an unofficial fan and community project. It is not affiliated with, endorsed by, or operated by the creators or publishers of *Last Asylum: Plague*.

© BurnFire Alliance, Kingdom #324.
