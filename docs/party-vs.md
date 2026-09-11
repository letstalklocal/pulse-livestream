# Party and VS

Party links two existing public, free live sessions. Hosts invite from More > Party; the recipient accepts before their audiences share the experience. Each viewer keeps the original live route and host identity.

## Media and layout

- Each host keeps publishing to their own Agora channel.
- Hosts and viewers subscribe to the partner through joinChannelEx as an audience member, without publishing another camera/microphone track.
- No Channel Media Relay activation or new native dependency is needed.
- Party and the current VS presentation use a fixed top-right partner window. VS adds a top bar with both avatars, their coin scores and a central countdown. The earlier equal-panel presentation is retained in code but is not selected. The primary video remains mounted through layout changes.
- Partner tokens last two minutes and renew every minute. Cleanup leaves only the secondary connection and preserves microphone capture.
- Host media readiness updates every five seconds. Readiness becomes stale after twenty seconds; unfinished VS rounds cancel when a host loses readiness. An initial Party connection has forty-five seconds to establish both hosts.

## Shared room behavior

- New chat messages are copied into both capped, temporary room buffers. Earlier messages are not copied.
- Either host can remove a message by long-pressing it, or mute a viewer through the existing viewer controls. Both rooms enforce Party chat restrictions.
- The Party viewer count is the union of authenticated viewer IDs, excluding both hosts.
- Gifts explicitly select a recipient and stay attributed to that host's original live session. Gift notifications reach both rooms.
- Leaving Party preserves both live sessions and separates new chat messages again. Existing shared messages age out naturally.
- Premium conversion is rejected while a Party/invitation is active. Private and Premium rooms cannot join Party.

## VS rules

- Either host requests VS; the other accepts. Invitations expire after thirty seconds.
- A three-second countdown precedes a three-minute round.
- Gift coin value is the score. Only successful gift transactions during the round count; participant-sent gifts do not count.
- Scores and the ledger's battle_id are updated in the same database transaction. Duplicate payment requests cannot score twice.
- The server determines the winner or draw. Earnings remain with the gift recipient. Ending an unfinished Party cancels the round.
- The round returns to Party and supports rematches.
- Either host can choose More > Party / VS > End VS and confirm to stop an active round or countdown early. This cancels the round without a winner, preserves gifts and both live sessions, and returns everyone to Party. Repeated requests are harmless; requests for an older round cannot stop a rematch.

## Validation

The additive schema migration is lib/db/migrations/20260910_live_parties.sql. Apply it before running the updated API; the Party integration test applies it idempotently and cleans up its own test accounts.

    node artifacts/api-server/tests/parties.integration.mjs
    node --test artifacts/api-server/tests/coins-authorization.test.mjs artifacts/api-server/tests/premium-broadcast-switch.test.mjs artifacts/api-server/tests/stream-socket.test.mjs
    pnpm run typecheck

Native acceptance still requires two broadcasting devices and a viewer: verify two-way audio, picture-in-picture dragging, merged chat/count, targeted gifts, VS countdown/results, disconnect/reconnect, and return to solo. Browser layout tests use camera fixtures; they do not verify Agora transport.

## Presentation change — September 11, 2026

The user requested keeping the normal Party feed during battles instead of switching to the side-by-side layout. Current selection is `party-bar` in `artifacts/mobile/utils/partyLayout.ts`. Both host and viewer use the same selection; the existing `side-by-side` presentation, scoreboard and chat-height adjustment remain available by changing that selection. No user-facing mode switch was requested.

The new bar sits below the live header and above the partner window's initial position: own-channel avatar, own-channel round coins, central countdown, partner round coins, partner avatar. Scores map to participant order even when watching the second host. The connected bar uses the existing round scores. Invitation, scoring, cancellation, results, gifting, audio and live-session rules remain unchanged. Party chat keeps its normal height in the selected version.

Device review needed: two hosts plus a viewer, initial countdown and live score updates from each channel, partner dragging, no main-video resize, narrow-screen header/bar spacing, keyboard behavior, early end and rematch. This presentation change does not complete the pending Crown sound device test recorded in `docs/moments-feasibility.md`.

Visual correction: the user rejected the dark boxes behind the party battle coin totals and countdown. Those text backgrounds are removed; keep the connecting score bar and existing placement. Do not restore dark pills behind these labels.

Countdown placement correction: show the party battle clock centered above the connecting bar for now, with no dark background. Preserve the avatar and coin positions. This supersedes the original clock-on-bar placement.

Score bar refinement: use thicker colored segments (22 px) with each numeric coin total inside its corresponding segment, without coin icons. Keep each segment wide enough to display its total even at zero; keep the countdown centered above the bar and avatars at the ends. No dark text backgrounds.

Thickness correction: the user found the 22 px score bar too thick. Reduce it to 16 px, keeping it vertically centered, with numeric totals inside and the clock above.

