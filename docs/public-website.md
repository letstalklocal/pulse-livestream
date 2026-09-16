# Pulse public website

Built September 12, 2026. The existing API serves the public website without requiring Clerk sign-in. The development host routes the mobile app at `/` and the API at `/api`, so the public website is mounted at `/api/site/`. A direct API deployment also serves the same site at `/`.

- Home: `/api/site/`
- Verification instructions: `/api/site/verify`
- Privacy notice: `/api/site/privacy`
- Support: `/api/site/support`
- Terms: `/api/site/terms`
- Personal verification handoff/callback remains `/api/verification/` so its existing cookie path and CSRF checks remain intact.

The public verification page explains how to start from Account → Age verification. It does not create an anonymous provider session or accept uploaded identity documents. A user who opens the personal verification endpoint without a valid session receives instructions to start in the app.

Current verification copy uses “Verify you're 18+” and “Confirm your age to access Premium features.” After success it shows “You’re Verified” and “You can now choose to enable NSFW/Mature Content.”

The site uses responsive HTML/CSS with an original inline SVG pulse illustration, keyboard focus styles, a skip link, semantic navigation and no external assets or JavaScript. Public pages do not set cookies. A nonce-based CSP prevents arbitrary scripts/styles; framing is disabled. Pages are marked noindex during preparation.

## Content pending from the owner

- Confirmed operator: **Worldwide Music Makers LLC**; used as the website default, overridable with `PULSE_LEGAL_NAME`.
- Confirmed public email: **info@wwmusicmakers.com**; used as the website default, overridable with `PULSE_SUPPORT_EMAIL`.
- Full app data inventory, legal grounds, retention/deletion settings, transfer arrangements and final terms. The privacy and terms pages explicitly remain drafts until these are finalized; adding name/email alone does not make them final.

Privacy information checklist reference: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/

Do not activate real-user Didit verification using the draft privacy notice. The privacy page can become the configured `PULSE_PRIVACY_URL` after completion. `VERIFICATION_PUBLIC_ORIGIN` must remain the HTTPS origin without `/api/site` or another path.

## Validation

API typecheck and build passed. Existing verification integration tests passed with mocked Didit responses. Restarted the development API preserving its environment. Verified all five public website pages through the actual public HTTPS proxy: 200 HTML, Pulse content, working prefixed navigation, CSP, and no Set-Cookie. Confirmed the existing verification endpoint remains reachable. Browser rendering and physical-device deep links have not been visually tested.

Development website:
https://254cd483-13a8-46a7-aec3-b50e106f5db3-00-29qgy6snub3n8.kirk.replit.dev/api/site/

This is a development-host website; an always-on production deployment/custom domain remains a release step.

Business details supplied by the user and verified on the public privacy, support and terms pages after rebuilding/restarting the API. Privacy and terms remain drafts for the remaining data-handling and agreement details.


### Selfie-first verification and ID upgrades (September 12, 2026)

The personal verification page preserves the large “You’re Verified” heading and separate Mature Content preference. It identifies the established method as “Verified with Selfie” or “Verified with ID”. Selfie-verified users can choose “Verify with ID”, consent, and complete the dedicated document/selfie workflow. Pending upgrades show “Continue ID verification” and status polling; reviewed upgrades direct users to support; completed ID verification hides upgrade controls. Existing verification remains active during an ordinary pending or unsuccessful upgrade, unless documentary evidence shows the user is under 18 or a completed ID check is revoked.

The initial notice and public verification FAQ describe selfie-first verification with an ID check when needed. The privacy draft now describes estimated-age checks, method and upgrade-state storage accurately. Draft status and open launch review remain unchanged. Website tests use a simulated DOM, not a device or visual check.

### Safety-focused verification wording

User decision: age verification is presented as helping protect users and keep the community safe. Avoid promotional descriptions such as “A community for adults”, “made for adults” or “A space for adults”. The public verification heading is “Help keep our community safe.” and the supporting sentence is “Verification helps protect you and keep our community safe.” Keep the explicit 18+ eligibility requirement in the age notice, badge and terms. This changes messaging, not eligibility or verification behavior.

### Verification introduction sequence

The user requested a clearer sequence without repeated safety messaging. This supersedes the previous public verification heading: “Verify your age.” → “You must be 18 or older to use Pulse.” → “Age verification helps protect you and keep our community safe.” → “Start with a selfie. Didit will ask for ID if needed.” The introduction leads with the task and eligibility, then the purpose and next step.

### Exact approved verification introduction

Latest user correction supersedes the preceding introduction revisions. Use exactly these three lines, in order:

- Heading: “Help Keep our Community Safe.”
- Lead: “You must be 18+ to use Pulse.”
- Supporting text: “Age verification helps protect you and our community.”

Do not add the selfie/ID sentence to this introduction. Existing procedural information below it remains in place. Preserve the specified capitalization.

