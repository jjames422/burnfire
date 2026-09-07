# Chat Release 3

Release 3 turns the existing chat backend capabilities into visible, usable community tools. It remains isolated on a feature branch until its Vercel preview is approved.

## Included

- Channel-scoped message search with author and date context.
- A pinned-message browser with jump-to-message navigation.
- Thread summaries and a focused thread panel for replies.
- Private image, GIF, PDF, and text attachments up to 25 MB, using signed URLs.
- A complete in-app reporting dialog with validation and private moderator delivery.
- Modern React 19 submit-event types throughout interactive forms.
- A source-policy CI check that blocks deprecated form-event types and prohibited attribution remnants from returning.

## Security boundaries

- Every chat surface remains authenticated.
- Search uses the channel-access database function.
- Attachment objects stay private and are read through short-lived signed URLs.
- Upload paths are scoped to the authenticated user.
- Reports are visible only to their reporter and platform administrators.
- Pinning remains restricted by the existing moderator database function.

## Deferred

- Direct and group messages, user blocking controls, moderator queue, timeouts, and audit interface.
- Malware scanning and image moderation before expanding attachment file types.
- Structured polls, notification preferences, multilingual writing assistance, custom emoji, and premium storefront flows.
