# Invisible viewing and Premium incognito

Approved September 21, 2026. These are separate features; preserve existing stream, chat, payment and moderation requirements.

## Agreed behavior

- Invisible viewing requires the existing active VIP subscription flag, defaults on, and has a Settings → Privacy toggle. Users remain counted but hidden as viewers, including from the streamer. Chat and gifts show their real identity; gifting makes them visible in the combined viewer/gifter list.
- Premium incognito is available to everyone when allowed by the streamer. Allow incognito defaults on. The Premium gift screen offers Enter as incognito, or shows Incognito not available when disallowed.
- Premium entry choice is fixed for the session, including leaving/rejoining. Incognito aliases (Incognito 1, Incognito 2, etc.) remain stable for that Premium session.
- Everyone, including the streamer, sees the alias in viewer entries, chat, gifts and notifications. Hide profile photos and profile access. Actual payment ownership remains internal.
- Gifter stats combine incognito contributions into one Incognito row with the combined coin total. Other session displays retain individual aliases.

## Completion tracker

- [x] Inspect existing VIP flag, Privacy preferences, combined list and Premium requirements.
- [x] Implement saved invisible-viewing preference and VIP-gated Privacy toggle.
- [x] Implement server-side invisible viewer filtering without changing audience counts or gift identity.
- [x] Implement durable Premium identity, entry-choice enforcement and streamer allowance.
- [x] Implement Premium UI and masked profile handling.
- [x] Aggregate incognito gifter statistics and review identity disclosure surfaces.
- [x] Translate new UI strings in all ten catalogs.
- [x] Run focused privacy/payment tests, required stream regressions and type/localization checks.
- [x] Apply additive development migrations, rebuild/restart API with existing environment, verify running endpoints.
- [ ] Android and iPhone device verification (requires devices; automated checks are separate).

Implementation and automated verification are complete. No native build or production deployment was started. Installed device build numbers are unknown.

## Implementation details

- Existing server-owned VIP access and saved `invisibleViewing` preference control roster filtering; viewer counts remain sourced from presence. Subscription expiry disables invisible viewing without deleting the preference.
- Session identity records persist the public/incognito entry choice and alias. Admission payment and identity creation commit together; retries keep the original choice. Free-entry participants confirm their choice without a charge.
- Public stream responses use opaque alias IDs, generic avatars and disabled profile links. Moderation resolves opaque identities internally. Anonymous blocks retain their alias in Settings and future Restricted lists, including pagination and unblocking.
- Stream rankings and owner earnings statistics group anonymous contributions before their display limit. Saved Moments use the session alias. Actual ledger ownership and wallet transfers remain unchanged.
- Premium Party admission records identity for both rooms. Pending Party invitations cannot be accepted after a room becomes Premium; this preserves the existing public/free Party-formation rule and prevents identity gaps.

## Automated verification — completed

- Full workspace TypeScript checks and final API bundle build passed.
- Required `node artifacts/mobile/tests/stream-screen-regressions.cjs` suite and focused `incognito-entry.test.cjs` passed, including anonymous avatar/profile guards and Premium/PiP admission gating.
- All ten localization catalogs passed (1,013 strings); diff formatting passed.
- Real-database `privacy.integration.mjs`, `incognito.integration.mjs`, `earnings.integration.mjs`, and `moments.integration.mjs` passed. Coverage includes VIP expiry/toggle, retained counts, gift visibility, concurrent aliases, paid/free immutable admission, denied-entry rollback, chat/websocket identity masking, aggregated totals, Party-end persistence, anonymous blocks across later streams, opaque cursor scope and unblocking. Temporary account/payment fixtures were cleaned up. Moment storage is mocked.
- Existing `live-premium.integration.mjs`, `premium-gift-requests.integration.mjs`, and `stream-moderation.integration.mjs` passed. Synthetic fixture tests do not invoke live Agora removal.
- Development migrations applied: `20260921_invisible_viewing.sql`, `20260921_incognito.sql`, and `20260921_incognito_blocks.sql`. Apply these additive migrations before deploying this API elsewhere.
- Final development API rebuilt/restarted preserving its existing launch arguments and environment. Running HTTP checks: health and stream list 200; Privacy GET/PATCH, opaque unblock and earnings require authentication; malformed incognito choice returns its new 400 validation response; a valid request for an absent stream returns 404. Authenticated behavior was tested through route handlers against the development database, not signed-in phone HTTP sessions.
- Primary-agent review covered delegated code, additional earnings/Moments/block identity disclosure paths, and test results. An additional mobile review found no remaining concrete defects.

## Android and iPhone verification — pending

Verify on both platforms: active/expired VIP and toggle persistence; invisible viewer count/list/chat/gift behavior; streamer allow/disallow controls; paid and free entry checkbox/unavailable message; stable aliases after leave/rejoin and PiP; hidden photo/profile access in chat/list/gifts; combined stats with several incognito gifters; anonymous block/unblock from Privacy and subsequent live Restricted lists; public-to-Premium and Party transitions. Repeat the required awake, header/list, navigation/loop/exit, keyboard/composer and dock cases in [stream regressions](stream-screen-regressions.md).

No device result or new native build is claimed. Production publication remains separate.
