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

- Either host in an active, media-ready Party starts VS directly. No battle invitation or second-host acceptance is required. The initial Party invitation still requires acceptance and expires after thirty seconds.
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

## Rounded partner window — September 15, 2026

The small floating party window uses a 5-point corner radius on host and viewer, at both window sizes (latest user correction after the Android renderer fix). Add a thin 1-point black border at 75% transparency (25% opacity) around the floating window, drawn above the video with touches passing through so window controls remain usable. The user reported square video corners on Android despite the rounded outer container. Use Agora TextureView for the Android floating partner video so it participates in parent clipping; retain SurfaceView on iOS and in the retained side-by-side layout. Keep the secondary connection, resizing, hide/restore, navigation gestures, and audio controls intact.

Validation: the party-window harness passes for Android and iOS renderer selection and existing interaction/audio regressions; mobile TypeScript also passes. Native verification remains pending: check all four corners with live video at both sizes, hide/restore, stream switching, and foreground/background transitions on Android. Mocked tests cannot verify native video clipping or playback.

## Direct battle start — September 16, 2026

Latest user instruction supersedes the former VS invitation/acceptance rule: when either participating host selects Start VS, both hosts and their audiences enter the three-second countdown automatically, followed by the existing three-minute round. Keep initial Party invitation/acceptance, both-camera readiness, public/free-only eligibility, scores/gift accounting, disconnect cancellation, End VS, rematches and presentation unchanged. “Anyone” means either host in that Party, not an audience member or unrelated host.

The existing `battle_request` API action now creates an active round with server-owned start/end timestamps under the existing Party transaction lock. Concurrent starts cannot create duplicate rounds. A legacy pending round can be started through the same action; legacy acceptance endpoints remain compatible, but the mobile battle sheet no longer offers acceptance/decline controls. The initiating sheet closes after successful start. No migration or action-enum change is required.

Validation: updated Party integration tests pass for immediate active/countdown state seen by both hosts and viewers, either host starting rematches, concurrent starts producing one round, readiness/ownership restrictions, scoring boundaries, duplicate gifts, early ending and disconnect cancellation. API/mobile TypeScript and API build pass. Development API was restarted with its prior environment and launch arguments. Running health returned 200; the Party start endpoint locally and Party read endpoint through the development hostname returned the expected unauthenticated 401. Authenticated battle behavior was exercised by the database-backed handler integration suite, not a signed-in phone or HTTP session. Device checks remain: start from either host, observe both countdowns without acceptance, verify score updates and End VS/rematch.


## Battle simulation and score marker — September 18, 2026

User requested a 20% thicker battle line and a two-phone simulation in the host three-dot menu. The gold line is now 2.4 points (from 2), centered at the same height; avatar rings retain their previous size. User confirmed adding a score marker to both actual and simulated battles after learning that the original line was static. The gold marker follows the displayed host's fraction of total score, centered when tied/empty and inset 5% at the ends. Both hosts see their own score on the left. Preserve the gold styling, clock/coin placement, partner window and real gift accounting.

With both hosts connected in an active Party and no active round, either host selects **Simulate battle** directly in the three-dot menu. It runs the existing three-second countdown and three-minute round. Every five seconds after the countdown, the server alternates 100 test score coins, beginning with the first Party participant. The last award is at 175 seconds; the first participant wins 1,800–1,700. Both rooms receive the same persisted scores and server clock through existing Party polling. **Test battle** labels distinguish the active round and result. Existing **End Battle** stops the simulation; disconnect/Party end cancels it, and rematches start fresh.

Keep simulation separate from spendable coins, earnings and gift transactions so it can be removed independently. A persisted `live_battles.simulated` flag selects deterministic elapsed-time score updates under the existing Party lock. Repeated/concurrent polls and API restarts cannot duplicate awards. Actual gifts during a simulation still use normal payments but do not contribute to its test scores or receive its battle ID. Simulation does not validate actual gift animations/payments; ordinary gift integration coverage remains separate.

Migration `lib/db/migrations/20260918_battle_simulation.sql` was applied to the development database; apply before deploying the updated API elsewhere. No production deployment or native build was started.

Automated: database-backed Party integration covers simulation host authorization/readiness, concurrent starts, alternating scores visible from both rooms and viewer reads, countdown, winner, stop/rematch and unchanged wallet/ledger; existing real-gift scoring checks pass. Mocked Android/iOS component checks cover marker ratios and mirrored scores, countdown/clock, test label and winner plus existing party window/audio gestures. Mobile/API types, API build, stream regression suite and all ten localization catalogs pass. Development API rebuilt/restarted with original environment/arguments; health returns 200 and running GET/POST Party routes reject unauthenticated requests with 401. Authenticated behavior was exercised against real database route handlers, not signed-in HTTP/phone sessions.

