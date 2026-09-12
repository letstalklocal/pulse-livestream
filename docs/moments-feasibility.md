# Moments feasibility

Requested behavior: a confirmed live gift worth at least 500 coins triggers a seven-second reaction clip, saved under Settings → Moments. The Android device test now confirms recording and playback. The user subsequently required the gift animation to be embedded in the saved MP4.

## Existing building blocks

- Gift transactions are committed server-side with recipient, channel, amount, and idempotency key.
- The broadcaster already receives WebSocket gift events and displays gift animations.
- Private object storage supports signed uploads/downloads.
- Moments is currently a placeholder in Settings.

## Recommended first experiment

Test capture of the broadcaster's own camera and microphone using the installed react-native-agora 4.5.4 recorder API on a physical Android development build. It exposes createMediaRecorder, startRecording, callbacks, file paths, and maxDurationMs, but the installed definitions mark these APIs @ignore. Availability and start latency therefore need verification before choosing this implementation.

Start capture when the qualifying gift is delivered to its recipient and shown on the broadcaster screen; stop after seven seconds of actual recording. A late start can lose the initial reaction. This approach does not promise the gift animation or chat will be embedded in the camera recording. Store gift metadata separately for display in Moments.

A browser preview cannot prove recording works: this app's web Agora module is a stub. Test actual camera/audio capture, playable output, elapsed duration, orientation, upload, background/interruption, and stream termination on Android.

## Required implementation pieces

- Emit confirmed individual gift amount, transaction identifier, recipient, and target stream. Current coins in the gift WebSocket event is the cumulative stream earnings total, not the gift amount.
- Record only the receiving streamer, including gifts during parties/battles; mirrored gift animations must not create recordings for both hosts.
- Deduplicate triggers by transaction ID. Resolve overlapping qualifying gifts without interrupting an active recording or dropping the second reaction; decide whether to share an extended recording and extract separate seven-second clips.
- Add owner-authorized Moments metadata, clip uploads, retry states, playback, and deletion. Keep clips private to the streamer for the initial Settings gallery.
- Validate gift eligibility and uploaded object ownership on the server. Do not turn successful gift transfers into failures because recording/upload fails.

## Alternative

Agora Cloud Recording supports server-side recording and delivery to cloud storage: https://www.agora.io/en/products/recording/

That needs recording-service setup and a compatible storage configuration. Starting a recorder only after a gift requires latency testing; it must not be assumed to capture the first reaction. An already-running recording that is trimmed around gift timestamps is an alternative, with more recording, storage, and processing overhead. Neither option has been enabled or tested here.

## Android test implementation (September 11)

- Ordinary and premium-admission gift notifications include the ledger idempotency key, individual amount, sender UID, and recipient UID. Party notifications carry the same metadata and only the recipient records.
- The broadcaster starts its native Agora recorder with a seven-second limit. Duplicate gift events are ignored. Ending/changing the stream cancels incomplete capture. Recorder start errors/timeouts are saved as diagnostics in Moments.
- A second gift arriving while capture is active is explicitly marked not recorded in this first test version. It does not interrupt the first clip.
- Clips persist on the device until removed. Upload failures retain the clip for playback/retry. Owner-only server endpoints create uploads from qualifying ledger transactions, list clips, issue private playback URLs, and delete them.
- Settings → Moments includes playback using the already-installed Agora player, upload retry, and recording diagnostics. Playback requires ending the live first to avoid creating a competing Agora engine.
- The additive moments migration and Drizzle schema are included. The feature does not require an additional native library; recording support in the current installed binary is still unverified.

Tests: `moments.integration.mjs` (database/auth/gift metadata; mocked object storage), `moment-recorder.test.mjs` (mocked native controller), `moments-storage.smoke.mjs` (real signed upload/download with cleanup). Physical Android capture and playback are not covered by these checks.

Device test: reload the development app, go live on Android, send a single gift worth at least 500 coins from a second account, stay live for at least 10 seconds, end the live, and open Settings → Moments. Verify picture, microphone audio, duration, sender/gift details, and playback. Then verify a 499-coin gift does not trigger, failures do not interrupt gifting, and another account cannot view the clip.

## Playback follow-up (September 11)

The first device test showed a Moments entry but unsuccessful playback. The native player now enables Agora's video module before opening the clip (a fresh engine defaults to video disabled), disables camera/microphone capture during playback, checks player creation and playback start errors, and reopens the clip for Replay. Native playback prefers the completed local file when present, with private server playback used when it is absent. These changes still require a physical Android check of the existing clip's picture and sound; a Moments entry alone does not establish that the recording is valid.

