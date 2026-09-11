# Pulse policy compliance checklist

Prepared: **September 11, 2026**. Status: **Open review; not a compliance certification.**

Purpose: turn the supplied article into a practical, source-backed review of Pulse before public distribution. This document identifies requirements, evidence to collect, and project-specific gaps. It does not choose launch markets, an age policy, moderation vendors, or advertising strategy. No app behavior or previously approved requirements were changed.

## How to use this checklist

Every box starts unchecked. Check an item only after its owner records evidence, the tested build/environment, review date, and reviewer. A source file or a passing TypeScript check alone does not prove operational compliance. “Partial” means some implementation exists; “Unverified” means evidence is missing, not that a violation has been established.

**Policy** items summarize linked platform requirements. **Conditional** items require an applicability decision for the market or feature. **Verification** items are proposed Pulse acceptance checks, not quotations of mandatory technical designs. Obtain qualified legal review for jurisdiction-specific conclusions. Recheck the linked rules before submission because requirements change.

Use this record for each item:

| Item ID | Named owner | Status | Evidence/build | Reviewer/date | Remaining action or documented non-applicability |
|---|---|---|---|---|---|
| Example: AGE-01 | Unassigned | Open | — | — | — |

## What the article establishes—and what it does not

The [Netmarvel article](https://medium.com/@netmarvel30/decembers-social-app-takedown-crisis-how-developers-and-advertisers-can-proactively-respond-b5b1a7e17feb), published January 2, 2025, reports December removals involving social apps and highlights child safety, moderation, privacy, advertising, and regional restrictions. It does not provide official enforcement decisions establishing the cause of each named app’s removal. Its app-availability statements are historical, not current status checks.

Two distinctions matter for this review:

- Google Ads certification is an advertising requirement, separate from Google Play or Apple distribution approval. The current advertising policy can cover livestream/chat apps focused on meeting new people; calling an app “Social” does not settle advertising eligibility. [Google Ads policy](https://support.google.com/adspolicy/answer/15328393?hl=en)
- Australia’s covered-platform under-16 account restrictions took effect **December 10, 2025**. Use current applicability guidance rather than the article’s January 2025 trial discussion. Pulse’s applicability has not been determined. [eSafety guidance](https://www.esafety.gov.au/about-us/industry-regulation/social-media-age-restrictions)

## Initial Pulse findings

These observations come from a limited read of local code and project records. Store consoles, production operations, the separate admin app, and legal documents hosted elsewhere were not audited.

| Area | Current evidence | Review status |
|---|---|---|
| Signup | Email, password confirmation and email verification exist. Google and Phone are disabled placeholders. No date-of-birth/age gate or terms-acceptance control appears in the inspected signup screens. [Onboarding](onboarding.md); [email form](<../artifacts/mobile/app/(auth)/sign-up-email.tsx>) | Age and terms checks open; verified email does not establish age. |
| Reporting/blocking | Stream, photo/post and account reporting code exists, including a child-safety reason. Account block endpoints exist. [Stream reports](../artifacts/mobile/components/ReportStreamSheet.tsx); [user safety](../artifacts/api-server/src/routes/user-safety.ts); [post reports](../artifacts/api-server/src/routes/posts.ts) | Partial. Report intake does not prove someone reviews or resolves reports. |
| Account deletion | The app submits a manual request; the documented release has no removal executor. Remaining coins/payments must be resolved under the approved requirements. [Account settings](account-settings.md) | Completion process unverified. Preserve the existing balance protections while reviewing deletion deadlines and unnecessary obstacles. |
| Recording | Gift-triggered Moments save camera/microphone clips. [Moments record](moments-feasibility.md) | Explicit recording disclosure/consent and capture indication need review, including Party participants. |
| Privacy/location | Country detection and Hide Location are documented. [Country location](country-location.md) | Partial; privacy settings are not a substitute for a published privacy policy. |
| Localization | Ten interface catalogs exist; native-speaker/device review remains open. [Localization plan](localization-plan.md) | Safety, consent and policy text need their own review; translated buttons do not prove translated policy coverage. |
| Money/admin operations | Coins, gifts, Premium, paid media and earnings are part of Pulse. The admin application is separate. | Production billing, moderation operations and payout controls were not verified. |

## 1. Audience, age and onboarding

Owners to assign: Product, Engineering, Legal.

- [ ] **AGE-01 — Conditional:** Record the permitted ages for account creation, watching, broadcasting, messaging, purchases and creator payouts in each launch market. Keep product minimum age, store content rating and legal age thresholds distinct.
- [ ] **AGE-02 — Policy:** Match store age-rating answers and creator-content access restrictions to the actual content and audience. [Apple §§1.2.1, 2.3.6](https://developer.apple.com/app-store/review/guidelines/)
- [ ] **AGE-03 — Verification:** Demonstrate that the agreed age restrictions apply to every signup method and relevant API, not just a screen. Test an underage attempt, an existing account, changed age information and a direct link into restricted content. Email/password confirmation and phone verification are not age checks.
- [ ] **AGE-04 — Conditional:** Assess COPPA applicability, including child-directed services and actual knowledge of under-13 users. Where applicable, document notice, verifiable parental consent, minimization, security, deletion and the amended rule’s requirements. Do not treat an “18+” label as the assessment. [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions); [2025 amendments](https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-312-coppa-final-rule-amendments)
- [ ] **AGE-05 — Policy:** Obtain acceptance of terms/user policy before users create or upload user-generated content. **Evidence:** published version, acceptance record and a rejected unaccepted upload attempt. [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)

## 2. Child-safety standards and response

Owners to assign: Safety Operations, Legal, Store Submission.

Google Play’s child-safety requirements apply to in-scope social apps even when they exclude children. [Google child-safety guidance](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en)

- [ ] **CHILD-01 — Policy:** Publish accessible standards explicitly prohibiting child sexual abuse and exploitation, naming Pulse or its listed developer; provide the URL in Play Console.
- [ ] **CHILD-02 — Policy:** Provide an accessible in-app channel for child-safety concerns and complete the required console declaration.
- [ ] **CHILD-03 — Policy:** Identify a knowledgeable child-safety contact and register current contact information in Play Console.
- [ ] **CHILD-04 — Policy:** Document action when child sexual abuse material becomes known, applicable reporting obligations and the responsible authority. Confirm legal review of evidence handling and retention.
- [ ] **CHILD-05 — Verification:** Run a harmless simulated urgent report from submission through assigned responder, content restriction, decision and audit record. Do not use real illegal material as a test fixture.
- [ ] **CHILD-06 — Verification:** Verify coverage for grooming and coercion involving DMs, private streams, paid media, gifts and creator incentives, including reports concerning a creator with earnings.

## 3. Content moderation, reporting and blocking

Owners to assign: Safety Operations, Engineering.

Policies require effective ongoing moderation, reporting and blocking; monetization must not encourage objectionable behavior. Apple also requires objectionable-content filtering and reachable contact information. [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en); [Apple §1.2](https://developer.apple.com/app-store/review/guidelines/)

- [ ] **MOD-01 — Policy:** Publish prohibited content/behavior rules covering exploitation, sexual content, harassment, threats and other prohibited material; demonstrate a working filtering/moderation process.
- [ ] **MOD-02 — Verification:** Test reporting across Live, Party, profile, posts/comments, DMs and paid media. A gift gate, blocked relationship or ended stream must not make relevant safety reporting inaccessible. Preserve approved chat interaction designs; evaluate coverage before proposing UI changes.
- [ ] **MOD-03 — Verification:** Test blocking across messages, invitations, gifts, profile/content access and live sessions, including reconnect and cached views.
- [ ] **MOD-04 — Verification:** Show that reports reach an authorized responder in the separate admin/operations system. Record severity, owner, response target, decision, removal/suspension and review history. Intake tables alone are insufficient evidence.
- [ ] **MOD-05 — Policy:** Review actual usage as well as written rules: apps primarily used for pornography, random/anonymous chat or bullying face Apple restrictions. [Apple §1.2](https://developer.apple.com/app-store/review/guidelines/)
- [ ] **MOD-06 — Verification:** Test access removal for an abusive live session and associated saved/shared copies using benign fixtures; confirm unauthorized users cannot view moderation evidence.

## 4. Privacy, data and recording

Owners to assign: Privacy/Legal, Engineering.

- [ ] **DATA-01 — Policy:** Publish a working, publicly accessible privacy-policy URL in the app and store records, identifying the developer, data uses/sharing, retention/deletion and privacy contact. [Google User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [ ] **DATA-02 — Policy:** Reconcile actual app/SDK collection with store privacy disclosures and required prominent disclosures/affirmative consent. [Google User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [ ] **DATA-03 — Verification:** Inventory Clerk identity data, Agora audio/video, media storage, country detection, notification tokens, transaction records, logs and optional message translation. Identify recipients, retention and access controls; verify Hide Location against public API responses.
- [ ] **REC-01 — Policy:** Obtain explicit recording consent and provide a clear visual and/or audible recording indication. [Apple §2.5.14](https://developer.apple.com/app-store/review/guidelines/)
- [ ] **REC-02 — Verification:** Explain and test the actual Moments behavior: gift-triggered capture, audio, clip duration, owner, storage, deletion and sharing. Determine whose media is captured in Party/private sessions and document the required participant notices. Camera permission alone is not evidence that this review is complete.
- [ ] **REC-03 — Verification:** Test private media authorization, expired links, deletion and cross-account access. Verify that sharing/export changes are visible to the user. Keep test artifacts free of real users’ private content.

## 5. Account and content deletion

Owners to assign: Engineering, Operations, Privacy/Legal.

Manual deletion is acceptable to Apple when it actually completes, users know the timeframe, and completion is confirmed. Unnecessary support hurdles are not acceptable for ordinary apps. [Apple account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app)

- [ ] **DEL-01 — Policy:** Make in-app deletion initiation easy to find and demonstrate completion of account and associated user-content removal, subject to documented lawful retention.
- [ ] **DEL-02 — Policy:** Provide the external deletion-request web resource required by Google Play and enter its URL in Play Console. [Google account-deletion requirement](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en#account_deletion)
- [ ] **DEL-03 — Verification:** Test the existing manual queue through actual completion across Clerk, database, storage, posts, media packs, Moments and accessible copies. Record what is retained, why, who can access it and when it expires.
- [ ] **DEL-04 — Verification:** Resolve the approved coin/payment protections with a documented, timely deletion process. Review one-coin balances, pending earnings, disputed payments and abandoned accounts; do not silently forfeit balances or leave requests indefinitely pending.
- [ ] **DEL-05 — Policy:** Explain deletion timing, completion notification and any subscription/billing consequences. If subscriptions exist, verify cancellation guidance and deletion options. [Apple account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app)

## 6. Coins, gifts, Premium and paid media

Owners to assign: Payments Engineering, Finance, Legal, Store Submission.

- [ ] **PAY-01 — Policy:** Map every digital purchase to its permitted billing route per platform/storefront. Use required store billing unless a documented exception or enrolled regional program applies. [Google Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en); [Apple §3.1](https://developer.apple.com/app-store/review/guidelines/)
- [ ] **PAY-02 — Policy:** Make prices, coin costs, paid access and subscription terms accurate and visible; match the checkout price. Check external purchase links against applicable regional rules. [Google Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
- [ ] **PAY-03 — Verification:** Exercise purchase, duplicate callback, failed payment, refund and entitlement outcomes. Confirm development coin grants cannot be used as a production funding route.
- [ ] **PAY-04 — Verification:** Review gifts, battle scoring, private entry, paid packs and creator bonuses for incentives that reward prohibited conduct. Test intervention without relying only on the creator’s own moderation controls.
- [ ] **PAY-05 — Conditional:** Have qualified reviewers classify any payout, prize, wagering or randomized paid reward before enabling it; identify applicable payment, tax, identity and licensing obligations. This checklist does not classify existing VS scoring as gambling.

## 7. Store submission and feature readiness

Owner to assign: Release/QA, Store Submission.

- [ ] **STORE-01 — Policy:** Supply working reviewer access, special instructions and accurate screenshots/metadata reflecting the submitted build. [Apple submission guidance](https://developer.apple.com/distribute/app-review/)
- [ ] **STORE-02 — Policy:** Resolve temporary content before public submission, including the approved Google/Phone Coming soon controls and development tools. Record the release decision; this checklist does not remove them from the development app. [Apple submission guidance](https://developer.apple.com/distribute/app-review/)
- [ ] **STORE-03 — Conditional:** Before enabling Google signup on iOS, assess the equivalent privacy-preserving login requirement and exceptions. [Apple §4.8](https://developer.apple.com/app-store/review/guidelines/)
- [ ] **STORE-04 — Policy:** Retain authorization for third-party music, gift artwork/animations and other distributed media. [Apple submission guidance](https://developer.apple.com/distribute/app-review/)
- [ ] **STORE-05 — Verification:** Review each supported language on devices for understandable signup, reporting, blocking, consent, prices and deletion. Preserve protected names and approved layouts. Keep review evidence separate from compilation/mock-test results.

## 8. Advertising eligibility—review only, strategy deferred

Owner to assign: Advertising Compliance, Legal.

- [ ] **ADS-01 — Conditional:** Determine whether Pulse and its proposed ads fall within Google’s dating/companionship definition, including livestream/chat focused on meeting people. Obtain applicable certification before running those ads.
- [ ] **ADS-02 — Conditional:** Check age and country restrictions. The current policy excludes dating/companionship ads in Saudi Arabia and other listed countries; Arabic localization does not establish advertising eligibility.
- [ ] **ADS-03 — Policy:** Review covered ads and their destinations for prohibited compensated dating/sexual services, exploitation and deception; disclose synthetic profiles/chatbots if ever introduced.

All three items use the [current Google Ads dating/companionship policy](https://support.google.com/adspolicy/answer/15328393?hl=en). Store availability and advertising approval require separate evidence. Channel selection, campaign design and acquisition strategy remain for the later discussion.

## 9. Market-specific legal applicability

Owner to assign: Legal, with Product and Safety Operations.

- [ ] **REG-01 — Conditional, Australia:** Determine whether Pulse is an age-restricted social media platform. If covered, document reasonable steps to prevent under-16 accounts and evidence supporting the assessment. [eSafety](https://www.esafety.gov.au/about-us/industry-regulation/social-media-age-restrictions)
- [ ] **REG-02 — Conditional, United States:** Assess TAKE IT DOWN Act coverage. For covered services, provide a clear request process and remove covered nonconsensual intimate imagery and known identical copies within 48 hours of a valid request. Include access for victims without accounts. These duties took effect May 19, 2026. [FTC business guidance](https://www.ftc.gov/business-guidance/resources/complying-take-it-down-act)
- [ ] **REG-03 — Conditional, United Kingdom:** Establish Online Safety Act scope and complete the required children’s access assessment. Where children are likely to access the service, document the corresponding risk assessment and protections. [Ofcom children’s duties](https://www.ofcom.org.uk/online-safety/protecting-children/protection-of-children-duties-under-the-online-safety-act); [access assessments](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/childrens-access-assessment-duties-under-the-online-safety-act)
- [ ] **REG-04 — Conditional, European Union:** Map DSA duties by service type and size, including applicable notice/action, user redress and minor-protection obligations. Verify any small-enterprise exemption instead of assuming all obligations apply—or none do. Distinguish nonbinding implementation guidance from legal duties. [Commission DSA FAQ](https://digital-strategy.ec.europa.eu/en/faqs/digital-services-act-questions-and-answers); [guidelines](https://digital-strategy.ec.europa.eu/en/policies/dsa-guidelines)
- [ ] **REG-05 — Verification:** Create a market register covering each intended country, responsible entity, applicable privacy/recording/content rules, age requirements, cross-border data handling and review owner. Spanish, Portuguese and Arabic are languages, not single legal jurisdictions. Brazil, Saudi Arabia and other possible launch markets have not received a country-specific legal audit here.

## 10. Evidence and sign-off

- [ ] **REVIEW-01:** Assign named owners and due dates for the open items. Store evidence securely; include benign device recordings, public policy URLs, console declarations and completed operational exercises.
- [ ] **REVIEW-02:** Record named sign-off from Product, Engineering/QA, Safety Operations, Privacy/Legal and Store Submission for their applicable items. Keep unresolved requirements visible rather than marking the whole app compliant.
- [ ] **REVIEW-03:** Recheck official policies before each public submission and when adding a market, authentication method, media feature, monetization feature or third-party data recipient. Record the policy version/date and reassess affected items.

**Work completed for this document:** read the supplied article; consult the linked primary sources; inspect relevant local signup, reporting, permissions and project records. No production account, payment, deletion, moderation or store-console checks were performed. Implementation and strategy decisions remain separate work.
