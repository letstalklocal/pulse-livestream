# Pulse payout operator for the Mac

## October 11: verify the checkout used by the Mac bridge

GitHub `letstalklocal/pulse-livestream` main commit `fce3c38948f65bdf1470c14b3fbee01470bea04d` already contains the continuous-preparation schemas for workflow `2026-10-09.2`. On October 11 the workspace HEAD and GitHub main matched this commit; the actual SDK `tools/list` confirms that prepare requires only evidence, final completion accepts preparationHash plus quote, and both preparation lease tools accept preparationHash without requiring quoteHash. A report that the Mac still requires quoteHash does not establish a missing backend change. The Mac checkout/running bridge remains unverified here.

Identify the exact repository path launched by the existing MCP command/args (including project overrides and symlinks), preserving the current profile and Keychain item. Inspect its branch, HEAD and worktree status; do not print full configuration/environment values or credential-bearing remote URLs. Compare that checkout with the correct repository's remote main. **Fetching downloads refs; it does not advance the working checkout.** Fast-forward the clean intended checkout when possible, preserving local changes and stopping on conflicts. Do not hard-reset or invent a quoteHash to bypass the schema.

From the checkout used by the bridge, run:

```bash
node lib/payout-mcp/scripts/inspect-maker-schema.mjs
```

This credential-free, offline command reports the loaded source path, source-file SHA-256 (not a recipient hash), local workflow revision and the actual schemas emitted through SDK tools/list. It must report `continuousPreparationSupported: true`. It does not contact production or verify the already-running bridge. If it passes but the chat still requires quoteHash, reconnect the existing Pulse MCP process after confirming its launch path, then inspect the live tool list. Verify that prepare's data.required excludes quoteHash and that record_preparation supports preparationHash and quote. A backend identity revision alone does not verify local schemas. Stop after identity/tool-discovery verification; do not prepare, recover, create drafts/links/schedules or send money during this diagnostic.

Codex stdio command/args/cwd and user/project configuration locations are described in the [official OpenAI MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). No backend publication, new native build, profile or credential is required just to correct the Mac source/tool discovery mismatch.

## October 9 continuous preparation

Current workflow revision **`2026-10-09.2`** makes quoting and draft saving one uninterrupted preparation job. Publish the backend and update/reconnect the existing Mac bridge; keep the current compatible `2026-10-04.1` profile and credential.

Maker calls `pulse_payout_prepare` with evidence, omitting `quoteHash`, before entering Remitly. Retain its `attemptId`, `preparationHash` and returned recipient/route snapshot. Get the quote and save the supported unsent one-time scheduled draft in the same run. Do not post a quote-only result or wait for creator confirmation. When saving succeeds, call `pulse_payout_record_preparation` with the final `quote` and actual scheduled draft details plus `preparationHash`, omitting `quoteHash`. Pulse commits both together and advances to payment review. Renew/release the pre-quote preparation lease with `preparationHash`.

If Remitly rejects the details, cannot quote within the gross budget or cannot save without sending/issuing a link, report the error through `pulse_payout_unknown` and stop with coins reserved. Never report an unsaved first-time plan as a saved draft. If saving succeeded but reporting failed, record the known draft identifier in protected evidence and inspect that existing draft; do not blindly replay or create another. Checker review and human final sending remain required. Quote-first tools stay available only for compatibility with existing attempts. The app displays the quoted amounts as estimates; final recipient-currency amounts can change with FX.

## October 9 safe retry rejection diagnostics

Workflow revision `2026-10-09.1` preserves actual HTTP rejection status and returns fixed safe guard codes/messages. Publish the updated backend, then update the existing Mac checkout's payout-MCP source (including new `src/rejections.mjs`) and reconnect its stdio server. No compiler, credential change or new profile is required. An old Mac bridge still discards backend rejection details even after publication.

Read `pulse_payout_get` for the same withdrawal. Its `recipientRecoveryDiagnostics` contains only booleans for saved record/snapshot revision and data equality and pending correction issue/version/hash integrity. Report those booleans plus any rejection code/httpStatus; never print contacts, credentials or hash values. A failed guard is not a reason to reset the withdrawal or erase/resubmit its saved correction. Keep reservations and audit history. Retain existing provider-absence, browser-lease and human-send requirements, and never retry a mutation automatically. Network/5xx outcomes remain uncertain.

After backend publication and the Mac source update, use this diagnostic prompt:

> Diagnose only; do not call recovery or any mutation. Fetch `pulse_payout_identity` and the current preflight/maker/recover playbooks; verify workflow revision `2026-10-09.1`. Read `pulse_payout_get` for `wd_9d50689c-81cb-4ba2-8ccf-02a2e722e7e3`. Report only workflow revision, status, progress stage, version, reservation amount and all `recipientRecoveryDiagnostics` booleans. If a read is rejected, report only its safe code, message and HTTP status. Do not print recipient values, credentials or hash values. Do not change the correction, withdrawal, lease, schedule or provider records, and do not send money.

This package prepares and checks reviewable Remitly work and reconciles recorded outcomes. Pulse remains authoritative for wallet reservations, approvals, attempts and audit evidence. The human makes the final payout decision and performs the final send or recipient-link issuance in Remitly. No helper or scheduled prompt sends money.

The JavaScript runtime helpers are portable and require Node 22 or newer. Credential setup currently uses **macOS Keychain** and fails closed on other operating systems. The JavaScript CLI and MCP runner need no compiler or project build. Create the credential manually in Apple's built-in Keychain Access; the helper uses macOS's built-in `security` command only to retrieve/delete it. The user reported a working production maker bridge and direct chat MCP identity call on their Mac on October 7; signed-in Remitly browser access and other operator roles remain separate checks. See [the confirmed connection checkpoint](../../docs/remitly-launch-handoff.md#october-7-mac-maker-mcp-connection-confirmed).

## Manual setup

1. Check out this repository on the Mac and run `pnpm install --frozen-lockfile` from its root. Use the existing trusted Node/pnpm installation. Do not run setup as root.
2. In Pulse's protected admin controls, have the owner issue a separate, revocable credential for the intended environment, provider-account alias and operator role. Maker and checker are different authorized operators. Do not share maker credentials with the checker or configure multiple role credentials in one agent job. Use separate operator accounts/configurations for genuine independence.
3. Configure a non-secret profile. Replace the example account alias/operator ID with the exact values supplied by the owner; the profile's environment must match the actual API identity. The public origin is fixed to `https://chimbalivestream.replit.app`.

   ```bash
   node artifacts/payout-operator/cli.mjs configure --profile maker --environment production --account YOUR_ACCOUNT_ALIAS --operator-id YOUR_OPERATOR_ID --role maker
   node artifacts/payout-operator/cli.mjs credential-instructions --profile maker
   ```

   The credential-instructions command prints only non-secret item details. Open Keychain Access on the Mac, select the login keychain and create a new password item with **Keychain Item Name** `com.pulse.payout-operator`, **Account Name** `profile:maker`, and the owner-issued token in the **Password** field. Use exactly the service/account fields shown by the helper. Paste the token only in Keychain Access, never a command argument, chat, TOML file, repository file or environment file. The health command retrieves it through an internal capture pipe and verifies origin/environment/account/operator/role/playbook version. Keychain access may require a human unlock/permission prompt; failed access blocks the job. API health does not verify the browser.

   After creating the Keychain item, verify it from the checked-out repository:

   ```bash
   node artifacts/payout-operator/cli.mjs health --profile maker
   ```

4. Copy the single-role stanza from [`templates/codex-mcp.toml`](templates/codex-mcp.toml), replacing absolute Node/repository paths, into that operator's Codex MCP configuration. The stdio bridge retrieves one Keychain credential and forwards it only to the scoped MCP child process. It does not require the GUI app to inherit a terminal token. The child checks identity before serving tools. Repeat setup separately for checker and reconciler under their proper independent operator configurations.
5. In the actual Codex session, verify the connection's identity, role tool list and authoritative playbooks. Confirm an actually available authenticated browser tool/session and the intended signed-in Remitly Business account. Do not enable recurrence until this manual capability test succeeds. Login/MFA/CAPTCHA and final provider sending remain human actions.

Profiles, heartbeat/deduplicated-summary files, count-only logs and local run locks live under `~/Library/Application Support/Pulse Payout Operator`, using owner-only directories/files (0700/0600). They contain no stored bearer tokens or provider session data. `PULSE_OPERATOR_HOME` can select another private directory for local tests; it does not change the pinned remote origin. Do not use a shared or symlinked directory.

## Updating an existing Maker stdio bridge

Publishing the backend alone does not update a Mac stdio bridge's local tool registry. The configured `pulse_payout_maker` command runs this checkout's `artifacts/payout-operator/cli.mjs`, which launches `lib/payout-mcp/src/stdio.mjs` and imports the local `lib/payout-mcp/src/index.mjs`. An older checkout or an already-running bridge can therefore omit `pulse_payout_retry_recipient_creation` even when the server reports workflow revision `2026-10-08.5`.

On the Mac, inspect the existing MCP configuration to identify its exact repository path. Sync the updated payout-MCP source into that checkout without discarding local edits; verify `lib/payout-mcp/src/index.mjs` registers `retry_recipient_creation` for Maker. Restart/reconnect that Maker MCP process so it reloads the updated source and tool list. Run the existing profile health check, then fetch full MCP identity and current playbooks: require revision `2026-10-09.2` and verify the Maker preparation tool accepts preparationHash and a final quote object. The health CLI alone does not establish the tool list or workflow revision. A source update needs no compiler/build step; dependencies changed only if the lockfile changed.

Retain the existing Maker profile and Keychain credential. Updating this bridge does not require another Remitly login, a new Reconciler connection, another phone edit or clearing a withdrawal/lease. Once the updated tool is available, use the saved correction and verified no-record retry path. If identity is still `.4`, the remote backend needs publication too; if identity is `.5` but the tool is absent, check the exact local launch path and running bridge process. User reports on October 8 that Remitly is already signed in and the local payout-MCP bridge is outdated; this is user-supplied Mac evidence, not independent verification of a bridge refresh or provider retry here.

## Current withdrawal flow

Fetch the current preflight and role playbooks at the start of every job and require workflow revision `2026-10-09.2`. The creator requests a gross withdrawal and Pulse reserves coins. Maker performs the continuous preparation job described above, reports final quote plus saved scheduled draft together, and leaves payment review for the independent checker and human. There is no second creator quote approval. Recipient amounts are estimates and can change with FX. Quote/save-only/recipient failures are reported as errors with coins reserved. Saved phone/email corrections are used by the existing Maker no-record guarded retry; saved or uncertain provider objects still require investigation. After recovery, use continuous preparation rather than separate quote-first reporting. Existing compatible profile version remains `2026-10-04.1`; no new credential is needed.

## Automations

Use the role-specific prompts in [`templates/automation-prompts.md`](templates/automation-prompts.md). Configure the cadence, working hours and time zone manually in the Mac's Codex app after the user selects them. No schedule has been installed here. Local desktop automation requires the computer awake/on and the app running, and the actual MCP/browser capability must be verified in that automation. A configured recurrence does not establish unattended Remitly support. See the [official Codex automation guidance](https://learn.chatgpt.com/docs/automations?surface=app).

The supported MCP configuration patterns are documented in [official Codex MCP guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Direct remote bearer configuration requires its named token environment variable in the actual Codex process; a Dock launch may not inherit terminal variables. The provided Keychain-backed stdio bridge avoids that dependency. Do not place tokens in persistent `launchctl` environment settings.

Optional terminal jobs can be wrapped with `node artifacts/payout-operator/cli.mjs run --profile maker -- YOUR_JOB_COMMAND`. It checks identity, takes an atomic local role lock, runs the child with exactly one role token, and records redacted heartbeats. Interruptions, failures or lost health keep the lock for explicit recovery. Backend account-wide browser leases and withdrawal attempts remain mandatory; the wrapper cannot replace them. Browser leases are acquired through MCP before provider interaction, not merely by starting this CLI.

## Recovery and credential rotation

Follow [`lib/payout-mcp/playbooks/recover.json`](../../lib/payout-mcp/playbooks/recover.json) and [the local runbook](operator-runbook.md). Never steal a backend lease or clear a local lock because time passed. Record investigation of possible provider work first. An unknown/declined-after-attempt withdrawal retains reserved coins until authoritative provider cancellation/return is verified.

For a stopped local process with an investigated backend attempt, use the recorded exact run ID:

```bash
node artifacts/payout-operator/cli.mjs recover-lock --profile maker --run-id RECORDED_RUN_ID --reason provider-investigation-recorded
```

This removes only the local lock. It does not alter reservations, provider objects, backend attempts or approval state. Active processes are refused. Deleting a local credential (`credential-delete`) does not revoke it; revoke the old credential in Pulse, issue its correctly scoped replacement, store it in Keychain and repeat health/capability verification.

## Verification

Run `node --test artifacts/payout-operator/tests/runtime.test.mjs` from the repository root. Tests cover identity/environment/account/role pinning, redirect refusal, paused work, restricted permissions, symlinks, credential/recipient-free logs, concurrent local locks, process interruption/recovery, one-role child environments, deduplicated count summaries and playbook boundaries. Separate MCP/backend tests cover remote authentication and durable browser/attempt leasing.

The maker bridge and direct chat MCP call are confirmed by the user as recorded above. Independent checker/reconciler connections, automation recurrence, browser login, provider selectors, interruptions/sleep and real Remitly actions remain unverified. No local simulator is exposed as a creator workflow, and no payment has been sent by this package.