Device verification pending on Android and iPhone (installed builds unknown): two broadcasting phones form Party, start simulation, observe countdown and alternating movement on both sides, final winner and test label, early stop/rematch and disconnect. Check actual gift-driven marker updates separately, both window sizes/hide/restore, keyboard/dock, menu, navigation, header/list and screen-awake regressions. Automated checks do not establish native appearance or touch behavior.

Additional checks: four host reconnect tests and coin authorization/Premium channel-switch tests pass. The separate older `stream-socket.test.mjs` suite fails all four cases before exercising behavior because its React mock lacks `useCallback`; neither that test nor `useStreamSocket.ts` changed in this task. This is separate from the passing required stream-screen regression suite.

## Additional battle-line thickness — September 18, 2026

User requested another 40% increase to the current gold battle line: 2.4 → 3.36 points. Keep its center at 18 points within the existing bar (top 16.32) and recenter the unchanged 8-point score marker (relative top −2.32). Applies to host/viewer real and simulated battles. Avatar rings, labels, clock and scoring remain unchanged. Automated mobile typecheck and required stream regression checks are separate from pending Android/iPhone visual verification; no native build or backend update is needed.

## Leading-side opacity and label gap — September 18, 2026

User reports the previous thickness increase was not noticeable and requests translucent lines with only the leading side solid, plus 10 px between coin totals/time and the bar. Set the track to a clearly visible 6 points. Split its gold segments at the existing score marker: winning side 100% opacity, trailing side 25%; both 25% on ties/zero. The score split and opacity mirror correctly for the second host/viewer and apply to real and simulated rounds. Labels retain their position with an explicit 16-point row ending at y=13; the track begins at y=23, giving a 10-point gap. Its center and avatar rings move down 8 points together; partner window/header remain fixed. The test label moves below the thicker line. This supersedes the prior 3.36-point thickness and solid-whole-line decisions.

Automated verification: mobile TypeScript, required stream regressions, mocked Android/iOS Party window checks (including leading/trailing opacity, ties and mirrored sides), localization and diff formatting. Actual phone appearance, installed bundle delivery and Android/iPhone touch/awake/layout behavior remain unverified. No backend, native build or deployment change.

## Blended winning edge and directional flow — September 18, 2026

User explicitly removed the circular score dot. The white portion must be part of the winning solid line, blended into its gold and attached to its leading edge as scores change. Render a 28-point gold-to-white gradient entirely inside the winning segment at the shared score boundary; reverse it when the right side leads. A clipped white highlight travels from the winning avatar toward this edge every 1.4 seconds, using native transform animation. Preserve 6-point thickness, translucent trailing side/ties, 10-point label gap, and identical actual/simulation behavior. Ties have no white winning edge or flow.

Reduced Motion keeps the attached white edge static. Backgrounding, round completion, ties, side changes and unmount stop/reset the animation; foreground resumes it. Mocked Android/iOS checks cover direction, gradient orientation, no dot, tie/end state, reduced motion and background/foreground, alongside prior Party controls. Mobile types, localization and required stream regression checks pass; actual native animation/appearance and other Android/iPhone device regressions remain pending. No backend or native dependency change, build or deployment.

## Single winning-line sweep — September 18, 2026

User correction: the moving highlight should travel only once. Replace the repeating loop with one 1.4-second sweep per changed score state with a leader. Leave the blended white tip attached to the solid winning line afterward. Clock ticks, unchanged polls, foreground return and motion-preference toggles do not replay an already observed score. Ties, backgrounding, Reduced Motion and round completion suppress/cancel motion; a later new score may trigger its own single sweep. This supersedes the repeating-flow/foreground-resume requirement above. Mobile types, required stream regressions and mocked Android/iOS single-sweep checks are automated verification; phone appearance remains pending.

## Alternating simulation leaders — September 18, 2026

User wants to see the effect from both sides, not one leader alternating with ties. Keep 100 test coins per five-second award, but use recipients A, B, B, A, A, B, B… so scores run 100–0 → 100–100 → 100–200 → 200–200 → 300–200 → 300–300 → 300–400. Each host takes the lead in turn. At 175 seconds the final scores are 1,700–1,800, making the second Party participant the winner at round end. This supersedes the earlier strictly alternating recipients/first-host-wins simulation. Actual gift scoring, countdown/duration and wallet isolation are unchanged. Menu copy describes alternating leads.

