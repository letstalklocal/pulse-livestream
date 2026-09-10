# In-app notifications

Settings > Notifications controls foreground banners. Preferences are stored per authenticated Pulse user in `notification_preferences` and survive restarts/sign-ins. A master switch preserves individual category choices. Message previews hide DM/comment content. The settings screen reports save/load failures and does not claim a failed save succeeded.

Supported activity: incoming unread DMs/media, pending private-live invitations, new followers, gifts and direct-media payments received through DMs (excluding live gifts, grants, and other purchases), likes/comments on owned posts, and followed hosts starting regular or Premium public lives. Party/VS invitations use the existing live controls and do not create extra notification banners. Announcements are omitted until there is a sender workflow. Turning off a banner does not discard messages or invitations or disable existing live-room gift rendering and controls.

The authenticated `/notifications/in-app` endpoint reads existing committed activity; it does not create copies of ordinary live chat. It filters disabled categories, self activity, blocked users, and private live discovery before responding. Expired invitations and ended/stale lives are excluded. Regular and Premium lives use the same Live streams preference; Premium banners are labeled Premium live and open the existing stream entry flow. Message/comment previews are redacted on the server and client when disabled.

The app polls every five seconds while active, uses stable event IDs for deduplication, and caps its banner queue at five. Initial opening, resuming from background, and preference changes establish a new baseline instead of replaying old events. Banners expire after 6.5 seconds and can be dismissed or tapped. DM-related banners (messages, private-live invitations, and DM gifts/payments) are suppressed throughout Messages, new-chat, and all open conversations. Suppressed events are marked seen so leaving Messages does not replay them. Query data and queued banners are isolated between accounts. This is a foreground alert feature, not a notification history or guaranteed-delivery queue; the feed is capped at the newest 100 events per poll.

Apply `lib/db/migrations/20260910_notification_preferences.sql` before deploying the new API. The integration test applies it idempotently and removes only its temporary fixtures:

```sh
node artifacts/api-server/tests/notifications.integration.mjs
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```

Push registration, OS permissions, APNs/FCM credentials, and background push delivery are intentionally deferred. Before release, test real foreground banners on signed-in devices, including navigation, app backgrounding, and full-screen live presentations.