The next device attempt timed out with “The clip could not be opened.” Investigation found the installed Agora wrapper's `addListener` only auto-registers the source observer when the observer map has an existing empty array; a fresh player has no entry, so native state callbacks are never registered. Moments now calls `registerPlayerSourceObserver` explicitly before opening, checks its return value, and unregisters the same observer at teardown. The playback regression harness now requires observer registration before delivering native state changes; the previous mock bypassed this requirement. Device playback remains to be confirmed.

Read-only inspection of the latest ready uploaded Moment with ffprobe found a 993,937-byte MP4, 7.019 seconds long, with H.264 video at 960×540 and AAC audio. This verifies that the uploaded file has recognizable video/audio streams and metadata; it does not verify Android rendering or a full decode. The temporary download was removed. Mobile TypeScript and the updated mocked playback lifecycle regression passed.

## Required gift inclusion (September 11)

The user confirmed: **Include the gift animation in the saved video itself**, including when downloaded or shared. A playback-only overlay does not satisfy this. This supersedes the camera-only limitation of the first experiment above.

- After private raw upload, the API composites the gift emoji and sender label into the MP4 using FFmpeg. It recreates GiftFloater's 380ms pop, 1100ms hold, and 720ms rising/fading exit from the beginning of the reaction clip. This is compositing using confirmed gift metadata, not screen capture; unrelated live UI is not included.
- Gift art uses bundled Android Noto emoji assets with their license. Sender text is treated as literal text, limited in length, and drawn using bundled licensed fonts. Device-specific emoji/font rendering can differ.
- The original remains private and unmodified. A separate `embedded_object_path` identifies the finished MP4; new uploads become ready only after successful processing. Failures retain the original and support retry, and concurrent requests share processing work. Rendering is serialized and resource/time limited.
- Playback serves the embedded file, never the old local camera-only file for a ready Moment. Existing ready recordings without an embedded file are upgraded on first playback. Deletion removes both source and finished objects.
- Runtime requires FFmpeg/ffprobe (declared in `.replit`) and the bundled `artifacts/api-server/assets/moments` directory. Apply `20260911_moment_gift_video.sql` before running this code.
- Real synthetic MP4 tests verify full decoding, H.264/AAC, animation pixels, fade-out, and special-character sender text. The encoded preview was visually inspected. API integration covers ownership, threshold, retry after processing failure, concurrent completion, and separate output persistence. These checks do not substitute for viewing the finished result on Android.

Running-server verification passed after rebuilding/restarting with the existing environment: anonymous playback returned 401; the owner's authenticated list/play returned 200; the latest existing Moment was upgraded to a separate private embedded MP4; repeated completion/playback reused it. The downloaded output fully decoded, with H.264 portrait video (540×960), AAC audio, 7.018 seconds, and 696,188 bytes. Actual Android playback of this embedded version still needs the user's check.

## User correction: live capture required (September 11)

The user rejected the post-recording compositing approach described above. The requirement is to capture the stream with the gift rendered into the video live, not add it afterward or record the phone screen. The previous implementation remains in place pending a safe replacement; its presence is not acceptance of that design.

An isolated Android development experiment now tests native camera-and-gift mixing and raw recorder output. It bypasses server processing and charges no coins. See [the proof procedure](moment-capture-proof.md). Mocked lifecycle checks and type checks cannot prove the gift is in the file; remote live viewing and raw exported MP4 playback must establish that before production integration.


The device proof captured the crown in the raw recording and remote live view, with matching black-box/static artifacts. A `fixed-alpha-v2` candidate fix keeps the native mixer layout and layer opacity constant, animates through immutable transparent PNG effect frames, and explicitly starts/rebinds the host mixed preview. This needs device confirmation; see the proof procedure. Regular gift Moments and server processing remain unchanged.


Device feedback rejected fixed-alpha-v2: the black rectangle disappeared, but full-screen static worsened. The current camera-overlay-v3 diagnostic removes the mixer entirely and applies transparent effect assets through Agora's native watermark API on the unchanged camera track. Its seven-second clip separates camera-only, stationary-image, animated-image, and cleared-image stages. This is not yet a proven fix and requires device comparison of host preview, viewer, and raw file. Production Moments behavior remains unchanged.

The user confirmed v3 video looked good, but the crown switched sides between the streamer's own preview and recording. V4 adjusts only test placement and host preview mirroring: measured encoded dimensions center the visible crown, and the host preview is unmirrored while the test is active. Device comparison with a second viewer remains required. The clean v3 camera watermark path is retained.

