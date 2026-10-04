# Pulse payout operator for the Mac

This package prepares and checks reviewable Remitly work and reconciles recorded outcomes. Pulse remains authoritative for wallet reservations, approvals, attempts and audit evidence. The human makes the final payout decision and performs the final send or recipient-link issuance in Remitly. No helper or scheduled prompt sends money.

The JavaScript runtime helpers are portable and require Node 22 or newer. Credential setup currently uses **macOS Keychain** and fails closed on other operating systems. The JavaScript CLI and MCP runner need no compiler or project build. Create the credential manually in Apple's built-in Keychain Access; the helper uses macOS's built-in `security` command only to retrieve/delete it. This has not been installed or verified on a real Mac in this session.

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

Actual Mac Keychain manual storage/read, Codex installation, automation recurrence, browser login, provider selectors, interruptions/sleep and real Remitly actions remain unverified. No local simulator is exposed as a creator workflow, and no payment has been sent by this package.
