# Video stickers — approved plan, paused

Recorded September 21, 2026. User approved implementation, then explicitly said “wait” and “save for the morning.” Work is paused pending a request to resume. Only code inspection was completed for this feature; no video-sticker implementation or migration has been made.

## Approved behavior

- Add the same circular Add gift sticker and Add pack sticker controls above the preview in Your Video. Each recorded video owns its own sticker selection, with at most two stickers. Selecting a pack automatically uses its saved gift and gift-derived price. No duplicate pack in the two slots.
- History videos retain their stickers. Newly uploaded videos start empty. Creator double-tap opens Close sticker / Replace sticker / Cancel, matching live behavior.
- Reuse live appearance: left side above chat, 64 × 89.6 points, 5:7, 10% white background, 50% white border, media-count icons above gift artwork and coin price below. Show in the opened recorded-video player; do not add to Discovery feed thumbnails.
- Gift stickers use existing recorded-video gifting behavior. Pack stickers show the existing purchase confirmation and use the shared pack purchase transaction.
- Charge once, credit once, record ownership and deliver the pack unlocked in DMs without another Rose. Existing blocks and video access restrictions apply. Creator previews never self-charge.
- Owned packs show View pack with no price. Opening a pack pauses the underlying video; opening successfully dismisses that viewer's sticker. Closing the gallery restores playback only when appropriate for the prior playback state, screen focus and app foreground state. Failed loading must not dismiss the sticker.
- Persist dismissals by viewer account and video; preserve DM access to the pack.
- New pack purchases count once toward that video's coin total, creator statistics and Top Gifters. Keep pack sales distinguishable from ordinary gifts. Retries, existing ownership and View pack do not create additional credit or retroactive video attribution.
- Validate current offer and price on the server. Removed/replaced stickers, unavailable videos, deleted packs and stale prices must not charge.

## Inspected implementation points

- `artifacts/mobile/components/LiveStickerCard.tsx`: reuse existing appearance and double-tap handling.
- `artifacts/mobile/components/LiveStickerSetup.tsx`: reusable creator setup and gift/pack picker; selector already reads pack gift and price. Review its Create pack navigation when used inside the video management sheet.
- `artifacts/mobile/components/LiveStickerOverlay.tsx`: current live-only status polling, purchase flow, host management, dismissal persistence and shared gallery. Reuse behavior with an explicit video context or a narrowly scoped video adapter; preserve live defaults and tests.
- `artifacts/mobile/components/CreatorVideoSheet.tsx`: Your Video, selected video and history. Place setup above the selected preview, preserving persistent upload/processing feedback and Discovery opt-in behavior.
- `artifacts/mobile/app/video/[id].tsx`: recorded viewer, gift flow, keyboard/overlay state and player lifecycle. Integrate stickers without changing Discovery thumbnail rendering or existing chat controls.
- `artifacts/mobile/components/MediaPackGallery.tsx`: shared in-place gallery; preserve accepted image sizing/swiping behavior.
- `artifacts/api-server/src/lib/liveStickers.ts`: shared draft validation (max two, gift catalog, pack ownership/uniqueness). Existing access validator is live-specific; do not use it for recorded video access.
- `artifacts/api-server/src/lib/mediaPackPurchase.ts`: shared atomic payment/ownership/DM receipt transaction. Currently supports DM and optional live context; add explicit video context while preserving request-key validation and lock ordering.
- `artifacts/api-server/src/routes/media-packs.ts`: pack unlock endpoint validates optional live context and expected price. Extend carefully or introduce an explicit video purchase endpoint calling the same transaction.
- `artifacts/api-server/src/routes/creator-videos.ts`: owner library/settings, viewer access, gifts, coin totals, ranking and stats. Existing video gifts are linked through `creator_video_gifts`; design attribution so pack sales remain identifiable and all totals agree.
- `artifacts/api-server/src/lib/creatorVideoAccess.ts`: existing recorded-video access rules to preserve and recheck inside payment transactions.

## Remaining work

