# Apple / TestFlight fixes

Updated: 2026-09-14

## Build plan

**Latest build decision (2026-09-15):** The user resumed testing builds and explicitly approved RevenueCat Test Store configuration for the next TestFlight build. This supersedes the earlier hold while fixes were collected. Use the installed EAS CLI and existing production profile; see the approved TestFlight configuration below. The assistant has not started a build.

The original live-chat reports came from iPhone TestFlight build 4. The user subsequently installed a newer build to test the fixes; its build number was not provided.

## Fix log

| Fix | Platforms | Implementation | Verification / next step |
| --- | --- | --- | --- |
| Bottom bar and messages stayed in the middle after closing the keyboard | iOS | Move the bottom dock with keyboard translation instead of resizing the overlay; preserve Android keyboard layout | User reports it now works when dismissing above the messages. Broader device regression remains pending. |
| Live composer lacked an on-screen Send button; latest preference is full width immediately | iOS and Android | Open the streamer composer at full width and always show Send, disabled for empty text or while sending. Supersedes the initial first-character expansion; Messages remains unchanged | Implemented for the next build. Mobile typecheck passed; device verification pending. |
| Keyboard could no longer be closed after the composer change | iOS and Android | Add video-background dismissal and a composer down-arrow; handle native keyboard dismissal; preserve drafts and keep the keyboard open after Send | User confirmed dismissal works above the messages. Down-arrow, draft restoration, and Android Back still need explicit device checks. |
| Taps where messages appear did not close the keyboard | iOS and Android | Handle touch completion in the message area, including bubbles and surrounding gaps, without taking over existing message actions | Implemented after the latest user build. Mobile typecheck and patch formatting passed. Awaiting the next build and device test. |
| Header coin looked white on iPhone instead of gold | iOS and Android | Replace the shared account-header system coin emoji with SVG coin artwork using explicit gold fills; keep the balance and profile action unchanged | Implemented for the next build. Mobile typecheck passed; device verification pending. |
| Timed gift requirement during an ongoing Premium live | iOS and Android | Premium gift icon, gift selection with 30/60 seconds (default 30), bottom Send Gift prompt, final-ten-second blink, atomic payment, and unpaid-viewer removal | API/mobile typechecks, API build, new integration tests, existing Premium/moderation regressions, and temporary-server HTTP smoke checks passed. Restarted development API endpoints and real Agora rule creation/deletion verified after the session restart. User confirmed the core gift/removal flow works, including the requested unpaid-removal, payer-stays, and uninterrupted-broadcast test (2026-09-14). Exact gift-test device/build unspecified; Apple-specific and edge-case checks remain pending. See [implementation and tests](premium-gift-requests.md). |

## Next build checks

- Exercise the [timed Premium gift device checks](premium-gift-requests.md), including successful payment, expiry removal, native removal without reconnecting others, and existing manual moderation.

- Confirm the shared account-header coin is gold on iPhone and Android, in light and dark themes; balance readability and profile tap behavior remain intact.
- Tap message text, bubble backgrounds, gaps between/beside messages, and the video above the list: the keyboard closes and the bar/messages return to the bottom.
- Use the down-arrow; check Android Back too. Reopen chat and confirm an unsent draft remains.
- Open streamer chat: input is full width and Send is visible immediately. Type, send, and clear: width stays fixed and Send stays visible. Empty/pending Send is disabled; sending keeps the keyboard open and permits continued typing. Messages retains its existing expansion behavior.
- Confirm existing long-press message removal and translation actions still work.
- Repeat opening/dismissing on iPhone and compare Android, including regular and party lives and bottom safe-area spacing.
- Check rapid repeat sends and failed sends with and without a newer draft.

Typechecks do not verify native keyboard movement or touch behavior. Only the user-confirmed checks above have device confirmation.

Implementation: `artifacts/mobile/app/go-live.tsx` and `artifacts/mobile/components/AccountHeader.tsx`. Preserve the requirements in [chat and message preferences](chat-message-preferences.md).

