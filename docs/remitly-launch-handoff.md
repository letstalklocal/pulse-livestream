# Pulse Remitly payouts — implementation handoff

## October 8 Maker retry after unsaved recipient validation failure

**Latest user decision:** when recipient creation fails at phone validation before anything is saved in Remitly, Maker may attempt creation again using the saved correction. This is preparation retry, not reconciliation of a sent transfer. This supersedes earlier Reconciler-only instructions for that no-record case; sent-transfer reconciliation remains separate and existing saved/uncertain records retain their investigation guards.

Workflow revision **`2026-10-08.5`** adds Maker-only `pulse_payout_retry_recipient_creation` and `POST /api/payout-operator/withdrawals/:id/retry-recipient-creation`. Existing credentials and the compatible profile version `2026-10-04.1` stay valid. Maker can see unknown/expired queue items for inspection, but may retry only a structured phone/email rejection with the latest pending correction and fresh signed-in evidence confirming **no recipient and no draft were saved**, as well as no payment, debit, link, pending or uncertain transfer. A current owned browser lease, all existing inspection/correction checks, unpaused preparation and the exact reservation are required. Absence of a provider contact/draft is a valid inspected result; do not invent a record or say an absent contact was edited.

Success closes the failed internal attempt, applies the saved correction, clears the old quote/check and returns the **same withdrawal** to `awaiting_quote`, retaining its coins. Maker continues with a fresh quote and a new durable attempt in the same run, without asking for another phone edit or quote approval. Saved provider objects/preparation, payment/activity/link markers, recorded human release/decline, generic interruption, mixed name/other errors, stale evidence/correction and conflicting attempts block this path. Independent checker review and human final sending are unchanged. The existing advanced owner/Reconciler recovery capability is preserved for existing-record investigation; no Maker credential gains that broader tool or sending capability.

Verification: isolated PostgreSQL and HTTP tests cover the no-record retry, all required flags, Maker/checker/Reconciler separation, owned leases, pause, saved records/effects, generic/mixed errors, stale data, idempotency, unchanged wallet/ledger, canceled old attempt and fresh preparation. The actual MCP SDK exercises the new Maker tool against the real service and isolated database. Existing withdrawal accounting/recovery, MCP protocol and all 10 Mac runtime tests, API/MCP types and API build pass. The development API was restarted with its exact prior arguments, working directory and environment; health returns 200 and the new action rejects missing/invalid credentials with 401. No actual Remitly retry, production publication or Mac connection/schedule change was performed here.

**Mac handoff after publication:** reconnect the existing Maker MCP connection, fetch identity and preflight/maker/recover playbooks, require workflow revision `2026-10-08.5`, and verify `pulse_payout_retry_recipient_creation` is listed. Inspect the failed attempt and saved correction, use the Maker retry only after verifying the no-record conditions, then obtain a fresh quote and continue preparation. Do not request a Reconciler connection solely for this unsaved phone-validation failure. If production still reports `.4` or lacks the tool, publication/connection refresh is incomplete; do not bypass guards.

## October 8 transfer progress and correction states

The latest user decision adds visible transfer-progress chevrons in admin and the existing mobile withdrawal detail screen. Show Requested → Preparation → Payment review → Recipient setup → Processing → Delivered, highlighting the recorded stage without implying payment or delivery from a saved correction. Error presentation advances through **Error — awaiting identification**, **Error — identified**, and **Correction saved — awaiting processing**. Phone/email corrections do not clear remaining legal-name/other issues. The API/MCP `progress` object distinguishes `error_unknown`, `error_identified` and `correction_saved`; saved corrections have `nextAction=verify_saved_correction` and remain blocked until the existing guarded recovery succeeds. Recovery returns the same withdrawal to `awaiting_quote`/`continue`; no new withdrawal, coins release or creator quote approval is introduced.

The recipient-error admin view has one contact panel. After Save, show the saved values and completion state, with editing optional. Technical quote/operational details, classification, manual recovery, reconciliation, decline and history are collapsed under **Advanced details and operator actions**. Preparation active/paused and Pause/Resume move to the queue's top right; reason is requested only in the toggle modal. Cancel/Escape/backdrop do not save.

MCP workflow revision `2026-10-08.4` tells operators to read progress alongside operational status and preserves the compatible `2026-10-04.1` profile pin. A saved edit signals provider verification work for the authorized reconciler, not permission for the maker to retry. No Mac job or provider action was executed here. A read-only public production asset check found the older admin correction UI still published. Publish the backend/admin/MCP changes and update TestFlight for the new mobile progress/correction presentation; actual production recovery and device visuals still need verification.

Verification passes for full admin browser fixtures, mobile withdrawal renders/type checks, all ten language catalogs, isolated PostgreSQL withdrawal/operator suites, real MCP SDK/protocol, all ten helper runtime tests and API type/build. The operator response explicitly reports `correction_saved`/`verify_saved_correction` while retaining underlying unknown state. Development was rebuilt/restarted with its original environment and arguments; health/admin JS/CSS return 200 and affected anonymous calls return 401. Device visuals, publication and actual Mac/provider recovery remain unverified.

## October 8 correction: edit and save once

The user rejected requiring a second admin form after correcting a phone number. The normal correction input is one phone/email edit and Save. An active saved contact correction now displays **Correction saved** in the admin queue/details, with **Saved contact correction** and a clear completion message. Unresolved legal-name/other errors remain Error. Operational unknown/expired state and reserved coins are retained until verified recovery, without treating the saved edit as a failed save.

Codex workflow revision `2026-10-08.3` directs the existing authorized reconciler to prioritize active pending corrections on its next run, inspect current Remitly history/contact using the corrected values, and call the existing guarded recovery tool. The maker waits for that verified recovery and then obtains a fresh quote. No repeated contact entry, creator quote approval or additional admin checklist is required in the normal operator flow. The manual recovery form remains under **Advanced: manual recovery fallback** for direct operator use. Roles, leases, nine factual recovery checks, reservation, human-decline/payment/link hard stops and manual final sending remain enforced; no maker credential is promoted to reconciler.

This change does not install or run a Mac schedule, verify a reconciler connection or change the production recipient. A maker-only connection reports the missing operator recovery capability rather than asking the user to repeat their phone edit. Admin UI/updated MCP instructions require backend publication; no native source/build change is included. Existing native Error copy changes only when its operational recovery progresses.

Verification: admin browser fixtures confirm one saved edit displays Correction saved without changing the active recipient/attempt or reservation; mixed legal-name errors remain blocked. Operator PostgreSQL/real SDK, MCP protocol, all 10 helper runtime tests, API type checks/build and whitespace checks pass. The development API was restarted with its existing environment; health and updated admin assets return 200 and operator identity/playbook endpoints reject missing credentials with 401. Production/Mac recovery and actual device checks remain unverified.

## October 8 owner access for recipient-error recovery

The user explicitly requires their authenticated enabled owner login to be sufficient to correct the recipient error, without adding another payout role or deployment secret. Owner-only `POST /admin-data/withdrawals/:id/recipient-error` records rejected fields on an already unknown/expired withdrawal; it appends protected evidence without changing payout status, recipient, quote, attempt or funds. The owner can save corrected phone/email and invoke the existing guarded recovery endpoint. The admin capability derives from the parent owner guard, not `PULSE_PAYOUT_RECONCILER_IDS`.

The first broader patch was rejected by automatic approval review because it also removed authorization from generic uncertainty and payment reconciliation. The implemented alternative is limited to recipient-error classification/correction/recovery. Generic unknown/reconcile and maker/checker preparation permissions remain as previously configured. Mac service credentials remain isolated to their existing maker/checker/reconciler roles; no service credential gains a human owner session or final-send capability. All recovery evidence, exact reservation and prior payment/link/human-decline guards remain required.

No role/secret change, schema migration or native build is needed for this owner access fix. Publish the updated backend/admin assets and reopen the withdrawal. Owner-without-extra-role classification/recovery, non-owner/anonymous denial, unchanged payout rows/attempts/funds during classification, recovery guards, browser fixtures, Mac operator/SDK/protocol isolation, generated/library/API checks and build passed. The development API was restarted with its existing environment; health/admin assets return 200 and the affected endpoints reject missing/forged credentials with 401. No production/provider record was changed here.

## October 8 recipient errors and contact corrections

The Colombia maker reported a current signed-in Remitly phone rejection after a preparation attempt began. Contact creation may have persisted; no payment, recipient link or schedule was reported created. This is user-relayed provider evidence, not a provider inspection from this workspace.

The user requires an **Error** display and specific error message, and the creator must be able to correct phone/email. The latest explicit decision defers new country-code/area-code validation: let Remitly reject invalid details and send back the error. Preserve existing basic contact formatting checks; do not impose a new payout-country phone-code requirement.

