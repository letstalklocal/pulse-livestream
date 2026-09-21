# Live gift and pack stickers

Approved September 21, 2026. These are optional offers, separate from Premium entry and timed requests.

## Accepted behavior

- Go Live setup has circular **Add gift sticker** and **Add pack sticker** controls and selected previews above the category row, with the background-image/title row below the categories (latest user placement correction). A live can have two stickers total in any combination; the same pack cannot occupy both slots. There is no X on the sticker. Double-tapping a setup preview or broadcaster sticker opens **Close sticker**, **Replace sticker**, and **Cancel**. Replace opens the shared gift/pack selector; cancellation or a failed save preserves the existing sticker. Screen readers expose the same Sticker options action. Viewers retain single-tap purchase/View pack behavior.
- Stickers sit on the left above chat. Each has a faint white background at 10% opacity, a 5:7 portrait ratio, and a thin white border at 50% opacity with rounded corners. The latest size is 20% smaller: 64 × 89.6 points, with proportionally scaled artwork, text, icons and spacing. Pack stickers show video and photo counts above the selected gift artwork, and the shared gold coin image plus pack price below. A pack's price is its total purchase cost, not the artwork's ordinary gift price. Gifts use the existing gift catalog and normal gift payment/animation/chat path.
- A pack tap uses the same confirmation wording as a DM unlock. A single shared purchase transaction debits the buyer, credits the creator, records pack ownership, and ensures the pack is delivered unlocked in the creator/buyer DM conversation. It reuses a previously delivered pack message instead of inserting a duplicate.
- A buyer-initiated receipt is delivered without a second Rose charge. Regular text/media/pack sends retain their existing message-preference checks. Account blocks, live removal, private membership, Premium entry and timed-request access restrictions still apply. Buying a sticker does not pay Premium admission or satisfy a timed request.
- After purchase the sticker says **View pack**, without a price. Buyers who already own that pack also see View pack. Opening it shows its photos/videos in an in-place gallery and dismisses only that viewer's sticker for that live. The pack remains in DMs. A failed load does not dismiss the sticker.
- Dismissals are saved on this device by account and durable channel, retaining the most recent 20 lives. Rejoining the same live preserves dismissal. A new live or another account has separate dismissal state. Other devices independently show View pack.
- Live sticker pack payments count once in the current live's earnings and Top Gifters through the original ledger entry's channel ID. Separate DM purchases, retries, already-owned packs and View pack do not add live credit. No second debit/creator credit is issued. Pack sales do not create a second ordinary gift or change battle scoring; ordinary gift stickers continue using normal gift scoring.
- Streamer selections are persisted with the durable live. Audience status polls every five seconds, including late joiners. Removed/deleted offers cannot be purchased, even while an older card is visible. Stickers hide with viewer overlays and while the keyboard is visible. Existing navigation, PiP, headers, live controls and keep-awake ownership are preserved.

## Implementation and rollout

Migration: `lib/db/migrations/20260921_live_stickers.sql` adds a default-empty JSON column; existing sessions remain valid. Apply it before deploying the updated API to any other environment. The development migration was applied during integration testing. No production migration/deployment or native build is implied.

- Stream creation accepts an optional `stickers` array of up to two `{kind, giftId, packId?}` objects. The server validates pack ownership and creates sticker IDs. Price, counts and recipients are never accepted from sticker configuration.
- `GET /api/streams/:channelId/stickers` returns metadata and only the caller's ownership, without media URLs/object paths. Authenticated active-stream access is required.
- `DELETE /api/streams/:channelId/stickers/:stickerId` is host-only and serializes with purchases through the session row.
- `PUT /api/streams/:channelId/stickers/:stickerId` replaces one host-owned sticker, preserving the other slot and enforcing pack ownership/uniqueness. The replacement receives a new ID so a stale offer cannot charge a different price. It serializes with purchases via the same session lock.
- Existing `POST /api/media-packs/:packId/unlock` accepts optional `live: {channelId, stickerId}`. Without it, the existing received-DM requirement remains. Both paths call `purchaseMediaPack`; payment, ownership and receipt commit or roll back together.
- Existing `POST /api/coins/spend` accepts an optional `stickerId`. For stickers it validates the active session, configured gift, host recipient and catalog price before using the existing gift transfer.
- Request keys and pack-row locks serialize retries, including different keys for the same buyer/pack. Wallets lock in UID order. A failed post-commit earnings notification cannot replay payment; existing earnings reads recover the total.
- Client requests have a 15-second timeout and abort on leaving. Uncertain gift attempts retain their request key for retry. Ownership, wallet caches and dismissal are account-scoped.

