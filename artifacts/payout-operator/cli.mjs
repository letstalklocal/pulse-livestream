#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  OperatorError,
  PLAYBOOK_VERSION,
  ORIGIN,
  defaultHome,
  saveProfile,
  loadProfile,
  health,
  request,
  logEvent,
  acquireLocalLock,
  recoverLocalLock,
  writeHeartbeat,
  recordSummary,
} from "./src/runtime.mjs";
import {
  readCredential,
  credentialInstructions,
  deleteCredential,
} from "./src/keychain.mjs";
const help = `Pulse payout operator (Node 22+, macOS Keychain)
configure --profile NAME --environment development|production --account ACCOUNT_ALIAS --operator-id ID --role maker|checker|reconciler
credential-instructions --profile NAME   manual Keychain Access item details; never displays a token
credential-delete --profile NAME    delete local credential; revoke separately in Pulse
health --profile NAME              verifies API origin/environment/account/operator/role/version
summary --profile NAME --queue-count N --processed-count N --needs-human-count N
bridge --profile NAME              role-scoped MCP stdio launcher, loads one Keychain credential
run --profile NAME -- COMMAND ...  identity gate, local lock and redacted heartbeats around a job
recover-lock --profile NAME --run-id ID --reason provider-investigation-recorded
No command sends payments, installs schedules or starts a Remitly browser.`;
function parse(argv) {
  const [action, ...rest] = argv;
  const separator = rest.indexOf("--");
  const args = separator < 0 ? rest : rest.slice(0, separator);
  const command = separator < 0 ? [] : rest.slice(separator + 1);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !/^--(profile|environment|account|operator-id|role|run-id|reason|queue-count|processed-count|needs-human-count)$/.test(
        args[i] ?? "",
      ) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--") ||
      args[i] in options
    )
      throw new OperatorError("invalid_arguments");
    options[args[i]] = args[i + 1];
  }
  return { action, options, command };
}
export function childEnvironment(profile, token, parentEnv = process.env) {
  // Strip every inherited payout credential before exposing exactly one role.
  const env = { ...parentEnv };
  for (const key of Object.keys(env))
    if (/^PULSE_PAYOUT_.*TOKEN$/.test(key)) delete env[key];
  Object.assign(env, {
    PULSE_PAYOUT_OPERATOR_TOKEN: token,
    PULSE_PAYOUT_ORIGIN: profile.origin,
    PULSE_PAYOUT_EXPECTED_ENVIRONMENT: profile.environment,
    PULSE_PAYOUT_EXPECTED_ACCOUNT: profile.accountKey,
    PULSE_PAYOUT_EXPECTED_OPERATOR_ID: profile.operatorId,
    PULSE_PAYOUT_EXPECTED_ROLE: profile.role,
  });
  return env;
}
export async function main(argv = process.argv.slice(2)) {
  const { action, options, command } = parse(argv);
  if (!action || action === "help") {
    console.log(help);
    return;
  }
  const home = defaultHome();
  const name = options["--profile"];
  if (!name) throw new OperatorError("profile_required");
  if (action === "configure") {
    const profile = await saveProfile(home, {
      schemaVersion: 1,
      name,
      origin: ORIGIN,
      environment: options["--environment"],
      accountKey: options["--account"],
      operatorId: options["--operator-id"],
      role: options["--role"],
      playbookVersion: PLAYBOOK_VERSION,
    });
    console.log(
      JSON.stringify({
        profile: profile.name,
        status: "configured",
        credentialStored: false,
      }),
    );
    return;
  }
  const profile = await loadProfile(home, name);
  if (action === "credential-instructions") {
    console.log(
      JSON.stringify({
        profile: name,
        status: "manual_keychain_entry_required",
        ...credentialInstructions(profile),
      }),
    );
    return;
  }
  if (action === "summary") {
    const counts = {};
    for (const [flag, key] of [
      ["--queue-count", "queueCount"],
      ["--processed-count", "processedCount"],
      ["--needs-human-count", "needsHumanCount"],
    ]) {
      if (!/^\d+$/.test(options[flag] ?? ""))
        throw new OperatorError("invalid_arguments");
      counts[key] = Number(options[flag]);
    }
    console.log(
      JSON.stringify({
        profile: name,
        ...(await recordSummary(home, profile, counts)),
      }),
    );
    return;
  }
  if (action === "credential-delete") {
    await deleteCredential(home, profile);
    console.log(
      JSON.stringify({ profile: name, status: "local_credential_deleted" }),
    );
    return;
  }
  if (action === "recover-lock") {
    await recoverLocalLock(
      home,
      profile,
      options["--run-id"],
      options["--reason"],
    );
    console.log(
      JSON.stringify({
        profile: name,
        status: "local_lock_recovered",
        backendStateUnchanged: true,
      }),
    );
    return;
  }
  if (!["health", "bridge", "run"].includes(action))
    throw new OperatorError("invalid_arguments");
  const token = await readCredential(profile);
  const identity = await health(profile, token);
  await writeHeartbeat(home, profile, true);
  if (action === "health") {
    await logEvent(home, profile, "health_checked");
    console.log(
      JSON.stringify({
        profile: name,
        status: "healthy",
        ...identity,
        browserVerified: false,
      }),
    );
    return;
  }
  if (action === "bridge") {
    const runner = fileURLToPath(
      new URL("../../lib/payout-mcp/src/stdio.mjs", import.meta.url),
    );
    const child = spawn(process.execPath, [runner], {
      stdio: "inherit",
      env: childEnvironment(profile, token),
    });
    const code = await new Promise((resolve) => {
      child.once("error", () => resolve(1));
      child.once("close", (code) => resolve(code ?? 1));
    });
    process.exitCode = code;
    return;
  }
  if (!command.length) throw new OperatorError("command_required");
  const lock = await acquireLocalLock(home, profile);
  await logEvent(home, profile, "run_started");
  let stopped = false,
    heartbeatBusy = false,
    lastError,
    forceTimer;
  const child = spawn(command[0], command.slice(1), {
    stdio: "inherit",
    env: childEnvironment(profile, token),
    detached: process.platform !== "win32",
  });
  const killGroup = (signal) => {
    try {
      if (process.platform !== "win32" && child.pid)
        process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {}
  };
  const stop = () => {
    stopped = true;
    killGroup("SIGTERM");
    if (!forceTimer) {
      forceTimer = setTimeout(() => killGroup("SIGKILL"), 10000);
      forceTimer.unref();
    }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const timer = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      await request(profile, token, "/heartbeat", {});
      await writeHeartbeat(home, profile, true);
    } catch (error) {
      // Health loss stops the worker even if local storage is unavailable.
      stop();
      const code =
        error instanceof OperatorError ? error.code : "heartbeat_failed";
      try {
        await writeHeartbeat(home, profile, false);
        if (lastError !== code) {
          lastError = code;
          await logEvent(home, profile, "run_failed", { errorCode: code });
        }
      } catch {}
    } finally {
      heartbeatBusy = false;
    }
  }, 60000);
  timer.unref();
  const code = await new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("close", (code) => resolve(code ?? 1));
  });
  clearInterval(timer);
  clearTimeout(forceTimer);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (code === 0 && !stopped) {
    await logEvent(home, profile, "run_completed");
    await lock.release();
  } else {
    await writeHeartbeat(home, profile, false);
    await logEvent(home, profile, stopped ? "run_stopped" : "run_failed", {
      errorCode: stopped ? "interrupted" : "child_failed",
    });
  }
  console.error(
    JSON.stringify({
      profile: name,
      status: code === 0 && !stopped ? "completed" : "recovery_required",
      localRunId: lock.runId,
    }),
  );
  process.exitCode = code === 0 && !stopped ? 0 : 1;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(
      JSON.stringify({
        status: "blocked",
        errorCode:
          error instanceof OperatorError
            ? error.code
            : "local_operation_failed",
      }),
    );
    process.exitCode = 1;
  });
