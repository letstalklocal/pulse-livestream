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

Build timing and per-fix verification are tracked in [Apple / TestFlight fixes](apple-testflight-fixes.md). Its latest approved test-build decisions supersede the earlier hold while fixes were collected.

- Confirmed 2026-09-14 after TestFlight build 4: on **iOS**, the bottom bar and messages must return to the bottom after the keyboard closes, matching Android. Preserve Android's existing keyboard layout behavior.
- Latest user correction: on **both iOS and Android**, the streamer live composer opens at full width and keeps the Send icon visible, including with an empty draft and while sending. Disable Send for blank text or an in-flight send. Do not expand/collapse the live input on typing, clearing, or sending. This supersedes the earlier live expansion requirement only; Messages keeps its existing composer animation.
- Keep the input focused and editable when sending; retain a failed draft without overwriting newer typing. Use `Type...` as the placeholder.
- Live keyboard dismissal must remain available independently of sending: tap the video background (including message bubbles and the gaps around them) or the composer down-arrow to close it, preserve the draft, and restore the live controls. Native keyboard dismissal (including Android Back) also restores the controls. Sending still keeps the keyboard open.
- User device check: keyboard dismissal and bottom-bar restoration now work when tapping above the messages. Message-area dismissal is the remaining correction; preserve message removal and translation gestures.
- Device regression pending: check taps on message text, bubble backgrounds, gaps between/beside messages, and above the list; check long-press removal/translation. Check background tap, down-arrow, and Android Back with empty/unsent/sent drafts; reopen and confirm draft preservation. On iPhone, repeatedly open/type/dismiss the keyboard and confirm the bar/messages return to the bottom; compare Android. On both platforms check full width on opening/typing/clearing/sending, persistent Send visibility, disabled empty/pending Send, send without keyboard dismissal, rapid repeat sends, and failure with/without a newer draft. Check regular and party lives and restored safe-area spacing after dismissal.

## Timed Premium gift requests

- The streamer gift icon replaces the lock in the same bottom-bar position while Premium is active. Select a gift and 30 or 60 seconds, default 30.
- Current viewers see a bottom requirement with a Send Gift button and countdown; blink at 10 seconds or less, respecting Reduced Motion. Pay to remain; unpaid viewers are removed at the deadline. Coin purchases from this window are deferred. Planned later (user decision, 2026-09-15): add a quick refill in the timed request prompt with 500, 1,000, and 2,000 coin choices; this is not implemented yet.
- Preserve existing Premium entry, free-entry, manual Remove/Block/Allow Back, ordinary gifts, and all chat/keyboard behavior. Details and regression checks: [timed Premium gifts](premium-gift-requests.md).

## Viewer live-stream three-dot menu

- Latest user decision (2026-09-15): order the menu **Report → Translate → Share → Exit Live**. The September 17 reaction-selection addition now inserts **Choose reaction** between Share and Exit Live, preserving the relative order of existing actions.
- Android viewer menu spacing must include the bottom safe-area inset so the sheet clears the system navigation buttons. Latest user correction (2026-09-15): lower the sheet slightly after the inset fix made it too high; reduce the extra gap from 40 to 24 points (16 points lower), preserving the inset. Use the inset independently of keyboard visibility. Check three-button and gesture navigation in regular and party lives; device verification is pending.
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

## Message-list cache plan — September 17, 2026

The agreed future optimization is a bounded startup cache, not a full message-history cache. Begin filling it when the app opens and syncs messages. Keep the 10 most recent conversations, with approximately 15–20 recent messages per conversation. New messages update the cached conversation and move it to the top; a new message in a conversation outside the cache promotes it and evicts the least-recent cached conversation. Eviction never deletes server history. Conversations beyond the 10-conversation cache continue using the existing server-loading behavior. This plan is documented only; the cache is not implemented yet.

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

## Existing DM access and status recovery — 2026-09-16

User reported iPhone conversations showing a spinner instead of the composer, despite a previously paid Rose; Back still worked. They also reported an input sometimes appearing but not responding to touch. No native reproduction or authenticated phone-request trace was available, so the separate touch symptom is not confirmed fixed.

The server already treats a persisted qualifying DM Rose transaction or any conversation history between the two accounts as permanently opening chat. Do not require another Rose or add a second payment flag that can disagree with the ledger. The app now uses server-synced conversation history to show the composer without waiting for the combined online/last-seen/gift-status request. After successful Rose payment, cancel in-flight peer-status reads and set that account/peer's cached `needsGift` to false immediately, before sending the gift notice. Server authorization and blocking remain authoritative on every send; known contact blocks still hide the composer.

