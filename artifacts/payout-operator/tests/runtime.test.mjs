import test from "node:test";
import { childEnvironment } from "../cli.mjs";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ORIGIN,
  PLAYBOOK_VERSION,
  saveProfile,
  loadProfile,
  verifyIdentity,
  health,
  logEvent,
  acquireLocalLock,
  recoverLocalLock,
  writeHeartbeat,
  recordSummary,
} from "../src/runtime.mjs";
const profile = {
  schemaVersion: 1,
  name: "maker-colombia",
  origin: ORIGIN,
  environment: "development",
  accountKey: "development-remitly-business",
  operatorId: "op-maker",
  role: "maker",
  playbookVersion: PLAYBOOK_VERSION,
};
const identity = {
  environment: profile.environment,
  accountKey: profile.accountKey,
  operator: { id: profile.operatorId, role: profile.role, name: "Maker" },
  preparationPaused: false,
  playbookVersion: PLAYBOOK_VERSION,
  capabilities: ["list", "quote", "prepare"],
};
const token = "pulse_op_" + "a".repeat(64);
async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "pulse-operator-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return home;
}
test("profile fields pin exact origin/environment/account/role and never permit credentials", async (t) => {
  const home = await fixture(t);
  await saveProfile(home, profile);
  assert.deepEqual(await loadProfile(home, profile.name), profile);
  for (const bad of [
    { ...profile, origin: "https://chimbalivestream.replit.app.evil.example" },
    { ...profile, token },
    { ...profile, name: "../escape" },
    { ...profile, environment: "sandbox" },
    { ...profile, role: "owner" },
  ])
    await assert.rejects(saveProfile(home, bad));
  const st = await fs.stat(path.join(home, "profiles", profile.name + ".json"));
  if (process.platform !== "win32") assert.equal(st.mode & 0o777, 0o600);
  assert.ok(
    !JSON.stringify(await loadProfile(home, profile.name)).includes(token),
  );
});
test("health validates actual identity and rejects redirects, pauses, unsafe capabilities and mismatched pins", async () => {
  const received = [];
  const fetcher = async (url, options) => {
    received.push({ url, options });
    return { ok: true, json: async () => identity };
  };
  await health(profile, token, fetcher);
  assert.equal(received[0].url, ORIGIN + "/api/payout-operator/identity");
  assert.equal(received[0].options.redirect, "error");
  assert.equal(received[0].options.headers.Authorization, "Bearer " + token);
  for (const bad of [
    { ...identity, environment: "production" },
    { ...identity, accountKey: "other-business" },
    { ...identity, operator: { ...identity.operator, id: "other" } },
    { ...identity, operator: { ...identity.operator, role: "checker" } },
    { ...identity, playbookVersion: "future" },
    { ...identity, capabilities: ["human_release"] },
    { ...identity, preparationPaused: true },
  ])
    assert.throws(() => verifyIdentity(profile, bad));
  await assert.rejects(
    health(profile, token, async () => ({ ok: false, status: 401 })),
    /credential_rejected/,
  );
  await assert.rejects(
    health(profile, token, async () => {
      throw Error("redirected to " + token);
    }),
    /api_unavailable/,
  );
});
test("updated workflow instructions remain compatible with an existing pinned Mac profile", async (t) => {
  const home = await fixture(t);
  const preflight = JSON.parse(await fs.readFile(new URL("../../../lib/payout-mcp/playbooks/preflight.json", import.meta.url), "utf8"));
  assert.equal(preflight.version, profile.playbookVersion);
  assert.equal(preflight.workflowRevision, "2026-10-08.1");
  assert.notEqual(preflight.workflowRevision, preflight.version);
  await saveProfile(home, profile);
  const existing = await loadProfile(home, profile.name);
  const revisedIdentity = { ...identity, workflowRevision: preflight.workflowRevision };
  const result = await health(existing, token, async () => ({ ok: true, json: async () => revisedIdentity }));
  assert.equal(result.playbookVersion, profile.playbookVersion);
  assert.deepEqual(await loadProfile(home, profile.name), profile, "workflow revision never requires rewriting a saved profile");
  assert.throws(() => verifyIdentity(existing, { ...revisedIdentity, playbookVersion: preflight.workflowRevision }), /identity_mismatch/);
});
test("count-only logs and private heartbeat never retain recipient details, URLs or secrets", async (t) => {
  const home = await fixture(t);
  await logEvent(home, profile, "run_completed", {
    queueCount: 3,
    processedCount: 2,
    needsHumanCount: 1,
  });
  await writeHeartbeat(home, profile, true);
  for (const extra of [
    { token },
    { recipient: "Maria Gomez" },
    { providerLink: "https://www.remitly.com/link/private" },
    { queueCount: "3" },
    { errorCode: token },
  ])
    await assert.rejects(logEvent(home, profile, "run_failed", extra));
  const log = await fs.readFile(
    path.join(home, "logs", profile.name + ".jsonl"),
    "utf8",
  );
  assert.equal(log.trim().split("\n").length, 1);
  assert.ok(!log.includes(token));
  assert.ok(!log.includes("Maria"));
  assert.ok(!log.includes("remitly.com"));
  const heartbeat = JSON.parse(
    await fs.readFile(
      path.join(home, "health", profile.name + ".json"),
      "utf8",
    ),
  );
  assert.equal(heartbeat.healthy, true);
  assert.deepEqual(Object.keys(heartbeat).sort(), [
    "at",
    "healthy",
    "profile",
    "role",
  ]);
  if (process.platform !== "win32") {
    assert.equal(
      (await fs.stat(path.join(home, "logs", profile.name + ".jsonl"))).mode &
        0o777,
      0o600,
    );
    assert.equal(
      (await fs.stat(path.join(home, "health", profile.name + ".json"))).mode &
        0o777,
      0o600,
    );
  }
});
test("local run lock serializes concurrent runs and never silently steals an interrupted run", async (t) => {
  const home = await fixture(t);
  const outcomes = await Promise.allSettled([
    acquireLocalLock(home, profile),
    acquireLocalLock(home, profile),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((r) => r.status === "rejected").length, 1);
  const lock = outcomes.find((r) => r.status === "fulfilled").value;
  await assert.rejects(
    recoverLocalLock(
      home,
      profile,
      lock.runId,
      "provider-investigation-recorded",
    ),
    /local_process_running/,
  );
  await assert.rejects(
    recoverLocalLock(
      home,
      profile,
      "wrong-id",
      "provider-investigation-recorded",
    ),
    /lock_owner_changed/,
  );
  await lock.release();
  const next = await acquireLocalLock(home, profile);
  await next.release();
});
test("crashed process lock remains until explicit investigation-backed recovery", async (t) => {
  const home = await fixture(t);
  const runtime = fileURLToPath(new URL("../src/runtime.mjs", import.meta.url));
  const script = `import {acquireLocalLock} from ${JSON.stringify("file://" + runtime)};const lock=await acquireLocalLock(${JSON.stringify(home)},${JSON.stringify(profile)});process.stdout.write(lock.runId);`;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 0);
  const id = child.stdout.trim();
  await assert.rejects(acquireLocalLock(home, profile), /local_run_locked/);
  await assert.rejects(
    recoverLocalLock(home, profile, id, "expired"),
    /recovery_confirmation_required/,
  );
  await recoverLocalLock(home, profile, id, "provider-investigation-recorded");
  const lock = await acquireLocalLock(home, profile);
  await lock.release();
});
test("symlinks and overly broad permissions fail closed", async (t) => {
  const home = await fixture(t);
  await saveProfile(home, profile);
  const target = path.join(home, "profiles", profile.name + ".json");
  const outside = path.join(home, "outside");
  await fs.writeFile(outside, "{}", { mode: 0o600 });
  await fs.unlink(target);
  await fs.symlink(outside, target);
  await assert.rejects(loadProfile(home, profile.name), /unsafe_local_path/);
  if (process.platform !== "win32") {
    await fs.unlink(target);
    await fs.writeFile(target, JSON.stringify(profile), { mode: 0o644 });
    await assert.rejects(
      loadProfile(home, profile.name),
      /unsafe_local_permissions/,
    );
  }
});
test("all five versioned playbooks preserve human final decision and explicit auto-send prohibition", async () => {
  const root = new URL("../../../lib/payout-mcp/playbooks/", import.meta.url);
  const { workflowRevision } = JSON.parse(await fs.readFile(new URL("preflight.json", root), "utf8"));
  for (const name of [
    "preflight",
    "maker",
    "checker",
    "reconciler",
    "recover",
  ]) {
    const data = JSON.parse(
      await fs.readFile(new URL(name + ".json", root), "utf8"),
    );
    assert.equal(data.name, name);
    assert.equal(data.version, PLAYBOOK_VERSION);
    assert.equal(data.workflowRevision, workflowRevision);
    assert.equal(data.humanFinalDecisionRequired, true);
    assert.equal(data.autoSendAllowed, false);
    assert.ok(data.instructions.length >= 8);
    assert.ok(
      data.instructions.every(
        (value) => typeof value === "string" && value.length > 20,
      ),
    );
  }
});

