# Chat and message preferences

Recorded: 2026-09-10

This document records the user's decisions from the chat-settings conversation and the current implementation that must be preserved. Later explicit user instructions take precedence. Do not treat a request to adjust one detail as permission to redesign or remove another feature. Implementation details below describe the current baseline; they are not additional product requests.

## Keyboard and composer — preserve these behaviors

- **No extra gap between the chat composer and the keyboard.** Do not add the bottom safe-area inset above an open keyboard. Restore the safe-area inset when the keyboard closes. Normal internal composer padding is distinct from an extra strip between the composer and keyboard.
- **Sending must not dismiss the keyboard.** Keep the input mounted, focused, and editable during the request so the user can continue typing. Prevent duplicate sends through the send action, not by disabling the text input.
- The placeholder is exactly **`Type...`**, with three periods. Do not include “Message” or the recipient's name.
- On the first typed character, expand the input horizontally and smoothly hide the media and gift buttons. Keep the send button visible.
- When the text is sent or cleared, restore the input's previous width and the media and gift buttons. Keep keyboard focus throughout this transition.
- Preserve the restored animation: width and opacity change together. The later experiment that faded icons first and delayed the width change was explicitly rejected and reverted.
- Current animation baseline: React Native `Animated.timing`, 180 ms, cubic ease-out; accessory width 92 to 0, opacity 1 to 0. Respect reduced-motion settings. These values describe the existing implementation, not a request to retune it.
- Preserve the draft and reply context on failure. Do not overwrite a newly typed draft with the previous failed message.

## Message time and double-check indicators

- Display the message's **local time**, using the viewing device's locale/timezone. It is the message timestamp, not the current clock time.
- Put time **before** the double-check, inside the message bubble.
- Keep message text, time, and double-check in the **same text flow**. For a short message, all fit on one line. Wrap the trailing time/check only when there is insufficient room.
- Do not put the time/check in a permanently separate row under the text or outside the bubble.
- Outgoing messages show a **double-check before read in a lighter shade**; use the full shade once a read receipt is available.
- Do not replace the double-check with the word “Read.” The accessibility label may still say “Read” or “Sent.”
- Incoming messages have a timestamp but do not show an outgoing-message double-check.
- Respect the recipient's Read Receipts preference. When receipts are hidden, do not expose read state; retain the lighter indicator.
- Media, media packs, and invitation read indicators remain inside their message cards. Current inline local-time rendering is implemented for text/gift bubbles; do not describe timestamps on every media card as already implemented.

## Swipe to reply

- Swipe right on a message to select it for a quoted reply.
- Show the selected message's sender and a short preview above the composer, with a cancel control.
- Focus the composer when selecting a reply.
- Include the quote inside the sent reply bubble, above the new reply text.
- Replies persist through reloads and appear for both participants. The server must verify the original message belongs to the same conversation.
- Text replies can quote text, gifts, media, media packs, and private-live invitations. Use suitable labels for non-text content rather than exposing protected media.
- Preserve the reply selection on a failed send; clear it after success, cancellation, or switching conversations.
- Keep swipe-to-reply compatible with vertical message scrolling, existing translation gestures, and blocking.
- Current scope: sending a text reply to a selected message. Quoted attachment replies and tap-to-jump behavior were not requested or implemented.

## Chat header and reporting

- Use the header's three-dot menu for reporting/blocking.
- **No three-dot/report buttons beside individual messages.** The user explicitly rejected those controls. Do not restore them or substitute a new per-message reporting gesture without a request.
- Header avatar is **40 px**. The 46 px version was rejected as too large; the original 34 px size was enlarged to the current 40 px.
- Show a small green online dot at the avatar's bottom-right when the person is online. Current dot: 11 px with a 2 px outline matching the background.
- Do not display the word **“Online” below the name**. The dot replaces it.
- Offline last-seen text remains below the name when available and permitted by the person's preference.
- Last Seen uses elapsed time: under one minute “Last Seen just now”; under an hour “Last Seen 10 mins ago”; from one hour “Last Seen 1 hour ago”; from one day “Last Seen 1 day ago”. Use whole elapsed units and singular/plural correctly.
- At seven days or older, show “Last Seen” followed by the device-local date, with no time. Refresh relative labels while the chat is open. This changes last-seen status only; message-bubble timestamps still show local time.
- Hide online/last-seen information when privacy settings or blocking prohibit it.

## Messages Settings

Use these labels:

| Setting | Behavior |
| --- | --- |
| Last Seen & Online | Controls whether other people can see this account's online/last-active status. |
| Read Receipts | Controls whether other people can see that this account read their messages. |
| Send Gift to Chat | Controls Rose activation for new chats from people this account does not follow. |

