# Signup onboarding

## Implemented new-account onboarding — September 16, 2026

The existing email signup form now includes **Birthday** with labeled Day/Month/Year inputs, “You must be 18 or older to use Pulse,” and an initially unchecked Terms of Service checkbox with an independently tappable link. Creating an account requires matching passwords, a valid adult birthday and explicit agreement. Reading the terms does not check the box. All new fields, notices, consent wording and errors are bundled in the ten supported app languages; language changes retain entered values. Arabic text direction is preserved, and numeric entry accepts Arabic, Persian, Devanagari and full-width digits.

The date policy uses UTC calendar birthdays, a four-digit year from 1900 onward, and March 1 for the eighteenth birthday of a February 29 birth in a non-leap year. Both form and server reject missing, malformed, impossible, future and under-18 dates. No native date-picker dependency or build-profile change was added.

Birthday/terms declarations travel through Clerk signup metadata during the existing email verification flow. Authenticated `POST /api/users/clerk-sync` independently validates them before creating a **new Pulse account**. It binds the account to the verified Clerk session rather than trusting the submitted Clerk ID; concurrent retries create one account. The private `user_onboarding` table records the declared birthday, accepted terms version and server acceptance time, atomically with account creation. Public profile responses and the local profile cache do not contain those fields. Signup never creates or grants Didit verification or enables Mature Content.

Missing or invalid declarations on an authenticated signup show a completion form before app navigation. This supports interrupted signup and future authentication methods using the same sync endpoint. Network errors offer retry; cached existing profiles remain usable during temporary connectivity failures. Account switching/sign-out and late responses cannot attach another account's onboarding or profile. `PUT /api/users/:uid` now requires the authenticated owner and only updates an existing profile; it cannot create an account to bypass onboarding.

**Scope:** existing Pulse accounts retain their profiles and access; no birthdays or acceptance records were invented for them. A separate legacy-account backfill/enforcement plan remains open. Phone signup remains disabled. Google OAuth is now implemented as recorded below; Clerk setup and device testing are pending. Premium/feed verification enforcement remains separate work.

**Development policy version:** `pulse-terms-preview-2026-09-16`, shown on the linked terms page. This records development testing against the current preview; it is not acceptance of a final launch agreement. Finalize policies, set a new version and define reacceptance before public release. The privacy draft now explains the declared birthday and Clerk/Pulse processing. Existing final-policy and retention tasks remain open.

**Validation completed:** API/mobile typechecks, shared database declarations, API build, HTTP/database onboarding regressions, display-name/profile preservation, localized signup-form tests, account-sync recovery/isolation tests and all ten catalogs (819 strings) passed. Boundary tests cover exactly 18, leap days, malformed/future/underage dates, missing or obsolete terms, authenticated identity mismatch, direct profile-create attempts, retry concurrency, private response fields and no verification grant. New synthetic rows are removed by the tests; no real Clerk account, email or provider check was created.

Migration `20260916_signup_onboarding.sql` is applied in development. The development API was rebuilt and restarted as PID 6828, preserving launch settings and the existing local RevenueCat configuration. On the running public API, unauthenticated account sync and profile updates return 401; updated terms/privacy pages return 200 and contain the new version/processing details. RevenueCat's unsigned webhook remains 401 and Didit remains sandbox.

**Remaining device check:** actual email delivery and signup, birthday keyboard/layout, opening/returning from terms, Arabic/large text, interrupted signup and account switching on iPhone/Android. Component tests use mocked native/Clerk/storage; these do not establish physical-device behavior or completed live verification.

## Account-sync render-loop fix — September 16, 2026

The user reported “Maximum update depth exceeded” around the cached-profile state updates in `AuthContext.tsx`. The installed Clerk Expo `useAuth` creates a fresh `getToken` function on every render. Depending on it changed `completeSignup`, which retriggered the account-sync effect and its state updates; the country-refresh effect also depended on that changing function.

