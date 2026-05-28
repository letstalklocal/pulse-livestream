# Pulse

A live streaming mobile app (Expo/React Native) similar to Tango, powered by Agora.io. Dark theme with electric pink accents. Anonymous viewing allowed; email+password login (Clerk) required to go live.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080 → proxy `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- EAS build: `eas build --platform android --profile development` (run from `artifacts/mobile`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, proxied at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo SDK 54, React Native, react-native-agora v4.5.4, newArchEnabled: true
- Auth: Clerk (email+password)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks (do not edit)
- `lib/api-zod/src/` — auto-generated Zod schemas (do not edit); `index.ts` manually enumerates exports to avoid duplicates
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/routes/streams.ts` — in-memory stream registry, heartbeat TTL, seeded demo streams
- `artifacts/api-server/src/routes/coins.ts` — coin balance, spend (gifting), grant, per-stream earnings, and leaderboard endpoints
- `artifacts/api-server/src/lib/wsHub.ts` — WebSocket hub; broadcasts `earnings`, `gift`, `stream_ended` events to all subscribers of a channel
- `artifacts/mobile/app/(tabs)/index.tsx` — home screen, stream list, viewability tracking
- `artifacts/mobile/app/go-live.tsx` — broadcaster screen (Agora broadcaster role, heartbeat, stream lifecycle, real-time coin counter)
- `artifacts/mobile/app/stream/[channelId].tsx` — full-screen viewer screen (gift picker, real-time coin/gift updates via WebSocket)
- `artifacts/mobile/components/GiftPicker.tsx` — bottom-sheet gift picker modal (Heart 5🪙, Party 10🪙, Diamond 50🪙, Rocket 100🪙, Crown 500🪙)
- `artifacts/mobile/components/GiftFloater.tsx` — animated floating gift emoji that rises and fades after a gift is sent or received
- `artifacts/mobile/components/GiftLeaderboard.tsx` — bottom-sheet leaderboard of top gifters for the current stream (updates every 10s while open)
- `artifacts/mobile/components/StreamCard.tsx` — stream list card with avatar + live preview overlay
- `artifacts/mobile/components/LivePreviewThumbnail.tsx` — 3s profile delay → 5s Agora audience preview → stop
- `artifacts/mobile/context/AuthContext.tsx` — wraps Clerk, syncs to DB, exposes local `User` type
- `artifacts/mobile/utils/agora.native.ts` — re-exports from react-native-agora (native only)
- `artifacts/mobile/utils/agora.ts` — web stub (no-ops) so Metro doesn't break on web
- `artifacts/mobile/utils/agoraState.ts` — module-level `isBroadcasting` flag shared across components
- `artifacts/mobile/plugins/withAndroidBuildFix.js` — raw mods Expo plugin fixing META-INF conflict between okhttp3 and jspecify

## Architecture decisions

- **Agora engine is a singleton** — `createAgoraRtcEngine()` returns one shared instance per JS runtime (per device). Never call `engine.release()` from preview cards or viewer screens — only `leaveChannel()`. Releasing destroys the engine for all other components on that device. The only place `release()` is safe is a true app shutdown.
- **`isBroadcasting` flag** — `utils/agoraState.ts` tracks when the user is actively broadcasting. `LivePreviewThumbnail` checks this before touching the engine, preventing the card preview from conflicting with an active broadcast on the same device.
- **Heartbeat uses a stable ref** — `useHeartbeatStream()` returns a new mutation object reference after every settled call. The heartbeat `setInterval` depends only on `isLive`, not on the mutation object, using `heartbeatMutateRef` to avoid the interval being reset on every successful heartbeat (which would starve the TTL).
- **Stream storage is in-memory** — `streams.ts` uses a `Map`. Streams expire after 60s without a heartbeat. Server restarts wipe all live streams. Demo streams use `lastHeartbeat: Infinity` so they never expire.
- **Card preview cycle** — `LivePreviewThumbnail` plays once per visibility window (3s profile photo → 5s Agora feed → stop). The `hasPlayedRef` resets only when the card scrolls off-screen, triggering a replay on the next scroll-in. Event handlers are explicitly unregistered before each new cycle to prevent stacking.
- **`engineInitialized` module flag** — `LivePreviewThumbnail` tracks whether `engine.initialize()` has been called (module-level, per device). Prevents re-initializing the singleton on every card visibility cycle, which would reset Agora internal state.
- **Contract-first API** — OpenAPI spec (`lib/api-spec/openapi.yaml`) is the source of truth. Run codegen after any spec change before touching client code.

## Product

- Home screen: scrollable grid of live stream cards. Each card shows the streamer's avatar, then after 3s plays a silent 5s Agora preview of the actual live feed, then stops until scrolled off and back.
- Go Live: authenticated users can start a broadcast with a title and category. Camera preview shown before going live. Heartbeat keeps the stream alive on the server.
- Stream viewer: full-screen live view with real-time chat (simulated), gifts, follow/unfollow, viewer count.
- Auth: Clerk email+password. Anonymous users can browse and watch; login required to broadcast.

