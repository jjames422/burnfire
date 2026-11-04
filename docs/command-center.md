# BF2 Command Center

The member portal's canonical origin is `https://portal.burnfire2.com`. Its root opens the
member headquarters. `/portal` is also available for local development; training, command,
and chat remain deep-linkable at `/academy`, `/command`, and `/chat` on the portal.

Local development: run `npm run dev`, then open `http://localhost:3000/portal`.

## Portal deployment

Point `portal.burnfire2.com` at the deployment hosting this Next.js app and add the hostname
to that hosting project's custom domains so it provisions HTTPS. DNS alone is not sufficient.
Set `NEXT_PUBLIC_PORTAL_URL=https://portal.burnfire2.com` before building. Use the same database
and application environment as the main site, not a second account store. Production requests
to the main site's portal pages redirect to this origin when `PORTAL_DOMAIN_ENABLED=true`;
the portal's `/` is always rewritten to `/portal`. Leave this flag unset until DNS and HTTPS
are ready, so existing main-site entry points continue to work during the transition.

Cookies are host-only: existing main-site visitors sign in once on the portal, then share
that portal session across chat, academy, and command. Public pages remain on `burnfire2.com`.
Passkeys must be enrolled on the final HTTPS portal hostname (or localhost during development),
not a temporary preview hostname or an HTTP network IP.

The portal hostname has been attached to the existing `burnfire` hosting project. Its external
DNS still needs this record at the domain's DNS provider:

| Type | Host | Value |
| --- | --- | --- |
| CNAME | `portal` | `e0b3dacd2c73ab35.vercel-dns-017.com` |

After DNS propagates, verify the hostname and HTTPS in the hosting dashboard, deploy this app,
and enable `PORTAL_DOMAIN_ENABLED=true`. Do not change the root domain or other sites' DNS.

## Sign-in and account security

The sign-in screen supports existing email codes, emailed sign-in links, and previously enrolled
passkeys. All methods use the same user row and host-only session, lasting up to 30 days.
Email codes and links expire after 10 minutes. A sign-in link has a fragment token (not a query
parameter) and requires an explicit confirmation POST, so normal email scanners do not consume it.
Passkeys use verified WebAuthn challenges, require user verification, and may be added from
**Sign-in & security** after signing in within the preceding 10 minutes.

`RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` are required for production email.
Email-link delivery fails explicitly when these are absent; links are never logged. Code
logging is limited to development when no provider is configured. Google/Apple OAuth is not
configured or presented as functional.

Passkey enrollment and authentication require HTTPS or localhost. Phone testing over a raw HTTP
LAN address does not support passkeys. Each relying-party hostname has its own credentials:
enroll a new passkey on the final portal hostname even if you previously tested on localhost.
Keep email access as the recovery method and consider adding a second passkey.

New passkey registration is restricted to the device's built-in authenticator, with a
local-device browser hint. Sign-in also hints that the browser should use this device.
The UI checks for a user-verifying platform authenticator before enabling passkey buttons;
devices without one retain email sign-in rather than being directed to a USB key.
First-time users must sign in by email and register a passkey in Sign-in & security first.
The operating system controls the final sign-in sheet; hints cannot force its exact appearance
or create a missing credential. Existing registered keys are not deleted by this change.

## Validation

`npm run ci` runs type checks, source/schema policy checks, unit tests, and a production build.
The optional database test creates an isolated schema inside a transaction and rolls it back.
The optional API test uses temporary `example.invalid` accounts and removes them afterward.
They run only when `BURNFIRE_TEST_DATABASE_URL` is explicitly supplied; the API test also needs
`BURNFIRE_API_TEST_URL=http://localhost:3000` and a running development server. Both refuse
non-local database connections or any port other than 5433. No test sends email.

Physical passkey enrollment/sign-in must also be checked on the final HTTPS portal with the
intended devices; localhost passkeys do not transfer to the live hostname.

## Database setup