Structured recipient rejections carry only allowlisted phone/email/name/other fields. Pulse exposes creatorStatus/errorMessage and translated field-specific copy while retaining the underlying unknown/expired investigation state and reserved coins. Raw provider notes and screenshots remain protected. The creator saves a pending phone/email correction on the same request; this does not mutate its active recipient snapshot, recreate a contact/transfer, return coins or resume preparation. Legal-name/other issues require operator review.

**Guarded recovery explicitly approved October 8:** the user approved completing admin recovery after verifying no payment, funding debit, recipient link, pending/uncertain transfer or unresolved old draft. This supersedes the earlier automatic-review block. The admin can now save a pending phone/email correction verified with the creator. An admin owner or authorized MCP reconciler inspects the existing provider contact and draft/pending/sent/activity history before applying it. For an existing provider contact, verify its corrected details; if no contact persisted, record its verified absence and that fresh preparation will use the correction. Recorded human release/decline or provider transfer/activity references block correction recovery. The endpoint binds evidence to the current correction hash, attempt and observation ID, requires fresh inspection after the correction, and retains the exact withdrawal reservation. Only phone/email errors are resolved this way; remaining legal-name/other errors still require review. Recovery closes the old attempt, updates the saved contact and recipient snapshot/version, invalidates the old quote/check, and returns the same withdrawal to awaiting_quote. Fresh quoting, independent checking and the human final send decision follow. Maker credentials cannot invoke recovery.

MCP workflow revision is `2026-10-08.2`; the compatible profile pin stays `2026-10-04.1`. Existing plain unknown records need the same attempt re-recorded with a structured recipient issue backed by provider evidence; do not parse old free-text notes into a public error. In admin, open the existing withdrawal, use **Identify the rejected recipient details → Save error details**, then **Correct recipient contact details → Save corrected contact details**. The operator normally completes verified recovery after the saved correction; admin owners retain **Advanced: manual recovery fallback** for direct recovery when needed. Admin recovery needs a backend publication, without a native build or schema migration; the creator Error/editor screens need the latest native build. No real provider correction, payment or production mutation was performed here.

Verification of the approved error/correction/recovery flow: expanded isolated withdrawal and payout-operator PostgreSQL suites, real MCP SDK/protocol tests (including actual recovery-tool forwarding), admin Chromium fixtures, all 10 helper runtime tests, generated/library/API/mobile type checks, API build and withdrawal render/handler regressions passed. Tests cover old generic errors gaining explicit rejected fields, creator/admin pending contact edits, account/role/browser-lease isolation, missing/false recovery checks, human decline and payment/link hard stops, stale corrections/evidence, unresolved legal-name issues, exact per-withdrawal reservation, unchanged wallets/ledger, idempotent recovery and fresh quoting/preparation. The development API was rebuilt/restarted with its existing environment/arguments; the running build matches final backend/MCP/admin source, health and updated admin assets return 200, and new creator/admin/operator/MCP endpoints reject missing and forged credentials with 401. Production publication, correction of the real Colombia record, real provider recovery/payout and Android/iPhone verification remain separate checks.

Date: 2026-10-04

Status: catalog, in-app withdrawals, scoped MCP and Mac operator code are implemented. On October 7, the user confirmed production backend rollout/admin login, payout-operator and Remitly-link configuration, Colombia tester enrollment with at least 6,000 coins, and latest TestFlight publishing/testing are complete. The production maker MCP connection is verified by a user-reported direct chat tool call. The user also confirmed the Mac is signed into Remitly. Codex browser-page access, independent checker/reconciler connections, scheduling and the full USD 15 Colombia payout remain pending confirmation. The current initial-request-consent update is verified in development and awaits development review, backend publication and the next native UI build.

## October 7 initial request consent — second quote approval removed

The user explicitly rejected requiring another creator approval of the actual Remitly quote: it causes waiting, quote expiry and unsaved scheduled-transfer re-entry. The user reaffirmed **USD 15 total wallet deduction including fees** for the first withdrawal. Initial withdrawal submission is consent for the requested gross amount, recipient and selected method. Show estimated receive-currency amounts (COP for this Colombia trial) without inventing an FX amount before a provider quote exists, and without asking for a second approval or showing a creator quote-expiry deadline. This supersedes earlier creator exact-quote-confirmation requirements below.

A valid fresh signed-in quote now sets `requested`, and the maker can claim preparation and save a supported one-time draft in the same run. Preserve its stored draft ID/review URL to avoid duplicate entry. Remitly save-only behavior still needs real-account verification; never send or issue a first-time link to fabricate a saved draft. Existing `awaiting_confirmation` requests remain maker-eligible and can proceed with a current matching quote, without another creator action. Refresh expired provider quotes internally before any attempt; the deprecated acknowledgement endpoint is compatible but not required. New records keep legacy `approvedQuoteHash` null rather than falsely claiming the creator approved an exact quote.

Freshness, exact method/currency/recipient, provider minimum, gross USD send+fee+tax bounds, reservation, durable attempts, independent checking and the human final payout decision remain enforced. COP is an estimate for new request-consented quotes and may change with FX; reconciliation records the actual positive amount. A genuine historical exact-quote approval retains its original receive floor. Initial withdrawal submission does not replace the human's final send decision. No new schema migration or live withdrawal rewrite is needed.

MCP instructions, tool description, operator runbook and automation templates use workflow revision **`2026-10-07.1`**. The compatible MCP/profile version remains **`2026-10-04.1`**, preserving the working Mac configuration and Keychain credentials. Every role fetches fresh playbooks at the start of a run; replace cached prompts that wait for creator approval. Backend publication and development review are pending; the new native UI requires the next normal TestFlight build. No real payment or production mutation was performed for this correction.

Verification: isolated withdrawal and payout-operator PostgreSQL integration suites, including the real MCP SDK, passed without a creator quote-approval call. Coverage includes legacy awaiting-confirmation requests, fresh quote and financial bounds, and estimated versus actual COP. Admin browser fixtures, all 10 operator-helper runtime tests, MCP protocol tests, generated contract/library checks, API build/type checks, mobile type checks, withdrawal regressions and localization checks passed. The development API was rebuilt/restarted with its existing environment and arguments preserved: health and updated admin assets return 200, and affected endpoints reject missing or forged credentials with 401. Real Remitly draft saving, the full Colombia payout and native device checks remain separate acceptance checks. No payment or production change was made.

## October 7 Mac maker MCP connection confirmed

The user relayed a successful **`pulse_payout_identity` call through the Mac chat's MCP interface**, rather than Terminal. Identity reports production, account scope `production-remitly-business`, operator name **Mac Maker**, maker role, and preparation active. The local Mac uses the default profile with the server in `~/.codex/config.toml` at line 192; no project overrides or payout tool filters were found. MCP initialization and `tools/list` succeeded. The app first logged “omitting pending optional MCP server”, subsequently marked Pulse ready, and fresh tool discovery exposed all 14 maker tools. The earlier restart/configuration diagnosis was premature; no configuration changes or further restart were needed. Existing connections and single-role isolation were preserved. This is user-provided Mac verification, not access to that machine from this workspace. The user subsequently confirmed the Mac is signed into Remitly; provider login is complete by that report. No actual provider-page inspection, draft, quote or payment was performed from this workspace.

Exposed tools have the `pulse_payout_` prefix: identity, list, get, playbook, heartbeat, browser_lease_acquire, browser_lease_renew, browser_lease_release, quote, prepare, record_preparation, preparation_lease_renew, preparation_lease_release and unknown. No payment, payout-setting, role or scheduling changes were made during this verification. Codex browser-page access in the same chat, independent checker/reconciler connections, sent-record identifier/status/link verification, scheduling and the full human-approved USD 15 trial remain separate checks; the user has confirmed Remitly sign-in. The observed active preparation state does not establish whether the latest optional-link or Resume correction has been published.

## October 7 preparation Resume correction

