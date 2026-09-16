# App data disappears after edits: development connectivity runbook

## When to use this guide

Use this guide when a Metro edit/refresh is followed by missing app data, Android hostname errors, or loss of Replit Remote SSH access. It records the September 15, 2026 investigation and the sequence to follow next time.

**Current conclusion:** a temporary Replit-side or DNS/connectivity interruption is plausible, but the root cause is unconfirmed. The successful controlled refresh did not reproduce the failure. Missing data on screen is not evidence that database records were deleted. Preserve approved features while gathering evidence.

## September 15 incident

### Symptoms and observations

- The user first noticed the issue around the iOS gold-coin and timed Premium gift changes. The same Android hostname failure was already documented during September 14 [Premium gift testing](premium-gift-requests.md). That establishes a reported timeline, not a causal code change.
- Android repeatedly logged `UnknownHostException` for the current development API hostname. The app could not complete those data requests.
- Remote SSH also failed and later recovered. The provided SSH excerpt stopped while reading the Mac's configuration; it did not contain the actual failure. Do not classify that SSH failure as a confirmed DNS error.
- The app's API hostname and saved SSH hostname matched the workspace's current `REPLIT_DEV_DOMAIN`.
- Chrome on the affected phone returned `{"status":"ok"}` from `/api/healthz` while app requests were failing. Browser success alone did not establish native-app connectivity.
- The user reported one phone off Wi-Fi and another on Wi-Fi, with both recovering at the same time. This weakens a shared-router-only explanation. SSH also recovered without an SSH configuration change.
- The API process remained running throughout the incident. Local health, health through the development hostname from the workspace, and the database-backed stream list succeeded. These checks do not independently verify public DNS from a phone or Mac.

### Experiments and recovery

1. Temporarily disabled RevenueCat startup in development. The user reported that data remained missing; Android hostname errors continued. The temporary switch and test were removed, and normal RevenueCat configuration restored. This experiment did not start from a working baseline, so it does not establish the original trigger.
2. Restarted Metro with its original environment, removing the temporary RevenueCat override, and `--clear`. The user then reported recovery. Initially the new Metro process had not served a fresh bundle, so the timing does **not** prove that clearing the cache or restoring RevenueCat caused recovery.
3. After recovery, read-only inspector probes returned HTTP 200 from both native fetch and XMLHttpRequest on Galaxy S10 (SM-G973U, Android 12) and Galaxy S24 Ultra (SM-S928U, Android 16).
4. Around 15:18 UTC, requested a full development reload on the Galaxy S10. Metro rebuilt 2,574 modules in approximately 41 seconds. The user confirmed that data was showing afterward.
5. At 15:20 UTC, added a temporary comment to the livestream sheet. Metro logged a one-module refresh. Both phones' API probes continued returning HTTP 200. Removed the comment and repeated probes successfully. **The user confirmed data stayed visible on both phones after the latest refresh.**
6. A five-second server monitor collected **120 samples from 15:12:13 to 15:22:08 UTC, with zero failed samples** for Metro status, local API health, and API health through the hostname from the workspace. Maximum observed response times were 32, 26, and 37 milliseconds respectively. This was monitoring after recovery and during the controlled test, not proof of external availability during the earlier outage.