1. Read current AGENTS instructions and required documents again as needed; inspect the current working tree so unrelated work is preserved.
2. Design and implement per-video sticker persistence/migration, owner configuration endpoints and metadata-only audience status. Preserve sticker identity when unchanged; replacement must invalidate stale offers.
3. Extend the shared purchase transaction for video access, receipt delivery, price verification and exact-once video earnings attribution. Serialize edits/removal/visibility changes and purchases with compatible lock ordering.
4. Integrate creator setup and viewer overlay, video gift dispatch, dismissal persistence and gallery playback pause/restore.
5. Add meaningful API/database tests: ownership, max two, duplicate pack, access/blocking, insufficient funds, stale price/offer, concurrent and lost-response retries, one debit/credit/receipt, prior ownership, attribution, visibility/deletion/edit races and gift behavior.
6. Add client tests: setup, host double-tap management, purchase confirmation, tap suppression, owned View pack, dismissal/account/video isolation, failed load, late response cleanup and playback restoration.
7. Run live/DM/video regressions, mobile/API/library types, API build and localization. Apply development migration and rebuild/restart development API preserving its environment; verify affected endpoints on the running server.
8. Report automated evidence separately from Android/iPhone device checks. Native placement, playback/audio/seek, keyboard, gestures, app background/focus and screen-awake verification remain pending until actually tested. Do not start native builds or production deployment without authorization.

No new CDN work is needed for stickers. Read `docs/live-stickers.md`, `docs/stream-screen-regressions.md`, `docs/chat-message-preferences.md`, `docs/coins-premium-revenuecat.md`, and relevant recorded-video requirements before implementation. The previous DM/pack resumable upload work is separate and must be preserved.

## Implementation — September 21, 2026

Implemented in the development workspace. `creator_videos.stickers` stores up to two server-generated sticker records, with the migration `20260921_creator_video_stickers.sql` applied to the development database. Owner-only `PUT /api/creator-videos/:id/stickers` validates the existing gift catalog, owned packs and duplicate packs; viewers receive metadata-only status at `GET /api/creator-videos/:id/stickers`. Status is available only for an accessible, ready, selected, Discovery-enabled video.

`VideoStickerOverlay` uses the approved live sticker cards over the opened recorded-video player, not Discovery thumbnails. Viewer cards hide with the keyboard; creators see the same cards but cannot charge themselves. Pack ownership displays View pack. Opening it fetches the existing authorized pack gallery, persists dismissal by account/video and pauses the recorded player; closing resumes it. A pack purchase uses the shared transaction with video/sticker identity, rechecks the currently selected enabled video and sticker under lock, honors expected price, and atomically debits/credits, records ownership, inserts one unlocked DM receipt and attributes the transaction through `creator_video_gifts`. Existing stats, top gifters and total queries therefore include the new sale exactly once.

The Your Video management sheet now uses the existing add/replace/close sticker selector for its selected recorded video. History retains each video's saved stickers. This does not alter live sticker routes, Discovery cards, RevenueCat, pack pricing, DM purchase rules or uploads.

Automated: development migration presence checked; API/mobile TypeScript and API build pass; development API rebuilt/restarted with its existing environment and protected endpoint authentication checked; localization and existing live sticker/stream regression suites pass. The isolated real-database test covers owner configuration, public metadata, pack price, purchase, one debit/receipt/purchase/video-attribution and already-owned access; it uses temporary accounts and no phone media. Android/iPhone checks remain pending for selector flow, 5:7 placement/contrast, video pause/resume/audio/seek, gallery dismissal, keyboard/dock, touch/scroll gestures, accessibility, background/foreground, paid/free/insufficient purchase and existing stream/DM regressions. No native build or production deployment was started.

### One gift and one pack limit — September 21, 2026

Latest correction: recorded videos allow at most one gift sticker and one pack sticker. The editor disables the add action for a kind already present and opens sticker options on a direct tap as well as double-tap. The API rejects duplicate gift or duplicate pack kinds, preserving the two distinct slots and existing replace/close behavior. API/mobile typechecks, live sticker regression and diff checks pass; the rebuilt development API was restarted and its protected video sticker endpoint verified. Device placement and gesture confirmation remain pending.

### Original prototype restored at user request

Restored the original `/video-prototype` screen, its route registration and its Discovery sample card under the existing development/explicit-build opt-in. It uses the original sample URL, `videoCache` and `CachedVideoPlayer`, including cache inspection controls. The recorded-video sticker overlay remains on `/video/[id]`. This supersedes the earlier request to remove the original prototype; it does not add stickers to the sample prototype or change the shared cache/player.

### Working sample with stickers

User clarified that the original prototype must show sample video and stickers together. The original cache acquisition, sample URL and CachedVideoPlayer remain; a Rose sticker is visible by default and the existing More sheet exposes the shared gift/pack selector. Select real owned packs, with one gift and one pack maximum. Gift taps use local prototype animations; pack taps preview owned media, pause the sample, dismiss the pack sticker and resume on close. Prototype actions do not charge coins. Real purchases remain in the regular recorded-video screen.
