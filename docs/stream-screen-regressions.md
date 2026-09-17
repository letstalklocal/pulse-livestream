# Required viewer and broadcaster regression checks

Recorded September 16, 2026. The user explicitly requires these app-specific behaviors to be checked whenever viewer or broadcaster functionality changes. They are acceptance requirements, not optional polish. Read this document before edits to either stream screen or shared stream controls. Preserve previously approved behavior; do not roll back unrelated fixes.

## Always check

- **Screen awake:** active broadcasting and focused/admitted viewing must prevent automatic display sleep on Android and iPhone, including demos, regular/Premium/party streams, loading/reconnecting, hide/show overlays and in-stream sheets. A foreground return must restore protection. Ending/leaving a live must release that screen's lock without releasing another active screen's lock. Viewing a blocked/admission/ended page must not retain the viewer lock. Backgrounding and manual locking remain OS-controlled.
- **Navigation:** preserve regular viewer page presentation with native back gestures disabled, 320 ms simultaneous vertical slide and bidirectional looping. First/last swipes never exit. Explicit chevron/Exit Live does exit. Right swipe hides controls; left restores them. No Discover flashes or masking background additions. See [stream navigation](stream-navigation.md).
- **Keyboard and layout:** broadcaster top and bottom docks remain independently anchored; closing the keyboard restores the bottom controls to the bottom. Preserve full-width live composer, visible Send, draft/focus, message translation and long-press actions. Do not treat Android as iPhone or assume a platform. See [chat/message requirements](chat-message-preferences.md).
- **Header:** viewer exit chevron, 28-point avatar and tightened username spacing; compact 9-point PREMIUM tag below the coins/viewer pill with a 1-point gap. The tag must not push the header down. Both host and audience use the combined pill design. Preserve private/party counter sources and moderation permissions.
- **Live Viewers sheet:** host sees merged roster/top gifters and Restricted controls; audience sees ranking data only, never the host roster or restriction state. Search starts hidden and toggles from its header icon. Streamer close X is top-right; selected avatar opens profile; no separate View profile or Back to viewers action. The list closes after 10 seconds of inactivity; touches, typing and scrolling reset the timer. Pause auto-close while the selected-viewer moderation panel or a moderation mutation is active. Closing/unmounting cancels the timer.
- **Premium/media:** preserve admission/payment restrictions, public-to-Premium channel reconnect, free/paid admission, gift ownership/totals and singleton-engine cleanup. A display-only change must not alter these. See [coins/Premium requirements](coins-premium-revenuecat.md).

## Required verification workflow

1. Identify affected platforms, host versus viewer, live mode and exact installed build. Check the existing working-tree changes; do not mistake unbuilt code for what is on a phone.
2. Run the fast stream regression suite after stream functionality changes:
   `node artifacts/mobile/tests/stream-screen-regressions.cjs`
3. Run mobile typechecking for changed TypeScript. Run localization checks if visible text changes. Add focused tests only for new behavior/races/access rules that existing checks do not cover; trivial spacing changes do not require mirrored implementation tests.
4. Check the relevant device cases on **both Android and iPhone**. For sleep prevention, set a short display timeout, broadcast/watch untouched for at least twice that timeout, repeat after background/foreground, profile return and native sheets, then end/exit and verify normal sleep resumes. Also check the host keyboard dismissal case and viewer exit/swipe case after shared-screen changes.
5. Record separately: automated results, actual device results, user confirmations, suspected causes and unverified cases. A typecheck/mock test is not native/visual proof. If no device is available, explicitly leave those checks pending rather than calling the regression fixed on-device.
6. Native changes require rebuilt binaries. The user is starting builds; do not start a build or production deployment without a new instruction. TestFlight uses Replit production (`chimbalivestream.replit.app`); the workspace-linked EAS configuration was stale at last inspection and must not silently switch the build back to development.

## Current screen-awake repair

The original Expo hook activated once and swallowed activation errors. In expo-keep-awake 57.0.1, both native implementations also skipped reapplying the native setting when a tag already existed. This is a confirmed recovery gap; the exact native event behind the reported Android broadcaster sleep was not captured. The user initially said iPhone, corrected the affected device to Android, and explicitly requested protection on both platforms.