For a new conversation without history or cached status, keep the initial access check, bounded to 12 seconds across token acquisition, fetch and body parsing. Failures expose the existing retry control; no automatic query retries extend that initial spinner. Background status errors must not unmount a composer backed by prior status. These changes do not persist a new device unlock flag; the durable evidence remains the existing server ledger/history, loaded again after restart.

Validation: dedicated request checks cover successful access, missing token, hanging token/fetch/body, cancellation, HTTP failure and retry recovery. Device checks remain required: reopen an established chat during a slow status request, type/send without losing focus/draft, pay a Rose and reopen without another charge, keep new-chat gift/block rules enforced, retry failed initial status, and investigate any remaining unresponsive-input touches. General API health success does not establish authenticated DM connectivity or the original stall's cause.

## DM media chooser dismissal — 2026-09-17

- Tapping outside the three-option Share Media sheet closes it. The X has an enlarged touch target. Latest user correction: preserve a fast slide on opening and dismissal; use a 150 ms slide with a matching backdrop fade, respecting Reduced Motion. This supersedes the instant-dismissal implementation.
- Keep all three media actions and the existing upload-in-progress dismissal guard. Taps inside the sheet must not trigger backdrop dismissal.
- Device verification pending on iPhone and Android: dismiss using the background and X, reopen repeatedly, tap sheet/header whitespace, exercise all three options, and verify dismissal is blocked while uploading. Check Android Back and composer draft/reply preservation and keyboard spacing after returning to chat. Automated type checks do not verify touch responsiveness or native dismissal timing.

- User reports media-sheet opening is slow on the S10 but fast on the Ultra. Sheet visibility now lives in a separate media chooser controller so opening/closing does not itself rerender the conversation or message list. Preserve the 150 ms slide, three media actions, upload guard and composer behavior. This removes unnecessary render work; the cause and improvement on the S10 remain unconfirmed pending device timing checks (tap-to-appearance versus animation duration), including a long conversation and comparison with the Ultra.

- S10 clarification: after closing, the first touch seems missed; reopening pauses and the sheet shoots too high then settles. The slide now starts after measuring the sheet and uses a fixed pixel distance, instead of changing interpolation distance during animation. Hidden sheet contents unmount, opening/closing guards reset before layout, and the native modal stays outside animated composer controls. These address suspected animation/lifecycle contributors, not a device-confirmed root cause. Device regression: repeatedly close/reopen with a single tap on S10 and Ultra, check no overshoot or invisible touch-blocking overlay, and verify iPhone, Android Back, all three media options and upload protection.

## Live reaction chooser — September 17, 2026

- User moved emoji selection into the viewer three-dot menu and requested any emoji instead of six presets. **Choose reaction** opens an input inside the same modal; use the phone emoji keyboard to select one emoji, then **Use emoji**. Support skin tones, flags, keycaps and combined emojis. Reject plain text or multiple separate emojis. Cancel preserves the selected reaction; selecting does not send one.
- The bottom-right tap button keeps its existing position and shared floating animation, defaults to ❤️ and displays the selected emoji. Remove the floating selection chevron/preset palette. Preserve chat drafts, keyboard/composer behavior, translation and existing menu actions.
- Automated checks pass for reaction validation/batching and stream regressions. Phone keyboard appearance, selection replacement, modal avoidance, cancellation/backdrop/Back, bottom-dock restoration, safe areas and chat-draft retention remain unverified on Android and iPhone. The user confirmed the original reactions worked well but did not identify platform/build or confirm this chooser revision.

### Reaction chooser usability and single-selection correction — September 17, 2026

Latest user correction supersedes the input-first chooser: the menu label is **Change emoji**. Open directly to a visible grid headed **Tap an emoji**; tapping selects that emoji and closes the chooser. The current choice is highlighted. **More emojis from keyboard** opens the keyboard input with explicit emoji/globe-key instructions and a **Select** button, retaining support for any single emoji.

The field must always hold one valid emoji. Choosing another replaces the previous one; it must never accumulate multiple emojis and then disable Select. Native keyboard appends are normalized to the latest whole emoji sequence, preserving skin tones, flags and ZWJ families. Plain text or clearing the field leaves the last valid choice selected. Cancel leaves the actual reaction unchanged. Preserve the bottom-right tap button, shared floating reactions, chat draft and all existing stream behavior.