Database-backed tests cover both rooms observing lead reversals and ties, final winner, existing access/concurrency checks and wallet isolation. Single-sweep mocked tests cover no replay on clock/poll/foreground changes. Device appearance and timing remain pending.

Validation for alternating leaders: Party database integration, mobile/API types, required stream suite, single-sweep component checks for both platforms, localization and API build pass. Development API restarted with preserved arguments/environment; health 200 and running GET/POST Party authorization 401 verified. Authenticated scenario coverage is route-handler/database testing, not a phone HTTP session.

## Soft white leading edge — September 18, 2026

User wants the white end to fade rather than form a solid cap. The final 28 points of the winning segment now blend gold → soft white → fully transparent, mirrored for the right-side leader. Stop the opaque gold base before this fade so it does not show through and create a hard edge. Keep the fade attached to the score boundary, with the existing single directional sweep, 6-point thickness, translucent losing side and 10-point label gap. Automated type/stream and mocked platform checks remain separate from pending Android/iPhone visual confirmation.

## Matching moving-line fade — September 18, 2026

User requests the moving line to use the same fade as the attached tip. Both gradients now share the exact gold → soft white → transparent colors and stop positions, mirrored when the right side leads. Preserve one sweep per changed leading score, attached endpoint, tie behavior, thickness and label spacing. Automated mobile typecheck, mocked platform Party checks and required stream regressions are separate from pending phone appearance verification.

## One-minute simulation bonus — September 18, 2026

User requests one side to pull ahead with more coins at the minute mark. At 60 seconds elapsed after the opening countdown (2:00 remaining), add a one-time 1,000-test-coin bonus to the first Party participant. Keep the 100-coin award sequence running, so both sides lead during the first minute and the bonus produces a decisive first-side lead afterward. Final simulated score becomes 2,700–1,800, first participant wins at the normal three-minute finish. The bonus is derived from server elapsed time, never accumulated on polls, and never affects wallets/earnings. This supersedes the prior second-participant simulation winner.

Verification targets: database integration checks immediately before/at/after the bonus, concurrent room reads, final winner and unchanged wallets/ledger; API type/build and running endpoint verification. Android/iPhone visual observation at 2:00 remaining remains pending.

One-minute bonus verification passed: Party database integration including 59/60/66-second score reads and final result, API typecheck/build and diff formatting. Rebuilt development API restarted preserving its environment/arguments; health 200, running Party GET/POST reject unauthenticated access with 401. Authenticated scoring was tested via database-backed handlers, not signed-in phones.

## Final-ten-second blink and centered winner — September 18, 2026

User requests the battle countdown to blink at ten seconds and the winner's avatar centered on screen with **Winner**. In real/simulated battles on host/viewer, the clock turns pink and pulses between full/30% opacity every half-second during the final 10 seconds of the round; the opening three-second countdown does not blink. Reduced Motion uses steady pink text. Backgrounding, expiry, cancellation, new rounds and unmount stop the blink and restore opacity. The winning-line effect still sweeps only once per changed leading score.

Use the server-selected winner to show a 96-point avatar with gold ring, localized Winner label and name in a screen-centered nonblocking overlay for the existing ten-second result duration. Keep Test battle visible on simulated results. Draws show the draw message without a winner avatar; cancelled rounds show no winner. The result disappears on expiry/rematch and passes touches through. This replaces the previous small result banner below the header.

Automated verification covers mobile types, required stream regressions, all ten localization catalogs, and mocked Android/iOS tests for the 11-to-10-second boundary, one blink loop, Reduced Motion, background/foreground cleanup, each winner identity, centered layout, draws, cancellation and ten-second expiry. Actual countdown animation, centered avatar appearance and existing awake/navigation/keyboard/header/list behavior still need Android/iPhone device confirmation. No backend, native build or deployment change.

## Winner text and avatar shadow — September 18, 2026

User requests white Winner text and winner name, plus a shadow on the avatar. Use white for those two labels, retain readable text shadows, and add a soft black shadow behind the gold-ringed avatar (iOS shadow properties and Android elevation). Preserve centered placement, result duration, gold ring, draw/test labels, countdown and single-sweep behavior. Mobile typecheck and required stream checks are automated verification; Android/iPhone visual appearance remains pending.