Preserve the approved introduction’s visual formatting: heading line break after “our”, with “Safe.” inside the existing `<em>` accent styling. The exact text remains “Help Keep our Community Safe.”; retain the lead paragraph styling and supporting paragraph.

Latest user instruction adds a fourth introduction paragraph after the safety message: “Start with a selfie. Didit will ask for ID if needed.” This supersedes the earlier instruction to omit that sentence. Preserve the heading line break, accent styling, lead paragraph and all other approved wording.

The approved fourth introduction paragraph is now: “Start with a selfie. Our verification service Didit will ask for ID if needed.” This replaces the shorter Didit sentence; all existing formatting remains.

The public verification instructions use the heading “How to Verify Your Account”, followed by “Start in the Pulse app” on a separate emphasized line. Retain the account-linking explanation and existing four numbered steps beneath it.

Latest approved instructions replace the separate “Start in the Pulse app” line and account-linking paragraph. Keep “How to Verify Your Account” as the heading, then “Follow these steps:” and this numbered list, preserving existing list styling and bold navigation labels:

1. Open Pulse in your mobile
2. Go to Account → Age verification.
3. Tap Verify now to open your secure, personal verification page.
4. Read the privacy information and continue to Didit's age check.
5. Return to Pulse to see your verification status.

Latest user correction: remove “Follow these steps:”, the public verification page’s “Open Pulse” button, and the full fallback paragraph beginning “If nothing opens, switch to the installed Pulse app.” Preserve the five numbered steps, section heading, privacy information link and existing formatting.

Latest user ordering requirement: place the existing “Before you begin” heading and its full camera/selfie/ID preparation paragraph immediately after “How to Verify Your Account”, before the five numbered steps. Move the block without changing its wording or formatting.

Verification section formatting: “Before you begin” is a smaller h3 (19px, below the 26px main section heading). Highlight only “Account” in “How to Verify Your Account” using the existing pink accent color. Add a thin 1px divider after the preparation paragraph and before the five numbered steps. Preserve all wording and ordering.

The privacy link is labeled “Our Privacy Policy” and sits immediately after the “Before you begin” preparation paragraph, before the divider. It retains the existing privacy destination. Remove its previous “How your information is used” placement after the numbered steps.

Add the section heading “Frequently Asked Questions” immediately above the public verification page’s existing FAQ accordion items. Preserve the questions and answers.

Latest FAQ wording/order: remove “Does verification enable mature content?” and its explanatory answer. Add the final FAQ item: “Is verification required to enable Premium content?” Answer: “Yes. Once you are verified, you can enable NSFW/Mature Content in settings.” This is a copy/order change; verification and the default-off content preference behavior remain as implemented.

Final FAQ answer wording correction: “Yes. Once you are verified, you can enable NSFW/Mature Content in Account settings.” Preserve the capital A in Account and keep this FAQ last.

Keep section titles visually consistent: highlight only “Questions” in “Frequently Asked Questions” using the same pink heading-accent style as “Account”. Preserve the full heading text.

Latest privacy-link placement: “Our Privacy Policy” is inline in the preparation paragraph, immediately after “later.”, rather than in a separate paragraph. Preserve its destination and the divider below the paragraph.

Make the inline “Our Privacy Policy” link less prominent with font-weight 300. Preserve its text, placement, underline, destination and the surrounding paragraph styling.

Remove the shared public website header’s top-right “18+” badge per user instruction. Keep the explicit age requirement in verification copy and terms.

### Account-linked verification page copy alignment

The user explicitly confirmed the approved wording must also appear on the page opened by the app’s Verify now button (`/api/verification/`). Its unverified introduction now uses the exact four approved safety/18+/selfie sentences, with the heading line break and pink accent on “Safe.” This replaces “Verify you’re 18+”, “Confirm your age to access Premium features” and the repetitive separate why-verification section. The capture preparation card now uses the approved “Before you begin” paragraph and smaller h3 heading. Preserve consent wording, privacy links, verification actions, large verified-state heading and the Mature Content preference.

Direct-flow instructions supersede the prior steps 3–4: step 3 is “Read the privacy information and check the consent box.” Step 4 is “Tap Verify now to start Didit’s age check.” The notice and consent now appear on the app screen before Verify now; the button no longer opens the extra Pulse consent page first. Preserve the current website formatting and other approved text.

### Signup declaration and preview terms version — September 16, 2026

The privacy draft now explains the birthday declared at signup, Clerk metadata used through email verification, private Pulse storage and server-stamped terms acceptance. This is distinct from extracted Didit document information. The terms preview displays `pulse-terms-preview-2026-09-16`, matching the development signup record. Both updated pages were verified on the running public API after rebuild/restart. Final policy content, retention and the launch agreement/version remain open; this change does not finalize them.