Verification: mobile typecheck and required stream regression suite pass, including direct grid choice, full-sequence replacement, enabled Select and cancellation. All ten catalogs and the focused stream localization checks pass. The unrelated pre-existing DM localization baseline issue remains outside this change. Android/iPhone visual, emoji-keyboard and gesture checks remain pending; no backend change, native build or production deployment was needed for this revision.

### Eight saved reaction favorites — September 17, 2026

The user approved eight account-saved favorites, initially ❤️ 🔥 👏 😂 😍 🎉 👍 🙌, with ❤️ the active reaction on first stream opening. **Change emoji** now shows the eight favorites, plus **Pick favorites** initially / **Change favorites** after saving. Both use the same eight-slot replacement editor and **Done**. Any single emoji remains supported via the existing grid/keyboard chooser; selecting an existing favorite swaps positions. Cancel and failed saves preserve the saved set. Account preferences persist in the database and stay separate across accounts. Keep all existing chat drafts, keyboard anchoring and menu actions.

The user also moved the viewer emoji button 48 points lower, closer to the three-dot control, retaining its touch target and safe-area positioning. Device validation is pending; see the stream regression document for automated results and the full favorites/device checklist.

### Blank emoji entry — September 17, 2026

Latest correction: **More emojis** opens **Change emoji** with a blank, focused field and no placeholder emoji. Select is disabled only until a first emoji is chosen; subsequent keyboard emojis replace it. Saved favorites and Cancel behavior remain intact. The user also requested automatic emoji keyboard mode; this is not supported by the current TextInput configuration, and the choice of an in-app emoji-only picker versus the system keyboard remains pending.

### In-app emoji-only picker — September 17, 2026

User explicitly selected an **in-app emoji-only picker**. This supersedes the system-keyboard path and resolves the previously pending choice. **More emojis** now opens **Change emoji** directly inside the same modal, with a blank selection preview, emoji category tabs and a scrollable emoji grid. There is no text input or letter keyboard; dismiss any existing keyboard on entry. Tapping an emoji replaces the preview with that single sequence. **Select** confirms it; Cancel leaves the prior favorite unchanged. The existing eight-favorite editor still commits through Done, and quick-grid choices remain single-tap selections. Preserve the purple devil quick-grid slot and the smaller/lowered/right-aligned live reaction button.

Bundle the Unicode Emoji 16.0 fully-qualified catalog offline: 3,781 sequences in nine categories, including modifiers, combined emoji and flags. Provenance and Unicode license are in `artifacts/mobile/data/emoji/`. The larger grid uses FlatList row virtualization to avoid mounting the whole catalog at once. Native emoji appearance still depends on the phone's installed fonts.

Automated verification: mobile typecheck and required stream regressions pass. Chooser checks cover no text input, blank initial preview, category changes, single replacement, Select/Cancel, row offsets, unique catalog entries and acceptance of every catalog sequence by client/server validators. Focused localization passes across all ten languages; the unrelated pre-existing full-suite DM baseline issue remains separate. No backend or native changes were needed. Android/iPhone visual/device checks remain pending: category scrolling, older-phone font coverage, full glyph appearance, one-tap emoji selection, safe-area/compact-screen layout, favorites Done/cancel, and existing stream keyboard/dock/navigation/awake cases.

### Battle result chat — September 18, 2026

Finished battles with an unequal score add a normal scrolling stream message from **Pulse**: `Winner: Username` on the first line and `2,700 coins` directly below it. Apply to real and simulated battles and both Party rooms. Preserve existing message appearance, translation, removal and chat scrolling; this is not a pinned notice. Stable battle IDs deduplicate repeated/concurrent polling, and removed messages stay removed. Cancelled rounds and draws do not announce winners.

## Restore original DM navigation — September 18, 2026

Investigation evidence, tested changes, rejected explanations, and pending device checks: [iPhone DM freeze investigation](iphone-dm-freeze-investigation.md).

User requested restoring the original DM route configuration to investigate an iPhone conversation that receives new messages but does not respond to Back or composer taps. Use only `headerShown: false`, restoring the navigator's default stack presentation and transition. This supersedes the temporary animation-only test and the custom transparent-modal slide with a 40 ms duration. It is not a confirmed freeze fix. Device verification pending: reopen the affected conversation, type/send, return with Back, and compare a working conversation on iPhone and Android.