`AuthContext` now uses a stable token callback that reads the latest Clerk callback through a ref. Account changes and explicit retry/completion still trigger the intended work. The original test used an unrealistically stable Clerk token function; the revised mock matches the installed SDK and reproduced repeated account sync before the fix. After the fix, twelve ordinary renders trigger no extra sync/country requests, and replacing the token callback still supplies the newest token for an explicit request. Account switching, stale responses, cache/recovery and localized signup regressions pass, as does mobile typecheck. Actual phone recovery after reloading remains to be confirmed. This is a client-only fix; no server behavior, provider settings or build profile changed.

## Signed-out Profile sign-in chooser — September 16, 2026

**Correction:** preserve the original centered guest Profile layout, 64-point profile icon, 28-point title, description and signup link. Only replace “Your Profile” with **Sign In** and place the Google/Apple/Email buttons below the description. The top-header layout introduced with the chooser was rejected and removed. Keep the separately requested signup option order and neutral Email styling.

Latest user decision: the signed-out Profile page now has the **Sign In** header and three equal-style options in order: **Google → Apple → Email**. Google/Apple start the existing Clerk flows directly. Email opens the existing email/password login route; that route is now email-only, retaining recovery and email verification. The **Sign up** link opens the current Create Account method screen.

Create Account now shows **Google → Apple → Email**, with Email directly below Apple and the same neutral card/background/border treatment. The Phone placeholder is removed from signup and is not shown on signed-out Profile. This supersedes earlier decisions to display a disabled Phone option and to emphasize Email with the primary fill. Signed-in profile layout and behavior are unchanged. The new Email sign-in label is translated in all ten languages. Native visual checks remain pending.

## Apple sign-in — September 16, 2026

User reported enabling Apple in Replit and requested its login button directly below Google. Signup-method selection now shows Google → Apple → Phone (Coming soon) → Email. Login shows Google then Apple below the email form. Apple uses **Sign up with Apple** / **Sign in with Apple**, the Apple icon and translated errors in all ten catalogs.

Both providers share the existing browser SSO handling through Clerk, using `oauth_apple` or `oauth_google` and `mobile://sso-callback`. Google behavior and callback handling are preserved. No new native module or app identifier/configuration change was needed. New Apple users complete the same server-validated Birthday & Terms flow before a Pulse profile is created. Provider authentication does not grant Didit verification or mature-content access.

Validation: mobile typecheck, shared Apple/Google OAuth regressions, signup provider ordering and all ten language catalogs (833 strings) pass with mocked browser/Clerk/native modules. No real Apple identity or session was created by these checks.

Apple configuration is Replit-managed, as is Google; the user's enablement report is not evidence of successful Apple consent/return. Real Apple login remains to be tested, including cancellation, returning users, Hide My Email, missing/restricted identity details and iPhone browser return. No automated identity linking by email was added. The earlier Google-language report was clarified as Google's own sign-in page; Pulse language was not changed.

## Google sign-in through Clerk — September 16, 2026

**Device update:** the user confirmed Google was already enabled in Replit and subsequently reported successful Google sign-in on their device. Platform, returning/new-user case and production environment were not specified; do not treat this as all-platform launch sign-off. The user then reported English changing to Spanish on the second screen after tapping Google. Which screen changed (Google-hosted vs Pulse onboarding) is awaiting clarification. The current Google flow does not change Pulse's saved language preference; the installed Clerk SSO hook has no language parameter. No language override or provider URL modification has been applied.

The app now offers an enabled Google action on signup-method selection and **Sign in with Google** on email login. Phone remains Coming soon. This uses the installed Clerk Core 3 browser SSO hook (`@clerk/expo/experimental`), `oauth_google`, existing Expo browser/auth-session dependencies and the existing `mobile` app scheme. No new native module, build profile, authentication provider or API endpoint was added. Clerk activates completed/existing sessions; Pulse never grants a session based on callback query parameters. A dedicated `sso-callback` route provides loading/back navigation if Expo Router opens the return URL, including a cold return that must restart sign-in rather than trust URL data.

The shared button handles silent cancellation/dismissal, retryable generic errors, missing requirements and duplicate-tap protection. New Google identities pass through the existing authenticated account-sync flow: missing birthday/Terms produce the account-completion screen, and the backend creates the Pulse profile only after valid 18+ birthday and explicit current Terms acceptance. Google authentication can create a Clerk identity before this completion; it does not grant Didit verification or Mature Content. Existing Pulse users retain the current sync/profile flow. Account linking is delegated to Clerk, with no client-side email matching or account merging.

