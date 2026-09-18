import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, livePartiesTable, liveBattlesTable, liveStreamSessionsTable } from "@workspace/db";
import { chatStore, deletedMessages, MAX_MESSAGES } from "./liveChat";
import { viewerModeration } from "./streamModeration";
import { contactBlocked } from "./userSafety";

export type PartyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = typeof db | PartyTx;
export type Party = typeof livePartiesTable.$inferSelect;
export const PARTY_INVITE_MS = 30_000;
export const PARTY_CONNECT_MS = 45_000;
export const PARTY_READY_MS = 20_000;
export const BATTLE_DURATION_MS = 180_000;

// Serialize invitations, round transitions, and gift scoring in the same order.
export async function lockParty(tx: PartyTx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('live-party-state'))`);
}
export async function partyStreams(party: Party, reader: Reader = db) {
  const rows = await reader.select().from(liveStreamSessionsTable).where(inArray(liveStreamSessionsTable.channelId, [party.firstChannelId, party.secondChannelId]));
  return [rows.find(s => s.channelId === party.firstChannelId), rows.find(s => s.channelId === party.secondChannelId)] as const;
}
export function partyMediaReady(party: Party, now = Date.now()) {
  return !!party.firstReadyAt && !!party.secondReadyAt &&
    now - party.firstReadyAt.getTime() < PARTY_READY_MS && now - party.secondReadyAt.getTime() < PARTY_READY_MS;
}
export async function partyValid(party: Party, reader: Reader = db) {
  const now = Date.now();
  if (party.status === "pending" && party.expiresAt.getTime() <= now) return false;
  if (!["pending", "active"].includes(party.status)) return false;
  const sessions = await partyStreams(party, reader);
  if (sessions.some(s => !s || s.endedAt || s.isPrivate || now - s.lastHeartbeatAt.getTime() >= 60_000)) return false;
  if (party.status === "active" && party.startedAt && now - party.startedAt.getTime() > PARTY_CONNECT_MS && !partyMediaReady(party, now)) return false;
  return true;
}
export async function findParty(channelId: string, reader: Reader = db, pending = false) {
  const rows = await reader.select().from(livePartiesTable).where(and(
    or(eq(livePartiesTable.firstChannelId, channelId), eq(livePartiesTable.secondChannelId, channelId)),
    pending ? inArray(livePartiesTable.status, ["pending", "active"]) : eq(livePartiesTable.status, "active"),
  )).orderBy(desc(livePartiesTable.createdAt)).limit(1);
  const party = rows[0];
  return party && await partyValid(party, reader) ? party : null;
}
export async function partyChannels(channelId: string) {
  const party = await findParty(channelId);
  return party ? [party.firstChannelId, party.secondChannelId] : [channelId];
}
export async function partyViewerAllowed(party: Party, uid: number) {
  const sessions = await partyStreams(party);
  const states = await Promise.all(sessions.map(async s => s ? {
    ...await viewerModeration(s.id, s.hostUserId, uid),
    contactBlocked: await contactBlocked(s.hostUserId, uid),
  } : { blocked: true, removed: true, muted: true, contactBlocked: true }));
  return { allowed: states.every(s => !s.blocked && !s.removed && !s.contactBlocked), muted: states.some(s => s.muted) };
}
export async function latestBattle(partyId: string, reader: Reader = db) {
  return (await reader.select().from(liveBattlesTable).where(eq(liveBattlesTable.partyId, partyId)).orderBy(desc(liveBattlesTable.createdAt)).limit(1))[0] ?? null;
}
export async function settleBattle(party: Party, tx: PartyTx) {
  const battle = await latestBattle(party.id, tx);
  if (!battle) return null;
  const now = Date.now();
  // Derive test awards from server time, so polling, retries and restarts cannot
  // double-award. Simulation never writes a wallet, earnings or gift ledger.
  if (battle.simulated && battle.status === "active" && battle.startsAt && battle.endsAt && partyMediaReady(party, now)) {
    const elapsed = Math.max(0, Math.min(now, battle.endsAt.getTime() - 1) - battle.startsAt.getTime());
    const awards = Math.floor(elapsed / 5000);
    // A, B, B, A, A, B, B...: each 100-coin award either ties or
    // changes the leader, so both directional effects can be tested.
    const firstAwards = Math.floor(awards / 4) * 2 + (awards % 4 === 0 ? 0 : 1);
    // One larger test award at one minute creates a decisive lead. Deriving
    // it from elapsed time keeps retries and concurrent polls idempotent.
    const firstScore = firstAwards * 100 + (elapsed >= 60_000 ? 1000 : 0);
    const secondScore = (awards - firstAwards) * 100;
    if (firstScore !== battle.firstScore || secondScore !== battle.secondScore) {
      await tx.update(liveBattlesTable).set({ firstScore, secondScore }).where(eq(liveBattlesTable.id, battle.id));
      battle.firstScore = firstScore;
      battle.secondScore = secondScore;
    }
  }
  const status = battle.status === "active" && battle.endsAt && now >= battle.endsAt.getTime() ? "finished"
    : battle.status === "pending" && now >= battle.expiresAt.getTime() ? "cancelled"
    : battle.status === "active" && !partyMediaReady(party) ? "cancelled" : battle.status;
  if (status !== battle.status) {
    await tx.update(liveBattlesTable).set({ status }).where(eq(liveBattlesTable.id, battle.id));
    battle.status = status;
  }
  return battle;
}
export async function endParty(party: Party, tx: PartyTx, status: "ended" | "declined" = "ended") {
  await settleBattle(party, tx);
  await tx.update(livePartiesTable).set({ status, endedAt: new Date() }).where(eq(livePartiesTable.id, party.id));
  await tx.update(liveBattlesTable).set({ status: "cancelled" }).where(and(eq(liveBattlesTable.partyId, party.id), inArray(liveBattlesTable.status, ["pending", "active"])));
}
export async function closeStreamParty(channelId: string) {
  await db.transaction(async tx => {
    await lockParty(tx);
    const parties = await tx.select().from(livePartiesTable).where(and(
      or(eq(livePartiesTable.firstChannelId, channelId), eq(livePartiesTable.secondChannelId, channelId)),
      inArray(livePartiesTable.status, ["pending", "active"]),
    ));
    for (const party of parties) await endParty(party, tx);
  });
}

export async function expireParties() {
  await db.transaction(async tx => {
    await lockParty(tx);
    const parties = await tx.select().from(livePartiesTable).where(inArray(livePartiesTable.status, ["pending", "active"]));
    for (const party of parties) {
      if (!await partyValid(party, tx)) await endParty(party, tx);
      else await settleBattle(party, tx);
    }
  });
}

export async function scorePartyGift(tx: PartyTx, channelId: string | undefined, senderUid: number, recipientUid: number | null, amount: number) {
  if (!channelId) return null;
  const party = await findParty(channelId, tx);
  if (!party) return null;
  const [first, second] = await partyStreams(party, tx);
  const recipient = [first, second].find(s => s?.channelId === channelId);
  if (!recipient || recipient.hostUserId !== recipientUid) throw new Error("Party gifts must target the selected host's live");
  const battle = await settleBattle(party, tx);
  const now = Date.now();
  if (!battle || battle.simulated || battle.status !== "active" || !battle.startsAt || !battle.endsAt || now < battle.startsAt.getTime() || now >= battle.endsAt.getTime()) return null;
  if (senderUid === first?.hostUserId || senderUid === second?.hostUserId) return null;
  await tx.update(liveBattlesTable).set(recipientUid === first?.hostUserId
    ? { firstScore: sql`${liveBattlesTable.firstScore} + ${amount}` }
    : { secondScore: sql`${liveBattlesTable.secondScore} + ${amount}` })
    .where(eq(liveBattlesTable.id, battle.id));
  return battle.id;
}

// Read committed results into the ordinary stream chat, including rounds from
// a Party that has since ended. Stable IDs preserve polling/removal semantics.
export async function appendBattleResults(channelId: string) {
  const results = await db.select({ battle: liveBattlesTable, party: livePartiesTable })
    .from(liveBattlesTable).innerJoin(livePartiesTable, eq(liveBattlesTable.partyId, livePartiesTable.id))
    .where(and(eq(liveBattlesTable.status, "finished"),
      or(eq(livePartiesTable.firstChannelId, channelId), eq(livePartiesTable.secondChannelId, channelId))))
    .orderBy(desc(liveBattlesTable.endsAt)).limit(MAX_MESSAGES);
  for (const { battle, party } of results.reverse()) {
    if (battle.firstScore === battle.secondScore || !battle.endsAt) continue;
    const id = `battle:${battle.id}`;
    const existing = chatStore.get(channelId) ?? [];
    if (existing.some(message => message.id === id) || deletedMessages.get(channelId)?.includes(id)) continue;
    if (existing.length >= MAX_MESSAGES && battle.endsAt.getTime() < existing[0].ts) continue;
    const sessions = await partyStreams(party);
    const winner = sessions[battle.firstScore > battle.secondScore ? 0 : 1];
    if (!winner) continue;
    // Recheck after the async lookup so concurrent chat polls cannot duplicate.
    const current = chatStore.get(channelId) ?? [];
    if (current.some(message => message.id === id) || deletedMessages.get(channelId)?.includes(id)) continue;
    chatStore.set(channelId, [...current, {
      id, senderName: "Pulse",
      text: `Winner: ${winner.hostName}\n${Math.max(battle.firstScore, battle.secondScore).toLocaleString("en-US")} coins`,
      color: "#FF1966", ts: Date.now(),
    }].slice(-MAX_MESSAGES));
  }
}