- The exact final label is **Send Gift to Chat**, not “Send Gift to Open Chat.”
- Required gift is **Rose, 1 coin**, for now.
- Follow direction matters: **if the recipient follows the sender, the sender can chat freely. Otherwise, when this setting is enabled, the sender must send the recipient a Rose to activate the chat.** The sender following the recipient alone does not provide an exemption. Mutual following is not required.
- Existing conversations stay open; do not charge per message.
- A successful qualifying Rose activates chat. Insufficient funds must not activate it. Retrying the same payment must not charge twice.
- A live-stream Rose or a different gift does not count as the current DM Rose activation payment.
- Blocking overrides chat activation, gift payment, and follow relationships.
- Enforce the requirement on the server for text, media, media-pack sends, and private-live invitations; hiding the composer alone is insufficient.
- Current implementation defaults: all three settings enabled, required gift `rose`. The conversation explicitly fixed Rose and follow direction; these defaults describe the existing implementation.

## Host live-stream composer

Build timing and per-fix verification are tracked in [Apple / TestFlight fixes](apple-testflight-fixes.md). The next build is on hold while other fixes are collected.

- Confirmed 2026-09-14 after TestFlight build 4: on **iOS**, the bottom bar and messages must return to the bottom after the keyboard closes, matching Android. Preserve Android's existing keyboard layout behavior.
- Latest user correction: on **both iOS and Android**, the streamer live composer opens at full width and keeps the Send icon visible, including with an empty draft and while sending. Disable Send for blank text or an in-flight send. Do not expand/collapse the live input on typing, clearing, or sending. This supersedes the earlier live expansion requirement only; Messages keeps its existing composer animation.
- Keep the input focused and editable when sending; retain a failed draft without overwriting newer typing. Use `Type...` as the placeholder.
- Live keyboard dismissal must remain available independently of sending: tap the video background (including message bubbles and the gaps around them) or the composer down-arrow to close it, preserve the draft, and restore the live controls. Native keyboard dismissal (including Android Back) also restores the controls. Sending still keeps the keyboard open.
- User device check: keyboard dismissal and bottom-bar restoration now work when tapping above the messages. Message-area dismissal is the remaining correction; preserve message removal and translation gestures.
- Device regression pending: check taps on message text, bubble backgrounds, gaps between/beside messages, and above the list; check long-press removal/translation. Check background tap, down-arrow, and Android Back with empty/unsent/sent drafts; reopen and confirm draft preservation. On iPhone, repeatedly open/type/dismiss the keyboard and confirm the bar/messages return to the bottom; compare Android. On both platforms check full width on opening/typing/clearing/sending, persistent Send visibility, disabled empty/pending Send, send without keyboard dismissal, rapid repeat sends, and failure with/without a newer draft. Check regular and party lives and restored safe-area spacing after dismissal.

## Timed Premium gift requests

- The streamer gift icon replaces the lock in the same bottom-bar position while Premium is active. Select a gift and 30 or 60 seconds, default 30.
- Current viewers see a bottom requirement with a Send Gift button and countdown; blink at 10 seconds or less, respecting Reduced Motion. Pay to remain; unpaid viewers are removed at the deadline. Coin purchases from this window are deferred.
- Preserve existing Premium entry, free-entry, manual Remove/Block/Allow Back, ordinary gifts, and all chat/keyboard behavior. Details and regression checks: [timed Premium gifts](premium-gift-requests.md).

## Viewer live-stream three-dot menu

- Latest user decision (2026-09-15): order the menu **Report → Translate → Share → Exit Live**.
- Android viewer menu spacing must include the bottom safe-area inset so the sheet clears the system navigation buttons, retaining its existing 40-point gap. Use the inset independently of keyboard visibility. Check three-button and gesture navigation in regular and party lives; device verification is pending.
- The viewer translation label is **Translate**, removing “chat” from the label. Keep its current On/Off indicator, consent, saved preference, availability and error handling.
- Preserve report-sheet behavior and demo checks, native sharing, menu dismissal and the existing exit action. This menu change does not change host/DM translation controls.
- Device checks pending: order/labels, translation On/Off, reporting, sharing and leaving a regular or party live.

## Live-stream message appearance

- Latest user correction (2026-09-15): add a small circular sender avatar on the **left**, beside a column containing the username and then the message below (supersedes the earlier inline/right-side layouts), on host and viewer live chat. Use the sender profile photo, with initials while unavailable; keep the avatar beside the name/message column when text wraps. Current size: 26 points, with a 1-point white border at 50% opacity. Latest user refinement: vertically center the avatar beside the combined username/message column, including wrapped text; this replaces the fixed 3-point downward offset. Align the avatar’s left edge with the outer left edge of the chat input box below, moving the whole avatar/name/message row together; message rows have no extra left padding. Apply to regular and party lives.
- User correction (2026-09-15): remove the gray/translucent boxes behind individual live chat messages on both host and viewer screens, including party lives. Message backgrounds are transparent.
- Latest text styling correction: username stays at 12 points in Inter SemiBold, softened white at 70% opacity; the message appears below it in white, 13-point Inter Regular (latest user size correction). The username/message column uses a 0-point gap (latest user correction: bring them 2 points closer, from 2 to 0). This supersedes the previous colored username/inline message presentation. Preserve translation and moderation actions, gift notices, and keyboard-dismissal touch behavior. This change applies to live chat only; direct-message bubble styling remains unchanged.
- Device checks pending: verify ordinary and gift messages without boxes in regular/party lives on host/viewer; confirm message readability, long-press translation/removal and tapping messages to dismiss the host keyboard. Type/localization checks do not verify native appearance or gestures.