## RevenueCat integration — 2026-09-15

Collect for the next authorized build: RevenueCat native SDKs, coin purchase screen and separate special-feature subscription screen. No paywall or web checkout/link is included. All nine launch coin amounts and prices are confirmed. The user reports all nine App Store Connect consumables saved and reopened with verified prices; genuine review screenshots and sales-country availability remain pending. Remote webhook setup remains pending. See [the App Store Connect checkpoint](coin-purchases.md#app-store-connect-checkpoint--2026-09-15). The existing Test Store and `pulse_pro` product mappings were inspected successfully via API. Native purchase and Customer Center testing still require a rebuilt app; do not treat JavaScript/type/HTTP tests as device checks. See [integration and validation](revenuecat-integration.md). The build hold remains in place.

### Coin purchase checkpoint — 2026-09-15

RevenueCat Test Store now contains all nine approved packs; actual sandbox webhooks passed on the running API. Account/profile header balances open Buy Coins; zero coins displays the icon plus Buy Coins. The ordinary gift drawer opens shared purchase content in a sheet and returns to gifts without changing routes. Pending native checks: all nine localized prices, zero/positive labels, checkout/cancel/pending recovery, gift-recipient retention, live continuity and chat draft/keyboard behavior. SDK native modules require the next authorized build; the build hold is unchanged. Apple linkage/credentials and production fulfillment are still pending.

### Android testing build requested — 2026-09-15

The user requested a new Android testing build and asked to preserve the documented workflow. Use the existing `development` profile for the Metro-connected development client: run `eas build --platform android --profile development` from `artifacts/mobile`. The initially suggested standalone `preview` command and its temporary profile changes were corrected. RevenueCat defaults to Test Store when running the development JavaScript bundle. After installing, connect to the running Replit Metro server and verify a current Android bundle request as described in `.agents/memory/android-dev-client-bundle-verification.md`.

This supersedes the build hold for the requested Android testing build. No build was started by the assistant; Apple/TestFlight submission is unchanged.

**CLI preservation requirement (2026-09-15):** Use the installed `eas` command. Do not substitute `npx eas-cli@latest`, recommend an optional CLI update, or alter build profiles/environment for a routine build request. The user flagged the risk of disrupting the working environment. Follow [the Android build workflow](android-build-workflow.md); tooling changes require a separate explanation and explicit authorization.

### Approved RevenueCat TestFlight configuration — 2026-09-15

User approval: “ok add so the next build can be tested in testflight.” The active `eas.json` now sets the two non-secret flags `EXPO_PUBLIC_REVENUECAT_MODE=test` and `PULSE_TESTFLIGHT_BUILD=true` under `build.production.ios.env`. The iOS-specific placement preserves Android behavior while keeping the existing `production` profile. The Expo config guard accepts this explicit testing exception; unmarked production test-mode builds remain rejected.

The installed EAS profile parser and eight RevenueCat tests passed. No CLI upgrade, `.env` edit, Replit-secret change, remote EAS-variable change, build, or submission was performed. Development Clerk/API/database/Agora configuration remains as previously documented. Run `eas build --platform ios --profile production` from `artifacts/mobile` for the next test build.

Before public App Store release: remove `PULSE_TESTFLIGHT_BUILD`, switch RevenueCat mode to `store`, configure the Apple public SDK key, and complete real-store fulfillment/QA. Do not select this Test Store binary for public release. Native purchase and UI checks remain pending on the new TestFlight build.

### Buy Coins grid for the next Apple test — 2026-09-15

The user reports the preceding Android test build looks good and still needs a rebuilt Apple app. The shared purchase page/sheet now uses a themed 3×3 card grid with smaller 32-point gold coin artwork, centered amounts, and white localized prices below. This is a JavaScript/layout change; include it in the next TestFlight build using the already-approved settings. iOS visual checks and the updated Android grid remain pending. No build was started or build environment changed for this redesign.
