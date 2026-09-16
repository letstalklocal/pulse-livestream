# Stream navigation and swipe transitions

Recorded: 2026-09-16. This is the accepted behavior to preserve on iOS and Android. Later explicit user decisions take precedence.

## Expected behavior

- Opening a viewer stream opens a regular full-screen navigation page (`presentation: "card"`, `animation: "none"`, `gestureEnabled: false`), not a full-screen modal. “Card” is the navigation option name; the viewer still fills the screen. This requirement applies to `stream/[channelId]`, not the broadcaster's `go-live` screen.
- On an upward swipe, the current stream slides up while the incoming stream preview enters from below. A downward swipe reverses the movement. Preserve the simultaneous 320 ms animation. The current implementation starts the animation on swipe release, rather than tracking the finger continuously.
- Streams loop in both directions: up from the last opens the first; down from the first opens the last. Boundary swipes must not return to Discover/Home. With zero or one listed stream, or if the current stream is absent from the list, a swipe stays on the current screen (existing warning haptic). Explicit close and Exit Live still leave the viewer.
- First visits and repeat visits should transition without exposing Discover or showing an unintended color/white/black flash. Do not mask a regression by adding a black background to the viewer root or a stream-specific black navigation content background: the user explicitly rejected those additions. Existing video/loading/no-image background styles were not removed.
- Swipe right to hide the viewer messages/controls; swipe left to restore them. Native iOS swipe-back must be disabled on the viewer route so it cannot intercept this gesture and exit to the previous screen. Preserve the 240 ms overlay animation, keyboard dismissal on hiding, party-window gestures, chat and keyboard behavior, gifts, and access rules. This transition work does not authorize redesigning them.

## Display sleep while watching

User reported iPhone auto-locking after its display timeout while watching. The viewer must keep the display awake while its route is focused and stream access is allowed, including demos, regular/party lives and video connection/loading after admission. Release the viewer's lock when leaving/covering the route, when access is removed, or when the stream ends. Normal system sleep behavior resumes when no other screen holds a keep-awake lock. Manual locking and backgrounding remain OS-controlled.

The viewer now conditionally mounts `StreamViewerKeepAwake`, using the existing `expo-keep-awake` dependency and a unique per-instance lock. The host already has its own broadcast lock and is unchanged. This display fix is separate from the confirmed navigation-flash fix. Device verification is pending: watch longer than the configured auto-lock timeout without touching the screen, switch streams, leave to another page, test stream end/removal, and background/return on iPhone and Android.

## What actually slides in today

The incoming layer is a preview, not a preconnected live-video page. For demos, `StreamBackdrop` renders `DemoVideo`: an animated category-colored background with category initials. For real streams, it renders the host's saved background image with a dark overlay, or the existing black fallback if no image exists. The preview contains neither live video nor stream controls.

`navigateToStream` animates the outgoing screen and preview together. When the animation completes, it calls `router.replace` to open the destination stream screen. The preview remains visible on the outgoing screen until that navigation handoff. The destination handles stream details/access and connects to live video; its background/loading view remains until video is ready. This is not a guarantee that the preview persists until the first video frame.

The real demo screen resolves its category from stream details, falling back immediately to the cached stream-list category. The preview also uses the list category. Preserve this fallback: waiting only for destination details previously caused a first-visit default-category color mismatch, while repeat visits had cached details. Background-image prefetching does not preload live video.

An alternative using one persistent viewer with the actual adjacent stream prepared ahead was discussed, but was not implemented or selected. Do not describe the current implementation as already preloading live video or silently replace it with that design.

## Confirmed history and limits

- User reported no iPhone flash in TestFlight build 4 and a translucent Discover flash in build 9, after the next preview had fully entered. Builds 5–8 were not confirmed tested; the introducing build/commit is unknown.
- Android initially appeared unaffected, then the user noticed a faint whitish/translucent flash only on first visits to each demo stream. Revisiting those streams did not flash. iPhone flashed on every transition.
- Changes retained: regular stack page presentation, cached demo-category fallback, and bidirectional looping. Added black root/route backgrounds were removed at the user's request. The user accepted page navigation and required the original swipe animation to remain unchanged.
- After rebuilding iPhone, the user confirmed “issue is fixed in iphone.” The new build number was not supplied. This is user device confirmation, not an assistant visual test. It confirms the combined result, not which individual change fixed it or what originally caused it.
- Mobile TypeScript, diff formatting and boundary logic checks passed during implementation. These do not establish native rendering or gesture correctness.
- The final Android report (“now more flashe”) was ambiguous and not clarified. Do not mark Android fixed or worsened based on that wording. Real-stream coverage and individual loop/exit device cases were not separately confirmed.

See [Apple/TestFlight fixes](apple-testflight-fixes.md#iphone-demo-stream-transition-regression--2026-09-16) for the chronological record.

## Troubleshooting and regression checks

1. Record platform, installed build number, last known working build, demo versus real stream, first visit versus repeat, and whether the flash happens during the slide, after the preview fills the screen, or when live video appears. Compare exact build revisions when available; a publication commit is not automatically the installed native build. The connected EAS history during this investigation only returned completed iOS build 2 and could not map builds 4–9.
2. Check navigation presentation, route/root backgrounds, incoming preview, destination category fallback and transition-reset timing. A cached first-visit difference and a native navigation exposure are separate hypotheses; do not claim a proven common cause without evidence.
3. Test a fresh app opening and first/repeat traversal of demos on both platforms. Watch background color, initials and Discover exposure before and after the 320 ms handoff.
4. Test real streams with and without saved backgrounds, including slow loading. Confirm the background-to-video handoff, correct host video/audio, and access restrictions. Do not bypass Premium/private admission to preload content.
5. With multiple streams, cross both first/last boundaries repeatedly, reverse direction, and verify explicit exit. Also check empty/single-stream lists and a current stream missing from the refreshed list.
6. Verify horizontal control hiding/restoring, party-window interactions and relevant [chat/keyboard regressions](chat-message-preferences.md#regression-review-when-changing-chat). Keep unrelated approved behavior intact.
7. Report type/build checks separately from actual device checks. Change one suspected cause at a time when isolating a recurrence; do not add a masking background or revert approved navigation without an explicit new decision.

## Implementation locations

- `artifacts/mobile/app/_layout.tsx`: viewer stack presentation and shared navigation background.
- `artifacts/mobile/app/stream/[channelId].tsx`: `DemoVideo`, `StreamBackdrop`, list/category fallback, next/previous selection, `navigateToStream`, swipe handlers, incoming overlay, destination loading and video readiness.
- `artifacts/mobile/components/PartyStage.tsx`: main video area and party-window interaction.

## iPhone horizontal swipe-back conflict — 2026-09-16

After accepting regular page navigation, the user reported that right-swiping exited to the previous screen instead of hiding live messages. The viewer route had `presentation: "card"` without disabling native navigation gestures. Added `gestureEnabled: false` on this route only, allowing the existing horizontal PanResponder to handle hide/restore. Preserve page presentation, vertical transitions/looping, explicit close/Exit Live, Android system Back and other routes' navigation gestures.

Device checks pending: on iPhone swipe right from the left edge and the center, including over messages, and confirm overlays hide without leaving the stream; swipe left to restore. Repeat with keyboard open (hide dismisses it), on demos/real streams and after vertical navigation. Verify vertical looping, party-window gesture isolation and explicit exit; compare Android. Typechecking does not prove native gesture arbitration.
