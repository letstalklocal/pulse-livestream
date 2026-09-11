# Live gift capture proof

The requirement is to capture the stream with a gift animated into its video as it happens. Adding an animation after recording does not meet the requirement. This isolated experiment checks the current Android Agora binary before replacing the production capture path.

## Run on two devices

1. Reload the Android development app and start an ordinary solo test live. Have another account watch on a second device. Party, private, and premium sessions are excluded.
2. Open the host's live menu, choose **Test live gift capture**, then **Run test**. No gift purchase or coin transfer is involved.
3. Speak and move throughout the seven-second recording. Watch for a crown that pops, rises, and fades on the second device. Confirm the camera continues normally afterward.
4. End the live. Open **Settings → Moments → Live capture test → Play raw test**.
5. Choose **Export raw MP4 + log**, select a folder, and open the exported MP4 in the phone's video player. Verify the same crown motion, microphone audio, synchronization, and approximately seven seconds of playable video.

Pass requires the animated crown in both the remote live feed and the raw exported file, synchronized audio, and a normally restored live camera. A successful SDK call or a “captured” status is not a pass. If the remote viewer sees the crown but the MP4 does not, this recorder is selecting a different video source; do not connect this approach to production Moments yet. If native mixing is unavailable, retain the error log for deciding the next implementation.

## What the test does

The current camera-overlay-v3 experiment uses Agora addVideoWatermark to draw transparent crown effect frames into the existing camera video, with visibleInPreview enabled. It requests seven seconds from the existing media recorder. It does not start a local transcoder, switch published video sources, change encoder dimensions, or create a mixed preview. See the staged test below; earlier mixer experiments remain documented as failed attempts.

The test measures its diagnostic stages after the recorder reports started. It establishes mixed-source compatibility, not the latency or completeness of automatic capture following a paid gift. Automatic triggering, sender labels, all gift assets, overlapping gifts, and production upload integration remain later work after this proof passes.

The file is read directly from the recorder output and copied unchanged for export. There is no server upload, server compositing, playback gift overlay, or phone screen capture. The JSON export contains SDK result codes and relative event times. Files and the latest result stay on the host device, grouped by account.

A normal qualifying gift cancels the test before normal recording proceeds. Leaving the live, changing supported modes, or backgrounding the app also cancels and attempts to restore publication. Cleanup failure explicitly asks the tester to end the test live. Use a test audience because this experiment temporarily changes the published video.

## Validation and scope

`node artifacts/api-server/tests/moment-proof.test.mjs` checks configuration, animation timing, restoration, cancellation, recorder failures, source conflicts, and unchanged-file export with mocked native APIs. Existing recorder and player regressions also pass. These checks do not establish native recording content; the two-device procedure above is decisive.

The test entry is gated to Android development builds. Existing Moments uploads and server post-processing are unchanged, including the previous approach that the user rejected. That approach is not used to manufacture a passing proof result.

Pre-test copies of touched existing files are in `.local/moment-proof-checkpoint/`. A rollback must remove only proof imports, controls, hooks, and new proof files. Do not restore whole snapshots over subsequent unrelated edits or revert the existing Moments feature wholesale.

## Artifact fix experiment: fixed-alpha-v2

Device feedback: the viewer and raw recording both showed the animated crown, but both also showed a black rectangle during fading and static bars. This locates the defect upstream of playback, in the published video path; the exact native cause is not yet established. The host preview did not show the crown.

The first version changed mixer layer opacity, dimensions, and coordinates every 50ms, including odd dimensions and positions. The revised test keeps two source layers and every native rectangle constant. Native coordinates and dimensions are multiples of 16; the output is 544×960. Both layers have opacity 1 throughout. Crown motion and fading are contained in 44 immutable RGBA PNG effect assets, switched at 20fps in a fixed 192×512 layer. Its border pixels remain transparent, and the final frame returns to an entirely transparent image. This removes dynamic native geometry and layer-alpha blending as variables without removing the visible pop/rise/fade. These are prebuilt gift effect assets, not post-processing of the recorded video.

For the host, the test calls `startPreview(VideoSourceTranscoded)`, recreates the rendering view when changing source, and explicitly supplies the host UID and disables mirroring for the mixed preview. Cleanup stops only this additional preview. SDK documentation permits rendering the transcoded source with the publisher UID; the prior source-property change alone was insufficient on the tester's device.

The result card and exported JSON identify `fixed-alpha-v2`. Reload the app, run the test again, and check host preview, remote viewer, and raw exported MP4 for matching crown animation, absence of black boxes/static bars, synchronized audio, and camera restoration. This is a candidate fix; no connected device is available to verify GPU rendering here. If artifacts persist, retain the raw MP4 and diagnostic log before replacing the native image compositing path.

Validation: mobile typecheck and existing player/recorder regressions passed. The proof regression checks constant aligned geometry, immutable frame selection, mixed preview startup/cleanup including failure, and real ffmpeg decoding of transparent, opaque, and fading PNGs. It still mocks Agora and cannot establish the resulting native MP4 pixels.