`useStreamKeepAwake` now creates an independent lease per mounted stream, retries/reasserts every 10 seconds while foregrounded and immediately on foreground return, logs activation failure, and serializes release after any in-flight activation. Existing host/viewer mount/access conditions remain intact. The checked-in pnpm patch makes activation reapply Android's window flag and iOS's idle timer even for an existing tag, preserving the existing multi-tag release behavior. `pnpm-workspace.yaml`, `pnpm-lock.yaml` and `patches/expo-keep-awake@57.0.1.patch` must ship together. Do not remove the patch on an SDK upgrade without replacing its behavior and repeating the device checks.

Mocked tests validate retry/renewal, background suppression, independent cleanup and late activation, plus sheet deadlines/reset/pause/unmount. They do not compile native code or prove an OS/window transition on a phone. Rebuilt Android and iPhone timeout checks remain pending.

Validation completed for this change: the combined seven-script stream regression suite, mobile TypeScript, diff formatting, and an offline frozen-lockfile install passed. The install verified that the checked-in native patch applies without upgrading dependencies. No native Android/iOS build or phone Auto-Lock test was performed.

## Shared live emoji reactions — September 17, 2026

User requirement: viewers choose an emoji and repeatedly tap; faster tapping produces more floating emojis. Everyone watching, including the broadcaster, sees the reactions. The user explicitly chose the **bottom-right corner** as the origin.

- Latest user decision: selection lives in **three-dot menu → Choose reaction**, using the phone’s emoji keyboard for one emoji at a time, including skin tones, flags, keycaps and combined/family emojis. The six-preset floating chooser and its chevron are removed. The viewer tap button remains at its confirmed bottom-right position, defaults to ❤️, and repeats the selected emoji. Choosing an emoji does not itself send a reaction; Cancel leaves the prior choice unchanged. The picker stays inside the existing menu modal and avoids opening a second modal.
- The sender sees immediate feedback; other viewers and the broadcaster receive ephemeral websocket batches. Party channels mirror reactions to both audiences/hosts. Reactions are free and separate from gifts, coins, earnings and chat history.
- Emojis rise and fade from the bottom right. Reduced Motion uses a stationary fade. At most 36 particles render per screen; network batches contain at most eight taps, flushed every 220 ms while tapping. The server validates emoji/count and limits sending per socket.
- Sending/receiving requires valid stream access, including private membership, Premium admission/free entry, moderation and active-session checks. Demo reactions are supported on the four existing demo channels. Queued taps are discarded on disconnect/unmount; old reactions are not replayed after reconnect.
- Viewer reactions follow the existing overlay hide/show animation. The control hides while typing and retains the selected emoji. Stream changes reset it. Header, chat input, navigation, gifts and keep-awake behavior are preserved.

Automated verification: mobile/API typechecks, API build, stream regression suite (including reaction access/delivery and UI batching/cleanup tests), and diff formatting passed. The rebuilt development API was restarted with its existing environment; its health endpoint and `/api/ws` were verified using multiple demo clients for shared delivery, no sender echo, channel isolation, malformed-batch rejection and unauthenticated private denial. Authenticated Premium/party scenarios were tested with mocked access data, not real phone sessions. The full localization suite stops at an unrelated pre-existing DM media-chooser key change; the catalog and host/viewer subset passes for all ten languages (841 strings).

Device verification remains pending on **both Android and iPhone**; installed build numbers are unknown. No native build or production deployment was started. Check two viewers plus broadcaster, slow/rapid taps and emoji changes, bottom-right positioning on small screens/safe areas, Reduced Motion, keyboard opening/dismissal, overlay hide/restore, navigation/loop/exit and party gestures. Check reconnect/background/foreground, stream end/access removal, paid/free Premium entry, private streams, party mirroring, gift coexistence, header/list behavior and the screen-awake timeout cases above. Automated tests do not prove native animations, touch arbitration or device sleep behavior.

Reaction chooser follow-up: the user reported that the initial shared floating reactions “work beautiful”; platform/build and individual regression cases were not specified. This confirms the initial experience only. The menu/keyboard revision passed mobile/API typechecks, the required stream suite, a client/server emoji corpus and focused localization checks. The development API was rebuilt/restarted preserving its environment, and running websocket clients verified delivery of a combined skin-tone emoji (👩🏽‍💻) outside the former preset list. Android/iPhone checks for the new chooser remain pending: open the emoji keyboard, select/replace a single emoji, reject ordinary text/multiple emojis, confirm/cancel/backdrop/Android Back, restore the original chat draft and bottom controls after keyboard dismissal, and verify the selected emoji on both viewers and host. No native build or deployment was started.