**Corrected setup — Replit-managed Clerk:** the user confirmed Clerk was provisioned through Replit. Manage the existing tenant in **Replit Project Editor → Auth → Configure → SSO providers → Development → Google**, enabling Google there. Replit-managed tenants are not accessible through a separate Clerk dashboard; the earlier direct-dashboard instructions do not apply. Replit provides managed OAuth credentials by default. Custom branded credentials are optional production configuration through Replit's Auth pane. Keep the existing managed Clerk keys and tenant. The app requests `mobile://sso-callback`; acceptance of that native return must be tested against this managed tenant. Replit's public Auth guide does not establish a user-facing mobile redirect allowlist, so do not direct the user to an unavailable Clerk Native applications dashboard. If the callback is rejected, investigate Replit's supported native OAuth configuration before changing the integration. [Replit Clerk Auth documentation](https://docs.replit.com/features/auth-and-identity/clerk-auth).


**Checks passed:** mobile typecheck; Google button regressions for strategy/callback, no fabricated onboarding metadata, cancellation, completed/existing sessions, incomplete results, safe errors/retry, duplicate taps and disabled/loading guards; existing localized signup regressions; account-sync onboarding/cache/isolation regressions; all ten catalogs (830 strings). Tests mock Clerk/browser/native and create no Google identity/session. Replit provider enablement/native callback support, Google consent/return on iOS and Android, first-user birthday/Terms completion, existing-user account linking, cancellation, cold return, MFA/extra Clerk requirements, logout/relogin and production credentials still need real-device validation. Extra provider requirements show a safe retry/email fallback; no bypass is implemented. No production readiness is claimed.

References: [Clerk Google OAuth setup](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google), installed `@clerk/expo` hook declarations and implementation.

## Signup header cleanup — September 16, 2026

Latest user request: move **Create Account** into the top header and center **Join Pulse and start enjoying live streams.** in the content. Applied to signup-method selection and email credentials. Birthday/terms and email-code verification use their existing titles (**Birthday & Terms**, **Check Your Email**) in the same header position, as the user requested for the other two screens. Headers respect the top safe area and retain Back; the Pulse logo, four-stage progress bar, form actions, values and keyboard-aware scrolling remain. The new sentence is translated in all ten languages. Native visual checks remain pending.

## Four-stage signup progress — September 16, 2026

The user confirmed successful account creation on a device with the two-step flow, then requested a four-stage bar: **Pulse Installed → Create Account → Accept Terms → Verify Account**. Verify Account explicitly means the email code, not Didit age/ID verification.

A shared progress component now appears below the Pulse logo on the signup-method, credentials, birthday/terms and email-code screens, replacing the earlier two-step counter. Pulse Installed is checked; Create Account is highlighted on method selection and credentials; Accept Terms is highlighted on birthday/terms; Verify Account is highlighted while entering the email code. Latest user correction: completed stages use the same primary color as the current stage, retaining white checkmarks; completed connector lines and labels also use the primary color. The current stage now uses a 2-point primary-color ring with an unfilled center and white number; upcoming numbers use white at 65% opacity so they are slightly dimmer, as requested; completed stages remain solid with white checkmarks. Upcoming connector lines use white at 40% opacity so the connections to stages 3 and 4 remain visible. Upcoming circle outlines also use white at 40% opacity to match the connector lines. The Pulse Installed label uses the same bold white styling as the current stage label for readability; its completed circle and checkmark are unchanged. These mark progress through the form: the Create Account stage does not move the Clerk creation request ahead of birthday/terms validation. Back and error recovery update the indicator with the existing flow.

All labels are bundled in ten languages. Labels wrap without truncation, and the progress indicator exposes its current stage to screen readers. Physical-device checks of the new bar remain pending, especially small screens, large text and longer translated labels. The user's successful account-creation check predates this visual change.

## Two-step email signup — September 16, 2026