## Automated test cases

`node artifacts/api-server/tests/live-stickers.integration.mjs` uses isolated synthetic users and actual PostgreSQL, marks its temporary sessions private to exclude them from shared Discovery, and cleans up its fixtures. Set `VERIFY_STICKER_DISCOVERY=1` to check the running development feed while fixtures exist. It covers:

1. Authentication; two-sticker/valid-gift/owned-pack configuration; exact contents/price; metadata without protected asset paths; per-buyer ownership.
2. A new live purchase creates one purchase, one DM receipt, one debit and one creator credit. Concurrent same-key/different-key requests and a lost-response retry do not duplicate these.
3. Insufficient coins, self-purchase, wrong channel/sticker, reused keys belonging to another purchase, account blocks, removed viewers, stale/ended sessions and removed offers fail without an unintended charge.
4. Premium unpaid denial and free-entry purchase; normal DM send-before-unlock rules; DM access to the same purchased pack; existing DM ownership does not create retroactive live credit.
5. Actual earnings and leaderboard handlers show exact live totals. Separate DM purchases are excluded. A gift sticker uses the original gift route, validates its price and scores once on retry.

`node artifacts/mobile/tests/live-stickers.test.cjs` runs the real components with mocked native/network dependencies. It covers setup limits, double-tap host Close/Replace versus single-tap viewer purchase, edit cancellation, pack confirmation, in-flight tap suppression, purchase-to-View-pack transition, dismissal persistence, opening without repurchase, uncertain gift retry keys, overlay hiding and late-response cleanup. These are behavioral tests, not rendered-device checks.

Existing regression commands:

- `node artifacts/mobile/tests/stream-screen-regressions.cjs` (includes sticker tests and existing startup, screen-awake, PiP, reactions, viewer sheet and Premium reconnect checks).
- `node artifacts/api-server/tests/coins-authorization.test.mjs`.
- `node artifacts/api-server/tests/message-settings.integration.mjs`.
- `node artifacts/api-server/tests/live-premium.integration.mjs` and `node artifacts/api-server/tests/premium-gift-requests.integration.mjs` with external Agora calls disabled for synthetic fixtures.
- Mobile/API typechecks, API build, all ten localization catalogs, and `git diff --check`.

## Required Android and iPhone verification — pending

Record platform, exact installed build, host/viewer accounts, regular/Premium/private/party mode and actual results separately. No device behavior is certified by the automated tests.

