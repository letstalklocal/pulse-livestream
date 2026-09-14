import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  liveViewerBansTable as bans,
  type LiveStreamSession,
} from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const endpoint = "https://api.agora.io/dev/v1/kicking-rule";
function credentials() {
  const id = process.env.AGORA_CUSTOMER_ID;
  const secret = process.env.AGORA_SECRET ?? process.env.AGORA_CUSTOMER_SECRET;
  const appid = process.env.AGORA_APP_ID;
  return id && secret && appid
    ? {
        appid,
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      }
    : null;
}
async function ruleRequest(method: "POST" | "DELETE", body: object) {
  const auth = credentials();
  if (!auth)
    throw new Error("Agora viewer-removal credentials are unavailable");
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: auth.authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ appid: auth.appid, ...body }),
    signal: AbortSignal.timeout(5000),
  });
  if (method === "DELETE" && response.status === 404) return null;
  const result = (await response.json()) as { status?: string; id?: number };
  if (!response.ok || result.status !== "success")
    throw new Error(`Agora viewer removal returned HTTP ${response.status}`);
  return result;
}

/** True means the caller must use the existing media rotation fallback.
 * Ban only this UID in this media channel, for longer than the one-hour RTC token.
 * Never use a zero-duration kick: it would permit reuse of a cached token.
 */
export async function removeAgoraViewers(
  tx: Transaction,
  session: LiveStreamSession,
  viewerUids: number[],
): Promise<boolean> {
  if (!viewerUids.length) return false;
  if (!credentials()) return true;
  const channel = session.rtcChannelName ?? session.channelId;
  // Keep a slow provider from holding up the live session indefinitely. At most
  // four calls run together, with a ten-second total budget for native removal.
  const pending = [...new Set(viewerUids)];
  const outcomes: Array<{ uid: number; ruleId: number }> = [];
  let fallback = false;
  let next = 0;
  const finishBy = Date.now() + 10_000;
  await Promise.all(
    Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (next < pending.length && !fallback) {
        const uid = pending[next++]!;
        if (Date.now() > finishBy - 5000) {
          fallback = true;
          return;
        }
        try {
          if (!Number.isInteger(uid) || uid <= 0 || uid === session.hostUserId)
            throw new Error("Invalid viewer removal target");
          const result = await ruleRequest("POST", {
            cname: channel,
            uid,
            time: 61,
            privileges: ["join_channel"],
          });
          if (!Number.isSafeInteger(result?.id))
            throw new Error("Agora did not return a banning rule ID");
          outcomes.push({ uid, ruleId: result!.id! });
        } catch {
          fallback = true;
        }
      }
    }),
  );
  if (fallback)
    console.warn("Individual viewer removal unavailable; using media rotation");
  for (const outcome of outcomes) {
    try {
      // A savepoint keeps the fallback transaction usable if saving a rule fails.
      await tx.transaction(async (savepoint) => {
        await savepoint.insert(bans).values({
          id: randomUUID(),
          sessionId: session.id,
          viewerUserId: outcome.uid,
          rtcChannelName: channel,
          ruleId: outcome.ruleId,
          expiresAt: new Date(Date.now() + 61 * 60_000),
        });
      });
    } catch {
      fallback = true;
    }
  }
  return fallback;
}

export async function allowAgoraViewer(
  tx: Transaction,
  session: LiveStreamSession,
  viewerUid: number,
) {
  const condition = and(
    eq(bans.sessionId, session.id),
    eq(bans.viewerUserId, viewerUid),
  );
  const rules = await tx.select().from(bans).where(condition);
  for (const rule of rules) {
    // Bans on an abandoned media channel cannot prevent re-entry to the current live.
    if (
      rule.expiresAt.getTime() > Date.now() &&
      rule.rtcChannelName === (session.rtcChannelName ?? session.channelId)
    ) {
      await ruleRequest("DELETE", { id: rule.ruleId });
    }
  }
  await tx.delete(bans).where(condition);
}
