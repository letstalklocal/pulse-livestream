# Performance goals

Performance replaces Statistics in Settings. Keep the screen compact and focused on progress.

## Approved rules

- Calendar month target: 10 qualifying days AND 20 total streaming hours.
- A qualifying day requires one stream lasting at least 60 minutes within that calendar day. Separate shorter streams never combine to qualify.
- All streamed time contributes to monthly hours, including shorter sessions. A day counts at most once.
- The bonus is 5% of that month's live gift earnings. Media pack sales, purchased coins, and grants are excluded.
- Future levels should extend the server-side PERFORMANCE_LEVELS configuration.

## Current implementation

- Displays total time today, longest stream today, monthly totals, daily qualification, live gift earnings, and estimated bonus.
- Uses the phone's IANA time zone for display and month/day boundaries. Midnight-crossing streams split across days; each day needs its own hour within one stream.
- Sessions/history are deduplicated; overlapping sessions count only once toward time totals. Only individual sessions qualify days.
- Active/stale sessions stop at their last heartbeat. Normally ended sessions use the end time if within the 60-second heartbeat timeout; stale closures stop at the heartbeat.
- Uses recorded sessions and legacy stream history; cannot reconstruct time missing from both.
- Bonus estimate rounds down to whole coins. It is not an automatic payout or balance credit. A fixed accounting time zone and monthly settlement policy remain to be established before automated crediting.

## Verification

Run `node artifacts/api-server/tests/performance.integration.mjs`, mobile/API type checks, and API build. Check on Android: small and large text scaling, a day with two half-hour sessions, a one-hour session, monthly goals, and empty/loading/error states. Type checks do not replace device checks.