## Private-message header identity from recorded video — September 19, 2026

User reported the private-message header stays “User” with a missing avatar when opened from recorded video, even as messages arrive. The video entry now passes the expected peerName parameter. The DM header and empty-conversation identity use the shared profile cache for the latest name/photo, the route name immediately while loading, and the conversation name as a fallback. Profile/conversation completion updates identity independently of history and chat-permission/presence loading. Preserve the 40-point header, online dot/last-seen privacy, established-chat access, composer/keyboard behavior and message loading.

Automated mobile types, header update/recipient isolation tests, recorded-video navigation tests, chat-status regression and localization passed. Native Android/iPhone identity/keyboard/navigation checks remain pending; message-history loading speed has not been diagnosed or claimed fixed. See replay-and-live-recording-ideas.md for the separate recorded player lifecycle repair and remaining device checks.

## Live sticker pack purchase receipts — September 21, 2026

User approved buying a pack directly from a live sticker and delivering it **unlocked** in the creator's DM conversation using the same pack purchase code. This buyer-requested receipt is part of the purchase transaction and requires no additional Rose; existing account blocks still apply. Ordinary text/media/pack sends keep their current chat activation checks. A previously delivered pack message is reused; retries do not duplicate delivery or payment. Existing conversation-history rules apply after the receipt. See [live sticker requirements and test cases](live-stickers.md).

Media-pack creation now requires saved sticker artwork; existing packs default to Rose. This does not change DM pack prices, delivery, ownership, chat activation or composer behavior. See the latest saved-gift requirement in [live stickers](live-stickers.md).

## Gifts on profile posts — September 21, 2026

User requested a gift icon on profile posts and a comment showing the gifter, coins and gift name, as in live streams. Other people's posts now have a gift action beside the existing like/comment controls, both in the profile feed and the opened photo view. It opens the existing gift drawer and wallet purchase content. Own posts do not offer self-gifting; signed-out senders go to sign-in.

A successful gift credits the post owner and saves a comment in the same database transaction, using the server's sender identity and gift catalog. Latest user correction: the comment body is **🪙 500 coins · Crown**, without the repeated name or “sent”; the existing author line already identifies the gifter. Previously saved gift notices use the same shortened display. The notice persists through reload and counts as a comment. The drawer closes and comments open after success. Existing comment moderation applies; removing the notice does not refund or repeat the payment. Post gifts do not send a DM or pay live admission/request requirements.

`POST /api/posts/:postId/gifts` takes `giftId` and `requestId`. It enforces authentication, post visibility/blocking, no self-gifting and sufficient funds. Request IDs are scoped to the sender and checked against the post/gift; concurrent retries cannot duplicate the transfer or notice. The client guards rapid taps and retains the request ID on failure for retry. No database migration is required; the existing ledger records the post in its description and the existing comments table stores the notice.

Automated verification: API/mobile/library typechecks, API build, post-gift database integration tests (including forced notice-write failure rolling back both balances and ledger), existing post-activity tests, client rapid-tap/retry/cache tests, all ten localization catalogs and stream regression suite pass. The development API was rebuilt/restarted preserving its environment. HTTP checks confirm authentication is required on the gift endpoint and the running comments endpoint serves the committed gift notice. Authenticated transfers were tested through route handlers against the development database using temporary accounts; this is not an authenticated phone test.

Android/iPhone device verification remains pending, with installed build numbers unknown: gift icon in profile feed/opened photo, drawer and coin-purchase return, successful send-to-comments transition, sender/amount/name with long names, reload and comment count, insufficient balance, rapid taps/retry, and comment scrolling/composer/keyboard dismissal. No native build or production deployment was started. Existing DM and live chat behavior remains unchanged.

Media-pack editing preserves the pack identity and existing buyers’ access. The selected gift now determines its price; the separate price field is removed. Current DM/live checkout verifies the displayed price before a new charge. See [latest pack editing and pricing requirements](live-stickers.md).

### Post gift totals — September 21, 2026

User requested the total in the top-right corner of the post. Profile feed photos (own and other profiles) and opened/saved photo views now show a small translucent badge with the existing gold coin artwork and localized total. Show zero when no gifts have arrived; do not display a made-up zero while activity is loading. The badge is touch-through and leaves photo controls unchanged. Grid thumbnails remain compact.