1. Before going live, add gift/gift, gift/pack and pack/pack. Check small screens, keyboard, safe areas and large text. A third sticker is unavailable. Replace/cancel/remove; missing/deleted packs fail safely. Go Live with zero stickers retains the existing flow.
2. Join from two viewers and a late joiner. Verify left placement, transparency, 5:7 ratio, complete gift artwork, gold icon, correct price and 2-video/2-photo counts over bright/dark video. Neither sticker covers chat/header/docks or intercepts swipes outside its own target.
3. Send each gift type, including Crown, from a sticker and the ordinary drawer. Check wallet debit, host credit, one animation/chat notice, leaderboard and total. Ordinary party recipient selection and battle scoring remain intact.
4. Buy a pack. Check confirmation, insufficient funds/cancel, rapid taps, airplane-mode/lost response/retry, and leaving during purchase. The buyer receives one unlocked DM pack; the other viewer still sees the offer and price. Neither Premium entry nor a timed request is paid by the pack purchase.
5. Check a pack already bought in DMs. View pack has no price, opens every image/video, and disappears for that viewer after opening. Close it, rejoin, restart the app and switch accounts. Dismissal remains scoped to that account/current live; a later live shows View pack again. DMs still provide access.
6. Remove the offer while another viewer is confirming payment; end the live; delete the pack. No stale offer charges after removal/end. Check host/block/remove/Allow Back, private membership, Premium paid/free entry and expired timed-gift access.
7. Check host and viewer keyboard open/type/send/dismiss, drafts, bottom docks and safe-area spacing. Check DM composer animation, send without keyboard dismissal, replies, timestamps and receipt preferences using [chat regressions](chat-message-preferences.md).
8. Check hide/restore overlays, vertical loop/swipe transitions, explicit Exit, Back/chat/PiP and gallery return. Header/viewer-list behavior must remain as recorded in [stream regressions](stream-screen-regressions.md) and [navigation](stream-navigation.md).
9. Run Android and iPhone short display-timeout tests: untouched host/viewer for twice the timeout, background/foreground, gallery/modal/profile return, then exit/end and verify normal sleep resumes. Check gallery video playback and live audio coexistence on both phones.

## Verification results

Completed September 21, 2026:

- Mobile and API TypeScript checks, API build, `git diff --check`, the full stream regression runner (including new sticker UI tests), and all ten localization catalogs passed (985 interface strings after the double-tap menu).
- New real-database sticker integration tests passed, including concurrent purchases, exact payment/receipt/earnings/ranking assertions, old DM ownership and original DM gating, account block/removal/Premium restrictions, stale/ended sessions and gift-route reuse.
- Existing coin authorization, DM/message-preference integration, Premium admission integration and timed Premium gift integration passed. Synthetic Premium tests made no live Agora calls.
- The additive migration is applied in development. The rebuilt development API was restarted with its original environment preserved; after the subsequent user-reported Replit restart, the managed API was healthy and its bundle still contained the sticker changes.
- Running port 8080 returned health 200, and sticker GET/DELETE, pack unlock and gift spend returned the expected 401 responses without authentication. These are running-server route/authentication smoke checks; authenticated purchase coverage uses real route handlers plus PostgreSQL, not signed-in phone HTTP sessions.
- `VERIFY_STICKER_DISCOVERY=1` verified the running Discovery feed excludes the new test's temporary sessions while fixtures exist. The final database check found zero remaining sticker-test users and zero sticker-test sessions.

Discovery observation: earlier integration suites used temporary public sessions in the shared development database, so temporary test cards could have been visible while those tests ran. The user's particular on-screen observation was not captured. The new sticker test now marks its fixture sessions private to keep them out of Discovery. No sticker UI was added to Discovery; the observed post-test feed contained only the four existing demos.

Android/iPhone visual, gesture, keyboard, media playback, live-network and display-timeout checks remain pending. No new native build or production deployment was performed.

### Final streamer management correction

Latest user decision: double-tap the streamer sticker to choose **Close sticker** or **Replace sticker** (Cancel dismisses the menu). This supersedes the intermediate long-press removal behavior. It applies in setup and while live. Setup controls/previews remain above categories; the transparent 5:7 card retains the 50%-opacity white border and has no X.

Verified automatically: actual card double-tap versus viewer single-tap; host menu options and replacement request; setup cancel preservation; host-only replacement, invalid gift rejection, preserved slot count, new offer ID and stale-price/replacement rejection against PostgreSQL. The full stream regression suite, mobile/API typechecks, API build and ten-language checks (985 strings) passed after this revision. The development API was rebuilt/restarted with its existing environment; running PUT/DELETE returned expected unauthenticated 401 responses, health returned 200, and Discovery contained no sticker-test sessions. Device double-tap timing, menu appearance and live replacement synchronization remain pending on Android/iPhone.