At approximately 15:24 UTC on September 15, the official [Replit status page](https://status.replit.com/) showed all systems operational, and [incident history](https://status.replit.com/history?date=2026-09-15) listed no matching incident for that day. A matching Replit incident was not confirmed; the status check does not exclude a brief or limited disruption. Recheck current status during any recurrence.

Gold coins, Premium requests, composer behavior, and the approved Android sheet adjustment remain in place. RevenueCat uses its normal configuration. No temporary diagnostic app edits remain. Typechecks and RevenueCat/refresh tests were separate from the actual native probes and user-confirmed visual checks.

## Next recurrence: capture first, then isolate

### 1. Record the failure before restarting

Record the exact source edit, UTC time, affected screens, device/OS, network on each device, whether SSH also fails, and the first complete error. Preserve Metro/API logs around the edit and recovery. Capture the actual SSH failure after the configuration-reading lines; omit credentials, tokens, private keys, and unrelated personal data.

Check whether Metro actually delivered the edit. A file save or a Metro restart alone does not prove the phone received a new bundle. Record full-reload versus incremental-refresh behavior and the bundle log time. Do not clear caches or restart repeatedly before collecting this evidence.

### 2. Check each connection separately

Confirm the current ports from `.replit` and running process arguments; the examples below use this incident's Metro port 18115 and API port 8080. Run each check separately so one failure does not hide the others:

```sh
curl --fail --show-error --silent --max-time 5 http://127.0.0.1:18115/status
curl --fail --show-error --silent --max-time 5 http://127.0.0.1:8080/api/healthz
curl --fail --show-error --silent --max-time 5 "https://${REPLIT_DEV_DOMAIN}/api/healthz"
```

Expected responses are `packager-status:running` and `{"status":"ok"}`. Check an affected read-only data endpoint too; health alone does not exercise authentication, the database, or every route. Do not change balances or real-user records as a diagnostic test.

Compare the hostname in native errors and the SSH configuration with the **current** workspace hostname and Replit **SSH → Connect → Connect manually** command. Do not reuse a historical hostname or process ID blindly.

On each affected phone, compare the same health URL in the browser and inside the app. Record Wi-Fi versus mobile data explicitly. From the Mac, capture the complete Remote SSH error; if needed, run the equivalent manual command with verbose logging and the existing credentials/configuration. Do not bypass host-key verification or reset SSH keys without evidence of a key problem.

| Observation | What to investigate next |
| --- | --- |
| `UnknownHostException` / `Could not resolve hostname` | Name resolution on that device/network; compare current hostname, browser/native behavior, other network, and Replit status. |
| Local API unavailable or process exited | API logs, process environment, server load and crash/restart history. |
| Local API healthy, external access fails | External DNS, routing, workspace proxy/access configuration, or platform availability. Workspace-hostname success alone cannot rule these out. |
| Browser succeeds but native app fails | Native request error and configured URL; compare native fetch and XMLHttpRequest, authentication, and app/runtime state. |
| Native requests succeed but displayed data disappears | Response contents, auth state, query observers/cache, and Fast Refresh lifecycle. Preserve the existing QueryClient lifetime fix in `_layout.tsx`. |
| HTTP 401/403 | Authentication or access checks; the request reached an HTTP server. |
| HTTP 404 for an active stream | Stream/session existence and endpoint behavior; distinguish it from the hostname failure. |
| SSH timeout/refusal versus permission denied | Connection path/listener versus authentication; capture the exact error before changing configuration. |

Check [Replit status](https://status.replit.com/) and incident history using the failure's timestamp. Record a relevant incident link if one exists. Treat a platform/DNS explanation as a hypothesis until evidence identifies it. Replit also documents [network/DNS troubleshooting](https://docs.replit.com/build/troubleshooting).

### 3. Run one controlled refresh from a working baseline

- First confirm data loads and native API requests succeed. If baseline loading fails, solve that separately; it cannot establish an edit-triggered regression.
- Monitor Metro, local API, hostname access from the workspace, and device requests with timestamps. Include server load if rebuild pressure is suspected. Keep probes bounded and read-only.
- Keep the relevant apps open, make one harmless source edit, and verify Metro delivered it. Avoid changing several features at once.
- Confirm visible data on the phones as well as request success. If SSH was affected, ask whether it stays connected too.
- Remove the temporary edit and verify the final state. If the failure returns, preserve logs before restarting so the sequence can be compared.

If a restart is justified, identify and revalidate the current process, preserve its launch arguments and environment, and verify the running endpoint afterward. Use `--clear` deliberately when testing stale bundler state; it triggers a full rebuild and is not a proven fix for this incident. A full app restart may be necessary for a native-SDK isolation test because Fast Refresh cannot undo an already-configured SDK.

Do not roll back gold coins, Premium requests, RevenueCat, or unrelated approved behavior solely because an outage followed an edit. Any isolation experiment must have a stated purpose, one changed variable, an observed result, and cleanup.

## Evidence to retain and report

For a recurrence, append: timestamp and edit; delivered bundle/refresh; device/network matrix; native/browser/local endpoint results; full SSH error; process uptime; relevant Replit status incident; exact intervention; user-confirmed recovery; and remaining uncertainty. If escalation to Replit is needed, prepare a concise redacted report with this evidence. Do not send it without user authorization.

The original temporary artifacts were `/tmp/pulse-connectivity-monitor.jsonl`, `/tmp/pulse-device-probe.cjs`, and `/tmp/metro-restored.log`. The monitor completed automatically. **These files may disappear after an environment reset; this document preserves the results.** Recreate diagnostics against current ports and installed tools rather than relying on old paths or PIDs.

For native inspection, Metro exposes connected targets at `/json/list`. This installed Expo version required the debugger WebSocket Origin to match its configured `EXPO_PACKAGER_PROXY_URL`; localhost Origin alone was rejected. Use the configured origin over the local inspector connection without weakening its checks. In this Hermes runtime, `Runtime.evaluate` with `awaitPromise` returned a Promise object before completion; collect actual asynchronous results and remove temporary diagnostic state afterward. A connected inspector or a returned Promise object is not evidence of a successful API request.


## September 16: Metro exits with ENOENT in a pnpm temporary directory

The user reported the mobile development command exiting with status 7 on Node 24.13.0, with a missing path ending in `typedoc_tmp_8086/dist/lib/utils-common` under `node_modules/.pnpm/typedoc@0.28.19_typescript@6.0.3/node_modules`.

Evidence captured before recovery:

- Metro was not running and port 18115 refused connections; the development API on port 8080 still returned `{"status":"ok"}`.
- The temporary directory was absent, but the completed `typedoc/dist/lib/utils-common` directory existed. Its modification time was 22:08:35 UTC; pnpm installation metadata was updated at 22:10:09 UTC.
- The installed pnpm 10.26.1 source creates staging directories named `<package>_tmp_<process.pid>` and renames them to the final package directory during import. This exactly matches the reported path format.
- `scripts/post-merge.sh` also performs a frozen-lockfile install. The available error excerpt does not identify which install initiated this particular failure or contain the original full stack trace.

**Assessment:** a dependency install overlapping with the development server's directory watching/scanning is the leading explanation. The temporary path is an installation artifact, not a missing application asset. The exact failing watcher and triggering install remain unconfirmed; do not classify this as the earlier phone DNS problem or an application-feature regression.

Recovery: after confirming no dependency install was running, started the existing `@workspace/mobile` dev script with its existing workspace environment and configured port 18115. No cache clearing, dependency installation, version changes, or application-code changes were performed. Metro subsequently returned `packager-status:running`. This verifies server startup, not delivery of a fresh phone bundle or phone UI behavior. Recovery logs are in `/tmp/pulse-metro-recovery.log` and may disappear after an environment reset.

A separate startup warning reported a missing `libnspr4.so` for the React Native desktop DevTools executable. Metro still started successfully; that warning is distinct from the reported temporary-directory crash.

For dependency installs or patch application, stop Metro first, allow the install to finish, then restart Metro. If this recurs without an overlapping install, capture the full stack trace and timestamp before changing watcher configuration. Do not create the missing temporary directory or reinstall packages solely because this staging path no longer exists.


### Preview workflow status after the manual recovery

The user still saw the failure in Replit Preview. The workflow log at `.local/state/workflow-logs/i-rZGqth_3DzHYmN-ICW5/artifacts_mobile__expo.shell.exec.0` was last modified at 22:08:35 UTC and contained the original crash, with no newer workflow start recorded. Its full stack identifies `@expo/metro-file-map@57.0.2` `FallbackWatcher.#watchdir` calling `fs.watch` on the vanished pnpm staging directory. This confirms the watcher failure; the particular install invocation remains unidentified.

The separately launched recovery server responded successfully both locally and through the Expo development hostname, but it did not reset Replit's failed workflow/Preview status. The assistant stopped only that manually launched process group to free port 18115 for the Replit-managed workflow. Restart the mobile workflow using Replit's Stop/Run controls; a Preview page reload alone does not start a new workflow. The assistant has no workflow-control tool in this session, so the managed restart and Preview recovery still require user confirmation. Do not report a standalone Metro health response as proof that Replit Preview has recovered.