Alignment refinement: both colored sides and numeric totals must share one horizontal baseline. Give both segments the same explicit 16 px height and totals the same 16 px line box without Android font padding. Device visual confirmation remains needed.

Further alignment correction: user reported the red side looked higher. Both color fills now stretch to the same shared track bounds independently of the text, with straight shared top/bottom edges (no rounded track corners). Check the actual device appearance before claiming visual confirmation.

Red-edge follow-up: user saw a thin black line below red. Red now fills the shared track background directly, removing the separate red fill layer and any transparent gap beneath it. Teal still fills its segment. Device confirmation pending.

Confirmed edge issue: user explicitly means mismatched heights/edges, not equal score widths. Replace independently rendered color layers with one SVG rectangle using a hard red/aqua color stop. Both colors now share one rasterized outline at 16 px height; score weighting, counts and clock placement remain. Uses the existing react-native-svg dependency. Device appearance still needs confirmation.

Coin-count text color: use white for the numeric totals inside both battle bar segments, as requested by the user.

Optical edge refinement: the supplied screenshot measured matching red/aqua bounds, but the user still perceives red as higher. Add a thin shared white outline in the same SVG to give the whole strip a continuous visible edge; no dark backgrounds. This is a visual adjustment, not a claim that the device appearance is resolved.

User selected red/aqua shades with similar brightness instead of an outline. Remove the just-added outline; use #FF729A red/pink and #35B5AD aqua in the shared SVG. Preserve bar geometry, white counts and clock placement. This supersedes the outline refinement.

