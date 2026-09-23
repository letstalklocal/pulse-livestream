# In-app notifications

Settings > Notifications controls foreground banners. Preferences are stored per authenticated Pulse user in `notification_preferences` and survive restarts/sign-ins. A master switch preserves individual category choices. Message previews hide DM/comment content. The settings screen reports save/load failures and does not claim a failed save succeeded.

Supported activity: incoming unread DMs/media, pending private-live invitations, new followers, gifts and direct-media payments received through DMs (excluding live gifts, grants, and other purchases), likes/comments on owned posts, and followed hosts starting regular or Premium public lives. Party/VS invitations use the existing live controls and do not create extra notification banners. Announcements are omitted until there is a sender workflow. Turning off a banner does not discard messages or invitations or disable existing live-room gift rendering and controls.

The authenticated `/notifications/in-app` endpoint reads existing committed activity; it does not create copies of ordinary live chat. It filters disabled categories, self activity, blocked users, and private live discovery before responding. Expired invitations and ended/stale lives are excluded. Regular and Premium lives use the same Live streams preference; Premium banners are labeled Premium live and open the existing stream entry flow. Message/comment previews are redacted on the server and client when disabled.

The app polls every five seconds while active, uses stable event IDs for deduplication, and caps its banner queue at five. Initial opening, resuming from background, and preference changes establish a new baseline instead of replaying old events. Banners expire after 6.5 seconds and can be dismissed or tapped. DM-related banners (messages, private-live invitations, and DM gifts/payments) are suppressed throughout Messages, new-chat, and all open conversations. Suppressed events are marked seen so leaving Messages does not replay them. Query data and queued banners are isolated between accounts. This banner feed is capped at the newest 100 events per poll. Persistent history is recorded independently, as described below.

Apply `lib/db/migrations/20260910_notification_preferences.sql` before deploying the new API. The integration test applies it idempotently and removes only its temporary fixtures:

```sh
node artifacts/api-server/tests/notifications.integration.mjs
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```

Push registration, OS permissions, APNs/FCM credentials, and background push delivery are intentionally deferred. Before release, test real foreground banners on signed-in devices, including navigation, app backgrounding, and full-screen live presentations.

## Video processing completion — September 21, 2026

User selected in-app completion alerts, not phone push. A signed-in app-wide monitor uses the existing owner-only video library/refresh endpoints every ten seconds while foregrounded, independent of the upload sheet. It tracks pending/new uploads, retries transient failures, ignores finished history at startup and deduplicates completion. Ready/failure alerts honor the master notification switch; tapping opens Your Video directly. No background push, auto-enabling Discovery or provider-side processing acceleration is implied. Checks resume on foreground return; an app restart starts a fresh baseline.

The uploader explains that processing continues after leaving the screen and notification is in-app. Latest user decision supersedes conditional dismissal: closing the uploader from Go Live offers Stay on Go Live or Go to Discovery, regardless of the saved Discovery toggle. Opening full-screen video uses a separate dismiss callback so it does not trigger Discovery navigation. Automated monitor and sheet checks are separate from pending Android/iPhone banner and navigation verification.

## Notification history — September 23, 2026

The profile bell (immediately left of the menu) opens Notifications and shows an unread count, capped visually at 99+. History records supported activity even when the master banner switch or individual categories are off. Opening an entry marks it read and opens its existing destination; video processing entries open Your Video directly. Entries can be deleted individually or cleared together without deleting messages, posts, gifts, purchases, or videos. Opening the list alone does not mark everything read.

Apply `lib/db/migrations/20260923_notification_history.sql` before publishing the API. Database triggers capture new events in the source transaction, including either ordering of direct-media payment/purchase inserts. Rolled-back activity creates no history. History starts when this migration is installed; older notifications are not backfilled. Video completion is recorded when the backend learns the provider's ready/failed status; this does not add a background provider monitor or phone push.

History endpoints are authenticated and recipient-scoped. Pages contain 50 entries, with a separate unread count. Self activity, user blocks in either direction, private live announcements, and host-specific live blocks remain excluded. History also respects message-preview privacy. Banner preferences do not filter stored history. Deletion does not reconstruct old events on later polls. Live/invitation entries remain historical after expiry; their destination's existing availability/access checks still apply.

Automated checks: database integration covers muted capture, persisted reads, account isolation, pagination, clearing without deleting source messages, rollback, video transition deduplication, and blocking; the existing banner regressions remain in place. The screen harness checks tap/read navigation, action failure, delete/clear, direct video-sheet opening, and account-switch/sign-in guards. Run:

```sh
node artifacts/api-server/tests/notifications.integration.mjs
node artifacts/api-server/tests/notification-history-ui.test.mjs
node --test artifacts/api-server/tests/notification-visibility.test.mjs
node artifacts/api-server/tests/localization.test.mjs
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```

Android/iPhone verification remains pending: bell spacing/count, unread styling, long text and scrolling, tap destinations, muted banners with saved history, individual/clear-all deletion, refresh, restart/account switch, and opening/closing Your Video. No native build or production publication is implied.

Development verification: migration applied, all listed automated checks passed, and the API was rebuilt/restarted with its existing environment. The running health endpoint returned 200; list/read/delete/clear endpoints each returned the expected 401 without authentication. Authenticated behavior was exercised against the actual router/database with temporary accounts, not through a signed-in phone session. Production still needs the migration and API publication.