## Final countdown pink pill — September 18, 2026

User specifies white countdown text inside a pill using app pink (#FF1966), superseding pink warning text. The pill and white countdown blink together during the final ten seconds. Reduced Motion shows the same pill steadily. Keep the existing text line height and 10-point bar gap; use horizontal padding only. Applies to actual/simulated host/viewer battles and the retained split layout. Winner text/name remain white with the avatar shadow. Automated checks are separate from pending Android/iPhone appearance verification.

## Smooth score retreat — September 18, 2026

User correction: the line must retreat rather than abruptly disappear. Animate the shared score-percentage boundary over 650 ms with easing for both increases and decreases. Keep both side overlays mounted: the outgoing solid gold/white edge follows the shrinking segment while fading out, and the new leader fades in. Ties return to the center with the outgoing edge fading smoothly. All geometry uses the same animated split so the white tips remain attached. Preserve the existing score formula/5% clamp, six-point height, ten-point label gap and one highlight sweep per changed leading score. New score updates stop/retarget from the current position. New rounds/channel changes initialize to their own state; Reduced Motion, background and inactive rounds update without motion.

Automated checks: mocked Android/iOS coverage verifies a 95%→50% retreat is animated and outgoing leader opacity transitions 1→0, alongside existing countdown/winner/window cases. Mobile types, required stream suite, localization and diff formatting are separate from pending actual Android/iPhone transition rendering, rapid-score, tie/lead-change and gesture checks. No backend, native build or deployment change.

## Winner avatar pop-in — September 18, 2026

User requests a pop-in rather than an instantly appearing winner avatar. On a new winning result, fade/scale the gold-ringed, shadowed avatar from 65% to 108% over 240 ms, then settle to 100% over 140 ms. Native transform/opacity animations run once per result; clock ticks, unchanged polls and foreground returns do not replay it. Preserve white Winner/name, centered placement, the ten-second result duration, draws, countdown blink and all bar effects. Reduced Motion shows the full-size avatar without the bounce. Background, result changes/expiry and unmount stop the animation. Applies to real/simulated host/viewer results.

Automated validation: mobile types, required stream regressions, localization and mocked Android/iOS Party tests (pop start/settle, no replay, background/foreground, Reduced Motion and existing winner/draw/expiry cases). Actual pop timing, avatar/shadow rendering and touch/layout behavior remain pending Android/iPhone device checks. No backend, native build or deployment change.

## Solid scored bar and centered tie highlight — September 18, 2026

Latest user instruction: once both streamers have nonzero battle scores, keep the entire gold bar solid even when one side trails. On a nonzero tie, retain a soft white highlight centered at the 50/50 boundary. This supersedes translucent losing segments/scored ties. Before both score, preserve the existing zero/one-sided appearance. The tie highlight follows the same animated boundary and fades in/out over the existing 650 ms transition; preserve smooth retreats, single directional sweeps, countdown, winner and simulation behavior. Automated mobile types, mocked Android/iOS Party checks, localization and required stream checks are separate from pending phone appearance verification.

## Highlight pushes the score boundary — September 18, 2026

User confirmed the preceding solid/scored-tie behavior works (platform/build and individual cases unspecified), then requested the moving highlight arrive first and visibly push the white edge to the new value. Replace independent sweep/boundary timers with one sequence: 450 ms travel from the scoring side to the current visual boundary, then 650 ms synchronized boundary/highlight movement to the new score ratio, followed by a 120 ms highlight fade. The white edge holds its previous position during approach. Incoming scores determine direction from the changed ratio, so a trailing host can push back into a tie or take the lead; do not limit the effect to the currently winning host. Same-ratio score gains travel from the side with the larger increment.

The sweep now uses the same 28-point directional gold/white/transparent gradient as the attached tip. It renders in the shared track, allowing travel from either avatar. Both boundary and highlight use identical easing/duration during the push, with outgoing/incoming/tie opacity changes in that same phase. Scores themselves update immediately; only the visual boundary waits for contact. New score updates cancel the old sequence and approach the current animated boundary. Background/Reduced Motion, new rounds/channel changes and inactive rounds settle immediately; unchanged polls, clock ticks and foreground return do not replay awards. Preserve percentage/5% clamp, solid bar once both score, centered scored ties, final countdown pill and winner pop.

Automated checks: mocked Android/iOS Party tests assert travel to the old 50% boundary before a push to 95%, right-origin push back into a tie, and animation ordering/durations, plus existing replay/motion/countdown/winner/window cases. Mobile types, localization and required stream suite are separate from pending phone confirmation of the new push effect, rapid updates and existing device regressions. No backend, native build or deployment change.

## More pronounced winner pop — September 18, 2026

User requests a clearer grow-then-return effect. Increase the avatar animation to 35% → 130% over 320 ms, then settle to 100% over 240 ms; fade in during the growth. This supersedes the subtle 65% → 108% pop. Keep one animation per result, Reduced Motion, cancellation/background cleanup, normal final avatar size, white labels and shadow. Automated checks cover both growth and settling phases; native visual confirmation remains pending.

## Continuous white-edge merge and countdown synchronization — September 18, 2026

User reports the stop-and-push sequence is better but still feels like two motions. Supersede the separate approach/push phases with one 1,050 ms animation driver: the traveling highlight softly overlaps/crossfades into the existing white edge, which begins moving during that overlap and then shares the same continuous path to the target. There is no intermediate stop or easing restart. `utils/battleMotion.ts` computes a rounded join with continuous position/velocity, mirrored for either side, exact target percentages and support for unchanged ratios. Keep smooth retreats, both-scored solid bar, centered white ties, soft gradient, one motion per update, cancellation/retargeting and Reduced Motion behavior.

User also reports the final-ten-second blink is slightly out of sync with the numeral. Replace its free-running loop with one opacity down/up sequence restarted when the displayed remaining second changes: 10 blinks, then 9 blinks, through 1. Same-second polls do not retrigger it. White font/app-pink pill, Reduced Motion and foreground cleanup remain.

Automated validation covers continuous path monotonicity/exact endpoints, overlap before joining, matched edge/highlight positions after merging in both directions, one animation driver, and one new blink per changed countdown digit. Mobile types, mocked Android/iOS Party checks, required stream suite and localization are separate from pending native visual/timing confirmation. No backend, native build or deployment change.

## Larger winner-avatar peak — September 18, 2026

User says the winner avatar looks better but should grow larger before settling. Increase only the peak scale from 130% to 160%, keeping 35% starting scale, 320 ms growth, 240 ms return and 100% final size. Preserve white labels, shadow, once-per-result behavior and Reduced Motion. Automated type/stream and mocked Party checks are separate from pending native visual confirmation of this larger peak.

### Winner polish and stream chat result — September 18, 2026

Keep the winner avatar's 320 ms growth to 160%, then ease back to normal over 650 ms (supersedes 240 ms). Reduced Motion still skips the animation. A finished, non-tied real or simulated round adds an ordinary scrolling chat message from Pulse: `Winner: Username` on the first line and `2,700 coins` directly below it. Both Party rooms receive the same stable result ID; repeated polls and host removal must not duplicate/reintroduce it. Read committed battle results so rolled-back scoring cannot announce a winner. Draws and cancelled rounds do not announce a winner. Device animation/chat verification remains pending on Android and iPhone.

Verification for this follow-up: mobile/API typechecks, required stream regressions, Android/iOS mocked Party animation checks, localization and database-backed Party/chat integration passed. Chat tests cover real/simulated result text, both rooms, concurrent polling, cancellation and removal. Development API rebuilt/restarted preserving its environment; running health and live-chat GET passed. Authenticated winner-content checks used route handlers with the real database, not a signed-in phone. Android/iPhone visual/gesture/device checks remain pending; no native build or production deployment.

### Simulation hidden — September 18, 2026

User approved the two-line Pulse winner message and requested hiding Simulate battle. Remove its broadcaster menu entry; retain Start/End Battle and the simulation backend for existing test coverage. Real battles use the same shared bar, countdown, winner animation and Pulse result formatting; actual eligible gifts determine scores instead of timed test awards. Automated checks are separate from end-to-end real-gift verification on Android/iPhone, which remains pending.

### Simulation restored — September 21, 2026

User explicitly requested unhiding **Simulate Battle** (title only, no additional text) in the broadcaster's three-dot menu, superseding the September 18 hiding decision. Restore it beside Start Battle for an active Party when no battle is active, disabled until both hosts are ready or while an action is pending. It calls the existing `battle_simulate` action and closes the menu, with no trailing chevron. End Battle and all existing simulation/payment rules remain unchanged. Mobile typechecking, localization and required stream regression checks are automated verification; Android/iPhone menu and simulation checks remain pending. No backend change or native build is needed for this source change; an already-started build may not include it.