Single-color decision: the user requested making the entire bar one color. Use solid aqua (#35B5AD), with both white numeric totals inside and the clock above. Remove the red/aqua gradient; retain the earlier side-by-side presentation in code. This supersedes the two-color refinements.

Gold line and avatar rings: user requested a solid gold connecting line, touching matching gold rings around both avatars, with a small coin icon and count above each side. Implement a 2 px line/rings using the same #E8BD59 color, 32 px avatar images inside 36 px rings, and white score labels above the line with the countdown centered between them. This supersedes aqua, counts-inside-bar and no-coin-icon decisions. Keep the normal party layout and retained side-by-side code.

Party partner window: user requested a 9:16 portrait shape for the small party window. Preserve its responsive width and dragging; set height to width × 16/9. Drag bounds use the updated height. The retained side-by-side panels and gold battle header are unchanged.

Partner-window tap: user requested touching the small party window to switch to that stream's main view. Viewer PartyStage now calls the existing guarded stream navigation with the partner channel ID; dragging retains the parent PanResponder and its movement threshold. Taps are disabled while partner media is unavailable and for the retained side-by-side layout. The previous main stream becomes the partner once the target party state loads. Asked whether hosts should also swap their preview; no answer received yet, so current implementation applies to viewers only. Host broadcast/navigation remains unchanged pending that scope decision.

Validation: mobile TypeScript and four existing host party/reconnect regression cases pass. These do not exercise touch gestures or native video presentation. Device checks still needed: tap switches to partner and back, drag does not navigate, reconnect button retries, and battle state/targeted gifts follow the selected viewer stream.

## Current partner window interaction — September 11, 2026

Latest explicit user correction supersedes dragging and tap-to-stream navigation (including the pending host scope question): pin the partner window top right, start at one-third of screen width, tap to toggle to one-quarter width and back, keep 9:16 portrait, swipe right to hide off-screen, and show a shaded left-arrow tab to restore it. Apply the same behavior to hosts and viewers. Restore the chosen size when opening the hidden window; reset to visible one-third width for a new party/partner. Keep the video mounted and audio connected while hidden. Movement is captured separately from taps so a swipe cannot also resize or trigger the viewer's stream-navigation gesture. Existing side-by-side code remains available.

Scope confirmation: user answered “Viewers and hosts” to the earlier scope question while this correction was being implemented. Apply the newest fixed-window controls to both; do not restore the superseded tap-to-stream navigation.

Validation for fixed-window controls: mobile TypeScript, the component interaction harness (`party-window.test.mjs`), and four existing host reconnect tests pass. The harness exercises size toggling, small-motion versus swipe capture, left/vertical swipes, right-swipe hide, restore at the selected size, video remaining mounted, new-party reset and active battle layout. Native gestures and drawing are mocked; verify on phones that the viewer's outer swipe navigation does not intercept the window gesture, the arrow stays tappable, host broadcasting/audio continues, and reconnect remains usable.

## Partner window details and audio — September 11, 2026

User requested doubling the shaded restore tab height while keeping its arrow size and centering. Tab is now 88 px high; the arrow remains 22 px. Remove the partner name and its shaded strip from the small window (the retained side-by-side presentation keeps its original labels).

Long-press opens a bottom sheet showing the partner avatar, name and account ID, with mute/unmute audio. This affects only the current user's subscription to that partner's secondary Agora channel; it does not mute the host's microphone or other participants. A long press must not also resize the window. Surface native mute failures in the sheet, preserve the selected preference on failure, reapply mute after reconnect, and reset it for a new party/partner. Hidden windows keep their video mounted and audio subscription intact except for the explicit mute selection.

Spacing: first added 24 px below the old window position; user then requested moving it back up 10 px. The final fixed top is `partyLayout.top + 14` in both party and active battle, so battle start never shifts the window. The restore tab follows that position.

Validation: mobile TypeScript passed; expanded party-window tests exercise the sheet, no-resize long press, mute/unmute requests, tab height/arrow size, permanent battle spacing, partner-scoped mute, failure handling, reconnect preference, and reset. The actual secondary connection is exercised against a mocked native engine to verify muted audio subscription and no microphone publication or shutdown. Four host reconnect regressions pass. Native touch behavior, sheet appearance, and audible mute/unmute still require phone confirmation. No API or backend changes were needed.

## Viewer double-tap switching — September 11, 2026

User added a viewer-specific way to switch streams: double-tap the small party window to open the partner's stream as the main viewer route. Use the existing guarded stream navigation; do not route hosts away from their broadcast. Single taps still toggle the small window between one-third and one-quarter screen width. On viewers, defer that resize for 300 ms to distinguish a double tap; a double tap must not also resize. Long press still opens partner information/audio controls, and right swipe still hides the window. Cancel pending taps on movement, touch cancellation, long press, party/partner changes, and unmount. Provide an accessibility action for switching streams. Host single-tap controls remain immediate.

Validation: mobile TypeScript and expanded mocked party-window/audio tests pass, including double-tap navigation without delayed resize, single-tap resize, cancellation by long press/swipe/touch cancellation/new party, and the accessibility action. Verify actual tap timing and stream navigation on a viewer phone; tests do not establish native touch behavior.

## Paused checkpoint — September 11, 2026 (latest)

User requested stopping and saving after viewer double-tap switching. Resume from this checkpoint; later decisions here supersede earlier exploratory layouts.

Current approved implementation:
- Preserve normal party mode during battles. The old side-by-side battle presentation remains in code; `BATTLE_PRESENTATION` currently selects `party-bar`.
- Battle header: solid gold line connecting matching gold avatar rings, small coin icons and white counts above each side, countdown centered above. Do not restore the rejected red/aqua bar experiments.
- Partner window: fixed top right, 9:16 portrait, initially one-third screen width. Single tap toggles between one-third and one-quarter width. No free dragging.
- Fixed vertical offset is `partyLayout.top + 14` (24 px was too low; user requested moving it up 10 px). Battle start does not move the window.
- Swipe right hides the window off-screen while keeping media connected. Restore with the shaded 32×88 px tab; its 22 px arrow stays centered. Restore the selected size; a new party resets the window to visible one-third width.
- No name/shaded strip on the small window. Long press opens partner avatar, name, account ID and local mute/unmute controls. Partner audio mute is scoped to the secondary channel, survives reconnect, reports failures, and resets for a new party. The host microphone is not muted by this control.
- Latest addition: viewers double-tap the small window to switch to the partner stream through existing guarded navigation. Viewer single-tap resize waits 300 ms; double tap does not also resize. Long press/swipe/cancellation/new party cancel a pending tap. Host controls remain single-tap resize and do not navigate away from broadcasting.

Checks completed: mobile TypeScript; `node artifacts/api-server/tests/party-window.test.mjs` (mocked component gestures, double/single taps, long press, hide/restore, fixed layout, scoped audio mute/reconnect/failure); four host reconnect regression cases. No backend changes were needed for these latest controls.

Next device checks: viewer double tap switches to the partner and back; single tap only resizes; long press only opens the sheet; swipe right hides without changing the main stream; restore arrow works; mute/unmute affects only partner audio and survives reconnect; verify host broadcasting continues and battle start leaves the window fixed. Native drawing, touch recognition and audible mute remain unverified by automated checks.

Separate unfinished device check: the Crown default chime should be audible to a remote viewer and included in the raw saved Moment. See `docs/moments-feasibility.md`; do not substitute post-recording audio compositing.

Main files: `artifacts/mobile/components/PartyStage.tsx`, `artifacts/mobile/app/stream/[channelId].tsx`, `artifacts/mobile/hooks/usePartyMedia.ts`, `artifacts/mobile/utils/partyConnection.ts`, `artifacts/mobile/utils/partyLayout.ts`, and `artifacts/api-server/tests/party-window.test.mjs`.

All changes are saved in the workspace. Preserve unrelated existing changes. No commit or deployment was requested. Stop implementation until the user resumes.