User approved separating email signup into two short steps. Step 1 shows email, password and confirmation with **Continue**. Step 2 shows **Birthday & Terms**, the 18+ notice, birthday inputs, explicit agreement and **Create account**. Both show localized step progress; new titles/progress are bundled in all ten languages. Continue does not call Clerk or create an account. Creation is gated on both valid credentials and birthday/terms, followed by the existing email-code verification.

The on-screen Back action returns from step 2 to step 1 while retaining all entered values and agreement; Android hardware Back also returns to step 1 when the keyboard is closed. Step changes dismiss the keyboard and reset scroll position. Keyboard-aware scrolling and birthday auto-advance are preserved. Clerk creation failures return to the credentials step so existing email/password errors can be corrected without re-entering birthday or terms. The signed-in account-completion recovery form remains unchanged.

Mobile typecheck and mocked signup regressions pass, including no early account creation, back/value preservation, error recovery, underage/terms gating and email verification. Device checks remain pending for keyboard/focus, native back behavior and both steps in translated/large-text layouts.

## Birthday keyboard scrolling — September 16, 2026

Birthday entry automatically advances Day → Month → Year after two digits are entered in Day or Month, including supported localized digits. Enter leading zeros for single-digit days/months. Editing an already complete field does not unexpectedly advance focus; Year remains focused after entry. This applies to both onboarding forms and retains keyboard-aware scrolling. Native focus behavior still needs a phone check.

The user reported that selecting Month left the birthday input covered by the keyboard. Both the email signup form and the account-completion form now use the existing keyboard-aware scroll component, which scrolls the focused input above the keyboard on iOS/Android with 32 points of clearance. The old outer keyboard-avoiding wrapper is removed to avoid duplicate adjustment. Web retains the existing component's standard scroll fallback. Birthday fields, values, validation and translations are preserved.

Mobile typecheck, existing mocked signup-flow tests and all ten language catalog checks pass. Physical-device verification remains pending: tap Day, Month and Year with the keyboard closed and already open; switch from password to birthday; dismiss/reopen the keyboard; and check small screens, large text and Arabic on both signup forms. Automated checks do not confirm native keyboard visibility.

## User decisions — September 11, 2026

Show a signup method screen before the email account-creation form. Offer Sign up with Google, Sign up with Phone and Sign up with Email. Originally Google and Phone displayed Coming soon. The later Google implementation below supersedes that restriction for Google only; Phone remains disabled. Email opens the existing registration form.

Use the existing app language selection for every label, including Coming soon. First-time users follow the detected phone language with English fallback; a saved manual app-language selection takes precedence. The signup option and password-confirmation strings are bundled in all ten catalogs, so signup wording works offline. Preserve Pulse as English and retain Arabic text direction without globally mirroring navigation or layouts.

The user approved adding Confirm password. Email signup now requires email, password and a matching confirmation before requesting account creation. Compare passwords exactly, including case and whitespace. Show localized mismatch feedback when a nonempty confirmation differs, and clear it once they match. The confirmation is hidden by default with its own show/hide control; it is local form state and is not included in the Clerk request. Preserve the existing email verification step.

## Approved next signup requirements — September 11, 2026

The signup birthday/terms portion is implemented as recorded above. Verification-based feed access, legacy accounts and remaining release checks are still open.

