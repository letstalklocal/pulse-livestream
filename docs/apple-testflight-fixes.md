# Apple / TestFlight fixes

Updated: 2026-09-14

## Build plan

**Hold the next build.** The user wants to collect the other fixes before making another Apple/TestFlight build. Keep adding fixes and their verification status here as work continues. No build was started for this documentation update.

The original live-chat reports came from iPhone TestFlight build 4. The user subsequently installed a newer build to test the fixes; its build number was not provided.

## Fix log

| Fix | Platforms | Implementation | Verification / next step |
| --- | --- | --- | --- |
| Bottom bar and messages stayed in the middle after closing the keyboard | iOS | Move the bottom dock with keyboard translation instead of resizing the overlay; preserve Android keyboard layout | User reports it now works when dismissing above the messages. Broader device regression remains pending. |
| Live composer lacked an on-screen Send button | iOS and Android | Expand on the first character and reveal Send; restore compact width after clearing/sending; respect reduced motion | Mobile typecheck passed. Dedicated device confirmation of expansion and Send behavior remains pending. |
| Keyboard could no longer be closed after the composer change | iOS and Android | Add video-background dismissal and a composer down-arrow; handle native keyboard dismissal; preserve drafts and keep the keyboard open after Send | User confirmed dismissal works above the messages. Down-arrow, draft restoration, and Android Back still need explicit device checks. |
| Taps where messages appear did not close the keyboard | iOS and Android | Handle touch completion in the message area, including bubbles and surrounding gaps, without taking over existing message actions | Implemented after the latest user build. Mobile typecheck and patch formatting passed. Awaiting the next build and device test. |
| Header coin looked white on iPhone instead of gold | iOS and Android | Replace the shared account-header system coin emoji with SVG coin artwork using explicit gold fills; keep the balance and profile action unchanged | Implemented for the next build. Mobile typecheck passed; device verification pending. |

## Next build checks

- Confirm the shared account-header coin is gold on iPhone and Android, in light and dark themes; balance readability and profile tap behavior remain intact.
- Tap message text, bubble backgrounds, gaps between/beside messages, and the video above the list: the keyboard closes and the bar/messages return to the bottom.
- Use the down-arrow; check Android Back too. Reopen chat and confirm an unsent draft remains.
- Type the first character: input expands and Send appears. Send or clear: compact width returns. Sending keeps the keyboard open and permits continued typing.
- Confirm existing long-press message removal and translation actions still work.
- Repeat opening/dismissing on iPhone and compare Android, including regular and party lives and bottom safe-area spacing.
- Check rapid repeat sends and failed sends with and without a newer draft.

Typechecks do not verify native keyboard movement or touch behavior. Only the user-confirmed checks above have device confirmation.

Implementation: `artifacts/mobile/app/go-live.tsx` and `artifacts/mobile/components/AccountHeader.tsx`. Preserve the requirements in [chat and message preferences](chat-message-preferences.md).