V4 device feedback: live/recorded placement matched, but the crown became larger and was half off-screen on the right. V5 removes ratio-mode placement and supplies smaller portrait/landscape pixel rectangles, preserving the clean camera overlay capture path. Captured test metadata now includes the exact placement configuration. Device confirmation is pending.

V5 device result: the crown was centered but tiny. The user explicitly approved doubling it. V6 doubles only the visible crown size, preserving the center and prior rise distance so the animation stays within frame. This remains the isolated test, not production gift integration.

## Production live-capture integration (September 11)

The user confirmed the v6 crown test worked and authorized replacing the previous Moments recorder/compositor while keeping the feature structure. The active implementation now uses the tested native `addVideoWatermark` camera path on confirmed recipient Crown gifts worth at least 500 coins. It starts the recorder first, animates the crown once the recording-start callback arrives, clears the watermark after the 2.2-second effect, and saves seven seconds of camera/microphone video. It does not capture the phone screen or add anything after recording. No mixer, encoder-resolution change, or video-source switch is introduced. The existing overlap diagnostic remains: a second gift does not interrupt the first recording.

The source crown is now 512×512 rather than 128×128; generated sprite dimensions, display size, center, travel distance and animation timing are unchanged. The diagnostic and production paths share these assets and placement math. Host preview mirroring is temporarily disabled during the native animation as in the successful proof. Other gifts retain their existing floating UI. A recipient-authorized native-frame acknowledgement suppresses the matching duplicate UI crown while retaining sender/gift text; normal and party viewers use the same gift ID.

The existing gallery, per-account local storage, private uploads, retries, playback and deletion remain. Successful files carry `captureMode: live-gift-v1` and are uploaded/served unchanged, including local playback when available. The after-recording renderer, its runtime assets and automatic playback upgrades have been removed. Existing historical finished clips remain playable and deletable; their source and legacy derivative are retained until deletion. Apply `20260911_moment_live_capture.sql`. The old embedded-path column remains only for backward compatibility.

Latest user correction (September 12): live-chat gift notices must read **Alex sent 🪙 99 coins · Crown**, with the coin icon before the amount and the word “coins” immediately after it. This supersedes the earlier amount-before-icon format. Confirmed ledger notification data supplies the name and amount; cumulative stream totals are never substituted. Notifications use the existing bounded live-chat store, deduplicate by gift transaction, respect removal, and mirror to the party channel. Admin gift management belongs in a separate web app; do not create an admin area in this app.

Validation for this integration: mobile/API TypeScript and the API build pass. Native recording/player/proof regressions pass with Agora mocked; the proof also decodes real generated PNG alpha. Moments integration verifies ownership, 500-coin eligibility, native-frame acknowledgement, upload retry, concurrent completion, raw-path playback, and live-chat gift deduplication/removal. Stream moderation and party/premium reconnect regressions pass. The API was rebuilt/restarted preserving its environment; running Moments list/upload/acknowledgement/completion/play endpoints return 401 for anonymous requests. Real private-storage upload/download/metadata smoke checks pass using a disposable synthetic payload, removed afterward. An existing-user/private-recording end-to-end test was rejected by automatic approval review and was not run; authenticated route checks use isolated integration fixtures.

Device acceptance still needed for the final paid-gift path: reload, start an Android live, send one 500-coin Crown from another account, remain live for at least 10 seconds, and compare the sharper native crown in the viewer feed with Settings → Moments playback. Check the sender's name, coin icon before the actual amount, “coins” after the amount, and gift name in stream chat. No extra charge or synthetic paid gift was used in verification.

Artwork consistency follow-up: the user reported different crowns. The gift picker, UI gift floater, premium gift choices and admission card previously rendered the platform crown emoji, while the native recording used the bundled Noto PNG. These displays now use `CrownArtwork` with the same `assets/moments/crown.png` source used to generate the live recording effect. Text-only premium summaries use the gift name without a conflicting crown emoji. Native animation, capture geometry, timing and recording are unchanged. Mobile TypeScript passed; visual/device confirmation remains pending.

Single-crown correction: the user reported the native/test crown alternating or overlapping with the old floating gift and explicitly required one crown. Viewers and the other party host now reserve qualifying Crown gifts for video from the first gift/payment event, instead of starting a UI crown while awaiting a later acknowledgement. The recipient can explicitly report a pre-render failure to allow a UI fallback; there is no timer that guesses a failure and adds a second crown. A bounded per-channel transaction registry remembers payment/socket/native decisions even after the visual notice disappears, preventing a late payment response or duplicate socket event from replaying the UI animation. A confirmed native frame cannot be overridden by a late fallback. The sender label and chat gift message remain. Native recording, artwork and positioning are unchanged.