- Pulse is **18+ only**. Require a full birthday/date of birth during signup and clearly display “You must be 18 or older to use Pulse.”
- Reject missing, invalid, future, and under-18 dates. Define the date/time policy and verify the exact eighteenth-birthday boundary, including leap-day birthdays.
- Require explicit agreement to the Terms of Service before signup completes. Use an initially unchecked checkbox with a working terms link; do not infer agreement from entering a birthday.
- Apply these requirements to every enabled signup method, including Google when implemented. Enforce them on the backend as well as the form, and record the accepted terms version and acceptance timestamp against the account.
- Preserve password confirmation, email verification, existing navigation, and localization requirements above. Localize the new fields, notice, agreement, and validation messages.
- Capture date of birth as part of onboarding to determine 18+ eligibility. Birthday entry alone must not mark an account verified.
- Use an external ID-verification service and show whether a user has successfully completed verification. Didit is the preferred provider to test; production readiness and exact status-display placement remain open.
- Mark an account verified only after the backend validates a successful provider result associated with that account and confirms the required 18+ outcome. A client-side success screen or submitted document is not sufficient.
- Track not-started, pending, verified, failed, and review-needed outcomes separately. Public verification status must not expose date of birth, ID documents, or failure details, and must not imply a broader safety endorsement.
- Prefer provider-hosted document capture and keep raw ID documents out of Pulse storage unless a reviewed requirement calls for them. Define the verification reference, outcome, timestamps, retention, and staff access needed before implementation.
- **Confirmed access rule:** users may join without completing ID verification, after satisfying the birthday-based 18+ gate and terms acceptance. Unverified users may only view a limited public-feed preview, followed by a “Verification required” prompt with a verification action and explanation. This supersedes unlimited public-feed viewing; the exact time/item allowance and reset behavior remain open (“a min” needs clarification). Preview access this does not authorize posting, messaging, live participation, purchases, or other product features. Keep reporting/blocking for encountered content, onboarding, verification, policy, support, and account-management access available so users can verify or manage their accounts.
- Enforce public-feed-only access on the backend as well as navigation, including deep links and direct API requests. Pending, failed, and review-needed verification states do not grant verified access.
- **Feed strategy source received:** [Stream filtering and audience permissions proposal](stream-filtering-strategy.md). Review before defining feed content, ranking, eligibility, interactions, or implementation. Its Public Live level requires verified viewers; reconcile this with the unverified trial explicitly.
- **Latest planning status:** the automatic preview cutoff versus continued public-feed browsing with Premium/media participation locked remains undecided until stream filtering is reviewed. Earlier cutoff wording is conditional on that decision. **Later user decision:** actual live viewing is essential. Allow unverified trial users to watch qualifying public livestreams; reviewed clips alone do not satisfy the trial. This does not authorize mature/private streams or participation. Eligibility rules, moderation performance and failure behavior, and any preview cutoff remain to be agreed and tested.
- Open decisions: Didit production eligibility and market/document coverage; status-display placement; retry/appeal and existing-account handling; the detailed feed strategy and feature-access mapping. Country-specific review remains tracked in the [go-live plan](go-live-checklist.md).

### Approved website verification and mature-content opt-in

**Implementation checkpoint:** the website handoff, verification backend, separate mature preference, and Account → Age verification entry now exist. Provider account/credentials and device verification remain pending. See [Didit setup and test instructions](didit-verification-setup.md). New-account birthday/terms signup is implemented above; legacy-account rollout and Premium/feed enforcement remain separate unfinished work.

**Approved provider direction:** test Didit for Pulse's 18+ age/identity verification. Verification is intended to keep minors out of restricted features; it is not automatically an opt-in to mature content. If asked, describe Pulse's business and content accurately. Russia availability must not delay supported-market work; discuss a fallback or deferred access if it is unavailable, without bypassing verification. No provider account or live provider verification has been established; the integration is prepared locally as described in the implementation checkpoint.

User-approved flow, September 11, 2026. Local integration is prepared; real provider and physical-device verification remain open.

1. The user selects **Verify now** in Pulse.
2. Open the Pulse website with a secure, account-linked handoff. Complete ID and 18+ verification through the selected external service.
3. The backend validates the provider result for that account. Only a successful qualifying result grants verified status; neither the browser return nor client-supplied flags can do so.
4. After successful verification, offer a separate **Show mature content** option on the website, **off by default**. Verification must not automatically enable it. The user can remain verified with mature content disabled.
5. Return to Pulse and refresh verification and preference state from the backend before granting access. Users can later disable the preference on the website; the app must respect the change.

Maintain separate account values:

| Field | Default | Authority and purpose |
|---|---|---|
| `isVerified` | `false` | Backend-controlled result of successful ID/18+ verification; retain underlying status, provider reference, and verification timestamp. |
| `matureContentEnabled` | `false` | Explicit authenticated user preference set on the website after verification; retain the opt-in timestamp and relevant disclosure version. |

