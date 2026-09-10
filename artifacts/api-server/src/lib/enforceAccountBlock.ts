import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, liveStreamSessionsTable, privateStreamInvitationsTable } from "@workspace/db";
import { getRuntimeStream, forgetViewer, endRuntimeStream } from "../routes/streams";
import { disconnectViewer, pushStreamUpdated } from "./wsHub";
import { findParty, partyStreams, closeStreamParty, partyChannels } from "./liveParty";

// Revoke already-issued media access as well as rejecting future API requests.
export async function enforceAccountBlock(a: number, b: number) {
  const sessions = await db.select().from(liveStreamSessionsTable).where(and(inArray(liveStreamSessionsTable.hostUserId, [a,b]), isNull(liveStreamSessionsTable.endedAt)));
  for (const session of sessions) {
    const other = session.hostUserId === a ? b : a;
    if (session.isPrivate) {
      const [invitation] = await db.select().from(privateStreamInvitationsTable).where(eq(privateStreamInvitationsTable.channelId,session.channelId));
      if (invitation?.invitedUserId === other) await endRuntimeStream(session.channelId);
      continue;
    }
    const party = await findParty(session.channelId);
    if (party && (await partyStreams(party)).some(stream => stream?.hostUserId === other)) await closeStreamParty(session.channelId);
    for (const channel of await partyChannels(session.channelId)) {
      const rtcChannelName = `live-${randomUUID()}`;
      const changed = await db.update(liveStreamSessionsTable).set({ rtcChannelName }).where(and(eq(liveStreamSessionsTable.channelId, channel), isNull(liveStreamSessionsTable.endedAt))).returning();
      if (!changed.length) continue;
      const runtime = getRuntimeStream(channel);
      if (runtime) runtime.rtcChannelName = rtcChannelName;
      forgetViewer(channel,other);
      disconnectViewer(channel,other);
      pushStreamUpdated(channel);
    }
  }
}
