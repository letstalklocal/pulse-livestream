# Signup onboarding

## User decisions — September 11, 2026

Show a signup method screen before the email account-creation form. Offer Sign up with Google, Sign up with Phone and Sign up with Email. Google and Phone display Coming soon and are disabled; no OAuth or phone/SMS flow is enabled. Email opens the existing registration form.

Use the existing app language selection for every label, including Coming soon. First-time users follow the detected phone language with English fallback; a saved manual app-language selection takes precedence. The signup option and password-confirmation strings are bundled in all ten catalogs, so signup wording works offline. Preserve Pulse as English and retain Arabic text direction without globally mirroring navigation or layouts.

The user approved adding Confirm password. Email signup now requires email, password and a matching confirmation before requesting account creation. Compare passwords exactly, including case and whitespace. Show localized mismatch feedback when a nonempty confirmation differs, and clear it once they match. The confirmation is hidden by default with its own show/hide control; it is local form state and is not included in the Clerk request. Preserve the existing email verification step.

## Approved next signup requirements — September 11, 2026

Status: requirements recorded; not implemented or verified by this documentation update.

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

**Implementation checkpoint:** the website handoff, verification backend, separate mature preference, and Account → Age verification entry now exist. Provider account/credentials and device verification remain pending. See [Didit setup and test instructions](didit-verification-setup.md). Birthday/terms signup and Premium/feed enforcement are separate unfinished work.

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

## Verification

Mobile TypeScript passes. The signup flow test exercises detected Spanish on first use, Arabic text direction, disabled Google, email route navigation, sign-in link, back fallback, missing/mismatched confirmations, blocked submission attempts, exact matching, password edits, independent visibility controls, language changes preserving confirmation, rejected password requests, email-code verification and successful finalization with React/native/Clerk mocks. It creates no real account and sends no email. Localization checks pass for all 747 strings in all ten catalogs and continue checking the moved email form against the original behavioral attributes, excluding the explicitly approved new confirmation control, which the signup flow tests exercise.

Actual phone layout, native keyboard/back navigation and real Clerk email delivery still need a device check. No backend behavior or endpoints changed.