## Live-stream gift notices

- Latest user correction (2026-09-15): remove the separate floating box containing the sender username and gift name. These details already appear in live messages. Preserve gift artwork/animation, native Crown deduplication and capture, and the existing chat notice on both host and viewer, including party lives.
- Latest user correction (2026-09-12): use **Alex sent 🪙 500 coins · Crown**. Order the value as coin icon, amount, then “coins”. Preserve sender and gift names.
- Use the confirmed gift transaction amount; keep deduplication, moderation removal, and party-channel mirroring intact. Both host and viewer chat use the shared server message.
- Device regression: send a gift in a regular/party live and check the order on host and viewer, including a four-digit amount and a long name. Device checks are still pending for this correction.

## Related notification and privacy decisions

- Country location is now populated from the connection IP, and Hide Location is active. This supersedes the earlier “Location coming later” decision; see [country location](country-location.md).

- DM notification banners should not show while the user is in Messages. Current suppression also includes open DM and new-chat screens.
- Message-preview setting description is exactly **“Show message preview in notification banner”**. It controls banner previews, not previews in the chat list.
- Gifts and coins notifications apply to DMs, not live-stream gifting.
- Blocking is all-encompassing across the app. Keep one blocked-accounts list; do not split account and live-viewer blocks back into separate user-facing settings.
- See [in-app notifications](in-app-notifications.md) for the related notification implementation and [message translation](message-translation.md) for translation behavior to preserve.

## Rejected changes — do not reintroduce

- Per-message three-dot/report buttons.
- A literal “Read” label instead of double-checks.
- Read indicators outside the bubble or permanently below the message text.
- “Message [user name]” as the input placeholder.
- The staggered fade-first/delayed-expansion animation experiment.
- The 46 px header avatar.
- An extra keyboard/composer gap from bottom safe-area padding.
- Disabling the input during send and thereby dismissing the keyboard.

## Implementation locations

- `artifacts/mobile/app/dm/[peerId].tsx`: composer, keyboard spacing, header, receipts, reply selection.
- `artifacts/mobile/components/TranslatedMessage.tsx`: inline trailing time/receipt content; preserve translation support.
- `artifacts/mobile/components/SwipeToReply.tsx`: swipe gesture and accessible reply action.
- `artifacts/mobile/components/DirectMediaMessage.tsx`, `MediaPackMessage.tsx`: receipts inside media cards.
- `artifacts/mobile/context/RtmContext.tsx`: message synchronization, reply data, read tracking, presence.
- `artifacts/mobile/app/message-settings.tsx`, `artifacts/mobile/hooks/useMessageSettings.ts`: settings UI and persistence.
- `artifacts/api-server/src/routes/message-settings.ts`, `direct-messages.ts`, and `artifacts/api-server/src/lib/messagePreferences.ts`: server privacy, activation, and reply enforcement.
- `artifacts/api-server/tests/message-settings.integration.mjs`: settings, payment, privacy, and reply integration checks.

## Regression review when changing chat

Check the relevant behavior on a device/preview; typechecking alone cannot verify keyboard or animation behavior. Do not claim a visual check was performed when only the bundle or types were checked.

1. Open chat, focus input: no extra keyboard gap; placeholder is `Type...`.
2. Type one character: input expands, accessory buttons hide together with the restored animation; keyboard remains open.
3. Send: keyboard remains open, icons return, and a next draft can be typed immediately. Clearing text also restores icons.
4. Send short and long messages: local time precedes double-check inline, wrapping only as needed; outgoing checks move from light to full shade when permitted.
5. Turn read receipts off on the recipient: no read-state disclosure.
6. Swipe and cancel a reply; send a reply and reload: quoted content persists in the correct chat.
7. Verify 40 px avatar, online dot, no redundant online text, and reporting only in the header menu.
8. When changing server chat access, run the relevant integration coverage for follow direction, Rose activation, blocking, and cross-conversation quote rejection.

Latest user corrections override this document. Update the affected requirement when behavior is explicitly changed, and revert only the requested change when the user asks for a rollback.

Gift-display regression for the box removal: send ordinary gifts and a Crown in regular/party lives; verify no floating sender/gift text box, the gift notice remains in chat, the gift animation still runs, and native Crown rendering stays deduplicated. Device verification remains pending; type/localization checks do not exercise native animations.

Live avatar device checks: confirm the avatar’s left edge aligns with the chat input box below and is vertically centered beside the combined username/message column, with softened-white username above the message, actual sender photos and initials fallback, long names/messages, gift messages, and regular/party host/viewer views. Verify transparent backgrounds, translation/removal gestures and keyboard dismissal remain intact. Device appearance/gesture checks are pending.
