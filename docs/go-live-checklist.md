# Pulse go-live development checklist

Created: September 11, 2026  
Status: Planning — no launch date committed

## Purpose and tracking

This is the working development plan for getting Pulse ready for public launch. The first six workstreams are requested priorities. Additional items are proposed launch checks to review and scope; they are not a claim that every feature is missing or a decision to redesign approved behavior.

All boxes start unchecked. Check an item only when its acceptance checks pass and evidence is recorded. Existing code is not proof of production readiness. Assign a named owner and target date before starting each workstream.

Use [Policy compliance checklist](policy-compliance-checklist.md) for detailed policy review and source references. Recheck applicable platform requirements before submission. This plan does not choose launch countries, minimum age, vendors, or legal policy wording.

| ID | Workstream | Status | Owner | Target | Evidence / sign-off |
|---|---|---|---|---|---|
| A1 | In-app purchases (IAP) | Open | TBD | TBD | — |
| A2 | Google sign-in | Open | TBD | TBD | — |
| A3 | Age verification | Didit preferred for testing; implementation open | TBD | TBD | — |
| A4 | Admin website | Needs scope and access review | TBD | TBD | — |
| A5 | Policy website and app links | Open | TBD | TBD | — |
| A6 | Moderation process | Stream-filtering proposal received; review open | TBD | TBD | — |
| A7 | Public feed strategy and verification access | Source document received; review open | TBD | TBD | — |
| B1 | Account lifecycle and support | Proposed | TBD | TBD | — |
| B2 | Security and production operations | Proposed | TBD | TBD | — |
| B3 | Core app and device QA | Proposed | TBD | TBD | — |
| B4 | Store submission and release | Proposed | TBD | TBD | — |

## A. Requested development priorities

### A1. In-app purchase functionality

- [ ] Confirm launch products: coin packs, Premium if included, and which paid features use coins versus direct entitlements.
- [ ] Configure products and production/sandbox credentials for each launch store; confirm the billing route for each product using the policy review.
- [ ] Implement checkout, clear prices, cancellation, pending purchases, failures, and retry behavior.
- [ ] Validate transactions on the backend and grant coins/access exactly once, including duplicate notifications and interrupted requests.
- [ ] Handle applicable renewal, expiration, refund, revocation, and purchase reconciliation events; define how refunded/spent coins are handled.
- [ ] Implement restoration for restorable products and reconcile balances/entitlements after reinstall or device changes.
- [ ] Verify gifts, paid media, private entry, and Premium consume the correct balance or entitlement, including simultaneous requests.
- [ ] Disable production access to development coin grants and reconcile purchase records with wallet/earnings records.
- [ ] Complete store sandbox tests on real iOS/Android devices for the platforms being launched and record results.

**Done when:** successful purchases provide the correct value once, failure/recovery cases work, and the team can trace and resolve a disputed transaction. If creator payouts launch, include payout reconciliation and applicable identity/payment review in scope.

### A2. Google sign-in

- [ ] Configure Google authentication for the production app identifiers and redirect URLs through the existing authentication setup.
- [ ] Complete signup/sign-in, cancellation, error handling, logout, session refresh, and returning-user flows.
- [ ] Define safe linking with existing email accounts; prevent duplicate accounts and unauthorized account linking.
- [ ] Route new Google users through the same required age, terms, and profile onboarding as other signup methods.
- [ ] Review the iOS login requirements and exceptions; add Sign in with Apple if required for the launch configuration.
- [ ] Verify sign-in on installed release builds for each launch platform, including redirect recovery and revoked access.

**Done when:** new and existing users can authenticate reliably without bypassing onboarding or losing their existing account data.

### A3. Age verification

**Setup checkpoint:** [Didit setup guide](didit-verification-setup.md) records the new local integration, required server secrets, webhook/callback URLs, and pending provider/device checks. No live provider account or completed verification is claimed; keep A3 open.