### Pack picker preview and creation — September 21, 2026

User requirement: the picker must show real saved-pack previews; an empty library offers **Create a pack** and opens the existing creation screen. There are no seeded/placeholder packs. Existing saved media is not deleted because its name contains “Test.”

Pack cards now show photo thumbnails/video tiles, photo/video counts, the coin price, **Preview**, and **Select**. Preview opens the existing photo/video gallery inside the same modal; closing it returns to the pack list without selecting or buying anything. Select highlights the pack; Next proceeds to sticker artwork (superseded by the explicit two-step flow below). An empty or fully-used library still offers creation; fully-used packs get a distinct message. Creation opens `/media-packs?create=1&returnToSticker=1`, refreshes sticker pack queries after success and returns to the previous live/setup screen. Reopen Add pack sticker to select the new pack. Cancelling/failing creation preserves the existing sticker selections. Android Back on the creation page is no longer intercepted by a broadcaster screen underneath; Back on the focused broadcaster still confirms ending the live.

Automated: real picker-component mocks cover existing-photo thumbnails, preview versus selection, embedded gallery, empty library without placeholders, creation route/return flag, and the focused/unfocused Android Back handler. Mobile typecheck, full stream regressions and localization checks passed (986 strings in all ten catalogs). No backend change or API restart was required for this revision. Actual preview rendering, media playback, creation/upload/return, keyboard and continued broadcasting need Android/iPhone verification; the user plans to create a new pack to test.


### Smaller sticker and faint background

User requested a slight background difference and a sticker 20% smaller. The shared card now uses 10%-opacity white fill (90% transparent), 64-point width and the same 5:7 ratio; internal artwork, icons, text and spacing scale to 80%. The 50%-opacity border, no-X design, streamer double-tap menu and viewer purchase/View pack behavior remain. This applies consistently to setup previews, artwork selection and live cards. Automated stream/type checks are separate from pending Android/iPhone readability, appearance and touch checks.


### Explicit pack-to-gift selection flow

Latest user requirement: pack sticker selection must read as **pick a pack, then choose the coin gift**. Add pack sticker now opens step **1 / 2 — Pick a pack** with real previews and one highlighted selection. **Next** is disabled until a pack is selected. Step **2 / 2 — Choose gift artwork** retains the pack name and its actual coin price; choosing artwork highlights it and enables **Add sticker** (or **Replace sticker** while editing). Artwork taps do not submit immediately. **Back** and Android Back return to the pack step with selections intact; selecting a different pack resets artwork. Closing/cancelling leaves existing stickers unchanged. Normal add flows no longer show the confusing gift/pack toggle row. Replacement retains an explicit type choice at the beginning so either sticker type can still be chosen. Empty-library creation and full media previews remain available.

Automated coverage includes no step advance on pack selection, Next gating, required gift selection, no implicit submission, Back preserving pack/artwork, and correct final pack/gift IDs. The full stream suite, mobile typecheck and all ten language catalogs passed (992 strings); Android/iPhone appearance, scrolling, Back behavior and touch confirmation remain pending. This revision changes no backend payment or API behavior.


### Compact New action in the pack picker

Latest user styling correction: replace the large Create a pack button in the list with a compact **+ New** action in the top header, immediately before Close. It has an add icon and text without a filled/bordered button. The same action opens the existing pack-creation screen and is available with an empty or populated library. Preserve the two-step selection, previews, Next/Back and final confirmation. Automated checks are separate from pending device appearance verification.


### Direct pack-card selection

Latest user correction removes the redundant **Select** button. Tap the pack card (including its thumbnails/name) to highlight it and show a checked indicator, then use the single **Next** action to proceed. The separate Preview control opens media without changing the choice; its press stops propagation to the selectable card. Keep the compact + New action in the header and preserve Back/final confirmation.


