import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID, createHash } from "node:crypto";
export const PLAYBOOK_VERSION = "2026-10-04.1";
export const ORIGIN = "https://chimbalivestream.replit.app";
export const ROLES = ["maker", "checker", "reconciler"];
export class OperatorError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const fail = (code) => {
  throw new OperatorError(code);
};
const text = (v, max = 150) =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  !/[\u0000-\u001f]/.test(v);
export function validateProfile(input) {
  const fields = [
    "schemaVersion",
    "name",
    "origin",
    "environment",
    "accountKey",
    "operatorId",
    "role",
    "playbookVersion",
  ];
  if (
    !input ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !fields.includes(k))
  )
    fail("invalid_profile");
  if (
    input.schemaVersion !== 1 ||
    !text(input.name, 60) ||
    !/^[-a-zA-Z0-9_]+$/.test(input.name) ||
    input.origin !== ORIGIN ||
    !["development", "production"].includes(input.environment) ||
    !text(input.accountKey, 100) ||
    !/^[-a-zA-Z0-9_.:]+$/.test(input.accountKey) ||
    !text(input.operatorId, 100) ||
    !/^[-a-zA-Z0-9_:]+$/.test(input.operatorId) ||
    !ROLES.includes(input.role) ||
    input.playbookVersion !== PLAYBOOK_VERSION
  )
    fail("invalid_profile");
  return { ...input };
}
export function defaultHome() {
  return (
    process.env.PULSE_OPERATOR_HOME ||
    path.join(
      os.homedir(),
      process.platform === "darwin"
        ? "Library/Application Support/Pulse Payout Operator"
        : ".local/share/pulse-payout-operator",
    )
  );
}
async function checkPrivate(target, directory = false) {
  let st;
  try {
    st = await fs.lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (st.isSymbolicLink() || (directory ? !st.isDirectory() : !st.isFile()))
    fail("unsafe_local_path");
  if (typeof process.getuid === "function" && st.uid !== process.getuid())
    fail("unsafe_local_owner");
  if (process.platform !== "win32" && (st.mode & 0o077) !== 0)
    fail("unsafe_local_permissions");
  return true;
}
export async function privateDirectory(target) {
  await fs.mkdir(target, { recursive: true, mode: 0o700 });
  await checkPrivate(target, true);
  return target;
}
async function privateFile(target) {
  await checkPrivate(target);
  return fs.open(
    target,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_APPEND |
      (constants.O_NOFOLLOW || 0),
    0o600,
  );
}
export async function saveProfile(home, input) {
  const profile = validateProfile(input);
  await privateDirectory(home);
  const profiles = await privateDirectory(path.join(home, "profiles"));
  const target = path.join(profiles, `${profile.name}.json`);
  await checkPrivate(target);
  const tmp = path.join(profiles, `.${randomUUID()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(profile, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await fs.rename(tmp, target);
  return profile;
}
export async function loadProfile(home, name) {
  if (!text(name, 60) || !/^[-a-zA-Z0-9_]+$/.test(name))
    fail("invalid_profile_name");
  await checkPrivate(home, true);
  await checkPrivate(path.join(home, "profiles"), true);
  const target = path.join(home, "profiles", `${name}.json`);
  if (!(await checkPrivate(target))) fail("profile_missing");
  try {
    return validateProfile(JSON.parse(await fs.readFile(target, "utf8")));
  } catch (error) {
    if (error instanceof OperatorError) throw error;
    fail("invalid_profile");
  }
}
export function verifyIdentity(profile, identity) {
  validateProfile(profile);
  if (
    !identity ||
    identity.environment !== profile.environment ||
    identity.accountKey !== profile.accountKey ||
    identity.operator?.id !== profile.operatorId ||
    identity.operator?.role !== profile.role ||
    identity.playbookVersion !== profile.playbookVersion ||
    !Array.isArray(identity.capabilities)
  )
    fail("identity_mismatch");
  if (
    identity.capabilities.some((c) =>
      /human[-_]?release|send[-_]?payment|human[-_]?decision/i.test(c),
    )
  )
    fail("unsafe_capabilities");
  if (identity.preparationPaused && profile.role !== "reconciler")
    fail("preparation_paused");
  return {
    environment: identity.environment,
    accountKey: identity.accountKey,
    role: identity.operator.role,
    playbookVersion: identity.playbookVersion,
    preparationPaused: identity.preparationPaused === true,
  };
}
export async function request(
  profile,
  token,
  resource,
  body,
  fetchImpl = fetch,
) {
  validateProfile(profile);
  if (!/^pulse_op_[a-f0-9]{64}$/.test(token)) fail("invalid_credential");
  if (
    ![
      "/identity",
      "/heartbeat",
      "/browser-lease/acquire",
      "/browser-lease/renew",
      "/browser-lease/release",
    ].includes(resource)
  )
    fail("unsupported_local_request");
  let response;
  try {
    response = await fetchImpl(
      `${profile.origin}/api/payout-operator${resource}`,
      {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      },
    );
  } catch {
    fail("api_unavailable");
  }
  if (!response.ok)
    fail(
      response.status === 401 || response.status === 403
        ? "credential_rejected"
        : "api_rejected",
    );
  try {
    return await response.json();
  } catch {
    fail("invalid_api_response");
  }
}
export async function health(profile, token, fetchImpl = fetch) {
  return verifyIdentity(
    profile,
    await request(profile, token, "/identity", undefined, fetchImpl),
  );
}
const ERROR_CODES = [
  "invalid_profile",
  "invalid_profile_name",
  "profile_missing",
  "identity_mismatch",
  "unsafe_capabilities",
  "preparation_paused",
  "invalid_credential",
  "api_unavailable",
  "credential_rejected",
  "api_rejected",
  "invalid_api_response",
  "local_run_locked",
  "local_process_running",
  "local_process_state_unknown",
  "unsafe_local_path",
  "unsafe_local_owner",
  "unsafe_local_permissions",
  "heartbeat_failed",
  "interrupted",
  "child_failed",
  "keychain_unavailable",
  "mac_keychain_required",
  "browser_unavailable",
];
const EVENTS = [
  "health_checked",
  "run_started",
  "run_completed",
  "run_stopped",
  "run_failed",
  "heartbeat",
  "busy",
  "recovery_required",
];
export async function logEvent(home, profile, event, counts = {}) {
  validateProfile(profile);
  if (
    !EVENTS.includes(event) ||
    !counts ||
    Object.keys(counts).some(
      (k) =>
        ![
          "queueCount",
          "processedCount",
          "needsHumanCount",
          "errorCode",
        ].includes(k),
    )
  )
    fail("invalid_log_record");
  const safe = {};
  for (const [key, value] of Object.entries(counts)) {
    if (key === "errorCode") {
      if (!ERROR_CODES.includes(value)) fail("invalid_log_record");
    } else if (!Number.isSafeInteger(value) || value < 0 || value > 1000000)
      fail("invalid_log_record");
    safe[key] = value;
  }
  await privateDirectory(home);
  const directory = await privateDirectory(path.join(home, "logs"));
  const file = await privateFile(path.join(directory, `${profile.name}.jsonl`));
  try {
    await file.write(
      JSON.stringify({
        at: new Date().toISOString(),
        profile: profile.name,
        role: profile.role,
        event,
        ...safe,
      }) + "\n",
    );
  } finally {
    await file.close();
  }
}
export async function acquireLocalLock(home, profile) {
  validateProfile(profile);
  await privateDirectory(home);
  const locks = await privateDirectory(path.join(home, "locks"));
  const target = path.join(locks, `${profile.name}.lock`);
  const runId = randomUUID();
  // mkdir is atomic; never steal a crashed run, even if its PID appears absent.
  try {
    await fs.mkdir(target, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") fail("local_run_locked");
    throw error;
  }
  try {
    await fs.writeFile(
      path.join(target, "owner.json"),
      JSON.stringify({
        runId,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        profile: profile.name,
      }) + "\n",
      { mode: 0o600, flag: "wx" },
    );
  } catch (error) {
    await fs.rmdir(target);
    throw error;
  }
  let released = false;
  return {
    runId,
    async release() {
      if (released) return;
      const stored = JSON.parse(
        await fs.readFile(path.join(target, "owner.json"), "utf8"),
      );
      if (stored.runId !== runId) fail("lock_owner_changed");
      await fs.unlink(path.join(target, "owner.json"));
      await fs.rmdir(target);
      released = true;
    },
  };
}
export async function recoverLocalLock(home, profile, expectedRunId, reason) {
  validateProfile(profile);
  if (
    !text(expectedRunId, 80) ||
    !text(reason, 80) ||
    reason !== "provider-investigation-recorded"
  )
    fail("recovery_confirmation_required");
  const locks = path.join(home, "locks");
  await checkPrivate(locks, true);
  const target = path.join(locks, `${profile.name}.lock`);
  if (!(await checkPrivate(target, true))) fail("lock_missing");
  const ownerPath = path.join(target, "owner.json");
  await checkPrivate(ownerPath);
  const owner = JSON.parse(await fs.readFile(ownerPath, "utf8"));
  if (owner.runId !== expectedRunId) fail("lock_owner_changed");
  if (!Number.isInteger(owner.pid) || owner.pid < 1)
    fail("invalid_lock_record");
  try {
    process.kill(owner.pid, 0);
    fail("local_process_running");
  } catch (error) {
    if (error instanceof OperatorError) throw error;
    if (error.code !== "ESRCH") fail("local_process_state_unknown");
  }
  await fs.unlink(ownerPath);
  await fs.rmdir(target);
  await logEvent(home, profile, "recovery_required");
}
export async function writeHeartbeat(home, profile, healthy) {
  validateProfile(profile);
  await privateDirectory(home);
  const dir = await privateDirectory(path.join(home, "health"));
  const target = path.join(dir, `${profile.name}.json`);
  await checkPrivate(target);
  const value = {
    at: new Date().toISOString(),
    profile: profile.name,
    role: profile.role,
    healthy: healthy === true,
  };
  const tmp = path.join(dir, `.${randomUUID()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(value) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await fs.rename(tmp, target);
  return value;
}

export async function recordSummary(home, profile, counts) {
  validateProfile(profile);
  const keys = ["queueCount", "processedCount", "needsHumanCount"];
  if (
    !counts ||
    Object.keys(counts).length !== keys.length ||
    keys.some(
      (key) =>
        !Number.isSafeInteger(counts[key]) ||
        counts[key] < 0 ||
        counts[key] > 1000000,
    )
  )
    fail("invalid_log_record");
  const normalized = Object.fromEntries(keys.map((key) => [key, counts[key]]));
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  await privateDirectory(home);
  const directory = await privateDirectory(path.join(home, "health"));
  const target = path.join(directory, `${profile.name}-summary.json`);
  if (await checkPrivate(target)) {
    let old;
    try {
      old = JSON.parse(await fs.readFile(target, "utf8"));
    } catch {
      fail("invalid_log_record");
    }
    if (old.fingerprint === fingerprint)
      return { changed: false, ...normalized };
  }
  const temp = path.join(directory, `.${randomUUID()}.tmp`);
  await fs.writeFile(
    temp,
    JSON.stringify({
      at: new Date().toISOString(),
      profile: profile.name,
      role: profile.role,
      fingerprint,
      ...normalized,
    }) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  await fs.rename(temp, target);
  await logEvent(home, profile, "run_completed", normalized);
  return { changed: true, ...normalized };
}
