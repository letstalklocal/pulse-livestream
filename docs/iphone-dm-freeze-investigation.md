# iPhone DM freeze investigation

Updated September 18, 2026. Status: unresolved; original navigation restored for the next device test. Do not describe any change below as a confirmed freeze fix.

## Reported behavior

- Production conversation: `javilo2` and `bonnnie7` (three n's). The initial spelling `bonnie7` was incorrect.
- Bonnie opens the conversation from the chat list. Messages and the message-writing box are visible, but the box and Back button do not respond to taps. User reports this occurs repeatedly, including after restarting the app.
- Bonnie can use demo chats. Javilo can open the shared conversation on his own iPhone. This narrows the issue but does not establish that Javilo's account itself is faulty.
- Initially, latest messages and the unread badge appeared missing. After testing the refresh changes, the user confirmed Bonnie sees new messages but the screen still freezes. Receiving messages therefore does not resolve the touch problem.
- Both users reportedly follow each other and sent Roses. They also tested private 1:1 sessions; both cards now show Ended. The user initially excluded this topic, then explicitly reopened it as possible context. Do not treat the timing correlation as proof of causation.

## Changes and verification

| Change | Status and limits |
| --- | --- |
| Immediate DM refresh when the chat list or individual conversation gains focus | Implemented in commit `4fd1fe7`. The regular 2.5-second polling remains. User subsequently confirmed new messages display while taps remain unresponsive. |
| Initial unread badges use incoming messages with null server `readAt` | Implemented in `4fd1fe7`. Counts are derived from returned history; do not claim a dedicated server unread-count endpoint or complete cross-device reconciliation. No explicit badge device confirmation recorded. |
| Retry initial list positioning after message updates while the list is not yet positioned | Implemented in `4fd1fe7`. Controls list setup; no evidence it disables Back or the input. Not a confirmed freeze fix. |
| Share a single DM refresh across simultaneous timer/focus triggers | Implemented in `1ad8ae7`, using `dmSyncRunner.ts`. Includes a 15-second deadline, cancellation on provider cleanup, and checks preventing cancelled work from applying data. No device result isolating this change recorded. |
| Disable slide animation only | Brief local diagnostic change; superseded by restoring the original route. No isolated device result recorded. |
| Restore original DM navigation | Current route has only `headerShown: false`, as before the custom slide change. Removes the `transparentModal`, explicit animation, and 40 ms duration overrides. Device test pending. |

Earlier experiments adding conversation-list entries to the established-chat check, resetting the Back guard on focus, and changing the media chooser's interrupted-animation close callback were reverted during this investigation. Do not list them as active fixes.

Automated: mobile typechecks and diff checks passed for the relevant changes. Focused executed checks for the refresh runner passed shared requests, release after success/failure, timeout, and cancellation. Existing chat-status request tests also passed earlier; these do not reproduce this touch freeze. No native automated reproduction or affected-phone trace was captured.

Separate bundled work made follower/following lists owner-only, with backend authorization and disabled links on other profiles. This was not a freeze fix. API/mobile typechecks and API build passed; the restarted development endpoint rejected unauthenticated access. This does not constitute authenticated production privacy verification.

## Database evidence supplied by the user

The workspace connection was not verified as production. The user ran read-only queries in the production database and pasted the results. Do not claim the assistant directly inspected production or changed its records.

The supplied conversation records contain text and two private-session cards (IDs 25 and 26), with no media/video messages, video content types, or media file references. The attempted video had no visible bubble. This rules out a saved video message in the supplied thread results as the item being loaded. It does not establish whether an orphan upload exists in storage, which was not checked.

Message 43 was marked read at September 18, 16:12:16 UTC. Message 47 was newly sent at 18:19:15 UTC and unread; the user clarified it had just been sent. Its unread status is not evidence of failure. Read timestamps are recorded automatically and do not prove the screen accepted touches. IDs 44–46 were absent from these results; message IDs are global, and their absence is not evidence of lost messages in this thread. Their contents were not queried.

## What the evidence does and does not support

- **Refresh failure as the sole cause:** does not explain the later observation that new messages display but controls remain unresponsive. Refresh improvements should not be presented as resolving the freeze.
- **Overlapping refreshes:** a real code-level reliability gap was addressed. New messages loading does not prove overlap never occurred, but there is no evidence linking overlap to the touch freeze.
- **Rose/follow restrictions:** server rules allow existing conversations and the recipient-following-sender exemption. These rules do not disable Back. Actual production authorization responses were not captured.
- **A pending private-session lock:** both cards reportedly show Ended. Code uses pending mutation state for the relevant card/action buttons, not the chat input or Back. Card rendering remains an untested possibility, not an established cause.
- **The attempted video:** no saved media message in the supplied results. A separate code issue was found: direct video URLs are passed to image components with a play icon rather than a video player. It was not changed and does not explain this thread without a video record.
- **HTTP 304/cache theory:** the earlier claim was overstated and retracted. Server 304 logs alone do not establish that application code received a raw 304 or missed changed messages. No caching fix was applied as part of this investigation.
- **An invisible modal/touch layer:** possible in principle, but not observed or confirmed on Bonnie's phone. A failed media-sheet dismissal was only a hypothesis and its speculative edit was reverted.
- **List positioning:** failed scroll-to-index attempts retry every 100 ms without a retry limit. That warrants investigation if the navigation test fails, but it is not proof of a busy loop or whole-screen freeze. List-positioned state controls list visibility, not the availability of Back or the input.

## Navigation finding and current test

Before commit `93a1e0d`, the DM route used `options={{ headerShown: false }}`. The custom slide change introduced `presentation: "transparentModal"`, `animation: "slide_from_right"`, and `animationDuration: 40` to retain the chat list underneath.

The installed react-native-screens source documents `slide_from_right` as Android-only, falling back to the default on iOS. On iOS, transparent-modal presentation maps to an over-full-screen native modal. This explains the user's observed bottom-up presentation rather than the intended horizontal slide. It does not prove that presentation caused the freeze: demo chats used the same route and worked.

The user requested restoring the original route, rather than merely disabling its animation. That restoration is now in source and passes mobile typecheck. It uses the navigator's default presentation and transition; do not call it an instant/no-animation route.

Next device check: record Bonnie's installed build number, reopen the affected production conversation, verify newest messages, tap/type/send, and use Back. Compare a working demo conversation and, if available, another real-user conversation. Check Android navigation too. Record each result separately. If the freeze persists, capture native/runtime evidence and inspect thread-specific rendering, unread positioning, and touch handling before making another speculative change. Do not delete messages or modify production session/payment records as a diagnostic shortcut.

See [chat requirements](chat-message-preferences.md) for preserved keyboard, composer, reply, receipt, and navigation behavior.