For content eligible for this restricted route, require both current verified status and mature-content opt-in. Content eligibility, following/creator permissions, and applicable Premium payment remain separate checks. Neither flag grants access to prohibited or otherwise ineligible content, and verification does not purchase Premium entry. Keep the mature preference private rather than exposing it through public profile data.

On iOS, enabling mature content occurs on the website, not through an in-app enable switch. This follows the intended website-opt-in pattern; it is not an Apple approval claim. [Apple §1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) describes incidental mature content from a web-based UGC service, hidden by default and enabled through its website. A website used only for verification does not by itself establish that Pulse qualifies. Review applicability, moderation, actual content, and monetization before submission.

Implementation acceptance checks: secure same-account handoff, canceled/pending/failed verification, rejected forged or replayed provider results, successful verification leaving mature content off, independent opt-in, preference withdrawal, return-to-app refresh, and backend enforcement against direct requests and stale state. Verify on actual iOS/Android devices separately from mocked or type/build checks. Didit is preferred for testing; provider setup, production validation, and website deployment remain open.

### Approved Premium card verification prompt

Premium lives are visible to unverified users as locked cards. Use the live's background image, suitable for public display, with an overlay containing a lock icon, “Premium,” and the entry price. Tapping the card while unverified displays:

> You must be verified to see this live.

Provide a route to complete verification. Successful 18+ verification is required before viewing; applicable payment is separate and occurs only after verification. Do not expose live video/audio through the locked preview. Localize the card and message, and enforce access on the backend as well as the UI.

This card and tap behavior are approved requirements; implementation and device checks remain open. The general feed cutoff remains undecided. The card does not establish platform approval of the underlying content.

### Approved end-of-preview verification prompt

User approved FOMO-oriented copy for the end of the limited unverified preview:

> **You’re missing what’s happening on Pulse**
>
> Your preview has ended. Verify you’re 18+ to keep exploring and join in.
>
> **Verify now**

Use truthful messaging without invented activity, countdowns, or claims that people are waiting for the user. This replaces the earlier generic “Verification required” prompt wording. Verification must still explain the ID service and data handling before capture; approval of this copy is not Apple approval of the access model. Keep reporting/blocking, support, policies, verification, and account-management access available after the preview ends.

Whether to apply a preview cutoff, and any allowance/reset rules, remains pending review of the [supplied stream-filtering proposal](stream-filtering-strategy.md). Copy is approved; implementation and device verification remain open.

Required implementation checks: preview allowance enforcement and persistence, verification prompt, reporting/blocking after preview expiry, unverified public-feed-only access, blocked restricted API/deep-link attempts, access transition after successful verification, authenticated provider results, rejected forged/duplicate callbacks, pending/failed/review outcomes, birthday/ID mismatch handling, verified-status display and privacy, missing/invalid dates, an under-18 date, exactly 18, leap-day boundaries, unchecked terms, working terms link, persisted acceptance version/time, API bypass attempts, and signup-method consistency. Record actual device and authentication checks separately from mocked or type/build checks.

## Routes and behavior

- `/(auth)/sign-up`: new method screen, reached through the existing signup links from sign-in, profile and go-live.
- `/(auth)/sign-up-email`: existing email/password and verification form, moved without changing Clerk account-creation, email-code or session-finalization behavior.
- Email pushes the form onto the native navigation stack, so Back returns to the method screen.
- The method screen retains the sign-in link and signed-in redirect. A direct entry with no back history returns to sign-in.

## Earlier signup-method verification — September 11, 2026

Mobile TypeScript passes. The signup flow test exercises detected Spanish on first use, Arabic text direction, disabled Google, email route navigation, sign-in link, back fallback, missing/mismatched confirmations, blocked submission attempts, exact matching, password edits, independent visibility controls, language changes preserving confirmation, rejected password requests, email-code verification and successful finalization with React/native/Clerk mocks. It creates no real account and sends no email. Localization checks pass for all 747 strings in all ten catalogs and continue checking the moved email form against the original behavioral attributes, excluding the explicitly approved new confirmation control, which the signup flow tests exercise.

Actual phone layout, native keyboard/back navigation and real Clerk email delivery still need a device check. No backend behavior or endpoints changed.
