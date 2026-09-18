# Video uploads and live recording ideas

Recorded September 18, 2026. Planning notes only; neither feature is implemented by this task.

## Agreed naming

- **LIVE**: a broadcast happening now.
- **VIDEO**: an uploaded prerecorded video.
- **REPLAY**: a recording of a past live stream.

The user approved distinguishing Video uploads from live Replays, replacing the original idea of calling both Replay. Use **Videos** for the uploaded-video section on Discovery. Whether future live Replays also appear there remains undecided.

## Idea 1: Uploaded videos in the feeds — discuss first

A streamer uploads a prerecorded video that appears in a separate Videos section/component on Discovery, clearly marked **VIDEO**. This is an uploaded recording, not a live broadcast, and does not require the video to have been streamed live previously.

The user wants to discuss this idea first. The Video label and uploaded-video concept are confirmed; implementation has not been requested.

### Launch rationale and requested direction

At launch, the app needs recruited streamers and content in the feeds even when those streamers are not broadcasting. Let streamers upload videos so visitors can discover creators and have something to watch between live broadcasts.

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

### Discussion points — not yet approved requirements

- Playback details: when playback starts or pauses, initial playback position, sound behavior, and whether viewers can seek. Looping is requested.
- Uploads: video length and size limits, title, cover image, processing, and publishing controls.
- Viewer interaction: which interactions make sense for a recording, including whether comments or chat are offered.
- Management: visibility, removal, retention, and moderation.

## Idea 2: Record live broadcasts — later phase

Record actual live streams for later viewing, marked **REPLAY**. The user expects this to take more time to set up and wants to defer its detailed discussion until after idea 1.

Recording controls, storage, processing, publishing, retention, and any connection to the uploaded-video feed experience remain undecided. Do not assume that Video uploads depend on live recording being available.

## Hosting, resource use, and cost discussion — paused

The user asked to save this conversation and return to it later. No provider was chosen and no implementation was authorized. Resume with an affordable hosting comparison for uploaded videos, using simple explanations and explicit viewer-count assumptions.

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

## Implementation boundaries

No implementation is requested yet. Preserve existing approved stream and chat behavior. Before implementing changes to stream screens, shared controls, navigation, or chat, read the applicable requirements in [stream-screen-regressions.md](stream-screen-regressions.md), [stream-navigation.md](stream-navigation.md), and [chat-message-preferences.md](chat-message-preferences.md), and perform their required checks.