### Reaction chooser usability and single-selection correction — September 17, 2026

Latest user correction supersedes the input-first chooser: the menu label is **Change emoji**. Open directly to a visible grid headed **Tap an emoji**; tapping selects that emoji and closes the chooser. The current choice is highlighted. **More emojis from keyboard** opens the keyboard input with explicit emoji/globe-key instructions and a **Select** button, retaining support for any single emoji.

The field must always hold one valid emoji. Choosing another replaces the previous one; it must never accumulate multiple emojis and then disable Select. Native keyboard appends are normalized to the latest whole emoji sequence, preserving skin tones, flags and ZWJ families. Plain text or clearing the field leaves the last valid choice selected. Cancel leaves the actual reaction unchanged. Preserve the bottom-right tap button, shared floating reactions, chat draft and all existing stream behavior.

Verification: mobile typecheck and required stream regression suite pass, including direct grid choice, full-sequence replacement, enabled Select and cancellation. All ten catalogs and the focused stream localization checks pass. The unrelated pre-existing DM localization baseline issue remains outside this change. Android/iPhone visual, emoji-keyboard and gesture checks remain pending; no backend change, native build or production deployment was needed for this revision.

### Eight account favorites and lower viewer button — September 17, 2026

User approved eight favorites saved to their account, with ❤️ selected when first opening a stream. Defaults: ❤️ 🔥 👏 😂 😍 🎉 👍 🙌. **Change emoji** in the three-dot menu shows those eight for quick selection. **Pick favorites** (before first save) and **Change favorites** (after saving) open the same editor: tap one of eight slots to replace it using the existing grid/keyboard chooser, then **Done** to save. Choosing an already-favorited emoji swaps the slots, preserving eight distinct emojis. Cancel discards edits; failed saves keep the draft available for retry and preserve the saved list. Preferences are keyed by authenticated account, never a client-supplied user ID; account changes reset the active reaction to ❤️. Pending saves cannot close the menu, and late completion after unmount does not change the new screen.

The user then requested the viewer emoji button closer to the three dots. Its old unused 40-point chooser space is removed, and the viewer wrapper is 8 points lower, moving the tap button/float origin down 48 points overall. Keep its 48-point touch target and bottom-safe-area offset, with a small gap above the bottom controls. Host reaction origin remains unchanged.

Persistence: `reaction_preferences` stores exactly eight ordered emojis per account. Migration: `lib/db/migrations/20260917_reaction_preferences.sql`. Authenticated `GET`/`PUT /api/reaction-preferences` return defaults/customization state and validate eight distinct single-emoji sequences. The migration was applied to the development API database. Production requires this migration before deploying the endpoint; no production deployment was performed.

Verification: real database tests with temporary accounts cover defaults, ordered persistence/reload/update, account isolation, invalid bodies and failed-write preservation. Mobile/API typechecks, API build, focused localization (853 keys in ten languages), UI favorites tests and required stream regressions pass. The development API was restarted preserving its environment; its running GET/PUT endpoints reject unauthenticated access with 401, and websocket reaction delivery still passes. Authenticated persistence testing invokes the route handlers against the real database; it does not represent a signed-in phone/network test. The full localization suite's pre-existing DM baseline issue remains separate.

Pending Android/iPhone device checks: lower button appearance/hit targets beside the three dots, choosing/replacing/swapping all eight favorites, keyboard replacement, Done/cancel/save failure, restart and second-device/account-switch sync, bottom controls/draft after dismissal, stream navigation/overlay gestures, host/audience reaction visibility and the required awake/header/list/Premium regressions. No native build was started.

### Smaller viewer reaction button — September 17, 2026

User requested a smaller emoji button. Reduce the visible circle from 48 to 36 points and its emoji from 27 to 22 points, centered inside the existing 48-point touch target. Preserve its lowered position near the three dots, floating emoji size/origin, favorites and tapping behavior. Mobile typecheck and stream regression checks are required; Android/iPhone appearance and touch verification remain pending.

