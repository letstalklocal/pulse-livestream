# Video uploads and live recording ideas

Recorded September 18, 2026. The user subsequently authorized a sample-video prototype; see the implementation plan below. Streamer publishing and live recording are not implemented.

## Agreed naming

- **LIVE**: a broadcast happening now.
- **VIDEO**: an uploaded prerecorded video.
- **REPLAY**: a recording of a past live stream.

The user approved distinguishing Video uploads from live Replays, replacing the original idea of calling both Replay. Use **Videos** for the uploaded-video section on Discovery. Whether future live Replays also appear there remains undecided.

## Idea 1: Uploaded videos in the feeds — discuss first

A streamer uploads a prerecorded video that appears in a separate Videos section/component on Discovery, clearly marked **VIDEO**. This is an uploaded recording, not a live broadcast, and does not require the video to have been streamed live previously.

The user wants to discuss this idea first. The Video label and uploaded-video concept are confirmed. A sample-video/cache prototype is now authorized; production upload and publishing remain future work.

### Launch rationale and requested direction

At launch, the app needs recruited streamers and content in the feeds even when those streamers are not broadcasting. Let streamers upload videos so visitors can discover creators and have something to watch between live broadcasts.

- Videos are portrait **9:16** and open directly in a full-screen viewer like the live-stream viewer, with controls over the video and a clear VIDEO label.
- Viewers can send normal gifts to the video owner. Production gifting must use the normal wallet debit, owner credit, ledger and idempotency rules; being offline must not prevent an eligible video owner from receiving a video gift.
- Show uploaded videos in a separate Videos section/component on Discovery, with videos looping. Do not mix these entries into the live feed. This supersedes the earlier proposal to sort live broadcasts and uploaded videos in one combined feed.
- Exact section placement and layout remain undecided. The earlier Following placement is not part of the current confirmed scope; whether Following also gets a separate Videos section remains undecided.
- The uploaded-video feature is opt-in: each streamer chooses whether to turn it on. Uploading a video alone must not automatically enable its feed presence.
- Streamers manually turn the feature on in the app. After a live broadcast ends, it does not automatically resume; the streamer must turn it back on.
- When a streamer opens the app while the feature is enabled, show an indicator letting them know it is on. The indicator location and visual design will be decided later.
- Turn off the uploaded-video feature before the streamer goes live, removing their uploaded video from feed availability before the broadcast begins. Keep the uploaded file; turning off this feature is not a deletion request.
- Keep the VIDEO label clear so viewers understand that the streamer is not broadcasting live.
- The intended architecture is ordinary recorded-video playback without using Agora for these uploads. This is a planning direction, not a verified implementation; upload handling, storage, video processing, and delivery still need to be designed.

### Additional suggestions — not yet approved

- Discovery can surface eligible creators broadly. If a separate Videos section is later added to Following, restrict it to followed creators.
- Start with a small upload allowance per creator, with the exact count and duration limit to be decided.

### Phone cache expiry — confirmed direction

The user confirmed a 24-hour lifetime for videos in the viewer's phone cache, with first-in, first-out (FIFO) removal: remove the oldest cached videos first. Measure the lifetime from when a video enters the cache; replaying or accessing it does not reset its age or move it to the back of the queue. Each cached video expires after 24 hours even if the cache is not full. This does not mean deleting the hosted upload or removing the video from Discovery.

The intended benefit is to reuse locally cached video for repeat playback and loops, reducing CDN downloads while the copy remains available. Expiry should not itself trigger a download; fetch the video again when needed. Reliable caching and expiry behavior require implementation and Android/iPhone verification.

Additional suggestions, not yet approved: cap total device cache storage and check current video availability/version before reusing a cached copy so disabled or replaced uploads are not surfaced as active videos. If a storage cap is added, use the agreed FIFO order for early eviction; the size limit remains undecided. Physical cleanup while the app is closed and handling expiry during active playback remain implementation details to resolve and test.

### Discussion points — not yet approved requirements

- Playback details: when playback starts or pauses, initial playback position, sound behavior, and whether viewers can seek. Looping is requested.
- Uploads: video length and size limits, title, cover image, processing, and publishing controls.
- Viewer interaction: which interactions make sense for a recording, including whether comments or chat are offered.
- Management: visibility, removal, retention, and moderation.

## Idea 2: Record live broadcasts — later phase

Record actual live streams for later viewing, marked **REPLAY**. The user expects this to take more time to set up and wants to defer its detailed discussion until after idea 1.

Recording controls, storage, processing, publishing, retention, and any connection to the uploaded-video feed experience remain undecided. Do not assume that Video uploads depend on live recording being available.

## Hosting, resource use, and cost discussion

The discussion was initially paused, then resumed with Bunny Stream as the leading candidate. No provider account has been connected or purchased. The user chose sample videos first for the authorized prototype; production streamer uploads are deferred.

### Options discussed, not selected

- A managed video service such as Cloudflare Stream could handle direct uploads, storage, encoding, and CDN delivery without sending video through the app API server. The app would still need upload controls, processing status, feed integration, playback lifecycle management, and the agreed streamer controls.
- The initial assessment was moderate implementation effort, not a scoped estimate. A separate Discovery component reduces integration complexity. Android and iPhone playback, looping, caching, and transitions still require verification.
- Compressed video files in object storage with CDN delivery were raised as a potentially cheaper alternative, with additional processing work. This alternative has not been costed or selected.
- No Agora live session is intended for uploaded-video playback. Actual live recording remains deferred.

### Pricing examples discussed on September 18, 2026

These are historical planning examples, not quotes or a final bill. Recheck pricing before choosing a provider.

Cloudflare Stream's published rates were $5/month per 1,000 minutes of storage capacity and $1 per 1,000 delivered minutes, with encoding and bandwidth included. Merely enabling an uploaded video does not generate delivery usage. Downloads for autoplay, buffering, and preloading count; loops served from the device cache do not add delivery, but mobile-player caching must be verified.

| Assumption | Example cost |
| --- | --- |
| 100 uploaded videos, 3 minutes each | $5/month storage capacity |
| 100 uploaded videos, 60 minutes each | $30/month storage capacity |
| 50 viewers total, each receiving 60 minutes | $3 delivery for that hour |
| 50 viewers per streamer across 100 streamers: 5,000 viewers receiving 60 minutes each | $300 delivery for that hour |