The Command Center tables and initial training curriculum are defined in the idempotent
`db/schema.sql`. Apply it to the site's dedicated BurnFire PostgreSQL database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
```

The schema creates the recruit invitation, enrollment, content version, quiz, acknowledgment,
identity history, private officer note, and follow-up records. It seeds the 12 supplied alliance
rules and the cross-server training module. Existing BurnFire members are enrolled from their
verified alliance membership records; members accepted through the existing alliance invitation
flow are enrolled automatically. Existing acknowledgments reference a specific content version
and are retained when a new version is published.

## Officer access

Every Command Center API checks the signed-in account against its verified `alliance_members` row
for `burnfire`, with an independent `platform_admins` override for site administrators. R3, R4,
and R5 may use operational tools. Content editing, member approvals, and recruit reassignment
require R4/R5 or site administration. An officer's `verified_at` must be set on the alliance
membership before rank-based access is granted. Site administration never changes someone's
game rank or makes them the alliance leader. Rank and permission management are described in
[Managing roles and channels](./managing-roles-and-channels.md).

R3 members can see recruit operational data, verify recruit identities, and manage follow-ups
and internal notes. These operational lists are currently alliance-wide, not restricted to
assigned recruits. Email addresses are exposed only to R4/R5 and site administrators. R3 cannot
change identity verification for R3 or higher; R4 cannot change verification for R5.

Members & oversight is available from chat, the portal navigation, and the Command Center.
R4 may approve ranks R1-R3; R5 may manage ranks below R5; site administrators may manage all
ranks. A confirmation precedes changes, and rank changes and recruit assignments are recorded.
R4/R5 can view officer recruit workloads, unresolved follow-ups, applications, and rank history.
The same central membership drives chat and command: R3/R4 get officer chat access, R5 gets
alliance-admin access. Unverified members cannot access private alliance channels.

## Invitations and email

R3+ officers create invitations from the Command Center. Each invitation uses a random one-time
token; only its SHA-256 hash is stored. The invite is bound to the invited email address at
redemption and expires after 14 days. The account receives the fixed R1 rank; the recruit cannot
choose their alliance rank or website permissions.

Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to deliver recruit invitations by email. Set
`NEXT_PUBLIC_PORTAL_URL` to the canonical portal HTTPS origin. If the
email provider is not configured, the portal explicitly reports that and gives the officer the
secure link to share directly. It does not mark that invitation as emailed.

## Recruit academy

Academy steps, module progress, quiz attempts, communication preference, assistance requests,
identity status, and acknowledgments are stored server-side. Recruits can sign in with their
invited email, complete the website onboarding without joining an external chat service, and resume
their saved step later. Existing BurnFire members can use their current account. A personal
invitation can be issued before the recipient has an account and defaults to the inviting officer
as sponsor.

Without an invitation, a visitor signs in at the portal, completes their player profile, and
submits a game identifier to start academy training. They appear in Members & oversight as an
applicant. An R4/R5 or site administrator verifies the claim and approves a membership rank there.
Training access does not confer private chat access, officer privileges, or automatic promotions.

Required training has a knowledge check. A score of at least 80% is required to acknowledge that
content version. A failed check creates one deduplicated officer follow-up for that recruit and
section. Acknowledging a published replacement version is separate from acknowledging an older
version.

An in-game tag/player ID is mandatory before quizzes or training acknowledgments. Members cannot
skip required sections: progression is limited server-side to the first unacknowledged required
section after identity submission and communication selection. Previously skipped saved positions
resume at the earliest unmet requirement. Members may pause without advancing to another section.
Quiz questions are numbered continuously across the published sections, including after resuming
or navigating back to a previous section.

### Signup approvals

The site-admin headquarters includes persistent membership approval tasks and signup counts.
Site admins can view every signed-up account (including incomplete profiles) in Members &
oversight, with search, pagination, signup dates, and email addresses. Other leadership users
retain their existing alliance-scoped roster; signup tasks and email addresses are site-admin only.

Members joining from the portal without an invitation request R1 through R5 alongside their game
ID. R4 may request Diplomat, Recruiter, Goddess, God of War, or no special title; R5 automatically
requests Alliance Leader. These are claims only and never grant permissions. A site administrator
approves the requested rank/title or selects different ones in Members & oversight. Approval
records the decision and clears the task, updating the shared chat/academy/command membership.
Site administration remains independent of alliance ranks and is not self-selectable.

Site admins can search all accounts by name or email under Members & oversight, then open
**Account support / reset** on any user, including users with incomplete profiles. Support
actions require a recorded reason and an explicit confirmation for the selected user:

- Reset quiz and academy progress: removes attempts, acknowledgments and section progress;
  clears completion and returns to welcome. Preserves identity, rank, preferences and follow-ups.
- Resolve selected officer issues: resolves only selected open issues, preserving officer notes
  and history. Quiz scores and training completion are not changed.
- Sign out of all sessions: revokes all browser sessions and pending passkey setup for that user.
  Using it on yourself signs you out too.
- Remove all passkeys: removes credentials and pending passkey setup. Email recovery and existing
  sessions remain available; use the separate sign-out action to revoke sessions as well.
- Reset identity verification: returns verification to pending and suspends rank-based access
  until reviewed again, without deleting their game ID or rank. Site-admin status is independent.

Every action is recorded transactionally in `user_recovery_history`; the latest 20 actions for
the selected account are shown in the support panel. Ordinary officers cannot access this API
or these controls.

Passkey sign-in uses conditional browser autofill on the email field rather than a button that
opens a security-key/QR-code chooser. A saved passkey for the current hostname can be selected
from the field. First-time visitors and browsers without passkey autofill use email, then may
register a built-in-device passkey in Sign-in & security. The browser controls its own credential
UI; a website cannot create an unsaved passkey during sign-in or force biometric availability.

The site does not read game telemetry. Game identifiers are self-submitted and remain pending
until an authorized officer verifies them. No in-game mail-open, relocation, research-donation, or
target-eligibility detection is claimed.

The supplied cross-server and Covert Ops policy is present, including the rule not to share a
Covert Ops target after two hits. Detailed target-navigation and eligibility mechanics are marked
for leadership review; they must not be treated as verified game instructions until approved by
leadership.

## Leadership content

Verified R4/R5 officers can edit content in the Command Center's Leadership CMS. Saving creates a
draft version; publishing retires the previous published version and makes the new one current.
Required rule and training versions need at least one quiz question before publication. Question
answers are not returned to recruit endpoints. Publish a new version when members must review and
acknowledge a changed rule.

## Integration boundary

This implementation provides website-based onboarding, preferences, training, acknowledgments,
and announcement delivery. It does not include chat-account OAuth linking, bot commands, interactive
chat acknowledgments, or chat notifications. Those require an approved application registration,
bot credentials, callback configuration, and a deployment-specific integration review; no simulated
chat integration is presented as functional.