The activity endpoint returns `giftCoins`, summed from completed post-gift ledger entries for that post/owner. This is the cumulative amount credited, not the owner's current wallet balance or the number of gifts/comments. Deleting a notice cannot change the total. The badge shares the existing post-activity query, so a successful gift refreshes it along with comment activity. Existing gifts are included without a migration.

Automated checks cover zero totals, isolation between posts, duplicate/failed payments and retention after comment deletion, plus API/mobile/library typechecks and localization. Android/iPhone visual verification remains pending for top-right placement, photo contrast, large totals/text sizes, swiping between posts and refreshing after gifting.

## Portrait media-pack cards in DMs

User explicitly selected DM pack cards for a 5:7 format: title first, then photo/video counts with icons, followed by media. Unlocked/owner media previews swipe horizontally with one bounded page at a time; tapping opens the previously confirmed full-screen shared gallery. Locked packs show only the blurred authorized preview, lock overlay and existing purchase action. Retain the displayed-price confirmation, existing ownership and in-card read double-check. Card width adapts to screen size, with a 280-point maximum. No automatic slideshow or changes to live stickers/pack-selection cards.

Automated coverage tests title/count order, 5:7 sizing, page offsets on multiple screen widths, locked-preview privacy, gallery opening, checkout amount and read state. Stream regressions and localization pass. Android/iPhone visual sizing, horizontal swiping versus chat scrolling/reply gestures, large text and keyboard cases remain pending; no device/build identity was supplied.

Latest size correction: DM pack cards use 60% of screen width (up to the existing 280-point cap), retaining 5:7 proportions and the approved title/counts/swipe layout. User confirmed liking the card design before this width reduction; device confirmation of the reduced width is pending.

## Individual DM video playback — September 21, 2026

User reported that individually sent videos did not play (no pack-video reproduction). Confirmed code defect: both inline and full-screen views used expo-image with a decorative play icon; no video player was mounted. Authorized full-screen video now mounts `DirectMessageVideo` using the installed expo-video player with native play/pause/seeking and contained sizing. Tapping to open starts playback; closing unmounts the player, and background/inactive transitions pause it. Loading/error states are visible. Photos preserve their original renderer and all unlock/read/composer behavior remains. Refreshed message URLs are synchronized; changing message identity resets local unlocked/viewer state.

The DM upload flow previously used three different MIME fallbacks, including image/jpeg for videos without mimeType. Signing, PUT and message creation now use the same type (video/mp4 for a video without metadata, retaining supplied types such as video/quicktime).

Automated verification: mobile typecheck, localization and focused real-component tests pass for free/purchased/locked videos, player absent until authorized/opened, close, background, refreshed URL, unchanged photo viewer, and MIME consistency for MP4/QuickTime/images. A read-only delivery check for one recent individual DM video returned HTTP 206, video/mp4 and byte-range support. Only response headers were retained; no media body or signed URL was logged. This confirms delivery support, not native decoding or end-to-end phone playback. Android/iPhone playback, seek/audio, close/background and paid unlock/device checks remain pending. No backend endpoint/native configuration change or CDN deployment was made.

CDN/upload assessment: current DM and pack uploads are whole-file PUTs directly to private object storage, without byte progress or resumable recovery. A CDN may improve repeat/global downloads, but it does not repair the missing player or resumable uploads. Recommended next work is upload progress, bounded timeouts/retries and resumable transfers; video compression/encoding should be measured separately. These upload/CDN improvements are not implemented in this fix. Cloud Storage supports byte-range downloads and resumable uploads: https://docs.cloud.google.com/storage/docs/xml-api/get-object-download and https://docs.cloud.google.com/storage/docs/resumable-uploads . Private CDN delivery requires authorized signed access: https://docs.cloud.google.com/cdn/docs/using-signed-urls .

Individual authorized DM videos now show an extracted first-frame thumbnail behind the existing play button. Native frame extraction is muted and does not autoplay; it runs once per mounted URL, bounds frame dimensions, releases its temporary decoder, and releases the retained frame on cleanup. Locked videos do not extract private media. Unsupported web extraction, failures and timeouts retain the play-button fallback. Automated tests cover rendering, duplicate-ready events, decoder/frame cleanup, failed extraction and late completion after unmount; mobile typecheck and localization also pass. Android/iPhone thumbnail appearance and extraction performance remain pending device verification.