Storage is additional to delivery. The viewing examples assume all viewing minutes are downloaded, with no cache savings or additional preloading. An hour of looping a short file is not an hour-long stored file. The number of available videos alone does not multiply playback charges.

The user pointed out that Agora's normal monthly live-streaming packages include minutes. The initial assistant comparison used list rates and did not account for unused package allowances. If eligible live usage fits within the remaining Agora allowance, it can add no extra charge, whereas a separate uploaded-video service adds a bill. This does not establish that Agora is cheaper at every usage level.

Agora's published bundles use standard minutes. The checked Broadcast Streaming HD audience conversion was 2 standard minutes per actual viewer minute; host usage also counts. Examples checked: 10,000 standard minutes free; 50,000 for $45.99/month; 150,000 for $133.99/month. Thus 50 viewers watching for an hour consume 6,000 standard audience minutes, before any host usage. The app's actual billing product, package balance, and video quality were not verified.

The discussion became confusing because the examples switched between 50 total viewers and 50 viewers per streamer, and between viewer minutes and package standard minutes. The final explanation used 50 total viewers for one hour: about $3 Cloudflare delivery plus storage, versus Agora drawing from included minutes with no additional charge if sufficient allowance remains. Do not assume the user confirmed a specific traffic forecast or package.

Sources consulted during the discussion:

- [Cloudflare Stream overview](https://developers.cloudflare.com/stream/)
- [Cloudflare Stream pricing and delivery billing](https://developers.cloudflare.com/stream/pricing/)
- [Agora Broadcast Streaming packages](https://www.agora.io/en/pricing/broadcast-streaming/)
- [Agora official documentation: standard-minute conversions and packages](https://github.com/AgoraIO/docs-portal/blob/main/content/docs/en/realtime-media/video/reference/pricing.mdx)

## Prototype plan and current implementation — September 18, 2026

The user approved **sample videos first** and asked that the work be reusable for future **messages and posts**.

1. **Playback/cache prototype (implemented in source):** separate Discovery entry below the live grid, a full-screen portrait sample viewer with overlay controls and independent Expo video player, full-file local cache, fixed 24-hour TTL and FIFO eviction. Include diagnostic controls for network-versus-cache playback, downloaded bytes, cached-file order/deadlines, immediate test expiry, and clearing cached files.
2. **Phone verification (pending):** rebuild Android/iPhone with the new native dependency and verify the cases below. Measure real downloaded bytes and playback quality before choosing encoding limits or final hosting costs.
3. **Bunny upload/publishing integration (future):** authenticated direct upload, processing/readiness, ownership, versioned video metadata, streamer opt-in and enabled indicator, disable before going live, manual reactivation afterward, discovery availability and moderation. No automatic enablement merely from uploading.
4. **Shared use by posts/messages (future):** reuse the cache core, filesystem adapter and player. Add authorization-aware media resolution, account/conversation-scoped immutable ID/version keys, revocation/deletion handling, logout/account-switch purging, signed URL renewal, and appropriate private-media storage policy before enabling message media caching. A cached file must never bypass current access restrictions. Message/post UI, upload permissions and retention remain separate integrations; existing chat behavior is unchanged.

### Prototype architecture and limits

- `artifacts/mobile/utils/videoCache/core.ts` has no Discovery, React, Agora, Bunny, or filesystem dependencies. The storage adapter persists its index and files on the phone. Cache reads never renew creation time. Concurrent requests serialize and reuse a completed file. Active readers pin files until released; expired entries cannot be acquired again.
- `artifacts/mobile/components/CachedVideoPlayer.tsx` is a reusable local-file player. It loops, pauses explicitly before release, and ignores late load completion after unmount. The lab unmounts it on blur/background, expiry, Stop, or a conflicting live session. Keep-awake is active only during playback.
- Download to a temporary file, validate HTTP/content type/size, then move to the final file and commit its index. Cancel on leaving/backgrounding; remove interrupted files and restart orphans. Initial playback waits for the complete download; progressive playback is outside this first test.
- **Provisional test limit: 256 MiB total cache**, also the maximum individual download. This is an implementation safeguard for the prototype, not an approved production product limit. FIFO removes oldest unpinned entries for space. Download staging can temporarily occupy additional disk space.
- Foreground cleanup runs at startup, foreground return and once per minute; playback has its own expiry deadline. A closed/suspended app cannot guarantee physical deletion at exactly 24 hours; cleanup occurs on its next active run and expired files are not reused. The OS can evict cache files earlier.
- The initial sample (replaced by the portrait clip below) was the Big Buck Bunny trailer hosted by W3C: `https://media.w3.org/2010/05/bunny/trailer.mp4` (Blender Foundation, CC BY 3.0). A complete download was verified: 33.003 seconds, 11,053,871 bytes, H.264 video and AAC audio. This is sample content, not an actual streamer upload. The test screen accepts other direct HTTPS MP4 links, including a Bunny MP4. HLS playlists are outside the full-file prototype.
- Sample URLs are used as lab cache keys only. Production keys must use authorized scope/media ID/version rather than signed URL text. The lab is for public test clips, not private message attachments.
- `expo-video ~57.0.4` is the only added dependency; the existing Expo SDK and Agora packages are preserved. No backend endpoint or server behavior changed and no API restart is needed.
- Visible in development builds, or release builds explicitly configured with `EXPO_PUBLIC_VIDEO_PROTOTYPE=true`. Normal release builds keep the lab hidden. Older native binaries show a rebuild-required message instead of importing an unavailable player module. No native build, deployment or provider purchase was started.

### How to test in the app

1. Install Android/iPhone builds containing expo-video. Development builds expose the entry automatically; TestFlight requires the prototype environment flag during bundling. Confirm the visible **Video prototype** marker is from this revision.
2. Open **Discover**, scroll below the live grid to **Videos → Video prototype**, to open the portrait viewer. Playback starts automatically after the first download. Open the **three-dot menu** to see transferred MB, the last playback source, and the cache tools; opening this diagnostic sheet stops playback.
3. Tap **Stop**, then **Play** again. Open the three-dot menu and expect the last playback to show **Playing from phone cache** and **0.00 MB** downloaded. Disable network after the first download and repeat to confirm local playback, then restart the app and repeat while the cache remains valid.
4. Open the three-dot menu (which stops playback) and use **Expire cache now**. Confirm cached entries disappear with no automatic download. Play again online to confirm a fresh download. Also test a real 24-hour boundary; the test shortcut does not prove OS timing.
5. Add distinct MP4 URLs to populate the cache. Replaying an older video must not change its expiry or FIFO position. Exceed the provisional storage cap using suitable test files and confirm oldest-first removal. **Clear cache** is available while stopped.
6. Interrupt a download with Stop, Back, backgrounding and network loss; retry and confirm no partial file becomes a playable cache hit. Test unsupported URLs and files above the cap.
7. Verify portrait framing, overlay controls, looping, audio, safe areas, diagnostic-sheet keyboard/scrolling, and no audio after Back/background. Check expiry during active and paused playback. Confirm screen stays awake during playback and normal sleep resumes after stopping.
8. Check Discover/Following, existing live entry/swipes/exit, broadcaster controls and live PiP. The lab must not initialize Agora or interfere with a live session; it asks the tester to close the live player first.

### Verification

Automated checks passed: cache policy tests, native-filesystem-adapter mocks, player lifecycle mocks, mobile TypeScript, the required stream regression suite, full localization checks across ten catalogs (906 strings), and diff formatting. Android and iOS JavaScript/Hermes exports also passed with the prototype enabled, written only to `/tmp/discovery-video-prototype-export`; this is not native compilation or deployment. The complete sample download and its codecs were checked with ffprobe. These checks do not establish native playback or visual correctness.

Device: **Android and iPhone pending**. No attached device tooling or installed build IDs are available in this environment. Native compilation, real phone disk/cache behavior, autoplay/loop/audio, screen-awake, background cleanup, expiry and layout remain unverified until the new builds are tested. Translations pass structural checks; native-speaker/visual review is pending.

### Portrait viewer and gift follow-up — September 18, 2026

The user specified 9:16 video that opens like a live stream and supports normal gifts. The prototype now opens automatically into a full-screen card route with no native swipe-back gesture, a centered 9:16 video frame, a compact overlaid header/back button, VIDEO badge, bottom playback/gift/menu controls and a portrait Discovery tile. The initial landscape sample trailer was center-cropped into that frame; the follow-up below replaces it with a native portrait clip; no portrait upload validation or transcoding is implemented yet. Future uploads should be prepared as actual 9:16 assets.

Cache diagnostics moved to the three-dot menu. Opening this test sheet stops playback; Play closes the sheet and resumes from cache. The most recent playback source and bytes remain visible in the diagnostic sheet. Existing live-stream swipe transitions, PiP, admission, host controls and chat are unchanged. The prototype does not yet implement a multi-video swipe feed or video PiP.

The normal `GiftPicker` and `GiftFloater` are reused. An explicit opt-in `preview` prop lets samples select all six gifts while disabling purchases, hiding wallet balances and identifying the flow as **Preview gifts / Test gifts only. No coins are spent.** Sample gifting only animates locally; no wallet, API, earnings or ledger mutation occurs. Existing live/message pickers default to normal behavior. Real gifts to actual video owners remain part of the production backend integration, not simulated financial success.

Verification for this follow-up: mobile typecheck, preview-gift behavioral tests (all six selections, no checkout, existing affordability/purchases preserved), player lifecycle tests, localization and stream regression checks. Android/iPhone visual checks, portrait cropping, automatic playback, gift-sheet presentation, gift animations, keyboard dismissal, back/background behavior and awake recovery still require devices. No additional native dependency or EAS/version configuration changes were made for this follow-up.

### Updated hosting estimate discussed before prototyping

For 100 concurrent viewers continuously watching 24 hours/day for 30 days: 4,320,000 viewer minutes. Cloudflare example: $4,320 delivery + $5 storage for 100 five-minute videos = $4,325/month. Bunny Volume example at 2 Mbps average: 64,800 GB × $0.005 = $324 delivery, plus storage (illustrative 20 GB in one region = $0.20/month). At 4 Mbps, Bunny delivery doubles. These assume continuous downloading; effective phone-cache reuse can reduce transfer. Rates, actual encoded storage, audience regions/network tier and observed device transfer must be checked before budgeting. Bunny Stream is a candidate, not yet connected.

Sources: [Bunny CDN rates](https://bunny.net/pricing/cdn/) and [Bunny Stream storage](https://bunny.net/pricing/stream/).

## Implementation boundaries

The sample-video prototype is authorized. Preserve existing approved stream and chat behavior. Before implementing changes to stream screens, shared controls, navigation, or chat, read the applicable requirements in [stream-screen-regressions.md](stream-screen-regressions.md), [stream-navigation.md](stream-navigation.md), and [chat-message-preferences.md](chat-message-preferences.md), and perform their required checks.


### Discovery card, true portrait sample and live-style chat — September 18, 2026

User requirement: the entry point is a card just like the existing Discovery cards. Opening it should feel like viewing a live stream, with chat, Follow and normal gifting; the media source is the prerecorded video. Keep the VIDEO identification and separate Videos section already agreed.

Implemented in the sample prototype:
- Discovery card matches StreamCard's two-column width, 9:16 image, 14-point radius, border and bottom avatar/name layout. A bundled poster appears immediately. Opening stops live card previews before navigating to the video screen.
- Default clip is a real 720 × 1280 H.264 portrait sample, 4 seconds, 2,745,228 bytes, silent. Its GitHub URL is pinned to commit ab8818629d31995c4de5b10460609b5c8d7baa94. The sample depicts an aerial view of a vehicle on a rural path; this is test footage, not a streamer account. See [sample provenance](../artifacts/mobile/assets/video-prototype/README.md). Playback loops through the existing 24-hour phone cache.
- Transparent chat messages overlay the video using the existing live avatar component and live message typography. Type... composer, Send, Follow, gifts and More occupy the bottom dock. While the keyboard is open, the input uses the available width; Send stays visible, safe-area bottom padding is removed, and background/message taps dismiss the keyboard while preserving the draft. Sending keeps input focus, rejects blanks, prevents duplicate native send events and caps local history at 100 messages.
- Follow toggles locally for this screen session. Chat is local to the phone, without fake remote participants or delivery claims. The diagnostics sheet explicitly explains the local test scope. Gift previews remain local and never spend coins.

Production still requires actual creator/video records, persistent account follows, shared chat rooms with access/moderation rules and gifts credited to the video owner through the normal server transaction path. The prerecorded timeline does not replace those social services. This prototype does not implement all live features (e.g. reactions, profile navigation, swipe feed or PiP).

Automated verification: mobile typecheck; required stream regression suite; full ten-language localization suite (911 strings); gift-preview checks; local chat/follow behavioral tests (blank/duplicate protection, focus, draft retention, history bound and follow state across keyboard changes) passed. ffprobe verified the sample codec, dimensions, duration and size. Earlier native-player/cache tests and Android/iOS JS exports passed before this follow-up; those exports are not device verification of this revision.

Device verification pending on both Android and iPhone, installed build IDs unknown: card appearance/tap, header/back hit targets, full-screen portrait playback/loop, silent-media handling, follow state, message scrolling, repeated keyboard open/type/send/dismiss/Android Back, draft preservation, dock safe-area anchoring, gift picker/animations, background/foreground, cache expiry and awake timeout/release. No native build or production deployment was started, and EAS/version configuration remains unchanged.


### Full-screen video correction — September 18, 2026

User clarified that playback must fill the entire screen. Removed the centered fixed 9:16 stage sizing: the video stage now fills the viewer bounds behind all overlays, with `contentFit="cover"` cropping as needed for the phone aspect ratio. The source asset and Discovery card remain 9:16. The video background remains independent of the keyboard-adjusted controls.

Verification: mobile typecheck, required stream regression suite and existing video chat/player checks passed. Android/iPhone edge-to-edge appearance, cropping and keyboard overlay checks remain pending; installed build IDs are unknown. No native build or deployment was started.

### Viewer counter and gift total — September 18, 2026

User requested viewer count and gift total in the video viewer. Added a compact combined header pill with the same 14-point GoldCoinIcon and eye icon as live viewing. Gift total means the sum of gift coin values (Rose + Crown = 501), not number of gifts. VIDEO remains visible beneath it.

Prototype semantics: one local viewer while the supported viewer is active, zero when unavailable/backgrounded/blocked. Gift total starts at zero for each screen session and accumulates local preview gifts, surviving video loops, keyboard changes and cache tools. No actual coins are spent or earned. Production needs shared presence counts and server-authoritative gift totals for the video's real owner.

Automated checks cover gift-value accumulation and unsupported-player count alongside the existing viewer interactions, mobile types, required stream regressions and localization. Android/iPhone header layout and full-screen video verification remain pending; no native build or deployment started.


### Full-screen label removal — September 18, 2026

Latest user instruction supersedes the full-screen VIDEO badge requirement: remove VIDEO from full-screen playback only. Keep the Discovery card label and the viewer/gift counters. Android/iPhone visual confirmation remains pending.

### Production video analytics for streamers — September 18, 2026

Recorded user requirement for the real implementation (not implemented in the sample prototype): track viewing and gift activity for each video so its streamer can see:

- Number of viewers.
- Average watch time.
- Total coins received through gifts on that video.
- Which viewers sent gifts, with their gift history and total coins contributed.

Persist gift attribution to the video, recipient streamer and sender account, including gift type, coin value and timestamp. Use confirmed server gift transactions as the source for totals so retries cannot double-count or create earnings from a local animation. Streamers must be able to review these statistics after a viewing session ends.

Implementation planning notes: distinguish the current concurrent viewer counter from historical viewer statistics. Final definitions for unique viewers versus viewing sessions and the average-watch-time denominator remain to be decided. Measure actual active viewing, including playback from the phone cache; CDN downloads cannot measure watch time or audience on their own. Automatic loops must not create additional unique viewers. Backgrounded, paused or buffering time should not count as watched time. Analytics presentation and reporting periods remain to be designed.

### Visible card preview and aqua tag — September 18, 2026

User requirement: video cards play a five-second preview when visible, matching live Discovery cards. User also chose **aqua** for the VIDEO tag because purple is already used elsewhere. Full-screen playback still has no VIDEO label.

Implemented: measure the card against the list viewport on scrolling/layout/content changes, using the existing live-card 40% visibility threshold. Each visible entry starts one muted preview using the shared 24-hour phone cache. The five-second timer starts at the first rendered frame, then the player unmounts and the bundled poster returns. Repeated frame/loop callbacks do not extend the timer. Scrolling out and back in creates a fresh preview. The four-second sample loops to cover the full five-second window.

Stop/release on leaving the viewport, route blur, background, card navigation, live-playback blocking or cache expiry. Pending downloads abort; late leases release without starting playback. Download/decode errors or a 30-second readiness timeout keep the poster. Card previews do not acquire a keep-awake lease. Full-screen player defaults remain audible and keep-awake enabled; the preview opts into mute and no awake lease. Initial preview still requires a full-file download; subsequent preview/full-screen playback reuses that file until expiry/eviction.

The VIDEO badge uses aqua #00D4D4 with dark teal text for readability. Existing card thumbnail, layout and tap navigation are preserved.

Automated verification: five-second/first-frame timing, repeated frame events, muted playback options, cache release, late download cancellation, error fallback and fresh-session tests passed, along with player lifecycle checks, mobile typecheck, required stream regressions and prototype localization. Android/iPhone visual/device checks remain pending: scrolling across the visibility threshold, return previews, five-second timing with real decoding, mute, quick card taps, slow downloads, background/foreground, PiP blocking and aqua badge appearance. No native build or deployment started.

### Approved streamer entry, management and storage flow — September 18, 2026

- User approved the current prototype appearance ("looks good"); platform/build and individual device regression cases were not specified.
- Inside Go Live, use three narrower pills ordered **Video · Go Live · Premium**, keeping Go Live in the middle.
- Video opens the **Your Video** sheet. Before uploading, show a 9:16 placeholder and Upload Video action, with an explanation that the video lets viewers discover the streamer while offline.
- After a video has been uploaded, show its preview, Replace video, Show in Discovery toggle and View stats. Uploading alone does not enable Discovery visibility.
- Returning streamers use the same Go Live → Video entry to access their saved video, toggle and stats. Going live disables the video; reactivation is manual.
- Approved production storage plan: store uploads in **Bunny Stream**. App database records ownership, Bunny video ID, thumbnail and Discovery enabled state. The original remains saved across app closure/device changes. The separate 24-hour viewer phone cache does not delete the hosted original.
- These are recorded production decisions, not completed upload/backend integration. Bunny account connection and service provisioning have not occurred. Upload duration/size limits remain undecided.

### Saved video history — September 18, 2026

User clarified that replacing a video must retain the old video's thumbnail and filename in history so the streamer can use it again. Preserve the hosted video asset and its Bunny ID as well; thumbnail/filename alone cannot support reuse without reuploading. Keep its existing statistics associated with the same video record.

The streamer can select a previous upload from video history as their current video. Replacement archives the prior selection in history instead of deleting its file. Selection and Discovery enablement remain separate: selecting a historical video must not automatically turn on Show in Discovery. History retention/deletion controls and limits remain undecided. The proposed five-minute maximum duration has not yet been approved.

## Creator video implementation — September 18, 2026

Implemented the approved **Video · Go Live · Premium** entry and **Your Video** sheet. Existing regular/Premium startup actions remain intact. The Video sheet provides upload, preview, replacement, saved history (filename, thumbnail and retained hosted asset), explicit selection, Show in Discovery and per-video statistics. History selection always disables Discovery; uploading never automatically publishes. The account-scoped sheet cancels pending uploads on closure/unmount and checks generation changes before using late picker/auth results.

### Storage and configuration

Server environment variables: `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_HOSTNAME` (hostname only). The Stream library API key stays on the backend. Upload creation returns a video-specific, two-hour TUS signature; the phone uploads 5 MiB chunks directly to Bunny, recovering acknowledged offsets after an interrupted response. Upload URLs are restricted to Bunny's upload origin and never receive the app's account token. Closing cancels the current phone operation; cross-app-restart upload resumption is not implemented.

Library setup: enable **MP4 fallback** before uploads and use standard/free encoding. Premium encoding, transcription and Multi-DRM are not required. User is creating the Bunny account; the final storage-region choice has not been confirmed. Latest recommendation during setup was Frankfurt primary plus New York replica for retained-history resilience, leaving LA/Singapore off. Replication choices cannot be removed after zone creation.

No five-minute duration maximum was approved or enforced. The existing **256 MiB technical file/cache ceiling** is enforced for this implementation. Actual provider metadata validates portrait 9:16 (small aspect-ratio tolerance), completed encoding and available MP4 fallback. A HEAD check verifies a playable-sized MP4 exists before marking it ready. Never trust only the phone's orientation metadata. Bunny transport/real native uploads still require the configured library and device checks; missing configuration is shown in the sheet.

### Durable backend and production viewer

Additive migration: `lib/db/migrations/20260918_creator_videos.sql`; matching ORM schema: `lib/db/src/schema/creator-videos.ts`. Applied to the development database. Production must apply this migration before deploying the routes, including the live-start transaction that disables video visibility.

Authenticated `/api/creator-videos` routes cover library/history, signed upload creation, processing refresh, selection, visibility, Discovery listing, playback details, chat, view heartbeats, gifts and owner-only statistics. Selection and live startup share an account advisory lock: live creation disables the video in its session transaction, and enablement rejects an active live. Ending a live never re-enables the video. All ownership/recipient identities come from the authenticated account and video record.

Discovery lists enabled uploaded videos with the existing aqua card tag and muted five-second visible preview. The developer sample remains available separately in development/explicitly opted-in builds. Real full-screen playback at `/video/[id]` fills the screen, has no VIDEO label, and uses account follows/DM navigation, shared video chat, normal wallet gifts, gift animation, live-style counters and the shared fixed-24-hour FIFO cache. Stable `creator-video:<id>` cache keys share files between cards and full-screen playback. Metadata/access is refreshed; disabling/replacing a video removes audience playback after the next successful access refresh.

Gift payments use fixed server gift prices, atomic sender debit/owner credit and the existing coin ledger, linked to the video. Idempotent retries return the prior payment rather than charging again. Stats include all-time unique viewers with watched time, average active seconds per viewing session, total gift coins, all gift senders and their totals, and the latest 200 individual gifts. These metric definitions are initial implementation choices, not a separately approved reporting specification. Viewing sessions persist across a pause within the same mounted viewer. Full-screen active playback contributes watched time; card previews, buffering/paused/background intervals and owner previews do not. Client cumulative heartbeats are deduplicated and bounded by elapsed server time. Presence expires after 30 seconds without a heartbeat. Shared chat currently polls every 2.5 seconds; details/counters every 5 seconds. Account blocking is enforced.

Existing live screens retain their reactions, navigation, PiP, Premium access and moderation behavior. The new recorded-video viewer does not yet reproduce every advanced live control (video-specific reactions, swipe feed, PiP, or message moderation/translation gestures). Do not describe those as implemented or device-tested.

### Verification and remaining setup

Automated checks: mobile/API types, API build, required stream suite, cache/player/preview tests, full ten-language localization (953 strings), direct-upload mock tests and real-database integration tests. Integration tests use temporary accounts and mocked Bunny transport; cover ownership, disabled configuration, portrait validation, history reuse, live disablement, blocking, shared chat deduplication, bounded watch time, owner-only stats, atomic gifts, concurrent retries and insufficient funds. Native upload tests mock filesystem/transport and verify chunk recovery, cancellation, destination checks and absence of account-token leakage.

Development API was rebuilt/restarted with its existing environment preserved. Running health returned 200; new library/feed/upload/visibility routes returned 401 without authentication. Authenticated business behavior was exercised directly against the real development database, not a signed-in phone. Real Bunny round trip and Android/iPhone visual, upload, keyboard, cache, gift and awake checks remain pending. No native build or production deployment was started.

Completion follow-up: a newly processed upload becomes the selected video automatically with Discovery off. A per-account pending-upload pointer prevents an older encoding result from overriding a newer upload or an explicit history selection. Real-database tests cover those races. Android and iOS Hermes JavaScript exports both passed at `/tmp/creator-video-export`; this does not constitute native compilation or phone verification. The final API revision was rebuilt/restarted with preserved environment and its running health/authentication checks repeated. All three Bunny environment settings were still absent at the last presence-only check; actual Bunny upload/playback validation remains blocked on setup, not represented as passed.

### Bunny credentials and first real provider check — September 18, 2026

User saved all three Bunny settings. Presence and format checks passed without displaying values, and the real Stream API accepted the library-scoped key (HTTP 200). The development API was restarted with the new settings and its prior environment preserved.

A temporary 720 × 1280 sample successfully uploaded through the app's signed TUS flow (2,745,228 bytes). Bunny completed encoding with MP4 fallback enabled. Its actual `availableResolutions` value contains `p` suffixes (e.g. `480p,720p,240p,360p`); fixed the parser to accept these and numeric variants, and updated the real-database regression fixture to match the real response. API type/build/integration checks pass; rebuilt development API health/auth checks pass.

Playback verification is currently blocked: the configured Bunny CDN returns HTTP 403 for MP4, HLS and thumbnail requests. This is a confirmed CDN response, not an upload failure. The exact library security setting has not yet been confirmed; asked the user whether Block direct URL file access is enabled. The temporary provider video was deleted successfully (HTTP 200), and temporary database records were removed. Do not claim a successful CDN playback round trip or phone test yet.


### Bunny delivery verified after security setting change — September 18, 2026

User confirmed **Block direct URL file access** was enabled, then turned it off. Keep this setting off for the current direct-MP4 download and phone-cache implementation.

Repeated the real provider round trip successfully: the authenticated upload handler issued video-specific TUS authorization, Bunny accepted all 2,745,228 source bytes, encoding finished, and the app marked the video ready after checking the CDN file. The MP4 downloaded successfully and its thumbnail was accessible. Independent ffprobe inspection confirmed H.264, 720 × 1280 (9:16), four seconds, and a 1,989,510-byte encoded file. The library retained the filename/history record, selected the processed upload automatically and left Discovery visibility off.

These checks invoked the route handlers with a temporary authenticated test identity against the real development database and real Bunny service; they were not performed from a signed-in phone. The temporary Bunny asset was deleted successfully (HTTP 200), and temporary database records were removed. This supersedes the earlier provider-access blocker. Android/iPhone native upload, visual playback, keyboard, cache, gifts and screen-awake verification remain pending. No native build or production deployment was started.


### Native upload Blob failure — September 18, 2026

User reported “Creating blobs from ArrayBuffer and ArrayBufferView are not supported” after selecting a video. Confirmed the upload used Expo File.slice(), whose installed implementation reads the file and constructs a Blob from a Uint8Array. React Native rejects that construction; the original Node Blob test mock did not reproduce the device limitation.

Replaced slicing with read-only native file handles: seek to the acknowledged TUS offset, read at most 5 MiB, close the handle in finally, and send the Uint8Array directly through expo/fetch. This also avoids reading the entire source file for each chunk. Local read failures stop before sending a PATCH; network recovery still resumes from Bunny's acknowledged offset.

Regression test now rejects Blob slicing like the phone, verifies exact uploaded bytes after full and partial chunk acknowledgements, bounded reads, handle cleanup on success/read failure/cancellation, and existing destination/token protections. The test reproduced the reported error before the fix and passes afterward. Filesystem and transport are mocked; an actual Android/iPhone upload retest remains pending. This is a JavaScript-only fix using installed Expo APIs; no native dependency/configuration or backend behavior changed.


### Removing an unfinished upload — September 18, 2026

User requested removal of the stuck video that kept saying processing. Added Remove to uploading, processing and failed entries in Your Video history. The authenticated DELETE /api/creator-videos/:id endpoint verifies ownership and serializes with processing/selection using the account lock. It removes the Bunny asset before deleting the database entry; provider failure preserves the entry for retry, and an already-missing provider asset can still be cleared. Foreign keys clear the pending pointer. Ready history cannot be removed through this endpoint, preserving hosted videos and gift/view statistics. An in-flight refresh cannot recreate a deleted entry.

Corrected provider status 0 (an empty/unfinished upload record) to remain uploading instead of showing processing. At investigation time the user's single Bunny entry reported status 0, encoding progress 0, zero dimensions/duration and zero storage size; this suggests the earlier Blob failure left an unfinished upload rather than an active encode. The user reported the dashboard showed uploading and, on opening, transcoding, and mentioned 20 seconds. No user video was deleted during diagnosis; Remove is available for the user to clear it before retrying.

Verification: mobile/API typechecks, API build, ten-language localization and real-database integration passed. New tests cover ownership, failed/processing removal, protected ready history/stats/visibility, cleared pending state and provider failure/404 retries (Bunny transport mocked). Development API rebuilt/restarted with its environment preserved; health returned 200 and the running removal route rejected unauthenticated requests with 401. Actual Android/iPhone interaction with Remove remains untested. No native build or deployment started.


### Processing feedback and deletion race — September 18, 2026

User reported a parse error while processing and, separately, Video not found after tapping Remove. Running API logs confirm the removal succeeded (200) and an overlapping processing refresh then returned 404. The sheet now cancels the active background poll before a mutation, ignores aborted/retired results, and starts a fresh controller on the next poll. A late response cannot restore the removed card or show the false deletion error.

The exact response behind the processing parse error was not captured. Hardened JSON handling so empty/truncated/non-object responses cannot expose a raw parser exception. Library/detail reads and processing refreshes may retry one malformed successful/server-error response; upload creation, gifts and deletion are never blindly repeated. Persistent malformed responses show the existing service/retry message. Cancellation prevents retries. Diagnostics contain method/path/status only, never credentials or response bodies. This is tested recovery behavior, not a proven diagnosis of the original phone parse error.

User requested a processing estimate. Bunny Get Video exposes encodeProgress (0–100) but does not document an ETA: https://bunny.net/docs/api-reference/stream/manage-videos/get-video . The owner refresh response now includes the bounded actual percentage (null when unavailable). Your Video displays Processing video: N%, refreshing through its existing five-second foreground poll, and Finalizing video… at 100% while the playable file is still being checked. No countdown or estimated time is fabricated. This progress is refreshed on opening the sheet rather than stored as permanent video metadata.

The user's replacement upload completed successfully: Bunny reported 100%, a 21-second original with 1920 × 1080 dimensions and -90° rotation (portrait after rotation), and the app database marked it ready. The earlier empty upload was removed by the user's action. Do not confuse that earlier failed entry with this completed replacement.

### Prototype-style controls in owner preview — September 18, 2026

User saw only the composer at the bottom and requested comparison with the approved prototype, then explicitly requested the three dots. Code inspection confirmed Follow and Gift were hidden for owners. Keep those controls visible in the full-screen owner preview: Follow is disabled for the creator's own account; Gift opens the existing preview-only picker and animates locally without a payment, wallet fetch or earnings change. The picker states Test gifts only. No coins are spent. Other viewers retain real follows, Messages after following, and normal wallet gifts with server idempotency and self-payment rejection.

Added the three-dot More button beside Gift, matching the prototype's placement. It opens Share and Exit Video; backdrop/Android Back closes it, and Exit returns to the prior page (Discovery fallback for a direct entry). Direct actions have no navigation chevrons. Follow uses the prototype's 38-point round shape. The header has explicit stacking above the composer layer, retaining the creator name/avatar, coin total and viewer counter. Full-screen playback still has no VIDEO label. Keyboard opening hides accessory controls and dismissal restores them without clearing the draft. Advanced live-specific menu features remain outside this change; do not claim full live-menu parity.

Verification: focused tests cover owner/audience control visibility, safe owner gift preview versus real audience API payment, displayed counters, Share/Exit, keyboard restoration, processing percentages/finalizing state, deletion/refresh races and malformed-response recovery. Upload regression, real-database API integration, mobile/API types, API build, all 956 strings in ten languages and required stream regressions passed. The development API was rebuilt/restarted with its existing environment preserved; running health and processing/removal authentication checks passed. Native rendering, device upload, keyboard/menu interaction, and screen-awake checks on Android/iPhone remain pending. No native build or production deployment started.


### Fading creator preview message — September 19, 2026

User requested a fading message saying This is a preview so creators understand the preview context. Added an owner-only, touch-through notice below the full-screen header once cached playback is available. It stays for three seconds, fades over 500 ms, then unmounts; leaving cancels its timer/animation. Audience playback never shows this notice. Existing control actions are unchanged. All ten languages include the message.

Automated verification: owner/audience visibility regression, mobile types, required stream regressions and localization passed. Android/iPhone appearance and fade timing remain pending device checks. No backend change, native build or deployment.


### Preview-only buttons and repeat notice — September 19, 2026

Latest user decision replaces the interactive gift-animation preview: the fading notice now reads “This is a preview. The Follow and Gift buttons are disabled.” Both controls remain visible with softened styling. They accept taps only to restart the same three-second notice and fade; creators cannot follow themselves, open the gift picker, animate a test gift or send a payment. The gift-send callback also rejects owner invocation, including stale callbacks. Audience follows and actual gifts retain their existing behavior.

User explicitly requested the counter still work. The existing real coin total and current viewer count remain fed by the five-second detail refresh in owner preview as well as audience playback. Owner preview does not count as a viewer. Whether tapping the counter should also open a viewers/gift-senders list was asked separately; no answer yet, and no list-opening behavior is claimed by this change.

Verification: owner/audience control tests cover repeated Follow/Gift taps restarting the notice, no owner follow/payment/animation, normal audience actions and preserved displayed counters/menu/keyboard behavior. Mobile typecheck, required stream suite, all ten localization catalogs (957 strings) and diff check passed. Android/iPhone visual, tap and fade timing checks remain pending. No backend change or native build.


### Viewer list, creator actions, hearts and centered notice — September 19, 2026

The user confirmed that tapping the combined coin/viewer counter should open a live-style list. Creators see current viewers and gift senders with coin totals, ranking, profile links and watching status. Audience members see gift rankings only, never the private viewer roster or individual presence. Search starts hidden, the list refreshes every five seconds, and ten seconds of inactivity closes it; touching, typing and scrolling reset that timer. Server authorization and account/role-scoped client queries protect the owner-only data. Counts remain real, and owner preview does not count as a viewer.

The creator's three-dot menu now includes Replace video and Turn off video. Replace opens the existing upload flow, preserving stored history; on iOS the menu dismisses before presenting the upload sheet. Turn off removes the video from Discovery through the existing visibility endpoint without deleting the file or history. Duplicate visibility submissions are blocked while pending.

The user requested the heart emoji only, like live, without replacement functionality. This is implemented as a fixed ❤️ reaction with no emoji-change chooser; the separately requested Replace video menu remains. Recorded videos reuse the shared floating reaction component and ephemeral websocket delivery, with video access checks and heart-only server validation. Hearts do not change coins, gifts or earnings. The control hides while typing.

The owner notice is now centered horizontally and vertically over playback. “This is a preview” is a larger 24-point bold heading, with “The Follow and Gift buttons are disabled.” centered beneath in 12-point text. It remains touch-through, visible for three seconds, then fades over 500 ms. Tapping owner Follow or Gift repeats it without performing those actions.

Automated verification: mobile/API typechecks, API build, real-database creator-video integration, required stream regressions, focused owner/audience controls and viewer-list privacy tests, upload-sheet regression, all ten localization catalogs (960 strings), and diff formatting passed. The rebuilt development API was restarted with its existing environment preserved; health returned 200, the running viewer-list route rejected unauthenticated access with 401, and running websocket clients verified shared live reaction delivery and isolation. Authenticated recorded-video access and heart restrictions were checked using database handler tests and mocked websocket access, not signed-in phone sessions.

Android/iPhone verification remains pending: centered notice and fade appearance, safe areas, native menu-to-picker presentation, viewer list/search/profile transitions, shared hearts with multiple viewers, keyboard/dock restoration, navigation and screen-awake regression cases. No native build or production deployment was started.


### Detail sheet without repeated totals — September 19, 2026

User clarified that the video header counter is the place for total viewers and total coins. Remove the duplicate aggregate summary from the video viewer sheet. The sheet retains individual viewers, gift senders, each sender's coin amount, rankings, search and profile links, with existing owner/audience privacy rules.


### Released player error and video-to-message identity — September 19, 2026

User reported an Expo TextureVideoView player-prop error (“cannot use a shared object that was already released”) when touching chat from recorded playback on a viewer phone. Exact native stack, installed build and device reproduction are unavailable; the class name points to Android. Inspection and a regression test exposed a lifecycle risk: the manual player effect released/recreated playback when callback identities changed while retaining the previous handle in React state. This is a demonstrated code defect, not proof of the precise phone event sequence.

The shared cached player now uses the installed Expo useVideoPlayer lifecycle with a URI-keyed playback session. UI/callback/mute updates retain the player; listeners read current callbacks. Source changes replace the entire view/player session. Layout cleanup cancels late work, removes listeners and pauses audio before Expo's passive cleanup releases the native object. Preserve explicit full-file cache use, looping, muted five-second card previews, background/route gating and independent awake leases. No native package/configuration change. Expo lifecycle reference: https://docs.expo.dev/versions/v58.0.0/sdk/video/#using-the-videoplayer-directly ; implementation checked against installed expo-video 57.0.4 and expo-modules-core 57.0.16.

User separately confirmed that “User” and missing avatar occur in the private-message header opened from the video. Fixed the video route to supply peerName, which the DM screen expects, instead of name. DM now reads the shared profile cache for current name and avatar, using the route name immediately while loading and conversation identity as a fallback. Profile/conversation updates update the header without waiting for message history or peer-status requests. Message-history latency itself has not been diagnosed or claimed fixed.

Automated verification: the new lifecycle test failed before the fix (nine players created across eight callback updates) and passes after it. It runs installed Expo hooks with mocked native resources and checks stable playback, current callbacks, mute updates, source replacement, pause-before-release, listener cleanup and ignored late success/failure. DM header and video-to-DM tests cover the correct parameter, immediate name, cached/later avatar/profile data and recipient isolation. Mobile typecheck, required stream regressions, card preview, viewer controls, chat status deadline/recovery, ten-language localization and diff checks passed.

Device verification remains pending on Android and iPhone: reload, open video, tap Messages, confirm name/photo, type/send/dismiss keyboard, navigate back/reopen, background/foreground and verify no released-player error or lingering audio; repeat card previews and required awake/header/list/navigation cases. These checks do not establish a fixed native crash until the phone retest. No backend change, native build or deployment.


### Confirm before turning off a video — September 19, 2026

User clarified that the previous OK-only alert was insufficient because it appeared after disabling. Three-dot menu → Turn off video now asks before changing visibility: “Your video will no longer appear in Discovery. You can turn it back on anytime.” Actions are Cancel and Turn off video. Cancel/native dismissal preserves visibility and returns to the menu. Only confirmation sends the existing visibility request; repeated confirmation cannot submit duplicate in-flight requests. Success closes the menu without another OK-only alert. Failures retain the existing error feedback. No deletion or history change.

Automated mobile typecheck, required stream suite, owner/audience menu tests (no request before confirmation, cancellation, duplicate-confirm guard and no success-only alert), ten-language localization (961 strings) and diff checks passed. Android/iPhone native alert placement, Cancel/Back, confirmation and menu dismissal remain pending device checks. No backend change or native build.


### Replace opens management; turn-off exits playback — September 19, 2026

Latest user correction: three-dot menu → Replace video opens the existing Your Video management window, showing the current video/history and available actions. It must not automatically launch the device video picker. Removed the automatic picker-on-open option; uploading remains an explicit action inside management. Preserve the iOS menu dismissal before presenting management.

Confirming Turn off video now closes recorded playback after the visibility request succeeds, returning to the previous screen or Discovery for a direct entry. Cancel leaves playback and visibility unchanged. A failed request leaves playback open with error feedback. Preserve the pre-action confirmation, duplicate-request guard and stored video/history; there is no extra OK-only success message.

Automated mobile types, required stream suite, viewer menu/navigation tests (Cancel, successful close, Discovery fallback, failure staying open), management-sheet regression and diff checks passed. Android/iPhone management presentation and confirmation-to-exit/native audio/awake cleanup remain pending device checks. No backend change, native build or deployment.


### Discovery switch placement — September 19, 2026

User requested Show in Discovery at the top of the Your Video management sheet. The switch and its existing going-live explanation now precede the thumbnail and upload/preview actions, directly below the sheet header during normal management. Existing selected-video requirement, visibility mutation, pending guard and stats view are preserved. Mobile types, management-sheet regression, required stream suite and diff checks passed. Android/iPhone visual verification remains pending.


### Conditional go-live notice and redesigned management tabs — September 19, 2026

Latest user decisions supersede the permanent going-live explanation and the one-page management layout:

- Keep Show in Discovery at the top of management, but remove the going-live explanatory text. Before creating a broadcast, read the current account's video-library settings. If a selected video is enabled, show “Your active video will be turned off when you start broadcasting.” with Cancel and Continue. Cancel/dismiss leaves the video and live state unchanged. Continue uses the existing stream-create transaction, which already disables the video. No video-active notice appears for disabled/absent videos. The preflight read has a 12-second bound; leaving/account cleanup cancels it, and late dialog actions cannot start the broadcast. A pending-start guard prevents duplicate submissions. Regular/Premium startup share this path; private startup also passes through it.
- Your Video has Video and History tabs, with the selected tab highlighted in aqua. Show in Discovery stays above them. The Video tab focuses on the current portrait video, filename, viewer count, average watch time and total coins. Show details opens the existing full stats/gift-sender information. Summary requests use account/video-scoped query keys, reuse cached data and refresh on mounting; loading/failure is shown rather than fabricated zero counts.
- Remove the standalone Preview button. Put a play/pause control directly on the portrait preview, retaining the same loaded player/position on pause/resume. A small full-screen icon preserves access to the viewer-style preview with its existing controls. The management preview downloads through the same 24-hour/FIFO file cache only after Play; it releases playback/cache access when changing tabs, closing, backgrounding or expiring. It makes no view-heartbeat or gift calls. Opening management from full-screen playback removes the underlying player to avoid playing two videos at once.
- History keeps ready saved videos with thumbnails, filenames, selection/reuse and Show details. Selecting a past video returns to Video and preserves manual activation. In-progress/failed uploads stay on Video with processing percentages/removal controls, and uploading has a compact progress bar. No history/file/stat deletion was added.

Automated verification: mobile typecheck; required stream suite including go-live preflight tests; regular/Premium startup cancel/success/duplicate/error tests; management tabs/history/details tests; inline preview cache/foreground/expiry/late-result tests; player pause/resume and lifecycle tests; existing upload-removal race, viewer controls and Discovery card-preview tests; all ten localization catalogs (966 strings); and diff formatting passed. Installed Expo hooks are exercised with mocked native resources. No backend behavior changed in this revision, so no API restart or migration was required.

Device verification remains pending on Android and iPhone: sheet sizing/scrolling and safe areas, aqua tabs and control hit targets, current-video counts/details, inline Play/Pause/full-screen, audio continuity and cleanup across tabs/actions/background/close, history reuse, processing/remove, go-live Cancel/Continue for regular/Premium/private sessions, and required awake/header/list/keyboard/navigation cases. No native build or production deployment was started.
