# Stream navigation and swipe transitions

Recorded: 2026-09-16. This is the accepted behavior to preserve on iOS and Android. Later explicit user decisions take precedence.

## Expected behavior

- Opening a viewer stream opens a regular full-screen navigation page (`presentation: "card"`, `animation: "none"`, `gestureEnabled: false`), not a full-screen modal. “Card” is the navigation option name; the viewer still fills the screen. This requirement applies to `stream/[channelId]`, not the broadcaster's `go-live` screen.
- On an upward swipe, the current stream slides up while the incoming stream preview enters from below. A downward swipe reverses the movement. Preserve the simultaneous 320 ms animation. The current implementation starts the animation on swipe release, rather than tracking the finger continuously.
- Streams loop in both directions: up from the last opens the first; down from the first opens the last. Boundary swipes must not return to Discover/Home. With zero or one listed stream, or if the current stream is absent from the list, a swipe stays on the current screen (existing warning haptic). Back/chevron leave the viewer page and, when enabled and admitted, keep that live in a bottom-right in-app picture-in-picture window. Exit Live fully stops viewing. See the September 17 PiP requirement below.
- First visits and repeat visits should transition without exposing Discover or showing an unintended color/white/black flash. Do not mask a regression by adding a black background to the viewer root or a stream-specific black navigation content background: the user explicitly rejected those additions. Existing video/loading/no-image background styles were not removed.
- Swipe right to hide the viewer messages/controls; swipe left to restore them. Native iOS swipe-back must be disabled on the viewer route so it cannot intercept this gesture and exit to the previous screen. Preserve the 240 ms overlay animation, keyboard dismissal on hiding, party-window gestures, chat and keyboard behavior, gifts, and access rules. This transition work does not authorize redesigning them.

## Display sleep while watching

User reported iPhone auto-locking after its display timeout while watching. The viewer must keep the display awake while its route is focused and stream access is allowed, including demos, regular/party lives and video connection/loading after admission. Release the viewer's lock when leaving/covering the route, when access is removed, or when the stream ends. Normal system sleep behavior resumes when no other screen holds a keep-awake lock. Manual locking and backgrounding remain OS-controlled.