## Coins & Gifts

### How coins work

- Every user has a coin balance stored in `coin_balances` (PostgreSQL). Balances are created on first access with `getOrCreateBalance()`.
- Coins are granted manually via `POST /api/coins/grant` (dev/testing) or will be sold via in-app purchase in production.
- Spending is atomic: `POST /api/coins/spend` deducts from the sender, credits the recipient (streamer), and writes a single `coin_transactions` row capturing both sides, the channel, and the gift name.
- If the sender has insufficient balance, the server returns HTTP 402 — the client shows an error and does not deduct.

### Gift flow — viewer side (`stream/[channelId].tsx`)

1. Viewer taps the 🎁 button → `GiftPicker` bottom sheet opens showing five gift tiers.
2. Viewer selects a gift → `POST /api/coins/spend` is called with `{ uid, recipientUid, amount, giftName, senderName, channelId }`.
3. On success: a `GiftFloater` animation spawns locally for the sending viewer immediately.
4. The server pushes two WebSocket events to **all subscribers** of that channel:
   - `{ type: "earnings", channelId, coins }` — updated running total for the stream
   - `{ type: "gift", channelId, giftName, senderName, coins }` — individual gift event
5. The viewer's WebSocket handler receives both events: coin counter updates instantly (`realtimeCoins` state), and a `GiftFloater` animation spawns on screen for other viewers watching the same stream.
6. The coin counter on the stats row (top of viewer screen) shows `realtimeCoins` (WebSocket-driven) and falls back to a 30s HTTP poll only if WebSocket is unavailable.

### Gift flow — streamer side (`go-live.tsx`)

1. The streamer's WebSocket connects to `wss://{EXPO_PUBLIC_DOMAIN}/api/ws` and subscribes to their own channel as soon as they go live.
2. Incoming `earnings` event → `streamCoins` state updates instantly, animating the 🪙 coin pill in the top-right HUD.
3. Incoming `gift` event → a `GiftFloater` rises on the broadcaster's screen showing who sent what gift, plus the updated coin total.
4. The coin pill is tappable — opens `GiftLeaderboard` showing top gifters ranked by total coins sent this stream.

### Gift leaderboard (`GiftLeaderboard.tsx`)

- Available on both the viewer and streamer screens by tapping the 🪙 coin count.
- Fetches `GET /api/streams/:channelId/leaderboard` — aggregates `coin_transactions` by `fromUserId` for the current channel, joins with `users` for display names, returns top 10.
- Refreshes every 10 seconds while the sheet is open.
- Shows 🥇🥈🥉 medals for ranks 1–3, numbered ranks for the rest.
- Empty state shown if no gifts have been sent yet.

### DB tables

| Table | Purpose |
|---|---|
| `coin_balances` | One row per user — current spendable balance |
| `coin_transactions` | Immutable ledger — every spend/grant/gift event with `channelId`, `fromUserId`, `toUserId`, `amount`, `type`, `giftName` |

### API endpoints (all under `/api`)

| Method | Path | Description |
|---|---|---|
| GET | `/coins/balance?uid=` | Fetch a user's current balance |
| POST | `/coins/spend` | Deduct coins from viewer, credit streamer, push WS events |
| POST | `/coins/grant` | Add coins to a user (dev/admin use) |
| GET | `/streams/:channelId/earnings` | Total coins gifted during a specific stream (fallback poll) |
| GET | `/streams/:channelId/leaderboard` | Top 10 gifters ranked by coins sent, with display names |

## User preferences

- Dark theme: electric pink `#FF1966`, background `#08080F`
- EAS build profile: `development`, platform: `android`, buildType: `apk`
- EAS project: `4119aa26-5e2a-4825-81e0-9612267f331c`, owner: `eespana`
- No rebuild needed for JS-only changes — Metro hot reload picks them up

## Gotchas

- **Never call `engine.release()` from viewer/preview components** — it destroys the singleton for the whole app on that device. Only call `leaveChannel()`.
- **Heartbeat effect must not depend on the mutation object** — use `heartbeatMutateRef` pattern. React Query gives mutations a new object reference after each settled call, which resets any interval that lists the mutation in its deps.
- **`engineInitialized` flag does not reset on `release()`** — if `release()` is ever called, the flag must be manually reset to `false`, otherwise `LivePreviewThumbnail` will try to use an uninitialized engine.
- **`plugins/withAndroidBuildFix.js` must not use `require('@expo/config-plugins')`** — uses raw mods graph directly to avoid import issues at EAS build time.
- **`lib/api-zod/src/index.ts` manually enumerates exports** — do not switch to `export *`, it causes a duplicate `GetFollowStatusParams` conflict.
- **Demo streams have channelIds ending in `-demo`** — `LivePreviewThumbnail` skips Agora for these.
- Always run `pnpm --filter @workspace/api-spec run codegen` after editing `openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
