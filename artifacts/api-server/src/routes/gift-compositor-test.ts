import { Router } from "express";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID, randomInt } from "node:crypto";
import path from "node:path";
import { access } from "node:fs/promises";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool, liveStreamSessionsTable } from "@workspace/db";
import { readPublishedGiftCatalog, giftAssetDelivery } from "../lib/managedGiftCatalog";
import { authenticatedUser, viewerModeration } from "../lib/streamModeration";
import { findParty } from "../lib/liveParty";

// No catalog mutation, coin transaction, ordinary gift event or recording occurs here.
// Explicitly enabled only on this development API. One worker globally bounds cost.
const router = Router();
type Session = {
  id: string; owner: number; source: string; demo: boolean; child: ChildProcess; expiresAt: number;
  channelName: string; uid: number; publisherUid: number; ready: boolean;
  durationMs: number; nextPlayAt: number; failed: boolean; lastPoll: number;
  audioSource?: string;
  timer?: ReturnType<typeof setInterval>;
};
let active: Session | null = null;
let starting = false;
const enabled = () => process.env.NODE_ENV === "development" && process.env.PULSE_GIFT_COMPOSITOR_TEST === "1";
const demoChannels = new Set(["pulse-gaming-demo", "pulse-music-demo", "pulse-talk-demo", "pulse-art-demo"]);
function stop(session: Session) {
  if (active === session) active = null;
  clearInterval(session.timer);
  if (session.child.connected) session.child.send({ type: "stop" }, () => {});
  session.child.kill("SIGTERM");
  const force = setTimeout(() => { if (session.child.exitCode === null) session.child.kill("SIGKILL"); }, 3000);
  force.unref();
}
async function sourceFor(channel: string, uid: number) {
  const stream = (await db.select().from(liveStreamSessionsTable).where(and(
    eq(liveStreamSessionsTable.channelId, channel), isNull(liveStreamSessionsTable.endedAt),
  )).limit(1))[0];
  if (!stream || stream.isPrivate || stream.requiredGiftId || stream.paused ||
    stream.lastHeartbeatAt.getTime() < Date.now() - 60000 || stream.hostUserId === uid || await findParty(channel)) return null;
  const access = await viewerModeration(stream.id, stream.hostUserId, uid);
  return access.blocked || access.removed ? null : stream;
}
function token(channel: string, uid: number, publisher = false) {
  return RtcTokenBuilder.buildTokenWithUid(process.env.AGORA_APP_ID!, process.env.AGORA_APP_CERTIFICATE!,
    channel, uid, publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER, 180, 180);
}
router.use(async (req, res, next) => {
  if (!enabled()) { res.status(404).json({ error: "Test unavailable" }); return; }
  try {
    const user = await authenticatedUser(req);
    if (!user) { res.status(401).json({ error: "Sign in to use this development test" }); return; }
    res.locals.testUid = user.uid;
    res.setHeader("Cache-Control", "no-store");
    next();
  } catch { res.status(503).json({ error: "Test authentication unavailable" }); }
});
router.post("/start", async (req, res) => {
  if (active || starting) { res.status(409).json({ error: "A test is already running. Close it or wait three minutes." }); return; }
  const source = req.body?.channelId;
  if (typeof source !== "string" || source.length > 150) { res.status(400).json({ error: "Invalid live channel" }); return; }
  starting = true;
  try {
    const uid = res.locals.testUid as number;
    const demo = demoChannels.has(source);
    const stream = demo ? null : await sourceFor(source, uid);
    if (!demo && !stream) { res.status(403).json({ error: "Open a demo or watch an active regular live. Parties, Premium and private lives are not supported by this test." }); return; }
    const root = process.env.PULSE_GIFT_TEST_ROOT;
    const giftPath = process.env.PULSE_GIFT_TEST_FILE;
    if (!root || !giftPath || !process.env.PULSE_PLAYWRIGHT_MODULE || !process.env.AGORA_APP_ID || !process.env.AGORA_APP_CERTIFICATE) throw Error("Not configured");
    const worker = path.join(root, "scripts/gift-compositor-worker.cjs");
    await Promise.all([access(worker), access(giftPath), access(process.env.PULSE_PLAYWRIGHT_MODULE)]);
    // Use the published development Mummy sound selection, never a client URL.
    // The visual test asset stays pinned; no catalog/revision is changed.
    const catalog = await readPublishedGiftCatalog(pool, "android", ["svga"]);
    const collections = catalog.collections as Array<{ gifts: Array<{ id: string; sound?: { id: string } | null }> }>;
    const mummy = collections.flatMap(c => c.gifts).find(g => g.id === "mummy");
    let customSoundBase64: string | undefined;
    if (mummy?.sound) {
      const { bytes } = await giftAssetDelivery(pool, mummy.sound.id);
      if (bytes.length > 10 * 1024 * 1024) throw Error("Sound exceeds test limit");
      customSoundBase64 = bytes.toString("base64");
    }
    const channelName = `gift-test-${randomUUID()}`;
    const publisherUid = 4000000001;
    const sourceUid = randomInt(3000000000, 3900000000);
    const child = fork(worker, [], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
    const session: Session = { id: randomUUID(), owner: uid, source, demo, child, channelName, uid, publisherUid,
      ready: false, failed: false, durationMs: 5000, nextPlayAt: 0, expiresAt: Date.now() + 180000, lastPoll: Date.now() };
    active = session;
    child.on("message", (message: any) => {
      if (message?.type === "ready") { session.ready = true; session.durationMs = message.durationMs; session.audioSource = message.audioSource; }
      if (message?.type === "ended" || message?.type === "failed") { session.failed = true; stop(session); }
    });
    child.on("error", () => { session.failed = true; stop(session); });
    child.on("exit", () => { if (active === session) { session.failed = true; stop(session); } });
    let checking = false;
    session.timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        if (Date.now() >= session.expiresAt || Date.now() - session.lastPoll > 20000 || (!demo && !await sourceFor(source, uid))) stop(session);
      } catch { stop(session); }
      finally { checking = false; }
    }, 5000);
    child.send({ appId: process.env.AGORA_APP_ID, demo, sourceChannel: stream?.rtcChannelName ?? source, sourceUid,
      sourceToken: demo ? null : token(stream?.rtcChannelName ?? source, sourceUid), hostUid: stream?.hostUserId,
      outputChannel: channelName, outputUid: publisherUid, outputToken: token(channelName, publisherUid, true), giftPath, customSoundBase64 });
    res.json({ id: session.id });
  } catch { res.status(503).json({ error: "The development compositor is not ready. Ask to restart the test worker." }); }
  finally { starting = false; }
});
router.use("/:id", (req, res, next) => {
  if (!active || active.id !== req.params.id || active.owner !== res.locals.testUid) {
    res.status(404).json({ error: "Test ended or unavailable. Close and try again." }); return;
  }
  res.locals.testSession = active;
  next();
});
router.get("/:id", async (_req, res) => {
  const session = res.locals.testSession as Session;
  session.lastPoll = Date.now();
  res.json({ id: session.id, ready: session.ready, expiresAt: session.expiresAt, durationMs: session.durationMs, audioSource: session.audioSource,
    ...(session.ready ? { channelName: session.channelName, uid: session.uid, publisherUid: session.publisherUid,
      token: token(session.channelName, session.uid) } : {}) });
});
router.post("/:id/play", async (_req, res) => {
  const session = res.locals.testSession as Session;
  try {
    if (!session.ready || !session.child.connected || (!session.demo && !await sourceFor(session.source, session.owner))) {
      stop(session); res.status(409).json({ error: "The live or test is no longer ready" }); return;
    }
    if (Date.now() < session.nextPlayAt) { res.status(429).json({ error: "Wait until this animation finishes" }); return; }
    session.nextPlayAt = Date.now() + session.durationMs + 1000;
    session.child.send({ type: "trigger" }, error => { if (error) stop(session); });
    res.json({ durationMs: session.durationMs });
  } catch { stop(session); res.status(503).json({ error: "Test stopped" }); }
});
router.delete("/:id", (_req, res) => { stop(res.locals.testSession); res.json({ stopped: true }); });
export default router;