The viewer conditionally mounts `StreamViewerKeepAwake` with a unique per-instance lock. Both the host and viewer now use the shared retry/foreground-renewal hook and native reassertion patch described in [required stream regressions](stream-screen-regressions.md#current-screen-awake-repair). Their existing mount/access conditions are preserved. This display fix is separate from the confirmed navigation-flash fix. Device verification is pending: watch longer than the configured auto-lock timeout without touching the screen, switch streams, leave to another page, test stream end/removal, and background/return on iPhone and Android.

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

## Host identity placeholder — 2026-09-16

User noticed a question mark in demo host avatars. The viewer header now uses the detail-response host name with the cached stream-list name as its immediate fallback for both initials and name. If neither exists, show a person icon rather than a question mark. This changes display only; do not use cached display metadata to bypass admission or change gift recipients. Typecheck validation is separate from pending first-entry/swipe device appearance checks.


## Viewer exit button and Premium label — September 16, 2026

User requirement: a visible left chevron before the host avatar exits the live, and the avatar is slightly smaller to make room. The viewer header now uses a 28-point avatar (reduced from 40, then 32, at the user’s request) with a separate 44-by-44 exit button. Tapping the avatar still opens the host profile; tapping the chevron uses the same navigation-back action as the existing Exit Live menu item. Long host names truncate within the available space. The username is shifted 6 points closer to the avatar at the user’s request, reducing that visible gap without moving the avatar or counter. The user subsequently requested a tighter chevron/avatar gap and a slight left shift: the group now has a -10-point left margin and no inter-button gap, and the chevron sits toward the avatar within its unchanged 44-by-44 touch target. The latest spacing adjustment left-aligns the smaller avatar in its existing touch target and reduces the chevron’s right padding to 2 points, bringing them closer without shrinking either touch target.

The user clarified that viewers currently lack a Premium indicator and requested the same tag as the broadcaster. Latest user placement decision: put the Premium tag directly underneath the coins/viewer counter, superseding the earlier inline placement. Premium viewers now see the compact broadcaster-style pink badge, white dot and uppercase PREMIUM text centered beneath the stats pill with a 1-point gap (raised 3 points at the user’s request). The badge is positioned relative to the stats group without increasing the header height or pushing the top bar down. The badge uses 9-point text (the user preferred this size after trying 10), a 5-point dot and smaller padding; the header uses a 6-point gap. Host names truncate to make room without adding another row. The tag follows the current stream's server-provided required gift, remains after paid/free admission, and disappears when the stream is no longer Premium or ends. It belongs to the existing overlay, so horizontal swipes hide/restore it with the other controls. Public/demo streams do not receive a Premium tag. This is display/navigation only; admission, payments, channel switching and swipe behavior are preserved.

Verification: mobile typecheck and diff formatting checks; native visual/device checks remain pending. Check regular/Premium viewers, live conversion and admission, long host names, small screens/safe areas, avatar profile navigation, chevron exit after vertical swipes, and hiding/restoring overlays. No build was started; the user will start the next build.


## In-app picture in picture — September 17, 2026

Latest user requirement: Back must navigate to the same previous page it did before, while the current live continues in a small window at the **bottom right**. Opening the viewer’s existing message/chat action also minimizes the live and opens that conversation. This supersedes the older requirement that the chevron always stops viewing. Vertical looping/320 ms transitions, regular card presentation, disabled native back gestures and horizontal overlay gestures remain unchanged.

- Default window: 112 × 199 points (9:16 portrait), above the bottom tabs/safe area. Tapping enlarges it to 192 × 341 (bounded by the available window, 9:16 portrait), exposing gear, outward-arrow return-to-live, and X in one transparent top row. It moves above an open keyboard. The player can be dragged within safe bounds. The resize keeps the nearest bottom corner fixed and animates over 550 ms.
- Expand returns to the **same live viewer in the feed**, retaining private-invitation parameters. X stops playback and clears the window. The existing **Exit Live** menu also fully stops playback. This is in-app PiP, not OS/home-screen PiP.
- Gear opens **Settings → General → Picture in picture**. The switch defaults on and persists on this device. Turning it off closes an existing PiP; later Back uses the prior exit behavior. Failed saves preserve the previous preference and expose a retry message.
- **Premium viewers must not be kicked out by Back.** Keep their admitted/free-entry connection and presence alive without another admission payment or token join when minimizing/expanding. Admission cannot be bypassed. A new public-to-Premium admission requirement returns to the existing entry screen. A timed gift keeps its countdown and a tappable return-to-payment prompt in PiP; Back itself does not kick the viewer back into fullscreen. Removal, blocking, expiry and stream end still stop media. Account changes and opening the broadcaster also clear viewer media.
- A root playback provider owns the existing Agora lifecycle, access monitoring, presence and party connection. Screen unmount after Back no longer destroys an explicitly minimized session. The message action replaces its viewer route when minimizing so closing PiP cannot leave a hidden viewer behind the DM. Fullscreen swipe navigation still replaces the viewer as before.
- Agora live-feed previews pause while a viewer session exists or the broadcaster is open, since they otherwise initialize/release the same singleton engine. Recorded-video card previews use Expo Video and the shared file cache, so this Agora restriction does not apply to them. Saved thumbnail backgrounds remain visible. Android PiP uses TextureView for clipping; iPhone uses its supported UIView renderer and a nonmodal FullWindowOverlay above native navigation.
- The floating admitted player holds its own foreground keep-awake lease. Closing/end/access loss releases it; existing viewer/host lease behavior remains separate.

Automated checks: dedicated mocked lifecycle/UI tests cover Premium/regular Back retaining connection and presence, locally confirmed admission before query refresh, expansion without rejoin, X/disable, failed preference writes, account/host/end/restriction/expiry cleanup, late token cancellation, sizes/controls/keyboard offsets and platform renderer selection. The existing singleton Premium token-race tests now target the relocated media lifecycle. Required stream regressions, mobile TypeScript and all ten localization catalogs are checked separately from devices.

Device verification confirmed by the user on **TestFlight iPhone and Android build**, installed build numbers unknown: dragging; 9:16 sizing; nearest-bottom-corner anchored expansion; 550 ms smooth resize; return-to-live arrows; transparent controls; real audio/video continuity on Back/chat/expand; Premium paid/free entry and timed gifts; private/party streams and partner audio; feed browsing without preview-engine interference; close/disable/relaunch; background/foreground and short display-timeout checks; keyboard/composer clearance and touch-through; small screens/rotation; explicit exit, vertical loops, horizontal overlay gestures, headers and viewer sheets. User reports all requested PiP behavior works on both builds.

### Device confirmation — September 17, 2026

The user confirmed the complete PiP experience works in the TestFlight iPhone build and Android build: dragging, 9:16 portrait sizing, smooth 550 ms expansion, nearest-bottom-corner anchoring, transparent top-row controls, return-to-live arrows, close, General setting, and Premium playback after Back.

### Cached videos alongside live PiP — September 21, 2026

User reported cached videos were blocked while a live PiP session was active, with the prototype asking them to close the live player. Removed the Agora preview guard from the original prototype, recorded-video viewer and muted recorded-video feed previews. These continue using the same file cache and CachedVideoPlayer. Preserve Agora live-preview suppression, the live session and Premium admission. Foreground/focus visibility and cached-player cleanup remain. Native simultaneous playback/audio and screen-awake verification on Android/iPhone remains pending.