### Reaction button aligned above the three dots — September 17, 2026

User requested moving the smaller viewer emoji button right so it is centered above the three-dot menu control. Set the 48-point reaction wrapper's right inset to 8 points: its center is 32 points from the right edge, matching the bottom bar's 14-point inset plus half the 36-point menu control. This moves it 8 points right while preserving its size and lowered vertical position. Mobile typecheck and required stream regressions must pass; actual Android/iPhone alignment remains pending device verification.

### Emoji grid replacement — September 17, 2026

User identified row 3, column 4 of the default six-column emoji grid as the half-visible emoji and requested the purple devil. Replace 🥹 with 😈 in that quick-selection slot. Preserve other entries, saved account favorites and button alignment. Automated type/stream checks are separate from pending Android/iPhone glyph appearance verification.

User clarified that only half the emoji is visible. Give grid emoji text an explicit 40-point line box at its existing 28-point font size, centered inside the 48-point-minimum cell, with Android font padding disabled. This addresses a possible glyph-metrics clipping contributor; no device reproduction establishes the cause. Keep 😈 in the requested slot. Full-glyph rendering on Android/iPhone remains pending device confirmation.

### More emojis blank-field correction — September 17, 2026

User requested **More emojis → Change emoji** with an empty field and the emoji keyboard immediately open. The field now starts blank, removes the misleading placeholder emoji, and focuses automatically. Select waits for the first valid emoji, then each new emoji replaces that one. Cancel preserves the prior favorite. This supersedes prefilling the editor with the previous emoji.

The installed React Native TextInput exposes no emoji-specific keyboard type/input mode; automatic switching to the system emoji panel across both Android/iPhone is not implemented. User preference between an in-app emoji-only picker and the system-keyboard emoji key is pending. Do not describe automatic system emoji switching as complete. Device keyboard/visual verification remains pending.

### In-app emoji-only picker — September 17, 2026

User explicitly selected an **in-app emoji-only picker**. This supersedes the system-keyboard path and resolves the previously pending choice. **More emojis** now opens **Change emoji** directly inside the same modal, with a blank selection preview, emoji category tabs and a scrollable emoji grid. There is no text input or letter keyboard; dismiss any existing keyboard on entry. Tapping an emoji replaces the preview with that single sequence. **Select** confirms it; Cancel leaves the prior favorite unchanged. The existing eight-favorite editor still commits through Done, and quick-grid choices remain single-tap selections. Preserve the purple devil quick-grid slot and the smaller/lowered/right-aligned live reaction button.

Bundle the Unicode Emoji 16.0 fully-qualified catalog offline: 3,781 sequences in nine categories, including modifiers, combined emoji and flags. Provenance and Unicode license are in `artifacts/mobile/data/emoji/`. The larger grid uses FlatList row virtualization to avoid mounting the whole catalog at once. Native emoji appearance still depends on the phone's installed fonts.

Automated verification: mobile typecheck and required stream regressions pass. Chooser checks cover no text input, blank initial preview, category changes, single replacement, Select/Cancel, row offsets, unique catalog entries and acceptance of every catalog sequence by client/server validators. Focused localization passes across all ten languages; the unrelated pre-existing full-suite DM baseline issue remains separate. No backend or native changes were needed. Android/iPhone visual/device checks remain pending: category scrolling, older-phone font coverage, full glyph appearance, one-tap emoji selection, safe-area/compact-screen layout, favorites Done/cancel, and existing stream keyboard/dock/navigation/awake cases.

### Emoji picker search — September 17, 2026

User requested search in the emoji picker. The in-app picker now has a search field above the category tabs. Search filters the complete bundled Unicode catalog and preserves the blank preview/single selection flow. Common English terms (heart/love/devil/dog/cat/laugh/fire/party/star/rocket/flag/clap) map to useful emoji results; direct emoji text also matches. Clear search restores the selected category. No results uses the existing localized label. Category browsing and FlatList virtualization remain intact.

Automated mobile typecheck, picker tests and required stream regressions pass; diff formatting passes. Device checks remain pending for search typing, keyboard/dock anchoring, category/search transitions, compact screens, selection/Cancel/Done and existing stream gestures/awake/header/list/Premium behavior.