DM video, media-pack and private 1:1 invitation rows now have 16 points of bottom spacing (doubled from 8), for incoming and outgoing cards. Other message spacing, card dimensions and composer/keyboard insets are preserved. Device visual confirmation of this spacing remains pending.

## DM and pack upload progress/resumption — September 21, 2026

User requested improving DM upload progress and resumable transfers, consistent with the wider upload experience. Individual DM photos/videos and newly added pack media now use one private object-storage resumable uploader. The existing upload endpoint accepts optional `resumable: true`; older clients retain their single-PUT response behavior. Cloud Storage session initiation stays authenticated on the API, and the native app sends bounded 1 MiB chunks directly to storage. Only acknowledged bytes contribute to progress. A lost response triggers an offset query before resuming; requests time out after 45 seconds, with up to three recovery attempts and bounded backoff. No account bearer token is sent to storage and upload session URLs are not logged.

Individual DM upload shows a percentage/progress bar followed by Sending while the message is saved. Cancel upload stops the transfer; Retry reuses the session while the sheet remains open. A retry after an uncertain send response uses the same object, recipient, price and idempotency key to prevent duplicate delivery; pricing is frozen for that attempt. Rapid taps cannot start a second transfer. Closing the sheet, changing conversation or unmounting retires the local attempt. Retrying after fully closing the app is not implemented: sessions are held in memory, not a persisted/background upload queue.

Pack creation/editing uses the same uploader with combined per-item progress and a Saving phase. Saved pack items are retained without uploading again. New items retain their sessions through a failed save retry; completed transfers are reused. Opening another create/edit draft clears those local sessions. Existing gift-derived prices, ownership, selection, pack layout, DM access/unlock, receipt and keyboard behavior remain. This change does not add video compression or a private CDN; creator-video Bunny uploading remains separate.

Automated verification: mobile/API/library types, API build, localization, interruption/partial-offset/lost-response/cancellation/file-cleanup tests, DM retry/idempotency/MIME/playback tests and pack editing/rendering tests pass. A temporary authenticated account exercised the upload route, including invalid MIME/unauthenticated rejection and legacy compatibility, then completed a real private-storage chunk/query/resume cycle with metadata verification; the account and object were removed. The rebuilt development API was restarted preserving its environment, and the running upload endpoint returned the expected authentication rejection. This is not a signed-in phone test.

Android/iPhone verification remains pending: larger video upload progress, weak network/disconnect/reconnect, cancel/retry, background/foreground, sheet dismissal, final message delivery, paid/free unlock, pack multi-item retry and saved-item editing, and existing chat keyboard/composer/swipe/read-indicator cases. No native build or production deployment was started.

### TestFlight pack-video HTTP 500 investigation

User reported a black selected-video tile, then “Uploading 1 item” followed by an HTML HTTP 500 page containing the Replit script. That label matches the earlier app uploader, not the new percentage UI; installed build number and production logs were not supplied. Development legacy/resumable session creation succeeded. Production health returned 200 and the unauthenticated upload endpoint returned 401; these do not verify an authenticated production upload.

Confirmed and reproduced a relevant backend defect: installed Expo iOS ImagePicker returns Double milliseconds (`duration.value / duration.timescale * 1000`), while pack items store PostgreSQL integer milliseconds. A create request with durationMs 1234.567 threw PostgreSQL 22P02 before the fix. Create/edit now round finite nonnegative durations within the integer range and reject invalid/overflow values. This is a proven defect, not proof it caused the reported production request without its logs. A router error handler now returns safe JSON instead of Express HTML and logs only operation/route/database code. Upload-session failures also return a clean retry message.

The client suppresses HTML server/proxy pages in error messages while preserving structured validation errors and HTTP status. Pack selection now extracts video frame thumbnails using the existing bounded thumbnail component rather than asking an image renderer to open a video URL.

Automated PostgreSQL tests cover fractional-duration create/edit, persisted integers, invalid metadata rejection/no partial packs and safe error diagnostics. Client HTML-response, thumbnail lifecycle and pack gift/edit regressions pass; API/mobile typechecks, API build and localization pass. Development API was rebuilt/restarted preserving environment and its running upload endpoint checked. Production publication has not occurred; current TestFlight video upload remains unverified. Backend publication can deliver the duration/error-response repair to the existing app. Thumbnail, HTML-proxy suppression and resumable/progress UI require a new app build. Do not start a native build or production deployment without the user's instruction.