**Approved verification delivery:** **Verify now → account-linked Pulse website → external ID/18+ verification → optional website-only Show mature content setting → return to Pulse and refresh backend state.** Keep `isVerified` and `matureContentEnabled` separate, both defaulting to `false`; successful verification never automatically enables mature content. Full requirements and acceptance checks are in [onboarding](onboarding.md#approved-website-verification-and-mature-content-opt-in).

- [ ] Implement secure app-to-website account handoff and provider verification with backend-validated results.
- [ ] Add the separate, off-by-default website mature-content preference after successful verification, including later withdrawal.
- [ ] Implement return-to-app refresh and backend access checks using both flags where applicable; keep payment, following, and content eligibility separate.
- [ ] Test failure/cancellation, account mismatch, forged/replayed results, default-off state after verification, opt-in/withdrawal, and stale client state on release builds.

**Provider direction approved:** proceed with **Didit as the preferred provider to test**. The purpose is to keep Pulse 18+ and prevent minors from accessing restricted features; mature-content opt-in is a separate user preference. Describe Pulse accurately if the provider asks about its features or content. This decision does not mean an account has been created, commercial eligibility confirmed, or integration tested.

**Russia must not block progress.** Continue work for supported markets while confirming Russian resident/document availability separately. If unavailable, discuss a fallback or deferred verification access for Russia with the user. Do not silently remove the country, bypass verification, or mark affected users verified.

- [x] Record Didit as the preferred provider for evaluation and testing.
- [ ] Set up a Didit test workflow for ID, liveness/face match, and 18+ eligibility; validate website handoff and backend result handling using supported test facilities.
- [ ] Confirm workflow document coverage and production service eligibility for the priority markets; track Russia separately without blocking other work.

**Priority launch markets supplied by the user:** United Kingdom, Saudi Arabia, United States, Colombia, Russia, Spain, Canada, Australia, Venezuela, Mexico, Costa Rica, Argentina, and Brazil. This records the intended markets; availability and country-specific requirements still need review before launch.

**Confirmed user requirement:** Pulse is **18+ only** across all priority launch markets. Users under 18 must not be permitted to create or use an account. Enforce this consistently across all signup methods and relevant backend access, including existing accounts.

**Confirmed signup approach:** require a birthday (full date of birth), clearly state “You must be 18 or older to use Pulse,” and require explicit agreement to the Terms of Service before signup can complete. Terms acceptance must use an unchecked checkbox with a working link to the terms. Block missing/invalid/future birthdays, users under 18, and submission without terms acceptance. Apply the same requirements to every enabled signup method, including future Google signup.

**Additional confirmed onboarding requirement:** capture age through date of birth, use an external service to verify ID, and show whether a user is verified. A birthday declaration or document submission alone must not earn verified status; the backend must validate the provider outcome and required 18+ eligibility. See [onboarding requirements](onboarding.md).

**Confirmed access rule:** users may join unverified after the 18+ birthday gate and terms acceptance, but may only view a limited public-feed preview until ID verification succeeds. After the preview allowance ends, show “Verification required” with a route to verify and an explanation of why it is needed. This supersedes unlimited unverified feed viewing. The exact allowance is pending clarification: “a min” may mean one minute or a minimal number of feed items. Preserve access to verification, policies, support, account management, and reporting/blocking for content already encountered. Enforce restrictions through both the app and backend. Detailed feed behavior depends on the user’s existing feed-strategy document.

**Open decisions/review:** Didit production eligibility and coverage across the priority markets (Russia is non-blocking); verification-status placement; birthday/ID mismatch handling; existing accounts; failed checks and appeals; data retention/access; and country-specific requirements.

- [x] Record priority launch markets and the user’s minimum account age decision: **18+ only**. This checkbox records the product decision, not completed implementation or country review.
- [ ] Review country-specific requirements and any additional age restrictions for watching, broadcasting, messaging, purchases, and payouts.
- [x] Record the user’s signup decision: required birthday, clear 18+ notice, and required terms agreement. Implementation remains open.
- [ ] Implement the birthday field and 18+ eligibility check, including exact eighteenth-birthday and leap-day boundary cases using a defined date/time policy.
- [ ] Add an initially unchecked terms agreement control and working Terms of Service link; require acceptance before completing signup.
- [ ] Enforce age and terms requirements on the backend and retain an account-linked acceptance timestamp and terms version.
- [x] Record the user’s access decision: unverified users may join and view only the public feed; broader product access requires successful ID verification. Implementation remains open.
- [ ] Implement the access rules in app navigation and backend authorization, including pending/failed/review-needed states, direct API requests, deep links, and the transition to verified access.
- [ ] Validate Didit for priority-market/document coverage, age/identity results, mobile onboarding, privacy, cost, and failure/review handling before production adoption.
- [ ] Integrate provider verification with backend-validated results and account-linked verification state; reject forged, replayed, or mismatched results.
- [ ] Show verification status without exposing birthday, documents, or private failure details; agree on display placement and wording.
- [ ] Test not-started, pending, verified, failed, review-needed, retry, provider outage, and birthday/ID mismatch cases; ensure only a confirmed qualifying result marks a user verified.
- [ ] Review the combined birthday and ID-verification approach for each priority market and define any additional checks needed before launch.
- [ ] Define the minimum data to collect, retention, access permissions, and user explanation.
- [ ] Implement checks across every signup method and enforce restricted actions on the backend.
- [ ] Define how existing accounts are assessed, incorrect age details are corrected, and failed checks are appealed.
- [ ] Test underage attempts, direct API/deep-link bypasses, verification outages, and restricted existing accounts using test data.

**Done when:** the agreed age policy is enforced consistently and verified with evidence. Email verification alone does not satisfy this workstream.

### A4. Admin website

The existing policy review describes the admin application as separate. Locate it and review what already works before planning replacements.

- [ ] Confirm its repository, deployment, domain, current features, and API integration.
- [ ] Agree on launch roles and permissions; secure staff sign-in and sensitive actions, including MFA.
- [ ] Provide scoped user/account lookup and approved account actions with reasons and an audit history.
- [ ] Provide purchase, wallet, and earnings lookup needed for support, with tightly controlled adjustments if approved.
- [ ] Reserve moderation queue/action requirements for A6; implement them after the user supplies the process requirements.
- [ ] Verify backend authorization, access to sensitive records, staff access removal, and audit records for privileged actions.
- [ ] Deploy and test the production admin workflow with the people responsible for operating it.

**Done when:** authorized staff can perform agreed launch support and moderation tasks, and unauthorized accounts cannot access those capabilities.

### A5. Policy website link

**Website dependency:** coordinate public policy pages with the secure verification and mature-preference pages specified in A3. Public policy access must not require verification or sign-in.

- [ ] Confirm the public website/domain and who owns policy content and updates.
- [ ] Prepare and review the applicable privacy policy, terms, community/safety standards, and support/contact information.
- [ ] Publish account-deletion instructions/request access and applicable purchase/refund/subscription information.
- [ ] Host stable public HTTPS pages that work on mobile without requiring an account.
- [ ] Connect the correct URLs in onboarding, app settings, and store listings; record required policy acceptance and version.
- [ ] Verify every link from release builds and check text matches actual app behavior and supported launch languages.

**Done when:** users and store reviewers can reach the approved, current policies from the app and public URLs. Detailed content review is tracked in the policy compliance checklist.

### A6. Implement a moderation process

**Source received:** [Stream filtering and audience permissions proposal](stream-filtering-strategy.md). Its proposed audience levels and automated enforcement need review and agreement; receiving it does not complete moderation design.

**User requirement:** the user has specific moderation requirements to provide when this work starts. Keep this workstream open. Do not select a vendor, finalize rules, automate enforcement, or treat the process below as approved before that discussion.

- [ ] Capture the user's requirements and obtain agreement on the launch process before implementation.
- [ ] Inventory existing reporting/blocking and identify gaps across livestreams, Party, profiles, posts/comments, DMs, paid media, and saved Moments.
- [ ] Agree on prohibited behavior, report categories, severity levels, response targets, staff coverage, and urgent escalation.
- [ ] Agree on review decisions, enforcement actions, user notices, appeals, and evidence access/retention.
- [ ] Decide the role of human review and any automated detection or filtering.
- [ ] Implement the approved workflow in the app, backend, and admin website, including assigned ownership and audit records.
- [ ] Document staff procedures and assign operational coverage before public launch.
- [ ] Run harmless simulated reports from intake through review, action, escalation, and appeal; verify urgent live-session intervention.

**Done when:** the user's requirements are implemented and staffed, and end-to-end exercises prove reports are handled. A report button alone is not a completed moderation process.

### A7. Public feed strategy and verification access

**Approved Premium discovery card:** show Premium lives to unverified users as locked cards. Use the live's background image, suitable for public display, with an overlay showing a lock icon, “Premium,” and the entry price. On an unverified user's tap, display: **“You must be verified to see this live.”** Require successful 18+ verification before access; any applicable entry payment remains separate and must not be taken from an unverified user. Do not reveal the live video or audio through the locked card. This is the agreed FOMO conversion approach, not approval to expose adult imagery in discovery.

- [ ] Implement the Premium background-image card with lock, Premium label, and accurate entry price.
- [ ] Implement the approved unverified-tap message and route to verification; preserve applicable paid-entry behavior after verification.
- [ ] Test card display, unverified taps, backend access enforcement, and verification/payment ordering. Record visual/device checks separately from type/build checks.

**Confirmed user decision:** actual live viewing is essential to the unverified trial. Reviewed clips alone do not satisfy the first-use experience. Unverified users must be able to watch qualifying public livestreams after the birthday-based 18+ gate and terms acceptance. This resolves the proposal's verified-only Public Live conflict for the trial; it does not grant access to every public stream or to mature/private content.

- [ ] Define which public livestreams qualify for unverified viewing, including thumbnails, audio, and any displayed chat; unknown/unreviewed eligibility must not automatically qualify.
- [ ] Prove ongoing moderation and backend-enforced removal of unverified access when a stream loses eligibility, including existing viewers and direct stream access.
- [ ] Measure detection-to-enforcement delay and determine whether the delivery path needs buffering to meet the agreed exposure target; define behavior during moderation outages and uncertain results.
- [ ] Test eligibility changes, reconnects, cached content, and moderation failure before enabling the live trial at launch.

The automatic cutoff versus continued qualifying live browsing remains open. Exact restrictions on participation, media, and Premium features must be agreed before implementation. Keep reporting/blocking and account/verification support accessible.

**Latest planning status:** decide the unverified trial only after reviewing stream filtering. The earlier automatic preview cutoff and the alternative of ongoing feed browsing with Premium/media participation locked are unresolved options. The approved FOMO copy remains available if a cutoff is chosen; no timer or content allowance has been agreed.

**User requirement:** unverified users may join and see a limited public-feed preview, then receive a “Verification required” prompt. Exact duration/item count and reset rules remain undecided. The [supplied stream-filtering proposal](stream-filtering-strategy.md) is saved; review it before finalizing implementation.

- [x] Save the [user-supplied feed/stream-filtering proposal](stream-filtering-strategy.md).
- [ ] Review the proposal, check its policy claims, and reconcile its verified-only Public Live audience with the desired unverified app trial before finalizing behavior or implementation.
- [ ] Record the approved public-feed content, visibility, ordering/ranking, and interaction rules from that document.
- [ ] Confirm preview duration or item count, when the allowance starts, whether it resets, and persistence across sessions/devices; implement backend enforcement and accessible verification messaging.
- [ ] Preserve reporting/blocking access during the preview and after the verification prompt, including reports about previously viewed content.
- [ ] Define which screens and API operations comprise public-feed viewing and which require verified access; do not assume public livestreams or interactions are included.
- [ ] Implement the approved feed strategy and coordinate verification-based access with A3.
- [ ] Test unverified, pending, failed, and verified accounts, including deep links, direct API requests, cached/private content exposure, and verification-state changes.

**Done when:** the feed follows the supplied strategy and users without successful ID verification can only view the approved public feed, with necessary verification/account-management access preserved. This work is pending requirements, not deferred out of launch scope.

## B. Additional proposed launch essentials

### B1. Account lifecycle and support

- [ ] Verify password reset, email verification, session expiry, logout, and account recovery.
- [ ] Complete account deletion through actual data removal/anonymization and user confirmation, including third-party data handling and justified retention.
- [ ] Resolve remaining coins, pending earnings, and subscriptions under the approved account rules; avoid indefinitely pending deletion requests.
- [ ] Establish a working support contact, ticket ownership, and procedures for access problems, purchase disputes, and safety escalations.

Reference: [Account settings](account-settings.md) and the deletion section of the policy checklist.

### B2. Security and production operations

- [ ] Review authorization for private content, messages, wallets, payout actions, and admin endpoints; test cross-account access attempts.
- [ ] Configure production authentication, API, database, media storage, streaming, notifications, domains, and secrets; keep test credentials/data out of production.
- [ ] Add appropriate abuse/rate limits and review upload validation and sensitive information in logs.
- [ ] Set up crash/error monitoring, health checks, alerts, and a named incident responder.
- [ ] Test database backup restoration and document deployment/migration recovery steps.
- [ ] Agree on expected launch traffic and test critical API/streaming capacity; set operating cost alerts.
- [ ] Rehearse rollback and agree on controls to pause affected purchases, uploads, or live features during an incident.

### B3. Core app and device QA

- [ ] Run a release-build journey covering onboarding, profile, Live/Party, messaging, gifts, paid access, earnings, reporting/blocking, and deletion for enabled launch features.
- [ ] Test camera/microphone permissions, recording disclosures, media uploads/playback, and app background/foreground behavior.
- [ ] Test slow/offline connections, reconnects, stream interruptions, and recovery without duplicate charges or lost balances.
- [ ] Verify push notifications and deep links with the app open, backgrounded, and closed; respect user notification preferences.
- [ ] Check supported device sizes, text scaling, accessibility, and launch languages, including safety and payment text.
- [ ] Run the relevant regression cases in [Chat message preferences](chat-message-preferences.md) and preserve all recorded user decisions.
- [ ] Record type/build checks separately from actual visual, physical-device, payment-sandbox, and operational tests.

References: [Performance goals](performance-goals.md), [Localization plan](localization-plan.md), and [In-app notifications](in-app-notifications.md).

### B4. Store submission and release

- [ ] Confirm launch platforms, countries, included features, and release owners.
- [ ] Complete signing, production release configuration, app metadata, screenshots, ratings, privacy/data disclosures, and reviewer access.
- [ ] Resolve visible unfinished features and development tools through explicit launch scope decisions.
- [ ] Review rights to distributed media, music, animations, and artwork.
- [ ] Complete an internal/beta release and triage findings; close launch-blocking defects.
- [ ] Recheck applicable items in the policy compliance checklist and record sign-off.
- [ ] Set a staged rollout plan, monitoring thresholds, rollback triggers, and support/moderation coverage for launch.

### Approved end-of-preview verification prompt

User approved FOMO-oriented copy for the end of the limited unverified preview:

> **You’re missing what’s happening on Pulse**
>
> Your preview has ended. Verify you’re 18+ to keep exploring and join in.
>
> **Verify now**

Use truthful messaging without invented activity, countdowns, or claims that people are waiting for the user. This replaces the earlier generic “Verification required” prompt wording. Verification must still explain the ID service and data handling before capture; approval of this copy is not Apple approval of the access model. Keep reporting/blocking, support, policies, verification, and account-management access available after the preview ends.

Whether to apply a preview cutoff, and any allowance/reset rules, remains pending review of the [supplied stream-filtering proposal](stream-filtering-strategy.md). Copy is approved; implementation and device verification remain open.

## Apple review considerations for the preview and ID gate

**Approved flow and remaining review:** mature content defaults off and is enabled separately on the website after ID/18+ verification. Apple’s §1.2 allowance concerns incidental mature content from a web-based UGC service; a verification website alone does not establish eligibility. Keep this applicability assessment open before submission.

Reviewed September 11, 2026 against [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). This is a design review, not approval or completed verification.

- Apple does not prescribe a one-minute feed preview. The preview length is a product decision, not a compliance guarantee.
- **5.1.1 / 5.1.2:** justify required ID information, minimize collection, explain provider sharing and retention, and obtain appropriate consent. Review whether less intrusive age assurance can meet the same need before finalizing a blanket ID gate for viewing.
- **1.2:** provide filtering, reporting, timely responses, blocking, and reachable contact information. These protections apply to preview content too.
- **Before You Submit:** give App Review full access through a demo account or demo mode and explain the verification flow.

Open launch check: assess the preview content and ID requirement against these provisions and each launch market; do not mark A3/A7 complete based on a timer or birthday field alone.

## Suggested delivery order

1. **Scope and decisions:** agree on platforms/countries, products, age approach, admin access, and owners. Request the user's moderation requirements when A6 starts. Inventory existing implementation before estimating.
2. **Foundations:** set up production services, the policy website, admin authentication/roles, and the purchase backend. Draft policy content alongside age/moderation decisions.
3. **User flows:** implement IAP, Google sign-in, age verification, policy acceptance/links, and account lifecycle completion. These can be separate workstreams once their dependencies are settled.
4. **Safety operations:** implement the agreed moderation process and admin tools; finalize policy text to match behavior and train operators.
5. **Release validation:** test integrated release builds, payment sandbox flows, recovery procedures, and policy/store readiness, then beta-test and stage the launch.

Do not promise dates until owners review scope and dependencies. A6 remains a launch blocker until the user's requirements are captured and the resulting process is operational.

## Out of scope for go-live — future investigation

- [ ] **C1. Agora alpha transparency for richer animated gifts.** Investigate [Agora's alpha transparency effect](https://docs.agora.io/en/realtime-media/rtc/build/apply-video-effects/alpha-transparency-effect) as a possible future live gift-rendering approach. Deferred by the user; this investigation is not a go-live blocker and does not authorize replacing the current camera-watermark implementation.
  - Compare against the existing approach using an isolated device proof: host preview, remote live video, and unchanged raw Moment MP4 must contain the intended animation without artifacts, duplicate gifts, or camera-mirroring changes.
  - Confirm compatibility with the installed SDK and recording path. Evaluate SVGA decoding and synchronized gift audio separately; alpha transparency alone does not establish either capability.
  - Preserve the requirement that animation and sound enter the live media path and saved recording, without post-recording compositing. See [Moments investigation and paused checkpoint](moments-feasibility.md) and [device proof history](moment-capture-proof.md).
  - Owner/target: TBD when this work resumes. Existing Crown/default-chime verification remains tracked in the Moments checkpoint.

## Final go-live sign-off

- [ ] A1–A7 completed with evidence and named reviewers.
- [ ] Proposed B items reviewed and all agreed launch blockers closed; any deferrals have an owner, reason, and target date.
- [ ] Applicable policy checklist items reviewed and signed off by their responsible owners.
- [ ] Engineering/QA confirms the exact release build and production environment tested.
- [ ] Support and moderation owners confirm coverage and working admin access.
- [ ] Release owner confirms store readiness, monitoring, backup/recovery, and rollout plan.
- [ ] Product owner records the go/no-go decision and launch date.

For each completed workstream, record: **owner, completion date, build/environment, evidence link, reviewer, and remaining follow-up**.