Validation: reordered-event/presentation tests, native recorder regressions, authenticated synthetic Moments integration, mobile/API TypeScript and API build pass. API restarted with its environment preserved; its updated live-gift endpoint rejects anonymous fallback requests. Final comparison on both host and viewer devices remains necessary; reload both apps to remove the older viewer logic.

Preview mirror correction: the user reported the camera flipping when a crown appears. The previous integration conditionally set the host canvas to unmirrored video while the crown/test was active, then restored normal selfie mirroring. That override and its production preview state callback are removed. Crown arrival, exit, cancellation, and the diagnostic test must not change camera mirroring. The host uses normal camera preview behavior throughout; the native crown remains centered and the captured/published video path is unchanged. This supersedes earlier notes approving test-only temporary unmirroring.

Future gift format/audio requirement: the user expects animated gifts (potentially SVGA) with sound. Current production Crown uses prebuilt PNG frames and has no gift sound; existing microphone capture is not proof of gift-audio capture. Future SVGA support must send the actual animation and synchronized gift audio into the live media path and include both in the unchanged Moment, without a duplicate UI animation or audio played only on the host device. Per-gift animation/recording duration and asset management belong to the separate admin web app. No SVGA decoder or gift-audio integration has been implemented or device-verified yet.

### Default gift sound (September 11, 2026)

User approved a default sound for now, before per-gift SVGA/audio support. The production Android Crown now plays an original 1.8-second chime once through the broadcaster Agora engine with publish enabled, immediately after the first native crown frame and after recording has started. The bundled WAV is materialized locally before playback. No viewer-side duplicate player, microphone mute change, camera mirror change, or post-recording soundtrack is introduced. Cleanup stops only the reserved gift effect; an audio failure logs a warning and preserves the video capture. Future per-gift audio and the separate admin app remain separate work.

Validation: controller regression tests mock native audio and verify publication, ordering, deduplication, interruption cleanup, and nonfatal audio failures. WAV metadata and bundle bytes are checked locally. Actual viewer audibility and inclusion in the raw saved Moment still require an Android device test; the native recorder audio mix has not been verified on a device.

## Paused checkpoint — September 11, 2026

User asked to stop and record where we left off. No further implementation is requested until work resumes. This checkpoint supersedes historical implementation details above where they conflict.

Current implementation:
- Production Android Moments uses the successful native camera watermark approach for confirmed Crown gifts worth at least 500 coins. The crown is rendered live and captured in the raw MP4; no after-recording compositing. Animation is 2.2 seconds and recording is seven seconds. Future per-gift durations are not implemented.
- One crown only, shared artwork across the picker and feed, with gift-ID deduplication and explicit failure fallback. Camera mirroring stays unchanged when the crown appears or disappears.
- Gift chat notice format is “Alex sent 99 🪙 · Crown”. Admin gift assets, prices, ordering and enable/disable controls belong in a separate web app, not this app.
- Latest change: added an original 1.8-second default chime. It plays once through Agora with publication enabled, after recording starts and the first native crown frame is applied. Interruption cleanup stops only this effect. Sound errors preserve the video recording. No SVGA playback or per-gift sound configuration yet.

Latest verification passed: mobile TypeScript; native recorder and proof regression tests (Agora mocked); generated WAV metadata, unclipped samples and matching bundled bytes. These do not prove sound is audible remotely or included in the saved MP4. No backend changes were needed for the sound addition.

**Next step when resuming:** reload host and viewer apps, start an Android live, send a 500-coin Crown and remain live for at least 10 seconds. Check the default chime on the host and remote viewer, then play the saved Moment and confirm both crown and chime are in the actual video. Also confirm one crown, stable camera mirroring and correct chat notice. If live sound works but the Moment is silent, investigate the native recorder audio mix; do not silently add sound after recording. Record the device result before expanding to SVGA or configurable gifts.

Main implementation files: `artifacts/mobile/utils/momentRecorder.native.ts`, `momentGiftAssets.native.ts`, `defaultGiftSound.ts`, `momentGiftConfig.ts`, `giftPresentation.ts`; `artifacts/mobile/scripts/generate-default-gift-sound.py`; `artifacts/mobile/assets/moments/default-gift.wav`; `artifacts/api-server/tests/moment-recorder.test.mjs`. Broader proof history is in `docs/moment-capture-proof.md`.

Changes remain in the workspace, with unrelated pre-existing changes to preserve. No commit or deployment was requested. Do not retry the previously rejected existing-user/private-recording verification described above; use device feedback or isolated synthetic fixtures.