Reference: [Agora local image layer configuration](https://agoraio-extensions.github.io/react-native-agora/classes/TranscodingVideoStream.html). Its documented alpha range is 0–1, so the earlier value range itself was valid; the black-box cause is a device/native rendering hypothesis, not a documented SDK limitation.

## Mixer regression and replacement diagnostic: camera-overlay-v3

The tester reported that fixed-alpha-v2 eliminated the crown rectangle but made the whole video static. The v2 change failed device validation. This does not establish whether image replacement, the transcoder, output configuration, or preview initialization caused the corruption. Do not characterize it as a confirmed alignment fix or a working production solution.

The v3 test removes all local transcoder calls, video publication switches, output encoder configuration, and mixed-preview changes. It uses the existing camera and Agora's native PNG watermark API, including visibleInPreview. No other watermark feature is currently implemented in the app. The test clears its watermark on completion/cancellation/failure and keeps raw recording/export separate from server processing. The installed wrapper exposes addVideoWatermark; although its documentation marks it deprecated in favor of a newer API, that successor is not exposed by this installed wrapper. Native support and recording of watermark pixels still require the device test.

Start a fresh test live after reloading the app so the failed mixer session is closed. The test confirmation and saved result identify v3 / camera-overlay-v3. Stay live until capture completes. Watch the host, second device, and exported raw MP4:

- 0–1s: untouched camera baseline, no watermark API calls.
- 1–3s: stationary crown, applied once.
- 3–5.2s: moving/fading crown; transparent effect PNGs replace the watermark at 20fps.
- 5.2–7s: crown cleared, camera only.

Report which stage first shows static. A clean still-crown stage followed by corrupt animation narrows the problem to frequent image updates. Corruption during the no-overlay baseline points outside crown compositing. A clean live view but a different raw file identifies a recorder-path difference. These are diagnostic interpretations, not guaranteed root causes. Do not integrate with paid gifts until all views and the raw file pass.

Mobile typecheck, recorder/player regressions, and the revised proof regression passed. The proof harness rejects any mixer, encoder, publication, or preview-source changes, verifies that the stationary phase applies one image, and checks watermark removal on error/background/gift cancellation. Source PNG alpha is decoded with ffmpeg; native stream rendering remains unverified here.

## Placement follow-up: centered-overlay-v4

The user reported clean v3 video, with the crown on the left of the streamer's own preview and on the right of the recording. The streamer preview defaults to front-camera mirroring; this is consistent with the horizontal reversal. The second viewer's placement was not reported. The initial overlay also used a fixed top offset rather than centering the visible crown within its tall transparent sprite.

V4 preserves the camera watermark recording path and staged timing. It computes placement from Agora's measured encoded frame dimensions (onLocalVideoStats), centering the stationary crown's actual sprite point (96,320) in the video. Dimensions are retained only for the matching engine/channel, and the test refuses to guess if statistics are not available yet. Sprite scale fits portrait and landscape frames. During proofBusy only, the host canvas uses mirrorMode 2; normal selfie mirroring returns afterward. No encoder/publication/source switch is introduced. Capture still requires visual confirmation in host preview, second viewer, and raw recording.

The proof regression verifies the crown center and transparent sprite bounds in portrait, landscape, and 4:3 dimensions, plus missing-dimension handling and existing overlay lifecycle behavior. The source file is still unmodified when recorded or exported.

## Placement regression: pixel-overlay-v5

The tester reported v4 matched between live and recording, but the crown was larger and half clipped off the right edge. Thus preview consistency improved, but the ratio-mode placement was not valid on the device; the math-only test did not establish native placement. The exact native coordinate/orientation interpretation remains unconfirmed.

V5 keeps the clean camera-watermark capture path and test-only unmirrored host preview. It removes watermarkRatio entirely and uses mode 0 (FitModeCoverPosition), providing both portrait and landscape pixel rectangles from the measured short/long encoded dimensions. Both center the visible still-crown point at source (96,320), preserve the 192×512 sprite aspect, fit the complete animation sprite, and cap visible crown width below 94 encoded pixels. Options stay fixed throughout each recording. No video encoder, source, or mixer changes are made.

The result identifies pixel-overlay-v5 and shows measured dimensions. Exported JSON includes both placement rectangles so a remaining discrepancy can be investigated from actual values rather than another guessed offset. The regression verifies pixel bounds, crown center in both orientations, size cap, absence of ratio configuration, and persisted placement. Repeat the test on a fresh live and compare host, viewer, and raw recording; native coordinates still need device verification.

## Approved size increase: double-crown-v6

The user confirmed v5 was centered and explicitly requested double the crown size. V6 doubles the visible crown (approximately 92 to 184 video pixels at the capped size) while retaining its centered still position and previous rise distance. Doubling the entire old sprite would also double the rise and clip the animation in landscape, so the effect assets instead use double-sized art in a 384×576 transparent sprite, with the still crown centered at (192,384). Portrait/landscape rectangles are recalculated around that point. The complete sprite fits both orientations in the checked dimensions. Native camera overlay, recording, mirroring, and test timing remain unchanged.

The regression verifies exactly twice the previous visible crown width, centered positions, sprite bounds, preserved aspect ratio, and decoded PNG transparency. Result label: double-crown-v6. Physical rendering still requires the phone check.

## Production follow-up

The user confirmed v6 worked on device and approved production integration. The shared artwork now uses a 512px crown source without changing geometry; the proof revision is `live-crown-hd-v1`. The staged diagnostic remains available for comparison, while paid Crown gifts use immediate animation after the recording starts. Raw Moments now bypass the removed server compositor. The paid-gift integration and sharper asset still require a new phone comparison; do not describe mocked checks as that device test.

The later user correction prohibits flipping the camera preview during a gift. The test and production host canvas now both retain normal preview mirroring for the whole live; the temporary unmirrored override described in older experiments has been removed. Native watermark placement and recording remain unchanged.
