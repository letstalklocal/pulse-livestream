# Required viewer and broadcaster regression checks

Recorded September 16, 2026. The user explicitly requires these app-specific behaviors to be checked whenever viewer or broadcaster functionality changes. They are acceptance requirements, not optional polish. Read this document before edits to either stream screen or shared stream controls. Preserve previously approved behavior; do not roll back unrelated fixes.

## Always check

- **Screen awake:** active broadcasting and focused/admitted viewing must prevent automatic display sleep on Android and iPhone, including demos, regular/Premium/party streams, loading/reconnecting, hide/show overlays and in-stream sheets. A foreground return must restore protection. Ending/leaving a live must release that screen's lock without releasing another active screen's lock. Viewing a blocked/admission/ended page must not retain the viewer lock. Backgrounding and manual locking remain OS-controlled.
- **Navigation:** preserve regular viewer page presentation with native back gestures disabled, 320 ms simultaneous vertical slide and bidirectional looping. First/last swipes never exit. Explicit chevron/Exit Live does exit. Right swipe hides controls; left restores them. No Discover flashes or masking background additions. See [stream navigation](stream-navigation.md).
- **Keyboard and layout:** broadcaster top and bottom docks remain independently anchored; closing the keyboard restores the bottom controls to the bottom. Preserve full-width live composer, visible Send, draft/focus, message translation and long-press actions. Do not treat Android as iPhone or assume a platform. See [chat/message requirements](chat-message-preferences.md).
- **Header:** viewer exit chevron, 28-point avatar and tightened username spacing; compact 9-point PREMIUM tag below the coins/viewer pill with a 1-point gap. The tag must not push the header down. Both host and audience use the combined pill design. Preserve private/party counter sources and moderation permissions.
- **Live Viewers sheet:** host sees merged roster/top gifters and Restricted controls; audience sees ranking data only, never the host roster or restriction state. Search starts hidden and toggles from its header icon. Streamer close X is top-right; selected avatar opens profile; no separate View profile or Back to viewers action. The list closes after 10 seconds of inactivity; touches, typing and scrolling reset the timer. Pause auto-close while the selected-viewer moderation panel or a moderation mutation is active. Closing/unmounting cancels the timer.
- **Premium/media:** preserve admission/payment restrictions, public-to-Premium channel reconnect, free/paid admission, gift ownership/totals and singleton-engine cleanup. A display-only change must not alter these. See [coins/Premium requirements](coins-premium-revenuecat.md).

## Required verification workflow

1. Identify affected platforms, host versus viewer, live mode and exact installed build. Check the existing working-tree changes; do not mistake unbuilt code for what is on a phone.
2. Run the fast stream regression suite after stream functionality changes:
   `node artifacts/mobile/tests/stream-screen-regressions.cjs`
3. Run mobile typechecking for changed TypeScript. Run localization checks if visible text changes. Add focused tests only for new behavior/races/access rules that existing checks do not cover; trivial spacing changes do not require mirrored implementation tests.
4. Check the relevant device cases on **both Android and iPhone**. For sleep prevention, set a short display timeout, broadcast/watch untouched for at least twice that timeout, repeat after background/foreground, profile return and native sheets, then end/exit and verify normal sleep resumes. Also check the host keyboard dismissal case and viewer exit/swipe case after shared-screen changes.
5. Record separately: automated results, actual device results, user confirmations, suspected causes and unverified cases. A typecheck/mock test is not native/visual proof. If no device is available, explicitly leave those checks pending rather than calling the regression fixed on-device.
6. Native changes require rebuilt binaries. The user is starting builds; do not start a build or production deployment without a new instruction. TestFlight uses Replit production (`chimbalivestream.replit.app`); the workspace-linked EAS configuration was stale at last inspection and must not silently switch the build back to development.

## Current screen-awake repair

The original Expo hook activated once and swallowed activation errors. In expo-keep-awake 57.0.1, both native implementations also skipped reapplying the native setting when a tag already existed. This is a confirmed recovery gap; the exact native event behind the reported Android broadcaster sleep was not captured. The user initially said iPhone, corrected the affected device to Android, and explicitly requested protection on both platforms.

`useStreamKeepAwake` now creates an independent lease per mounted stream, retries/reasserts every 10 seconds while foregrounded and immediately on foreground return, logs activation failure, and serializes release after any in-flight activation. Existing host/viewer mount/access conditions remain intact. The checked-in pnpm patch makes activation reapply Android's window flag and iOS's idle timer even for an existing tag, preserving the existing multi-tag release behavior. `pnpm-workspace.yaml`, `pnpm-lock.yaml` and `patches/expo-keep-awake@57.0.1.patch` must ship together. Do not remove the patch on an SDK upgrade without replacing its behavior and repeating the device checks.

Mocked tests validate retry/renewal, background suppression, independent cleanup and late activation, plus sheet deadlines/reset/pause/unmount. They do not compile native code or prove an OS/window transition on a phone. Rebuilt Android and iPhone timeout checks remain pending.

Validation completed for this change: the combined seven-script stream regression suite, mobile TypeScript, diff formatting, and an offline frozen-lockfile install passed. The install verified that the checked-in native patch applies without upgrading dependencies. No native Android/iOS build or phone Auto-Lock test was performed.