test("child launcher exposes only one role credential and explicit identity pins", () => {
  const env = childEnvironment(profile, token, {
    PATH: "/usr/bin",
    PULSE_PAYOUT_MAKER_TOKEN: "other-maker",
    PULSE_PAYOUT_CHECKER_TOKEN: "other-checker",
    PULSE_PAYOUT_OPERATOR_TOKEN: "other-operator",
    NORMAL_VALUE: "keep",
  });
  assert.equal(env.PULSE_PAYOUT_OPERATOR_TOKEN, token);
  assert.equal(env.PULSE_PAYOUT_EXPECTED_ROLE, "maker");
  assert.equal(env.PULSE_PAYOUT_EXPECTED_ACCOUNT, profile.accountKey);
  assert.equal(env.PULSE_PAYOUT_EXPECTED_OPERATOR_ID, profile.operatorId);
  assert.equal(env.NORMAL_VALUE, "keep");
  assert.ok(!("PULSE_PAYOUT_MAKER_TOKEN" in env));
  assert.ok(!("PULSE_PAYOUT_CHECKER_TOKEN" in env));
});

test("repeated count summaries are deduplicated without retaining payout identifiers", async (t) => {
  const home = await fixture(t);
  const counts = { queueCount: 3, processedCount: 1, needsHumanCount: 2 };
  assert.equal((await recordSummary(home, profile, counts)).changed, true);
  assert.equal((await recordSummary(home, profile, counts)).changed, false);
  assert.equal(
    (await recordSummary(home, profile, { ...counts, needsHumanCount: 1 }))
      .changed,
    true,
  );
  const log = await fs.readFile(
    path.join(home, "logs", profile.name + ".jsonl"),
    "utf8",
  );
  assert.equal(log.trim().split("\n").length, 2);
  assert.ok(!log.includes(token));
  await assert.rejects(
    recordSummary(home, profile, { ...counts, recipient: "private" }),
  );
});
