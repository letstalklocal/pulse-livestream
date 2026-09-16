# Apple / TestFlight fixes

Updated: 2026-09-16

## Build plan

**Current Apple build workflow (2026-09-16):** The user starts Apple/iPhone builds through the **Publish tool in Replit**. Use this workflow when giving Apple build instructions; the EAS CLI commands recorded below are historical. TestFlight uses the Replit production environment. Android continues to use its [documented development build command](android-build-workflow.md).

**Previous build decision (2026-09-15):** The user resumed testing builds and explicitly approved RevenueCat Test Store configuration for the next TestFlight build. This supersedes the earlier hold while fixes were collected. Use the installed EAS CLI and existing production profile; see the approved TestFlight configuration below. The assistant has not started a build.

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

Collect for the next authorized build: RevenueCat native SDKs, coin purchase screen and separate special-feature subscription screen. No paywall or web checkout/link is included. All nine launch coin amounts and prices are confirmed. The user reports all nine App Store Connect consumables saved and reopened with verified prices; genuine review screenshots and sales-country availability remain pending. Sandbox webhook setup and actual Test Store delivery are verified; Apple/Google linkage and production fulfillment remain pending. See [the App Store Connect checkpoint](coin-purchases.md#app-store-connect-checkpoint--2026-09-15). The existing Test Store and `pulse_pro` product mappings were inspected successfully via API. Native purchase and Customer Center testing still require a rebuilt app; do not treat JavaScript/type/HTTP tests as device checks. See [integration and validation](revenuecat-integration.md). The latest test-build decision above supersedes the earlier hold.

### Coin purchase checkpoint — 2026-09-15

RevenueCat Test Store now contains all nine approved packs; actual sandbox webhooks passed on the running API. Account/profile header balances open Buy Coins; zero coins displays the icon plus Buy Coins. The ordinary gift drawer opens shared purchase content in a sheet and returns to gifts without changing routes. Pending native checks: all nine localized prices, zero/positive labels, checkout/cancel/pending recovery, gift-recipient retention, live continuity and chat draft/keyboard behavior. SDK native modules must be present in the testing binary; follow the latest authorized test-build workflow above. Apple linkage/credentials and production fulfillment are still pending.

### Android testing build requested — 2026-09-15

The user requested a new Android testing build and asked to preserve the documented workflow. Use the existing `development` profile for the Metro-connected development client: run `eas build --platform android --profile development` from `artifacts/mobile`. The initially suggested standalone `preview` command and its temporary profile changes were corrected. RevenueCat defaults to Test Store when running the development JavaScript bundle. After installing, connect to the running Replit Metro server and verify a current Android bundle request as described in `.agents/memory/android-dev-client-bundle-verification.md`.

This supersedes the build hold for the requested Android testing build. No build was started by the assistant; Apple/TestFlight submission is unchanged.

**CLI preservation requirement (2026-09-15):** Use the installed `eas` command. Do not substitute `npx eas-cli@latest`, recommend an optional CLI update, or alter build profiles/environment for a routine build request. The user flagged the risk of disrupting the working environment. Follow [the Android build workflow](android-build-workflow.md); tooling changes require a separate explanation and explicit authorization.

### Approved RevenueCat TestFlight configuration — 2026-09-15

User approval: “ok add so the next build can be tested in testflight.” The active `eas.json` now sets the two non-secret flags `EXPO_PUBLIC_REVENUECAT_MODE=test` and `PULSE_TESTFLIGHT_BUILD=true` under `build.production.ios.env`. The iOS-specific placement preserves Android behavior while keeping the existing `production` profile. The Expo config guard accepts this explicit testing exception; unmarked production test-mode builds remain rejected.

The installed EAS profile parser and eight RevenueCat tests passed. No CLI upgrade, `.env` edit, Replit-secret change, remote EAS-variable change, build, or submission was performed. Development Clerk/API/database/Agora configuration remains as previously documented. The command recorded at that time was `eas build --platform ios --profile production` from `artifacts/mobile`; the current Apple build workflow is the Replit Publish tool, as recorded above.

Before public App Store release: remove `PULSE_TESTFLIGHT_BUILD`, switch RevenueCat mode to `store`, configure the Apple public SDK key, and complete real-store fulfillment/QA. Do not select this Test Store binary for public release. Native purchase and UI checks remain pending on the new TestFlight build.

### Buy Coins grid for the next Apple test — 2026-09-15

The user reports the preceding Android test build looks good and still needs a rebuilt Apple app. The shared purchase page/sheet now uses a themed 3×3 card grid with smaller 32-point gold coin artwork, centered amounts, and white localized prices below. This is a JavaScript/layout change; include it in the next TestFlight build using the already-approved settings. iOS visual checks and the updated Android grid remain pending. No build was started or build environment changed for this redesign.

### Live gift label and Buy Coins cleanup — 2026-09-15

Removed the extra sender/gift-name box from the shared live GiftFloater; existing live chat gift messages, animations and native Crown suppression remain. Removed Restore purchases and its explanation from Buy Coins; the existing subscription/settings restoration remains. Native visual checks of regular/party gifts and the updated purchase sheet are pending. No native build was started.

### Transparent live message backgrounds — 2026-09-15

Removed the translucent gray background and corner radius from individual host/viewer live chat messages. Kept existing spacing, sender colors, text, translation/moderation and keyboard-dismissal behavior. Applies to regular and party lives; DM styling is unchanged. Native visual/gesture checks remain pending.

### Live chat sender avatars — 2026-09-15

Added a 20-point circular sender avatar directly to the left of each username in host/viewer live chat (user corrected the earlier right-side request), including party lives. Uses the existing cached user-profile lookup and initials fallback; no chat payload or backend change. Preserve transparent message backgrounds, gift notices, message actions and composer behavior. Device layout/gesture checks remain pending.

### Live chat avatar and text refinement — 2026-09-15

Latest user correction: avatar is 22 points (2 points larger) with a 1-point, 50%-opaque white border. Keep it on the left of a text column: username in softened white (70% opacity), message below in the existing white 12-point Inter regular font. Applies to host/viewer and party lives, with transparent backgrounds and existing message actions preserved. Shared Avatar accepts an optional border-color override; other avatar styles retain their existing defaults. Native appearance/gesture checks remain pending.

**Latest avatar size/position refinement:** Live-chat avatars are now 26 points with a 3-point top offset on host/viewer and party lives. Preserve the 1-point, 50%-opaque white border and stacked username/message layout. Device appearance check pending.

**Latest live chat text-size correction:** Message text is now 14 points in Inter Regular on host/viewer, including party lives. Usernames stay at 12 points in Inter SemiBold. Preserve the avatar, colors, transparent backgrounds and message actions. Native wrapping/appearance check pending.

### Gold live counter icons — 2026-09-15

The user reported a white coin in the iPhone live counter; inspection found both host and viewer counters still used the system coin emoji. Replaced both with a 14-point gold SVG icon shared with the existing 16-point account-header artwork. Explicit fills preserve the gold color across platforms. Live earnings/count calculations and leaderboard tap behavior are unchanged. Applies to regular and party lives. Native iPhone appearance check remains pending; include this JavaScript change in the next TestFlight build. No build or environment changes were made.

### Viewer live menu order — 2026-09-15

Viewer three-dot menu now reads Report, Translate, Share, Exit Live. Removed “chat” from the viewer translation label; retained translation state/consent and all existing action handlers. All supported app languages include the shorter label. Native menu/action checks remain pending.

**Top Gifters gold icon:** Replaced the coin emoji beside leaderboard totals with the shared explicit-gold artwork. Ranking, amounts and sheet behavior are unchanged; native visual verification remains pending.

## iPhone demo-stream transition regression — 2026-09-16

The accepted behavior and future troubleshooting sequence are maintained in [Stream navigation and swipe transitions](stream-navigation.md).

User confirms Discover did not flash between demo streams in TestFlight build 4, and does flash when swiping up in build 9. Builds 5–8 were not confirmed tested for this behavior; do not attribute introduction specifically to build 9. Exact build-to-commit mapping is unavailable: the currently configured EAS project history only returned completed iOS build 2.

The existing modal presentation and swipe replacement code predate this regression window; they are a possible exposure mechanism, not a proven newly introduced cause. Current provisional mitigation uses a stack card for the viewer route, retaining the vertical transition. The user rejected the added black background because the iPhone symptom may be another manifestation of the category mismatch; both newly added black backgrounds (route content and viewer root) were removed. The existing background styles remain as before this investigation. Category fallback and bidirectional looping remain, alongside the provisional card presentation change; device testing has not isolated their effects. Mobile TypeScript and diff formatting checks pass. The later iPhone device confirmation below supersedes the pending flash validation; identification of the triggering change remains unconfirmed. Preserve the approved chat, keyboard, gifts and party behaviors while investigating.

### Stream-list boundaries — 2026-09-16

User reports Android does not show the Discover flash, but after swiping to the end and back to the first stream, another downward swipe exits to Home. Latest explicit correction supersedes the initial stay-at-the-boundary interpretation: streams loop in both directions on both platforms. Down from the first opens the last; up from the last opens the first. Empty/single-stream lists and a current stream absent from the list do not navigate or exit. Explicit close/Exit Live controls remain unchanged. Device verification pending: loop across both boundaries repeatedly and verify explicit exit.

### First-visit Android flash — 2026-09-16

User clarified Android also has a faint whitish/translucent flash on the first visit to each demo stream; revisiting already seen streams does not flash. iPhone shows translucent Discover on every transition. This supersedes the earlier broad report of no Android flash. Inspection found the incoming preview uses the cached list category, while the actual demo previously used only the detail-query category and temporarily fell back to Other's blue palette on a cold visit. The demo now falls back to the same cached list category immediately. This fixes a concrete first-render palette mismatch; it does not prove the reported white flash or iPhone Discover exposure has the same cause. The later iPhone confirmation below establishes the reported flash is fixed on that device; detailed cold/repeat coverage and Android outcome were not explicitly confirmed.

### iPhone flash confirmed fixed — 2026-09-16

After rebuilding the iPhone app, the user confirmed: “issue is fixed in iphone.” The tested build number was not supplied. This is user-reported device confirmation of the flash fix, not just a type/build check; it does not isolate which change resolved it or establish the original triggering commit.

Preserve the accepted implementation: regular full-screen stack page navigation on both platforms, demo category fallback from the cached stream list, and bidirectional first/last looping. The user explicitly accepted regular page navigation and required the existing swipe animation to remain the same; its direction and 320 ms timing remain unchanged. Do not restore the rejected additional black backgrounds. Android’s latest report was ambiguous (“now more flashe”) and was not clarified; do not record Android success or regression from it. Real-live-stream coverage and boundary/exit device checks were not separately confirmed.

### Viewer display timeout — 2026-09-16

User reports the iPhone display sleeps after the configured timeout while watching a stream. Inspection found keep-awake protection on the broadcaster only. The viewer now mounts an Expo keep-awake lock while focused and allowed to watch, releasing it on blur/unmount, stream end or access restriction. Uses the existing dependency; host behavior is unchanged. See [display-sleep requirements and device checks](stream-navigation.md#display-sleep-while-watching). Native timeout testing remains pending; the earlier iPhone confirmation covered the transition flash, not this new fix.

### Viewer right swipe should hide messages — 2026-09-16

User reported iPhone right swipe navigating back after the viewer became a regular stack page. Disabled native navigation gestures only for `stream/[channelId]` using `gestureEnabled: false`; the existing right-hide/left-restore handler and animations remain. Keep the accepted stack presentation and flash fixes. See [gesture requirements and device checks](stream-navigation.md#iphone-horizontal-swipe-back-conflict--2026-09-16). Native verification remains pending.

### Installed build visible in Settings — 2026-09-16

Settings → About → App version now displays the installed app version and native build number as `1.0.2 (12)` (example only). `expo-application` supplies `nativeApplicationVersion` and `nativeBuildVersion` from the installed binary (iOS CFBundleVersion / Android versionCode), rather than guessing from remote EAS history or app.json. The SDK-matched existing transitive package is now a direct mobile dependency. The separate Bundle version row remains for JavaScript troubleshooting. When native metadata is unavailable, such as web, retain the configured version/Unknown fallback and omit the unavailable build. Device verification: compare the Settings number to TestFlight on iPhone and the installed Android build. This change does not start a build or infer the current installed build number.

### Blank viewer after Premium entry payment — 2026-09-16

User reported iPhone video remaining blank after paying during a public-to-Premium conversion, with exit/re-entry restoring playback. Fixed a viewer Agora singleton cleanup race where a retired token request could release the replacement connection; reset old render readiness while admission blocks access. Same live session and screen remain; the existing protected-media-channel switch remains. Four mocked reconnect regressions and mobile TypeScript passed. Actual iPhone conversion/payment/video recovery remains unverified. See [reconnect requirements and regression evidence](coins-premium-revenuecat.md#premium-conversion-viewer-reconnect--2026-09-16).


## Go Live startup recovery and background caching — September 16, 2026

Reported: iPhone Go Live remains spinning and the stream never appears on another device. Saved background thumbnail is also blank, but coins/profile picture load. Account reported as `javilo2`; the user explicitly confirmed TestFlight now uses Replit production, not development. The precise deployed hostname/build is not yet verified. Development health/feed checks succeeded, which does not prove production or iPhone connectivity.

Confirmed code defects: startup authentication/network/body reads had no deadline, cleanup could also wait indefinitely, and camera-ready setup did not display startup errors stored in camera-error state. Host requests now opt into 20-second deadlines (stream ending: 5 seconds), including authentication and body parsing. A late authentication result cannot send an expired request. Startup failures show an alert with the failed step; a finally block restores the button after bounded cleanup. Existing request callers without a timeout keep their normal behavior. An aborted HTTP request is not a guaranteed server rollback; existing heartbeat expiry remains a fallback for orphan sessions. This addresses indefinite waiting/error visibility, not a confirmed root cause of the reported iPhone stall.

User also requested local background caching; see [background cache requirements](stream-background-crop.md#local-background-cache--september-16-2026). No broadcaster keyboard/dock layout changed.

Automated checks: startup request tests exercise stuck authentication/fetch/body reads, late token settlement, cancellation, HTTP errors and successful retries; startup flow tests exercise creation/token failures, failed cleanup, visible alerts and successful media-channel handoff. Native iPhone testing and delivery in an updated build remain required.

Environment correction (September 16): TestFlight now uses Replit production, explicitly confirmed by the user. Earlier development-service instructions above are historical; do not revert the build to development. Production diagnosis must use the production endpoint/account. RevenueCat test-mode decisions remain separate.


Reported affected build: **1.0.2 (11)** on iPhone TestFlight. The user confirms Replit production. A read-only EAS `production` environment lookup from the workspace's linked project still returned the current development hostname; this may represent a different/stale project configuration and is not proof of the installed binary's endpoint. Requested the published production URL before investigating that server. No EAS values were modified. The new cache/startup changes are not present in the reported build.

Validation completed: API-client declaration build, mobile TypeScript, both startup test scripts and diff whitespace check passed. These are code checks, not native/iPhone or production-account verification.


### Production read-only checks — September 16, 2026

User supplied `https://chimbalivestream.replit.app` as the production server used by TestFlight 1.0.2 (11). Production health, stream feed, exact-name user search and UID 39726 profile requests returned HTTP 200. `javilo2` still has a saved stream-background object path; its signed download returned HTTP 200 with 144,340 bytes. The account has no uploaded avatar URL in this API response; the visible profile picture may come from the authentication provider/local cache, so that observation alone does not prove all profile-image requests succeed.

These results rule out a missing background record or unavailable object at the time of the check. They do not establish the cause of build 11's blank thumbnail or infinite startup spinner. No authenticated stream was created and no account, production configuration or deployment was changed. Requested a controlled app reopen/retry to distinguish a persistent failure from stale app state. Local caching and bounded startup/error visibility remain prepared code changes, not a verified production/device repair.


Device follow-up: the user first reported that both problems remained after reopening, then closed/reopened again and reported that the images now appear. The user subsequently explicitly confirmed that Go Live also starts the broadcast successfully. Both the background and startup recovered on the existing TestFlight 1.0.2 (11) build against Replit production. No production deployment or new TestFlight build occurred during this recovery, so it cannot be attributed to the prepared caching/deadline changes. The original cause remains unconfirmed.


### Broadcasting screen sleep and mandatory regressions — September 16, 2026

The user corrected the reported broadcasting device from iPhone to Android, then explicitly requested that **both** platforms stay awake. Implemented shared activation retry/foreground renewal for host and viewer and a pnpm native patch that reapplies the Android/iOS idle-prevention setting for existing tags. Exact device trigger remains unconfirmed. Both Android and iPhone must be rebuilt for the native repair; no build was started. The Live Viewers list also now closes after 10 idle seconds, resetting on interaction and pausing for moderation. The user requires the [stream-screen regression checklist](stream-screen-regressions.md) on every future viewer/broadcaster functionality change; root AGENTS.md now enforces that workflow. Native device sleep/keyboard/gesture checks remain pending.