### Broadcaster stop icon — September 17, 2026

User requested a clear square stop symbol instead of the concentric-circle/bullseye appearance. Use a solid white `stop` icon centered inside the existing red button, without the icon’s extra circular ring. Preserve button placement, touch target and end-live confirmation. Android/iPhone visual verification remains pending; installed build numbers are unknown.

### Emoji picker search rollback — September 17, 2026

User requested removing search because it took too much space. The picker is restored to the compact category tabs and emoji grid; the full Unicode catalog and blank preview/single-selection behavior remain. The search field, filter state and search-only labels are removed. Automated type/stream checks remain required; device visual verification is pending.

### Favorite selection return state and pencil removal — September 17, 2026

Latest correction: after selecting an emoji in the replacement picker, returning to the favorites screen keeps that emoji in the edited slot and preserves the active selection when returning to the live. Remove the pencil badges from favorite cells; the existing “Tap a favorite to replace it.” instruction is sufficient. Cancel keeps the prior saved set and active emoji. Automated picker/stream checks remain required; device return-state visuals are pending.

### Favorites capitalization and Done return — September 17, 2026

User correction: display **Pick Favorites** / **Change Favorites** with a capital F. When editing a favorite, selecting an emoji returns to the eight-slot editor and keeps the new emoji in its slot; the editor shows **Done** (alongside Cancel), and the user must tap Done to save/return to the live. Do not close the favorites editor immediately after the nested emoji selection. Automated favorites and stream regression tests remain required; device return-state verification is pending.

### Done-only favorites return — September 17, 2026

Latest user correction: remove Cancel from the favorites flow. The favorites screen always has a single **Done** action; before editing it closes the picker, and during editing it saves the eight favorites then closes it. Replacing a slot returns to the favorites screen first, where Done is required to finish. The nested emoji picker also hides Cancel in this flow; quick-grid selection returns to the favorites editor, while the full catalog uses Select. Preserve the active newly selected emoji on return.

### Done outline styling — September 17, 2026

User requested that Done not use the filled pink action style. Done now uses a transparent background with a white outline, while Pick/Change Favorites retains its pink filled styling. Preserve Done-only return behavior and the active newly selected emoji.

### Thinner Done outline — September 17, 2026

User requested a lighter Done border. Reduce the white outline to 0.5 points while retaining the transparent fill and Done-only return behavior.

### Three-step reaction confirmation — September 17, 2026

The complete flow is now explicit: (1) tapping one of the current favorites changes the active preview but does not close the three-dot sheet; Done closes it to the live; (2) Change Favorites → tap a slot → choose an emoji → return to the favorites editor with the replacement visible → Done saves and closes to the live; (3) More emojis follows the same nested return then Done flow. The final Done closes the entire sheet, never leaving the user on the three-dot menu. The newly selected emoji becomes active immediately after that final Done.

### Direct Change Favorite workflow — September 17, 2026

Latest user workflow supersedes the two-step editor: opening the reaction sheet shows the eight favorites. Tap a favorite to target it, then tap singular **Change Favorite**. This opens the full in-app emoji picker directly. Choose an emoji with Select; it returns to the original favorites sheet with the new emoji selected. Tap the outlined Done to save the account favorites and close the entire three-dot sheet back to the live. No intermediate Change Favorites screen or extra return step remains.


### In-app viewer picture in picture — September 17, 2026

Back/chevron now keeps an admitted live (including Premium) in a bottom-right floating player while navigating back normally. The existing viewer message action also opens the conversation with PiP. Tap to enlarge; gear opens General, center expand restores the same viewer, and right X closes playback. Settings → General includes the saved device preference. See [the full requirements and checks](stream-navigation.md#in-app-picture-in-picture--september-17-2026).

This explicitly supersedes chevron-as-stop while PiP is enabled; **Exit Live** remains a full stop. Preserve all other required navigation/header/list/keyboard checks. PiP must keep admitted viewing awake while foregrounded and release its independent lease on close/end/access loss. Feed previews must not seize the singleton engine while PiP is active. Automated lifecycle and UI coverage is included in the required suite; it is not device proof. Android/iPhone real-stream, Premium, party, keyboard, touch, navigation and timeout verification remains pending. No build or deployment was started.
