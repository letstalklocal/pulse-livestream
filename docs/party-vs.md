# Party and VS

Party links two existing public, free live sessions. Hosts invite from More > Party; the recipient accepts before their audiences share the experience. Each viewer keeps the original live route and host identity.

## Media and layout

- Each host keeps publishing to their own Agora channel.
- Hosts and viewers subscribe to the partner through joinChannelEx as an audience member, without publishing another camera/microphone track.
- No Channel Media Relay activation or new native dependency is needed.
- Party uses a draggable partner window. VS uses equal panels. The primary video remains mounted through layout changes.
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

## Validation

The additive schema migration is lib/db/migrations/20260910_live_parties.sql. Apply it before running the updated API; the Party integration test applies it idempotently and cleans up its own test accounts.

    node artifacts/api-server/tests/parties.integration.mjs
    node --test artifacts/api-server/tests/coins-authorization.test.mjs artifacts/api-server/tests/premium-broadcast-switch.test.mjs artifacts/api-server/tests/stream-socket.test.mjs
    pnpm run typecheck

Native acceptance still requires two broadcasting devices and a viewer: verify two-way audio, picture-in-picture dragging, merged chat/count, targeted gifts, VS countdown/results, disconnect/reconnect, and return to solo. Browser layout tests use camera fixtures; they do not verify Agora transport.