Resume/pause now saves the settings singleton even when its row is missing and returns the persisted value. The admin queue reports the actual paused/active state. This fixes a reproduced missing-row failure; its presence in production is unconfirmed. Missing settings block preparation until an authorized owner explicitly saves the state. Withdrawal/operator isolated integration, admin browser tests, API build/type checks and live development authorization checks passed. Backend publication is pending; no new TestFlight build or schema migration is required. See [verification](admin-website.md#preparation-resume-persistence-and-status--october-7-2026).

## October 7 production rollout checkpoint

Recipient delivery clarification: the user confirmed that **Remitly emails the recipient link directly**, and a recipient has already tested that the Remitly email works. Pulse must not require the owner to send that email or copy the generated link into admin. First-time manual release now accepts no `providerLink` or provider reference, while still requiring the current independent check, unexpired approved quote, human evidence and observed time. It records `awaiting_recipient` with pending provider onboarding and preserves reserved coins. Optional supplied links retain URL validation; scheduled/saved-recipient release still requires its provider reference. This is user-reported email verification, not completion of the full Pulse withdrawal trial.

The user wants the Codex PC to check later whether the generated link is available in the **sent transfer record**, and identify how to track the sent status. The verified code rule `scheduledDraftId` applies only to scheduled review URLs; do not assume it identifies a sent transfer or reuse an unverified URL pattern. Later browser verification must establish the stable sent-transfer reference/activity ID, available recipient-link field, actual status labels and URL format from the signed-in account. Match recipient, route, amounts and release time; ambiguous matches require human investigation. Existing reconciliation can record the first verified provider reference for a linkless first-time attempt and then rejects conflicting references. Automatic recipient-link retrieval/storage is deferred and is not implemented by this change. Sending remains manual; authoritative delivery evidence still governs settlement. The optional-link correction passed isolated withdrawal/operator integration and both admin browser suites, generated/API/library checks and live development authorization checks after a preserved-environment restart. Production publication of this correction remains pending.

The user confirmed completion of items 1 and 2 in the rollout checklist: review/publish the backend with required payout migrations and production catalog/default fees, and successful production admin Google login as `sixarmedia@gmail.com`. This is user-reported completion, not an independent production database or browser verification from this workspace. Earlier pending-production/login notes below describe historical checkpoints and are superseded by this update.

The user additionally confirmed completion of the later five-step checklist items 1–3: configure payout operators and verified Remitly links; enable the Colombia tester through **Users → Enable withdrawals** with at least 6,000 coins; and publish/test the latest TestFlight build. These are user-reported completions. Next is item 4, connect the Mac to the MCP and verify authenticated browser access, followed by item 5, the full USD 15 Colombia withdrawal with human approval/sending and provider-confirmed settlement. The manually sent transfer ID/URL format and recipient-link availability remain specific provider checks; general link setup completion does not establish those formats. No real payout was performed from this workspace.

## October 5 user-row enrollment correction

Enable withdrawal access from **Users → Enable withdrawals** on the intended user's row or detail panel. The directory includes the user's primary sign-in **Email** and current **Enabled** status. This is the user's required normal workflow, superseding manual UID entry/reason/confirmation through Payout desk. The client performs the balance preview automatically and preserves the existing audited enrollment and stale-wallet protections. Re-enabling disabled access preserves wallet and repeat policy. See [implementation and verification](admin-website.md#user-row-withdrawal-access-and-email--october-5). Development is rebuilt/restarted; no real account was enabled and production remains unchanged.

## October 5 Withdraw Money screen decisions

The latest user instructions supersede the earlier provider-first order. Start with the amount, defaulting to **6,000 coins / USD 15**. Use two adjacent editable boxes: **Coins** with shared gold artwork, and **Dollars (USD)**. For the first withdrawal, both amount boxes are read-only and fixed at 6,000 coins / USD 15. Failed/canceled requests do not unlock editing; delivered/returned history matches the backend repeat classification. On subsequent entries, editing either updates the other at 400 coins per dollar; coin amounts that cannot represent whole USD cents cannot continue. The user confirmed subsequent withdrawals are USD 25–500 gross, including fees; default subsequent entry to USD 25. Preserve authoritative wallet checks.

- On the first amount screen only, show **Available to withdraw**, the dollar balance in large text, and the gold coin icon/count to its right on the same row. This latest placement supersedes the intermediate request to put coins underneath. Place a text-only **Conversion: 400 coins = $1** line below and outside the balance card, indented 16 points to align with its content, replacing the two-example line. The latest user decision removes only the conversion-line icon. The balance card and conversion must not repeat on provider/country selection, payment-method selection or the contact form. Show reserved/on-hold balances only when nonzero.
- Keep withdrawal history off the main form. A horizontal three-dot control at the top right opens a menu with **Withdrawal history**, which opens the scrollable history dialog. Preserve dates, amounts, statuses and tap-through to withdrawal details. Closing/back returns to the unchanged draft; blur/account changes clear the dialogs.
- Use one paragraph: **Your first withdrawal must be $15. After your first withdrawal, the minimum is $25. Fees are deducted from the withdrawal amount based on the delivery method you select next.** This supersedes separate min/max lines and the two-sentence fee-inclusive copy. The user confirmed the subsequent minimum as USD 25. The user subsequently confirmed a USD 500 maximum. Development now enforces first withdrawal exactly USD 15 and subsequent withdrawals USD 25–500, including fees.
- Show **Remaining coins** as the available wallet balance minus the proposed gross deduction, updating during entry and on review. Invalid or over-balance input shows a dash rather than a misleading negative amount. Do not subtract again from a persisted pending request whose reservation may already be reflected in available funds.
- Next opens **Select Provider and Country**. When only one enabled provider is exposed (currently Remitly), select it automatically and display **Provider: Remitly** on one row without a required selection control (latest correction supersedes the above-name label); immediately show the country menu. Retain explicit highlighted selection when multiple supported providers become available. Country choices live in a modal menu with an explicit safe-area/window-height bound, a flexing scroll viewport, visible scroll indicators (persistent on Android; flashed on opening on iOS), and a fixed **Scroll to see all countries** hint below the list. The last item stays selectable in long catalogs; no country is removed to fit the panel. Phone scroll/indicator behavior remains device verification. Next opens a separate payment-method screen. Show **Select payment method** and highlight the selected provider/method instead of radio-circle artwork. Keep accessible selection state. Method columns have **Method**, **Fee**, and **Delivery** headers once above the rows; row values are just the name, amount, and duration such as **5 mins**, using the reclaimed space for delivery. Remove duplicated method metadata, “Observed Fee”, research/provenance commentary and the old quote-sample amount explanation. Fees remain catalog estimates; the actual quote and financial controls are preserved.
- Contact form **Next** opens a separate **Review withdrawal** screen before any request is submitted. In **Contact**, show legal recipient name, email and full international phone. Give the email the remaining row width rather than a fixed half-width; keep it on one line, reducing its font size only as needed. In **Withdrawal details**, show total gross earnings, estimated fee deduction, estimated deposit (gross minus fee), selected method, and **remaining coins last**. Identify these figures as estimates. For first-time Remitly setup, explain that Remitly will email to confirm the payment method. The later provider quote is checked internally against the requested amount and method; no second creator approval is required.
- Contact phone entry uses two boxes: **Country code** prepopulated from the selected country's calling-code metadata, and **Phone number**. Combine them into one international phone string for the existing recipient/Remitly snapshot; normalize spaces, parentheses and hyphens. Keep the prefix editable, since the recipient's phone country can differ from the delivery country. Changing delivery country resets the prefix and old phone. **Next** validates on tap with a visible error rather than silently disabling the button for invalid contact data.
- Returning users go amount → review using the latest matching completed withdrawal with confirmed provider onboarding, a valid saved contact, and an enabled/available method in the saved country. Skip provider/country/method/contact setup and do not save contact again. Show the saved-method message rather than first-time Remitly setup instructions. Missing, changed or unavailable saved details fall back to setup. Back returns to amount for saved-method review, otherwise contact. Account changes reset the draft; uncertain retries retain the persisted amount/idempotency key without deducting remaining coins twice.
- Admin default fees take precedence over historic fee observations in selection/review. Explicit configured zero defaults are supported; historical promotional zeros are not treated as normal fees. Unknown or excessive fees show an unknown deposit, never a fabricated zero or negative deposit.
- The message **After completing your request, you will receive a link to confirm your preferred payment method.** is Remitly-specific. Show it only inside the contact-details form for the integrated Remitly provider. It must not appear on the initial amount, provider/country selection or payment-method selection screens. Other providers must not inherit this message or the Remitly bank-details wording. Identify the integrated provider by its stored ID rather than its editable display name.
- Show **Withdrawals have not been Enabled** directly below the initial **Next** button when the account is not enrolled. This latest user wording/placement supersedes the admin-enable notice above the form. Enrollment remains an admin permission, not an automatic wallet grant.

Keyboard visibility correction: the user reported amount inputs hidden behind the keyboard. The withdrawal form now uses the existing `KeyboardAwareScrollViewCompat` with a 32-point focused-field clearance on native iOS/Android, and its standard ScrollView fallback on web. Remove the outer React Native KeyboardAvoidingView to avoid applying keyboard displacement twice. The header and country modal stay outside this scrolling area; both amount inputs and later contact inputs receive automatic focus scrolling. No shared keyboard component, chat or stream control was changed. Native keyboard appearance and switching between the two fields still require phone verification.

Verification: mocked mobile handlers cover linked fields, default amount, limits, remaining balances, amount-first navigation/back, menu open/select/system close, available route filtering, provider-specific wording, history-menu empty/populated states, close/detail navigation with draft preservation, and strict contact/request writes. Withdrawal retry/account-isolation and quote/statement tests, mobile TypeScript and all ten language-catalog checks pass. Physical Android/iPhone layout, keyboard and navigation checks remain pending. Metro is running; production and native binaries were not published.

## October 5 production owner update

The user selected existing production Google account **`sixarmedia@gmail.com`** as the production admin owner; the earlier `one.espana@gmail.com` selection remains the development owner. The user reports zero rows in production `admin_staff`. Production access still needs the correct verified managed-Clerk User ID and an audited owner grant. Google authentication requires no additional password. User-provided production ID is `user_3JJ7roIjFeLukMbmmU9YWqKRvoZ`; the audited, single-statement [one-time SQL grant](../artifacts/api-server/scripts/provision-production-owner.sql) is prepared and tested in isolated PostgreSQL, subsequently executed by the user in the production SQL console with reported result `role=owner, enabled=true` for that exact ID. Production owner membership is confirmed by that user-provided result. The subsequent Google sign-in was blocked specifically by the production second-factor gate. No production grant has been executed from this workspace, which currently exposes development credentials only. Replit manages this Clerk tenant through its Auth pane; external Clerk dashboard instructions do not apply. The existing bootstrap script still targets the earlier email and must be updated or bypassed through an explicit audited production provisioning operation for the newly selected owner.

The user explicitly approved **Google sign-in plus enabled owner membership**, with additional authentication deferred. Replit-managed Clerk does not support end-user MFA. Admin routes now require an authenticated bearer/session and enabled owner in every environment, without a second-factor `fva` requirement. This supersedes earlier Pulse admin MFA requirements, including historical verification notes below; it does not change Remitly authentication or independent maker/checker roles. Republish the Replit backend, then verify the existing owner's Google login. This server-only fix requires no TestFlight rebuild. See [the current admin policy](admin-website.md#production-access-denial-after-owner-grant--october-5). Authorization integration suites, public config tests and API/library checks passed; the development API was rebuilt/restarted with its environment preserved and its protected routes still reject missing/forged credentials. Successful production owner access was verified in isolated HTTP fixtures; actual Google login after publication remains user verification.

## October 5 removal of research commentary from admin

The user explicitly rejected the **Route research and quote errors** disclosure and its legacy $500/discount commentary. Remove that rendering function and disclosure entirely from the payout screen. Keep payout-type/default-fee columns, provider/country/name editing, available/unavailable statuses and quote entry/history. Research provenance stored in the database is not displayed in this admin view. This UI correction does not change prices, limits, stored quotes or production data.

## October 5 default-fee columns and removal of $500 comparisons

The user requires column-aligned payout data with **one primary row per payout type**, a directly editable normal/default fee, and no repeated $15/$500 sample rows. They explicitly requested deletion rather than hiding of the $500 comparison samples. Imported zero fees may be promotional; do not silently promote them to normal fees. Keep imports visible at the top, larger provider controls, and pencil name editing. The later explicit maximum decision is USD 500 for subsequent withdrawals; it does not restore the deleted redundant $500 sample rows.

- Country tables show payout type, default USD fee, funding method, receive currency, delivery, status and actions. **Add default fee / Edit fee** saves the fee for the payout type. Quote history is secondary, uses plain funding labels, combines matching quote rows and flags zero fees as promotion status unverified. Actual withdrawal quotes and existing payment records remain separate.
- `PATCH /api/admin-data/payout-catalog/methods/{id}` accepts expected revision plus `defaultFeeCents`/`defaultFundingMethod`. Defaults are audited, survive imports and remain admin reference settings; they do not fabricate dated observations or replace fresh provider quotes in creator accounting.
- [`20261005_catalog_default_fees.sql`](../lib/db/migrations/20261005_catalog_default_fees.sql) adds constrained default fields, deletes $500 catalog observations with count-only audit events, and initializes only unset defaults from the latest positive $15 samples. Zero samples remain unset; explicitly configured zero defaults are preserved. No wallet, withdrawal or payment row is deleted.
- The bundled research file now contains only $15 fee samples; it no longer imports redundant $500 fee rows. Historical provider notes/promotion cautions remain as provenance. Current development migration removed **24 $500 rows** and initialized **18 positive default-fee rows**.
- The user requires a **development review link before any production promotion**. Apply/build/review in development only. Production publishing and its migration remain pending that review.

Automated catalog/database HTTP regressions, client/library/API/mobile TypeScript checks and desktop/390px Chromium fixtures passed. Fixtures cover default updates, audit/revision/scope checks, sample deletion, zero handling, import preservation, quote-history grouping and the existing editor/import flows. Real provider behavior and physical devices were not retested.

## October 5 payout admin UI correction

The user rejected always-visible duplicate name fields. Country and payout-type names must appear once in the normal view, with an adjacent pencil opening the name field only while editing. Provider names follow the same approach. Save and Cancel appear only after editing a name or changing enablement; Cancel restores the original values. Keep the country expanded after a successful save.

The user explicitly requires **import controls visible at the top**, not tucked behind a disclosure, and larger provider menu/name fields (48px minimum control height and 16px text). Provider creation remains visible. The owner confirmed they already imported the research; preserve those database records and do not reimport or overwrite them for this UI correction. Initial rollout should deliver the approved research prepopulated rather than make the owner perform setup imports. Development and production remain separate databases; publishing code alone does not transfer development records.

Verification: JavaScript syntax and Chromium fixtures passed at desktop and 390px width, including visible top import controls, provider sizing, default-hidden duplicate name fields, pencil editing, cancel/reset, saved payout-type names, retained country expansion, existing fees/import preview races, conflicts and permission-loss clearing. Screenshots were visually inspected. These are automated browser checks; no native mobile source, database data or payment behavior changed, and no physical-device check was performed.

## October 5 admin provider management correction

The user requires **admin-created provider → country → method → fees**, with imports applied to the selected provider and routine observed-fee changes entered directly in admin. Requiring a deployment secret and a Remitly-only importer for this workflow was rejected. This update supersedes the earlier mandatory account-environment configuration and import-only fee editing requirements below.

- **Payout methods → Add provider** saves the provider in the database. Select it, preview its countries/methods/fees JSON, then explicitly import. The existing Remitly research file remains compatible. Payoneer and other providers can store their own research using the same hierarchy; creation is not a provider payment integration.
- `PULSE_PAYOUT_CATALOG_ACCOUNT` is optional legacy namespace configuration. Existing configured namespaces and development data remain unchanged. With no override, production uses `production-remitly-business` internally and development uses `development-remitly-business`. These are catalog namespaces, not credentials. No secret entry is required for normal admin provider creation/import.
- New owner-only endpoints: `POST /api/admin-data/payout-catalog/providers` with `{name}`; `POST /api/admin-data/payout-catalog/methods/{id}/fees` with expected revision, exact send amount/fee in integer USD cents, funding method, observation time, delivery estimate, tax status and source page. Provider creation and fee observations are audited. Fee updates append immutable history; they do not change approved withdrawal quotes. Existing enablement and display-name edits remain.
- Admin imports include `providerId`. The server resolves it within the current database namespace and validates research for that provider. Changing file/provider or refreshing invalidates the preview. Legacy CLI imports remain scoped and Remitly-specific.
- Apply [`20261005_catalog_provider_management.sql`](../lib/db/migrations/20261005_catalog_provider_management.sql) after the existing catalog migration; it extends accepted observation sources while preserving all rows.
- Creator APIs still expose only providers supported by the current Remitly withdrawal implementation. Adding Payoneer does not expose an unimplemented payment flow to creators. No mobile source change or new mobile build is required for this admin workflow.
- The import and direct-entry formats currently use US sender funding and USD fee/send amounts. They record observations, not interpolated percentage/tier schedules. See [the import format](payout-provider-imports.md).

Verification: API/client/library and mobile TypeScript checks, API build and catalog/withdrawal/operator database integration suites passed. Chromium admin fixtures passed at desktop and 390px widths, including provider creation, direct fee entry, HTML escaping, file/provider preview races, revisions, permission-loss clearing and expanded fee-editor layout. These are automated browser checks, not physical-device or real-provider verification. The new source-constraint migration was applied to the confirmed development database with provider/observation counts unchanged (1 provider, 61 observations). The final development API was rebuilt/restarted preserving environment/arguments/cwd; health and updated admin assets returned 200, and all three new/affected POST endpoints rejected unauthenticated requests with 401. Successful owner mutations were exercised in isolated authenticated HTTP fixtures, not a live owner session. Production migration, backend republish and real owner verification remain pending; no production data or provider payment was changed.


## October 4 follow-up decisions

- Final wallet decision: **all existing wallet coins are redeemable**, including bought coins, received gifts and granted test coins. Use the same authoritative wallet; no diamonds, conversion screen or gift-source eligibility backfill. **400 coins = USD 1** (10,000 coins = USD 25). This supersedes the earlier gift-only and USD 0.003 reference, and the intermediate diamond proposal.
- The human makes the **final payout decision**. Preparation/checking do not send money. An owner may decline or manually approve and send/issue the link in Remitly, then record the actual provider action. A decline before any provider attempt returns reserved coins; a decline after an attempt blocks release and retains the reservation until provider cancellation/return is verified.
- Test the existing app through TestFlight with the tester's existing wallet coins. Enable that specific account through the admin enrollment preview. Enrollment changes permission only and never creates coins. Do not create a separate synthetic-earnings product flow.
- The intended first real trial is a **USD 15 withdrawal** with a Colombia tester who completes the full creator flow, including recipient setup and Remitly-hosted delivery details. The human still completes provider sending. Catalog implementation does not authorize a real payment.
- The first withdrawal is **exactly USD 15 gross**; subsequent withdrawals are **USD 25–500 gross**, including the creator-paid fee. Remitly adds its fee to the transfer amount, so a fee estimate of USD 0.99 would leave USD 14.01 to send within a USD 15 gross withdrawal. That example still requires an actual quote for USD 14.01; a quote observed at USD 15 send is not proof of the fee at USD 14.01.
- Creator selection order is **provider → recipient country → delivery method → withdrawal amount → fee/send/total-deduction breakdown**. Explain that a Remitly link collects delivery details. Keep banking details with Remitly. A method or fee change through the link requires review against the approved bounds.
- Build an account-scoped payout-method catalog with migrations, an idempotent research import, authenticated creator APIs and protected admin updates/disable controls. Choose database relationships that fit the existing PostgreSQL/Drizzle project. Use only the supplied observations from the signed-in Remitly Business account; saved fees are estimates and an actual quote is required before preparing a payment.
- The supplied October 4 research covers 13 countries, debit-card funding from the US, and **USD 15 and USD 500 send amounts**, not gross withdrawals. Preserve unavailable destinations and quote errors for admin review. Keep taxes and unverified promotional discounts separate from fees. Do not interpolate a fee schedule from two samples.
- Saudi Arabia was observed with manual-only recipient entry; Costa Rica's link method restrictions were not verified. These facts do not establish readiness for the creator's method-selecting link flow. Brazil's method-specific taxes remain unresolved.
- The latest October 5 instructions approve USD 25–500 for subsequent withdrawals. The enabled creator account and authoritative available wallet balance still gate every request; catalog estimates never authorize payments.
- The user approved the inherited model for coding sub-agents because the AGENTS.md preference `gpt-5.6-terra` is unavailable in this session. The primary agent must review their work and verification.

## Payout-method catalog delivery — October 4

The catalog foundation is implemented and imported into the existing **development** database. Its verification below is separate from the withdrawal implementation described next.

- Research source: [`remitly-research-20261004.json`](../artifacts/api-server/src/config/remitly-research-20261004.json), preserving the user's signed-in observations: 13 countries, 24 methods and, after the approved $500 cleanup, 24 fee samples plus 13 country observations. A repeated import inserts zero observations.
- Schema: [`20261004_payout_catalog.sql`](../lib/db/migrations/20261004_payout_catalog.sql) and [`payout-catalog.ts`](../lib/db/src/schema/payout-catalog.ts). Providers are scoped to a named account; country/method relations have database constraints. Observations are immutable, imports are atomic, and optimistic admin updates have before/after audits. Imports preserve admin names and disables and do not restore stale omitted methods.
- API: authenticated `GET /api/payout-catalog` and `POST /api/payout-catalog/estimate`. Estimate input is `{methodId, withdrawalCents, fundingMethod}`; withdrawal amounts are integer USD cents and capped at 50000. A missing exact send-amount/funding observation returns `quoteRequired=true` and `breakdown=null`; all saved estimates have `liveRequoteRequired=true`. Taxes are unknown/unresolved separately, and unverified discounts never reduce the earnings deduction.
- Admin: **Payout methods** at `/api/admin/#payout-methods` (or `/admin/#payout-methods` on the direct API). Complete research, errors, availability, delivery estimates, fee samples and verification dates remain visible. Owner-authorized endpoints are `GET /api/admin-data/payout-catalog`, `PATCH /api/admin-data/payout-catalog/{providers|countries|methods}/{id}` and `POST /api/admin-data/payout-catalog/import`. Updates accept display name/enabled plus expected revision. Observed fees are updated through new signed-in research evidence, not arbitrary fee overrides. Authenticated enabled-owner and disabled-staff checks remain in effect.
- Import preview is the default. The admin upload requires a validated preview before explicit import. The CLI is `node scripts/import-payout-research.mjs --account <account-alias>`; add `--apply` only for an approved database import. `--file <path>` imports another observation file. No importer runs migrations or sends payments. An optional genuine UTC `observed_at`, matching `observed_date`, supports multiple observations in one day; omitted timestamps retain the original date-only import identity. Changing content under the same observation identity is rejected.
- The development API uses `development-remitly-business` as its local catalog alias when no explicit `PULSE_PAYOUT_CATALOG_ACCOUNT` is configured. This alias does **not** claim Remitly provides a sandbox; the observations still came from the signed-in Business account. Production now has its own default namespace, `production-remitly-business`; an explicit legacy namespace override remains optional. See the October 5 provider-management correction above.
- The creator catalog currently exposes 8 countries and 21 methods. US/Venezuela unavailable routes and Russia quote errors remain admin-only. Saudi Arabia and Costa Rica retain their observed methods/evidence but are excluded from creator selection pending link-flow verification. Catalog `availability` expresses readiness for the approved flow; `inspectionStatus` and research notes preserve the provider-specific findings. Brazil remains quote-required because its taxes are unresolved.

Verification completed for this catalog:

- API/library type checks, API build, generated OpenAPI/React Query/Zod contracts and patch whitespace checks passed.
- `node artifacts/api-server/tests/payout-catalog.integration.mjs` passed against a disposable private PostgreSQL cluster: concurrent/idempotent/atomic imports, immutable conflicts and rollback, source/URL/input validation, account/route isolation, exact decimal amounts, fee/funding matching, USD 15 gross limit, historical/same-day quote precedence, taxes/promotions, independent enablement, revision/audit checks, bearer/owner/production-MFA authorization and generated response schemas.
- Catalog browser fixtures passed in Chromium at desktop and 390px widths: rendering, edits/conflicts, imports, changed-file preview races, HTML escaping, errors and permission-loss clearing. Existing admin directory/overview and removal/verification/live/moderation browser regressions also passed. Fixtures do not establish a real owner-authenticated session.
- Development API was rebuilt and restarted preserving its arguments, working directory and environment. Health/admin assets returned 200, updated catalog controls were served, and all catalog endpoints rejected missing and forged credentials with 401. Successful authenticated requests were verified in the isolated HTTP harness, not through the real owner's running-server session. Read-only checks of the actual development data also passed generated contract validation.
- No physical iPhone/Android checks, live Remitly/browser checks, Mac installation/scheduling, production deployment or payment sending were performed. The supplied observations were imported; their provider behavior was not independently retested.

## In-app withdrawals and payout desk — October 4

The existing app now has Settings → Withdraw Money, an Earnings shortcut, recipient contact setup, provider → country → method selection, a USD 15 request, estimated provider amounts, status/history and a private downloadable statement. Available/reserved coins are shown with their USD equivalent and shared gold artwork. Remitly collects bank/delivery details through its actual recipient link.

The backend reserves **6,000 real wallet coins** atomically with the request and records a wallet `withdrawal_hold` transaction plus immutable reservation/evidence events. Idempotent retries cannot reserve twice. Purchased, gifted and test-granted balances follow the same rule. Cancellation/refunds use `withdrawal_release` entries. Successful delivery settles the verified actual cost; unused reserved coins return to the wallet. Unknown outcomes retain their reservation; provider-confirmed returns append adjustments without automatic repayment. No account is enabled by the migration; owner enrollment is individual and audited.

The protected admin **Payout desk** provides withdrawal enrollment preview, queues, actual signed-in quotes, preparation leases, independent checking, human approve/record-release and decline actions, investigation and outcome reconciliation. The initial withdrawal submission consents to the gross amount and method; actual quote checks are internal, and the human makes the final payout decision. Release records an action the human already performed in Remitly; clicking it does not call a provider payment API. Maker and checker must be separate actors. Repeat withdrawals follow the configured USD 25–500 policy.

Artifacts: [`20261004_creator_withdrawals.sql`](../lib/db/migrations/20261004_creator_withdrawals.sql), [`creatorWithdrawals.ts`](../artifacts/api-server/src/lib/creatorWithdrawals.ts), [`withdrawals.ts`](../artifacts/api-server/src/routes/withdrawals.ts), [`withdraw-money.tsx`](../artifacts/mobile/app/withdraw-money.tsx), and [`withdrawal/[id].tsx`](../artifacts/mobile/app/withdrawal/[id].tsx). Creator routes live under `/api/withdrawals`; authenticated owner-protected operator routes live under `/api/admin-data/withdrawals`. OpenAPI, client types and Zod schemas include both sets.

### TestFlight rollout and full Colombia trial

1. Publish the updated API through the existing Replit deployment, with both additive migrations applied to its intended database. Import the research idempotently using the production Remitly account alias; development data does not automatically become production data.
2. Configure `PULSE_PAYOUT_CATALOG_ACCOUNT` to that alias. Set `PULSE_PAYOUT_MAKER_IDS`, `PULSE_PAYOUT_CHECKER_IDS` and `PULSE_PAYOUT_RECONCILER_IDS` to authorized Clerk staff IDs; authenticated enabled-owner checks still apply. Maker and checker must differ. Empty role lists deny those configured actions. Recipient-error classification, correction and guarded recovery in the admin portal require only the authenticated enabled owner session; no reconciler allowlist entry is needed for that flow.
3. Verify actual Remitly review/activity URL paths used by the operator and configure approved HTTPS prefixes in `PULSE_PAYOUT_LINK_PREFIXES` when recording URLs. Empty prefixes deny supplied URLs. First-time manual release does not require copying the recipient link because Remitly emails it directly. Do not infer sent-transfer IDs from scheduled review URLs.
4. Publish the existing app identity to TestFlight through the normal build flow. No separate app, wallet or test earnings screen is required.
5. In **Payout desk**, preview the Colombia tester's UID and existing wallet, then enable it with a reason. Confirm at least 6,000 available coins. No tester UID has been supplied and no real account has been enrolled automatically.
6. Tester opens Withdraw Money, sees the real wallet, selects Remitly → Colombia → method, enters legal name/contact information and requests USD 15 gross. Confirm the wallet decreases by 6,000 and the withdrawal shows that reservation.
7. Maker obtains a fresh signed-in quote whose **send + fee + tax ≤ USD 15**, recording actual recipient amount, provider minimum, timestamp/expiry and evidence. A USD 15-send sample does not establish the fee at USD 14.01 send. Record the actual breakdown and estimated COP in Pulse; the creator does not approve it again. Continue to preparation in the same operator run.
8. Maker claims preparation before any potential provider action and records the first-time link plan/history checks with auto-send off. Independent checker validates quote, recipient, reservation and provider history. Human decides approve or decline. For approval, the human performs the Remitly action and records its evidence/time; the first-time recipient link is optional because Remitly emails it directly. Saved-recipient transfers retain the provider-reference requirement. No software here sends money.
9. Tester opens the actual link and completes Remitly delivery details. Reconciler verifies provider status/reference, recipient, method and amounts against the approved snapshot. Only authoritative delivered evidence marks delivery and settles coins. Tester checks final wallet/history and downloads the statement.
10. Run decline-before-preparation, decline-after-attempt, cancellation, unknown/expired and returned-payment cases in isolated fixtures first. Real ambiguous attempts require investigation and verified cancellation/return before coins are released or retries enabled.

Automated checks cover wallet reservation/concurrent spending, idempotency, source-independent eligibility, enrollment without minting, quote bounds, recipient ownership, maker/checker separation, human decline, reconciliation and exact-once refunds. Desktop and narrow browser fixtures verify the payout desk. These do not verify phones, a real authenticated Remitly session, production deployment or actual transfers. Android/iPhone navigation, keyboard/scrolling, gold artwork, links, private statement sharing, foreground refresh and existing stream/chat behavior remain device checks for TestFlight.

Verification checkpoint: both catalog and withdrawal isolated PostgreSQL/HTTP suites passed, including generated Zod response validation; both catalog and payout-desk browser suites passed, including 390px layout and expired recovery. API/library/mobile type checks, API build, mobile withdrawal handlers, ten-language localization (1,110 keys), required stream regressions and diff checks passed. The new withdrawal migration was applied to the matching **development** database with wallet totals unchanged and zero accounts enrolled. The API was rebuilt/restarted preserving its environment. Running health/admin assets return 200; 21 withdrawal endpoints reject missing/forged bearer credentials with 401. A read-only development overview matches the actual wallet and generated contract. Successful authenticated business flows were exercised in the isolated HTTP harness, not a real owner's production session. No actual transfers, production migration/publishing or native build occurred.

Private native statement file sharing adds the Expo-compatible `expo-sharing` dependency; it needs the user's new native build. App identity and build configuration are unchanged. Installed-device sharing remains unverified.

## MCP and Mac operator delivery — October 4

The scoped payout MCP is implemented at **`/api/payout-mcp`**, alongside the existing API. After publishing the updated Replit backend, its production connection URL is `https://chimbalivestream.replit.app/api/payout-mcp`. The Mac does **not** build the mobile app or backend. The supplied optional Keychain bridge runs JavaScript with Node 22 or newer; it needs repository dependencies installed, with no compiler or Xcode requirement. Installation is documented in [the Mac package README](../artifacts/payout-operator/README.md), with [operating and recovery instructions](../artifacts/payout-operator/operator-runbook.md) and [role-specific automation prompts](../artifacts/payout-operator/templates/automation-prompts.md).

The authenticated owner-protected admin **Payout operators** page issues and revokes separate maker/checker/reconciler credentials. Each credential is bound to the backend environment, configured Remitly Business account alias and one stable operator identity. Credentials are shown once, stored only as hashes on the server, expire after seven days by default (maximum thirty), and should be entered manually in macOS Keychain Access. The bridge checks exact origin/environment/account/operator/role/version before exposing tools. Keep different role credentials in independent operator configurations; never let a maker switch credentials to check its own work.

The adapter calls the authenticated **`/api/payout-operator`** service through a fixed backend connection; it has no database access. Tools expose identity, bounded role queues, protected payout details, authoritative playbooks, browser/attempt leases, signed-in quote recording, unsent preparation, independent checking, uncertainty and reconciliation. They expose no final human approve/decline, payment sending, recipient-link issuance, credential management, enrollment, pause management or arbitrary HTTP. Authenticated service assertions are recorded with operator identity and evidence; they are not provider API callbacks. The adapter authenticates each remote RPC, bounds requests/responses and rates, redacts credential values, rejects redirects and never retries a financial mutation automatically.

Account-wide durable browser leases serialize maker/checker/reconciler activity. Lease ownership and expiry are checked within the same transaction as protected financial mutations. An interrupted or expired preparation is quarantined as unknown with coins still reserved. Revocation stops future calls and quarantines interrupted preparation. Versioned [playbooks](../lib/payout-mcp/playbooks/preflight.json) preserve the human final decision. If Remitly cannot save a first-time link preparation without issuing the link, the operator stops for the human. Actual provider behavior still needs verification.

The additive [operator migration](../lib/db/migrations/20261004_payout_operators.sql) was applied only to the confirmed running **development** database. Wallet account/count totals were unchanged and no operator credentials, enrollments or payments were created by that migration. Production needs the migration after the existing catalog/withdrawal migrations, `PULSE_PAYOUT_CATALOG_ACCOUNT` set to the genuine account alias, authenticated enabled-owner access and separately issued production credentials. `PULSE_PAYOUT_MCP_ALLOWED_ORIGINS` optionally lists exact trusted browser origins; native MCP clients normally omit Origin. Existing verified Remitly URL restrictions and manual release requirements remain in force.

Verification:

- Library/API types, generated OpenAPI/React Query/Zod contracts and API build passed. Real MCP SDK tests exercised initialize/list/call, role exposure, revoked credentials, strict input validation, secret redaction, request/response limits, redirects and uncertainty without mutation retries.
- Disposable PostgreSQL tests exercised actual MCP and service routes, owner/MFA issuance, hashed credentials, role/environment/account isolation, revocation/expiry/rates, exclusive and idempotent browser claims, concurrent lease release during a financial mutation, expiry rollback, attempt interruption and the complete creator → maker → independent checker → simulated human release → reconciliation flow. Existing withdrawal integration regressions also passed. These fixtures never contact Remitly or production.
- Admin browser fixtures passed issuance/revocation, role choice, one-time secret dismissal, permission-loss races, escaping and 390px layout. Existing payout desk and catalog browser fixtures passed.
- Saved-recipient withdrawal initialization and writes now retain only allowed contact fields, excluding server revision/status metadata and null/blank optional surnames. Mobile handler regressions, typecheck and localization checks passed. This fix belongs in the next TestFlight app build; physical device validation remains pending.
- Nine Mac helper runtime tests passed for identity pins, role isolation, private paths/logs/heartbeats, symlink/permission checks, overlapping/crashed locks, explicit recovery, playbooks and count-only summary deduplication. Linux tests do not establish actual macOS Keychain or Codex scheduling behavior.
- The development API was rebuilt/restarted with its existing environment preserved. Health/admin assets returned 200, the new credential controls were served, missing/forged service/MCP/admin credentials returned 401, and MCP method/Origin/body boundaries returned 405/403/413. Successful authenticated calls were tested in the isolated HTTP/MCP harness; no real owner's credentials were used on the running server.

Mac installation, actual Keychain access, authenticated browser capability, Remitly login/MFA, provider selectors, native Codex recurrence and sleep/recovery behavior remain **unverified**. Configure the proposed thirty-minute cadence only after manual capability verification and confirmation of timezone/working hours. No schedule, external notification channel, production deployment or real payout was created here. The Mac still needs to connect/configure Codex; the human still performs the final payout decision and provider sending.

## Instructions to Codex on Replit

Build a Remitly-based creator withdrawal workflow within the existing Pulse project. Inspect the repository and applicable AGENTS.md instructions first. Implement the creator screens, backend accounting, admin payout desk, scoped MCP adapter, and supporting local operator package described below. Preserve unrelated changes and existing functionality.

This document supersedes the Payoneer-first launch direction in earlier payout plans. Remitly is the launch provider. Keep provider boundaries extensible, but do not build or expose unverified payment methods from other providers.

There are two cooperating environments:

| Environment | Responsibility |
| --- | --- |
| Pulse on Replit | Authoritative earnings ledger, recipient records, withdrawals, reservations, approval queue, agent permissions, evidence and audit records |
| Existing operator Mac | Scheduled agent runs, authenticated Remitly browser preparation, independent checking, reconciliation and notifications |

The human completes final sending in Remitly at launch. Do not assume a Remitly payout API exists. Do not claim Replit can install software or schedule jobs on the Mac: deliver the local code and handoff instructions, then verify installation on the Mac separately.

## 1. Observed Remitly behavior

The user tested the following in their Remitly Business account:

- First-time recipients can receive a payment link and select their delivery method.
- Repeat transfers initiated from Settings → Contacts → recipient preserve the selected method. Other entry points, including multiple-recipient payments, asked for the method again.
- One-time scheduled transfers dated today, with auto-send off, appear on the homepage as Ready to review with a Review and send action.
- The review URL contains a scheduledDraftId query parameter.
- Sent transfers have an activity URL and a separate provider reference ID.
- Scheduled drafts display a send-by deadline. The inspected account displayed Eastern time.
- Exchange rates are finalized when sending.
- Auto-send is offered, but remains off for launch. Future auto-send is a separate implementation and authorization decision.

These are account-specific observations. Still verify multiple simultaneous drafts, logout persistence, draft-link reopening, expired-draft behavior, and whether first-time payment-link transfers support scheduling. Do not treat an untested behavior as established.

## 2. Creator screens

Add Withdraw Money to Settings and link it from Earnings. Preserve app styling, localization, accessibility and existing navigation.

Provide:

1. Available wallet coins and USD equivalent, reserved withdrawals and payout history. No earnings hold applies to the confirmed all-wallet policy.
2. Recipient setup: legal first/last names, optional second surname, country, phone with country code, and email.
3. A clear explanation that Remitly collects delivery/bank details. Do not collect banking credentials in Pulse.
4. Withdrawal amount, fee disclosure, estimated recipient amount, and confirmation.
5. Withdrawal detail with truthful status and timeline.
6. Downloadable earnings payout statement.

Use configured country/currency support. Do not imply all Remitly countries or methods are enabled. Distinguish saved contact details, provider onboarding pending, and verified saved recipient readiness.

### Launch amount rules

- First successful withdrawal minimum: USD 15.
- Subsequent minimum: USD 25, including fees, reaffirmed by the user October 5. Maximum USD 500, explicitly confirmed by the user October 5.
- First withdrawal: exactly USD 15 gross. Subsequent maximum: USD 500 gross, including provider fees. This approved policy supersedes the earlier fixed USD 15 server limit; historical quote observations did not establish it.
- Failed/canceled requests do not consume the first-success allowance.
- Prefer one unresolved withdrawal per creator at launch, preventing concurrent first-withdrawal eligibility and simplifying operations.
- Gross withdrawal means total earnings deducted, including the creator-paid provider fee.
- The observed USD 0.99 fee is not universal. Store actual fee quotes and maximum approved deductions.
- Example only: USD 15 gross minus USD 0.99 fee leaves USD 14.01 to send before FX.
- Enforce the provider minimum against the send amount after fees. The observed USD 10 minimum must be configured by supported route, not assumed universal.
- If fees/taxes, method or USD amounts violate the submitted gross/route bounds, stop for human resolution. Refresh the provider quote internally within those bounds without requesting a second creator approval. New receive-currency amounts are estimates; do not silently increase the gross deduction.
- If fees decrease, settle actual cost and release the unused reservation under a documented rule.

## 3. Accounting and duplicate prevention

Use the existing `coin_balances` wallet as the available balance, regardless of coin source. The October 4 decision supersedes the earlier separate/gift-only balance proposal. One coin is USD 0.0025; use integer quarter-cent units and integer cents for provider quotes. Historical gift totals are statistics, not an additional spendable balance.

Implement:

- Preserve existing wallet credits and append withdrawal adjustments, reservations, settlements, releases and returns.
- All wallet sources are eligible at 400 coins per dollar; no diamond conversion, eligibility hold or historical opening credit is needed. Existing purchases/gifts remain authoritative wallet transactions.
- Unique wallet/financial source references prevent duplicate reservation/refund credits.
- Atomic balance reservation and idempotent withdrawal submission.
- Stable Pulse withdrawal IDs and immutable recipient/amount snapshots.
- At most one unresolved payout attempt per withdrawal, across providers.
- Provider-account-scoped uniqueness for scheduled draft IDs, transfer/activity IDs and provider reference IDs when present.
- Audited state changes with actor, time, evidence and reason.

Limit production withdrawals to explicitly enabled accounts and configured country/provider routes. The full app trial uses the tester's existing coins. Disposable fixtures are used only for automated verification.

Timeouts, missing receipts and uncertain browser outcomes block retries. They do not release the reservation. Never delete financial history to resolve an exception.

## 4. First-time and repeat workflows

### First-time recipient

Prepare the Remitly recipient-choice payment-link flow. Link issuance may commit a payment and requires human release. Do not assume it can be saved as a scheduled draft.

Track awaiting human release, link issued, awaiting recipient, processing and delivered separately. A lack of immediate funding debit does not make a link safe to duplicate.

Mark onboarding ready only after provider evidence confirms the saved recipient and chosen delivery method. Keep bank details at Remitly; Pulse stores an appropriate recipient mapping and masked destination evidence.

### Repeat recipient

Start from the saved Remitly contact and prepare:

- Current date in the provider account's timezone.
- Does not repeat.
- Auto-send off.
- Correct recipient, destination, send amount, currency, fee and funding account.
- Service Payment as the reason when accurate for the creator compensation.

Capture the draft ID, review URL and review deadline. If the deadline cannot allow adequate human review, flag the request rather than silently moving dates.

Never create a replacement draft until the previous attempt has been resolved. One withdrawal maps to one active one-time schedule, never a recurring transfer.

## 5. Admin payout desk

Build a searchable/filterable payout queue with:

| Field | Purpose |
| --- | --- |
| Pulse withdrawal ID | Permanent internal reference |
| Creator and legal recipient name | Match app identity to payee |
| Gross deduction, fee, send amount | Explain full accounting |
| Country, currencies, masked destination | Verify delivery |
| Transfer status | Requested, preparing, scheduled, processing, etc. |
| Checker status | Not checked, passed, needs attention |
| Review deadline | Identify action required |
| Review in Remitly | Open the saved scheduled draft |
| Provider reference and activity link | Track sent payments |

Add detail views with evidence, individual checks, history and actor identities. Provide a separate exceptions queue and an emergency preparation pause. Pausing must not prevent reconciliation.

Validate provider URLs against approved HTTPS host/path patterns. Do not accept arbitrary URLs or fetch user-supplied destinations. Restrict draft links and recipient data to authorized operators. Verify deep links after fresh login before relying on them operationally.

Keep checker status separate from transfer status. Internal approval or opening a link does not mean a payment was sent.

## 6. Maker, checker and human controls

Enforce roles at the backend, not just in prompts:

- Maker: prepares drafts and records evidence.
- Checker: independently reads and verifies drafts; cannot check their own work.
- Human approver: reviews checked requests and completes sending in Remitly.
- Reconciler: records and verifies provider outcomes.

Use separate agent identities and credentials. No agent credential can grant itself human approval or modify roles.

Checker requirements:

1. Withdrawal, legal recipient and masked destination match.
2. Gross deduction, fee, send amount and currencies reconcile.
3. Earnings remain reserved.
4. No paid, pending or uncertain duplicate exists in Pulse.
5. Relevant provider history has been inspected, with evidence and coverage recorded.
6. The schedule is one-time, auto-send is off and its deadline is valid.

Bind checks to the exact payout version/hash. Changing recipient, destination, amount, fee bounds or draft invalidates the check. Missing evidence produces needs attention, never an invented pass. The checker returns corrections to the maker instead of editing the payout itself.

Pulse cannot prevent independent actions in Remitly. Require operators to use the workflow and reconcile out-of-band transfers. Do not claim software can enforce separation inside the provider website when it cannot.

## 7. Status, reconciliation and statements

Store internal workflow status separately from raw provider status. Model requested, preparing, scheduled/awaiting human review, awaiting recipient, submitted/processing, delivered, failed, canceled, expired, returned and unknown outcomes with explicit permitted transitions.

After sending, capture the provider reference, activity URL, actual amounts/fees/currencies, status, evidence and observation time. Match the recipient and amount to the withdrawal before reconciliation. Only verified completion marks it paid.

Repeated reconciliation must be idempotent. Do not regress delivered to processing because of older evidence. Handle returns through audited financial adjustments rather than reopening the original withdrawal for automatic repayment.

Release reservations only after authoritative failure/cancellation and any required funding return are confirmed. Expired deadlines require investigation; disappearance of a draft is not proof of cancellation.

Statements include creator/business identity, earnings period where applicable, withdrawal ID, gross amount, fees, send amount, status and verified provider reference/date. Clearly label estimates and pending payments. Do not fabricate an invoice issued by the creator.

## 8. Backend and MCP adapter

Keep all financial mutations in the authenticated Pulse backend. Add a small MCP adapter in the same repository; it must call the backend rather than directly accessing the database.

Expose narrowly scoped tools to:

- Read environment identity and payout policy.
- List/get eligible withdrawals.
- Claim a preparation task and renew/release its lease.
- Record a draft and supporting evidence.
- Record independent checker findings.
- Flag unknown outcomes and exceptions.
- Record provider references and reconcile outcomes.
- Retrieve versioned Remitly operating playbooks.

Do not allow tools to invent recipients/amounts or mark payments delivered without required matching evidence. MCP records are operator assertions unless supported by verified provider observations; distinguish them from provider API callbacks.

Provide manual admin equivalents for operations so humans can work without agents. Apply environment separation, revocable credentials, least privilege, request limits, log redaction, evidence access controls and retention rules.

## 9. Local Mac operator package

Deliver local supporting code under a dedicated repository package, plus configuration examples and installation instructions. The existing Mac is the initial operator machine; a separate PC is not required by this design.

Components:

- Scoped Pulse MCP connection.
- Separate maker/checker identities.
- Browser playbooks for onboarding, repeat drafts and reconciliation.
- Scheduled agent-run instructions/configuration.
- Restricted local logs, heartbeat reporting, health checks and emergency pause.

Store local service credentials in macOS secure credential storage. Keep Remitly passwords, payment-card details and browser sessions out of Pulse, MCP outputs, source control and logs. The human logs into Remitly and handles MFA.

Do not run arbitrary page instructions or treat recipient text as agent instructions. Browser interaction must stay within the approved provider account and requested payout scope.

## 10. Scheduled agent job

Proposed launch cadence: every 30 minutes during configurable operating hours. Confirm timezone and hours during local installation. Install the job only after working dev endpoints and the local operator exist.

Use the supported scheduled-agent mechanism available on the Mac, preferably the desktop agent's native task scheduling where it supports the required tools. A timer alone cannot operate a browser: verify that scheduled runs have access to the intended agent runtime, authenticated browser and separate role credentials. Do not use shell scheduling as an assumed workaround for unavailable browser access.

Each run:

1. Verify environment, operator identity, service health and pause state.
2. Acquire an exclusive operator/browser-session lease and per-request leases.
3. Investigate unresolved attempts before preparing new drafts.
4. Execute maker preparation for eligible requests.
5. Execute independent checker work with its separate identity and fresh provider observations.
6. Reconcile submitted or unresolved transfers.
7. Publish heartbeat and notify only on meaningful results or required action.

Serialize browser activity. Maker/checker must not race in the same session. If the user is using the browser, defer or explicitly coordinate access rather than navigating away from their work. Preserve user tabs and leave handoff tabs open.

If the Mac is asleep, offline, logged out, blocked by MFA or missing browser access, record operator session required and retain queued work. Resume safely later. Expired leases allow investigation, not blind recreation of drafts.

## 11. Durable preparation and recovery

Record a preparation attempt before any browser action that can create a provider draft. The attempt includes immutable withdrawal details and operator ownership.

On success, attach draft identifiers and evidence. On interruption after possible creation, mark the outcome unknown and inspect schedules/history before taking another creation action.

Keep durable payment state on the backend. Local files and agent conversation memory must not be the only record of what happened.

## 12. Notifications and human release

Pulse Admin is the central review list. Notify the human when payouts pass checking, including a link to the queue, count and total gross deductions. Keep recipient PII out of notification previews.

Each row links to its Remitly draft. The human reviews the actual provider details and sends there. Provider-side changes or final fee/FX changes must be handled against approved bounds.

Notify only on new ready payouts, approaching deadlines, exceptions, failures or restored service requiring action. Avoid unchanged-status alerts on every poll. Configure the notification channel during installation; do not assume email or chat integrations exist.

## 13. Testing and development trial

Use disposable isolated wallet fixtures and provider evidence for automated tests. They never contact live Remitly. The actual trial is the existing app and tester's wallet through TestFlight, not a separate synthetic-earnings workflow. A future Mac operator simulator, if implemented, is a developer verification tool only.

Required tests:

- Concurrent reservations, insufficient balance and duplicate request retries.
- First-success and repeat minimum rules.
- Exact fee and sub-cent accounting.
- Maker/checker separation and unauthorized API/MCP access.
- Changed details invalidating checks.
- Unique draft/reference constraints.
- Overlapping schedules, stale leases and interrupted preparation.
- Browser session loss, MFA and Mac unavailability.
- Unknown outcomes blocking retries.
- Idempotent reconciliation and out-of-order observations.
- Failed/canceled/returned/expired handling.
- Creator account isolation and restricted recipient/evidence access.

Run: creator setup → request → reservation → simulated maker draft → checker → human simulated release → reconciliation → creator history and statement.

Confirm the target development API/database before migrations. Follow repository requirements for generated API contracts, builds and tests. Rebuild/restart the development API as required, preserving its environment, and verify affected authenticated endpoints on the running server.

Verify mobile navigation, keyboard, accessibility, poor-network retry, account switching and external-link return. Report automated checks separately from actual iPhone/Android checks.

Actual Remitly checks must separately verify multiple schedules, logout/relogin, draft links, first-time setup, deadlines and reconciliation. A simulator pass is not provider validation.

## 14. Delivery order and ownership

1. Replit: inspect baseline and implement additive ledger/schema/API with feature flags and dev fixtures.
2. Replit: implement creator screens, admin desk, statements and meaningful tests.
3. Replit: implement scoped MCP adapter, operator package and simulator.
4. Replit: run the development workflow and publish exact connection/deployment instructions.
5. Mac: install/configure operator and separate credentials; verify read-only dev connection.
6. Mac: verify browser access and complete the simulated maker/checker/reconciliation flow.
7. Mac: configure scheduled agent task and verify wake-up, health, pause and recovery behavior.
8. Human-led provider validation and separately authorized live pilot.

Deliver an operator runbook with start, pause, resume, health, login renewal, exception investigation and recovery procedures. Document actual scheduler/tool limitations rather than claiming unattended operation without testing it.

## 15. Scope boundaries and completion report

Do not send real payments, enable auto-send, backfill payable historical earnings, or deploy to production as part of this implementation. Any real pilot requires separately specified genuine recipients, amounts, fees and human provider release.

Report separately:

- Code and migrations implemented.
- Automated tests run and results.
- Running development endpoint verification.
- Mobile/device verification.
- Local Mac installation and scheduled-task verification.
- Remitly behavior verified versus still untested.
- Remaining production configuration and launch blockers.

The intended complete launch flow is: Pulse records and reserves the withdrawal → the Mac prepares a one-time Remitly draft → an independent checker verifies it → the human sends → the Mac reconciles the result to Pulse.

## October 5 review and repeat-limit verification

The development repeat-limit migration was applied to the development database only. The running development API was rebuilt/restarted with its environment preserved; local/public health checks pass, and withdrawal/catalog endpoints continue rejecting anonymous access (401). Authenticated workflow checks use isolated HTTP/PostgreSQL fixtures, including first-only USD 15, repeat USD 25/500 boundaries, idempotency, quote gross bounds, maximum reservation/unused-fee refund/return, cancellation and wallet isolation. MCP protocol, mobile handler, TypeScript and ten-language checks pass. The development mobile URL serves successfully. No real payout, production publication or native build was performed; iPhone/Android rendering and keyboard checks remain pending.