### Picker Back and Close controls

Remove the redundant Back button from the initial pack step and single-step gift picker. X closes/cancels the picker. Back appears only on the second pack step, where it returns to pack selection and preserves choices. Existing Android Back behavior remains equivalent.


### Inline pack preview action

Latest user correction: remove Preview’s dedicated row, which made each pack card unnecessarily tall. Preview is now a small eye-icon/text action at the end of the existing media-count/price row, without a pill border. Its hit area extends beyond the compact visual, and pressing it still opens the media gallery without selecting the card. Other picker behavior remains unchanged. Android/iPhone spacing and touch appearance require device verification.


### Restore setup button row

The inline Preview edit accidentally removed the shared row style, causing the Go Live add-sticker circles to stack on the left. Restored the centered horizontal row with wrapping, preserving its position above categories and the compact inline Preview. Required stream regressions and mobile TypeScript checks pass. Android/iPhone visual verification remains pending.


### Upload Video beside sticker controls

User requested a matching circle with a video-camera icon titled **Upload Video** to the right of the two add-sticker circles, above categories. Moved the existing video-sheet action out of the bottom mode selector into that third circle. Preserve keyboard dismissal, startup disabling, private-invitation visibility and the existing upload flow; reaching the two-sticker limit does not disable video upload. Stream regressions, mobile typecheck, localization (ten languages) and diff formatting pass. Android/iPhone visual and touch checks remain pending.


### Gift saved during pack creation — supersedes two-step pack stickers

Latest user requirement: require a gift-artwork selection while creating a media pack and persist it on the pack. Tapping a pack in the sticker picker immediately adds/replaces the sticker with that saved artwork; remove pack Next/Back, step numbers and the second artwork-selection step. Keep compact + New, real thumbnails, inline Preview (which never selects), the two-sticker maximum and distinct-pack restriction. Ordinary gift stickers retain their existing gift selection. The user explicitly selected **Rose by default for existing packs**. The later gift-based pricing correction below supersedes the separate coin-price field: the selected gift now sets the price, with no additional gift charge.

`media_packs.gift_id` stores the catalog identifier. Migration `lib/db/migrations/20260921_media_pack_gift.sql` adds a non-null Rose default for existing rows and has been applied to development. New create requests must provide a valid catalog gift; list/get/create responses include it. Sticker validation derives artwork from the owned pack, overriding stale client artwork. Pack ownership and historical payments are preserved. The later pack-edit flow below refreshes active pack sticker artwork from the saved pack. Apply this migration before deploying the API to production; no production deployment was performed.

Automated verification: mobile/API typechecks, generated contract checks, required stream suite, focused pack-creation tests, all ten localization catalogs, real-database live-sticker purchase tests and message-settings integration pass. Tests cover missing/invalid gifts, no upload before selection, saved choice after reload, independent coin price, failed-draft preservation, Go Live cache refresh, direct addition without Next, Preview isolation, disabled selection, server-derived artwork, and prior purchase/ownership/earnings/access cases. Private synthetic fixtures are cleaned up. The development API was rebuilt and restarted with its environment preserved; health returned 200 and live GET/POST pack routes returned 401 without authentication. Authenticated creation/purchase tests invoke actual route handlers against the database with fixture storage URLs; they are not signed-in HTTP or real media-upload device tests.

Android/iPhone checks remain pending: create a pack with each gift, failed upload/retry, reopen and add with one tap, legacy Rose pack, inline Preview/close, live replacement, and existing stream awake/navigation/keyboard/header cases. Installed device builds are unknown.


### Edit packs and gift-based prices — latest requirement

The user clarified that a pack has one selected gift, and that gift sets its price. There is no separate coin-price field. Both creation and editing use the existing gift catalog: Rose 1, Heart 5, Party 10, Diamond 50, Rocket 100, Crown 500. Each choice shows its coin value. The API derives the price from the gift and ignores a client-supplied independent price. This supersedes all earlier descriptions of artwork-only selection or independently entered pack pricing. Picking a pack immediately sets the sticker artwork and shown price from the saved pack; purchasing charges that displayed price once.

