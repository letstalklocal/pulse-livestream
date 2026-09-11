# Party and VS

Party links two existing public, free live sessions. Hosts invite from More > Party; the recipient accepts before their audiences share the experience. Each viewer keeps the original live route and host identity.

## Media and layout

- Each host keeps publishing to their own Agora channel.
- Hosts and viewers subscribe to the partner through joinChannelEx as an audience member, without publishing another camera/microphone track.
- No Channel Media Relay activation or new native dependency is needed.
- Party and the current VS presentation use a draggable partner window. VS adds a top bar with both avatars, their coin scores and a central countdown. The earlier equal-panel presentation is retained in code but is not selected. The primary video remains mounted through layout changes.
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
