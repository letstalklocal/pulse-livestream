import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, unlinkSync } from "node:fs";
import { build } from "esbuild";

const dir = fileURLToPath(new URL("..", import.meta.url));
const output = `${dir}/tests/.party-test.cjs`;
await build({ stdin: { contents: `
  export { default as parties } from './src/routes/parties';
  export { default as streams } from './src/routes/streams';
  export { default as chat } from './src/routes/chat';
  export { default as coins } from './src/routes/coins';
  export { default as moderation } from './src/routes/moderation';
  export { pool } from '@workspace/db';
  export { openPartyConnection } from '../mobile/utils/partyConnection';
`, resolveDir: dir }, outfile: output, bundle: true, platform: "node", format: "cjs", external: ["pg-native"], logLevel: "silent" });
const { parties, streams, chat, coins, moderation, pool, openPartyConnection } = createRequire(import.meta.url)(output);
const prefix = `party-test-${randomUUID()}`;
const base = 1700000000 + Math.floor(Math.random() * 10000000);
const [a, b, c, v, w] = Array.from({ length: 5 }, (_, i) => base + i);
const channels = [a, b, c].map(uid => `${prefix}-${uid}`);
const [ca, cb, cc] = channels;
const call = async (router, path, method, uid, body = {}, params = {}) => {
  const handler = router.stack.find(l => l.route?.path === path && l.route.methods[method])?.route.stack[0].handle;
  assert.ok(handler, path);
  const res = { statusCode: 200, body: null, set() { return this; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } };
  await handler({ auth: () => ({ userId: uid ? `${prefix}-${uid}` : null, tokenType: "session_token" }), headers: {}, query: {}, params, body, log: { error() {}, warn() {} } }, res);
  return res;
};
const action = (channelId, uid, body) => call(parties, "/streams/:channelId/party", "post", uid, body, { channelId });
const state = (channelId, uid) => call(parties, "/streams/:channelId/party", "get", uid, {}, { channelId });
const post = (channelId, uid, text) => call(chat, "/streams/:channelId/chat", "post", uid, { text }, { channelId });
const messages = (channelId, uid) => call(chat, "/streams/:channelId/chat", "get", uid, {}, { channelId });
const presence = (channelId, uid) => call(streams, "/streams/:channelId/presence", "post", uid, { action: "join" }, { channelId });
const gift = (uid, recipientUid, channelId, key = randomUUID(), amount = 5) => call(coins, "/coins/spend", "post", uid, { uid, recipientUid, channelId, amount, giftName: "Heart", idempotencyKey: key });
try {
  await pool.query(readFileSync(new URL("../../../lib/db/migrations/20260910_live_parties.sql", import.meta.url), "utf8"));
  for (const uid of [a, b, c, v, w]) await pool.query("insert into users(uid,clerk_id,name) values($1,$2,$3)", [uid, `${prefix}-${uid}`, `Party test ${uid}`]);
  for (let i = 0; i < channels.length; i++) await pool.query("insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category) values($1,$2,$3,'Party test','Talk')", [channels[i], [a, b, c][i], `Host ${i}`]);
  await pool.query("insert into coin_balances(user_id,balance) values($1,1000),($2,1000)", [v, w]);
  const candidates = (channelId, uid) => call(parties, "/streams/:channelId/party/candidates", "get", uid, {}, { channelId });
  assert.equal((await candidates(ca, null)).statusCode, 401);
  assert.equal((await candidates(ca, v)).statusCode, 403);
  assert.equal((await candidates(`${prefix}-missing`, a)).statusCode, 403);
  const available = await candidates(ca, a);
  assert.equal(available.statusCode, 200);
  assert.ok(available.body.users.some(host => host.channelId === cb));
  assert.ok(!available.body.users.some(host => host.channelId === ca));
  await pool.query("update live_stream_sessions set ended_at=now() where channel_id=$1", [cb]);
  assert.ok(!(await candidates(ca, a)).body.users.some(host => host.channelId === cb));
  assert.equal((await candidates(cb, b)).statusCode, 403);
  await pool.query("update live_stream_sessions set ended_at=null where channel_id=$1", [cb]);
  assert.equal((await action(ca, null, { action: "invite", targetChannelId: cb })).statusCode, 401);
  assert.equal((await action(ca, v, { action: "invite", targetChannelId: cb })).statusCode, 403);
  assert.equal((await action(ca, a, { action: "invite", targetChannelId: ca })).statusCode, 400);
  await post(ca, v, "Before Party");
  const invitations = await Promise.all([action(ca, a, { action: "invite", targetChannelId: cb }), action(cc, c, { action: "invite", targetChannelId: cb })]);
  assert.deepEqual(invitations.map(r => r.statusCode).sort(), [200, 409]);
  const pending = (await state(cb, b)).body.party;
  assert.ok(pending);
  const ownerChannel = pending.participants[0].channelId;
  const ownerUid = pending.participants[0].uid;
  // Normalize the winning concurrent invitation to A/B.
  await action(ownerChannel, ownerUid, { action: "cancel", partyId: pending.id });
  assert.equal((await action(ca, a, { action: "invite", targetChannelId: cb })).statusCode, 200);
  const invitation = (await state(cb, b)).body.party;
  assert.equal((await state(ca, v)).body.party, null);
  assert.equal((await action(ca, a, { action: "accept", partyId: invitation.id })).statusCode, 403);
  assert.equal((await action(cb, b, { action: "accept", partyId: invitation.id })).statusCode, 200);
  assert.equal((await action(ca, a, { action: "battle_request", partyId: invitation.id })).statusCode, 409);
  await action(ca, a, { action: "ready", partyId: invitation.id });
  await action(cb, b, { action: "ready", partyId: invitation.id });
  await presence(ca, v); await presence(cb, v); await presence(cb, w);
  assert.equal((await state(ca, v)).body.party.viewerCount, 2);
  assert.equal((await state(cb, w)).body.party.participants[0].channelId, ca);
  assert.ok(!(await messages(cb, w)).body.messages.some(m => m.text === "Before Party"));
  const posted = await post(ca, v, "Shared Party message");
  assert.equal(posted.statusCode, 200);
  assert.ok((await messages(cb, w)).body.messages.some(m => m.id === posted.body.message.id));
  assert.equal((await call(chat, "/streams/:channelId/chat/:messageId", "delete", v, {}, { channelId: cb, messageId: posted.body.message.id })).statusCode, 403);
  assert.equal((await call(chat, "/streams/:channelId/chat/:messageId", "delete", b, {}, { channelId: cb, messageId: posted.body.message.id })).statusCode, 200);
  assert.ok((await messages(ca, v)).body.deletedIds.includes(posted.body.message.id));
  assert.ok(!(await messages(ca, v)).body.messages.some(m => m.id === posted.body.message.id));
  await call(moderation, "/streams/:channelId/moderation", "post", b, { viewerUid: v, action: "mute" }, { channelId: cb });
  assert.equal((await post(ca, v, "Muted across rooms")).statusCode, 403);
  await call(moderation, "/streams/:channelId/moderation", "post", b, { viewerUid: v, action: "unmute" }, { channelId: cb });
  assert.equal((await call(streams, "/streams/:channelId/premium", "post", a, { requiredGiftId: "rose", freeViewerIds: [] }, { channelId: ca })).statusCode, 409);
  assert.equal((await action(ca, a, { action: "battle_request", partyId: invitation.id })).statusCode, 200);
  let battle = (await state(ca, a)).body.party.battle;
  assert.equal((await action(ca, a, { action: "battle_accept", partyId: invitation.id, battleId: battle.id })).statusCode, 403);
  assert.equal((await action(cb, b, { action: "battle_accept", partyId: invitation.id, battleId: battle.id })).statusCode, 200);
  await gift(v, a, ca);
  assert.equal((await state(ca, a)).body.party.battle.firstScore, 0, "Countdown gifts do not score");
  await pool.query("update live_battles set starts_at=now()-interval '1 second' where id=$1", [battle.id]);
  const key = randomUUID();
  const duplicate = await Promise.all([gift(v, a, ca, key), gift(v, a, ca, key)]);
  assert.ok(duplicate.every(r => r.statusCode === 200));
  await gift(w, b, cb);
  battle = (await state(ca, a)).body.party.battle;
  assert.equal(battle.firstScore, 5); assert.equal(battle.secondScore, 5);
  assert.equal((await pool.query("select count(*)::int as count from coin_transactions where idempotency_key=$1", [key])).rows[0].count, 1);
  assert.equal((await pool.query("select battle_id from coin_transactions where idempotency_key=$1", [key])).rows[0].battle_id, battle.id);
  await gift(w, b, cb);
  await pool.query("update live_battles set ends_at=now()-interval '1 second' where id=$1", [battle.id]);
  await gift(v, a, ca);
  battle = (await state(ca, a)).body.party.battle;
  assert.equal(battle.status, "finished"); assert.equal(battle.firstScore, 5); assert.equal(battle.secondScore, 10); assert.equal(battle.winnerUid, b);
  assert.equal((await action(ca, a, { action: "battle_request", partyId: invitation.id })).statusCode, 200, "Rematch is allowed");
  const rematch = (await state(cb, b)).body.party.battle;
  await action(cb, b, { action: "battle_accept", partyId: invitation.id, battleId: rematch.id });
  await pool.query("update live_parties set first_ready_at=now()-interval '30 seconds' where id=$1", [invitation.id]);
  assert.equal((await state(cb, b)).body.party.battle.status, "cancelled", "Connection loss cancels VS");
  await action(ca, a, { action: "ready", partyId: invitation.id });
  await action(cb, b, { action: "leave", partyId: invitation.id });
  assert.equal((await state(ca, a)).body.party, null);
  assert.equal((await state(cb, b)).body.party, null);
  await post(ca, v, "Solo again");
  assert.ok(!(await messages(cb, w)).body.messages.some(m => m.text === "Solo again"));
  assert.equal((await call(parties, "/streams/:channelId/party/media", "get", v, {}, { channelId: ca })).statusCode, 403);
  await action(ca, a, { action: "invite", targetChannelId: cb });
  const expiring = (await state(cb, b)).body.party;
  await pool.query("update live_parties set expires_at=now()-interval '1 second' where id=$1", [expiring.id]);
  assert.equal((await action(cb, b, { action: "accept", partyId: expiring.id })).statusCode, 409);
  assert.equal((await call(streams, "/streams/:channelId", "delete", v, {}, { channelId: ca })).statusCode, 403);
  assert.equal((await call(streams, "/streams/:channelId/heartbeat", "post", v, {}, { channelId: ca })).statusCode, 403);
  console.log("PASS: Party authorization, concurrent invitations, consent, readiness, merged/deduplicated viewers, chat merge/split/deletion/muting, premium exclusion, atomic gift scoring/idempotency, countdown/end boundaries, rematch, disconnect cancellation, invitation expiry, and live ownership.");

  const handlers = new Set();
  const calls = [];
  const emit = (method, ...args) => { for (const h of handlers) h[method]?.(...args); };
  const engine = {
    registerEventHandler(h) { handlers.add(h); },
    unregisterEventHandler(h) { handlers.delete(h); },
    joinChannelEx(token, connection, options) { calls.push(["join", connection, options]); queueMicrotask(() => emit("onJoinChannelSuccess", connection)); return 0; },
    updateChannelMediaOptionsEx(options, connection) { calls.push(["renew", connection]); return 0; },
    leaveChannelEx(connection, options) { calls.push(["leave", connection, options]); queueMicrotask(() => emit("onLeaveChannel", connection)); return 0; },
    leaveChannel() { assert.fail("Party must never leave the primary channel"); },
    release() { assert.fail("Party must never release the primary engine"); },
  };
  const states = [];
  const dispose = openPartyConnection(engine, async () => ({ token: "test", channelName: cb, uid: v }), b, s => states.push(s));
  await new Promise(resolve => setTimeout(resolve, 10));
  emit("onFirstRemoteVideoFrame", { channelId: ca }, a);
  assert.equal(states.at(-1).ready, false);
  emit("onFirstRemoteVideoFrame", { channelId: cb }, b);
  assert.equal(states.at(-1).ready, true);
  assert.equal(calls[0][2].publishCameraTrack, false);
  assert.equal(calls[0][2].publishMicrophoneTrack, false);
  emit("onTokenPrivilegeWillExpire", { channelId: cb });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(calls.some(c => c[0] === "renew"));
  await dispose();
  assert.equal(calls.at(-1)[2].stopMicrophoneRecording, false);
  assert.equal(handlers.size, 0);
  console.log("PASS: Secondary Agora connection isolates events, never publishes viewer media, renews tokens, leaves only the partner channel, and preserves the host microphone.");
} finally {
  await pool.query("delete from coin_transactions where from_user_id=any($1) or to_user_id=any($1)", [[a,b,c,v,w]]);
  await pool.query("delete from coin_balances where user_id=any($1)", [[a,b,c,v,w]]);
  await pool.query("delete from stream_moderation where viewer_user_id=any($1)", [[a,b,c,v,w]]);
  await pool.query("delete from live_stream_sessions where channel_id=any($1)", [channels]);
  await pool.query("delete from users where uid=any($1)", [[a,b,c,v,w]]);
  await pool.end();
  unlinkSync(output);
}
process.exit(0);