The Media Packs list now has an Edit icon. Open a saved pack with its current photos/videos and selected gift, add or remove media, choose a different gift, then Save changes. Keep 1–20 items. Close discards unsaved edits; failed saves retain the draft. Only newly added media uploads. Save is guarded against rapid duplicate presses and dismissal while pending. The pack name stays unchanged; gift selection controls the price.

Owner-only PUT `/api/media-packs/:packId` retains the pack ID, existing media IDs, messages and purchases. It validates retained IDs belong to the same pack, rejects duplicates/missing items, locks the pack and applies removal/addition/order/gift/price changes in one transaction. A database failure rolls everything back. Removed pack items are detached without deleting underlying storage objects. Existing buyers retain access to the updated pack without another payment. Saved gift/media changes refresh setup previews and active pack sticker metadata.

Both current DM and live checkout send the displayed `expectedPrice`. The shared purchase transaction checks it against the locked pack before a new charge; a changed price returns 409 and refreshes the client, so it cannot charge a different amount from the confirmation. Existing ownership returns without another payment. The field remains optional for older clients.

Migration `lib/db/migrations/20260921_media_pack_gift_prices.sql` aligns existing asking prices with saved gifts (including Rose defaults); it was applied to the development database. Historical ledger amounts and purchases are unchanged. Deploy both gift migrations before the updated API in production; no production deployment was started.

Automated verification: library/API/mobile typechecks, localization in all ten languages, required stream suite, focused create/edit UI tests, real-database sticker/edit/purchase integration and message-settings regressions passed. Coverage includes form hydration, cancel/pending guards, no reupload of retained media, gift-derived price, failed draft preservation, duplicate saves, owner-only edits, item bounds/identity/order, forced mid-transaction rollback, existing buyer access, active sticker gift refresh, stale-price rejection with no debit, exact gift-value debit and retry deduplication. Fixtures and failure triggers were removed. The development API was rebuilt/restarted preserving its environment; health returned 200 and running create/edit/unlock routes returned 401 without authentication. Authenticated flows were tested through real route handlers and the database with fixture storage URLs, not a signed-in phone session.

Pending Android/iPhone checks: Edit icon, existing photo/video previews, adding/removing media, gift coin values, Save/Cancel and upload failure, reopen and one-tap sticker addition, live sticker/DM displayed-price checkout, and existing awake/navigation/header/keyboard cases. Installed device builds are unknown.


### Live pack gallery page sizing

User reported pictures overlapping toward the end of a pack opened from a live sticker. The shared live/Preview gallery now measures its actual viewport, uses explicit non-shrinking page width/height and exact item offsets, and contains images inside a clipped frame within safe-area padding. Viewport size changes remount paging at the current item; active-video selection is clamped to valid pages. The separate DM gallery is unchanged. The user confirmed **“now it works”** for the live-sticker gallery after this change; platform/build and both-platform regression coverage were not specified. Automated checks are recorded separately; full Android/iPhone layout/rotation/awake regressions remain pending.

Gallery follow-up: the user reported a regression after the successful confirmation. The only gallery code changed after that confirmation was restoring the DM-specific fixed-width viewer. Restored shared `MediaPackGallery` usage for DMs, matching the code state at the successful confirmation. Preserve this shared gallery for live stickers, Preview and DMs. This supersedes the separate-DM statement above. Device reconfirmation remains pending; do not infer which entry point the user was testing.

Full-screen gallery correction: remove the page’s reserved top/bottom padding. Media fills the measured gallery viewport using contain, so matching-aspect images fill the screen and different-aspect images retain natural letterboxing without cropping. The close button remains overlaid at its safe-area position. Preserve non-shrinking page widths and clipping to prevent overlap. Android/iPhone full-screen appearance needs user/device confirmation.
