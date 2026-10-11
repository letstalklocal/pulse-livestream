import { fork, type ChildProcess } from "node:child_process";
import { randomUUID, randomInt } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { access, readFile } from "node:fs/promises";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { pool } from "@workspace/db";
import { giftAssetDelivery, readPublishedGiftCatalog } from "./managedGiftCatalog";
import { installLiveGiftDelivery, type LiveGiftEvent } from "./liveGiftDeliveryBus";
import { GIFT_CATALOG } from "./giftCatalog";
import legacyAssets from "./legacyGiftAssets.json";
import { giftBrowserExecutable } from './giftBrowser';

// Global policy, per-recipient media workers. Payments and receipts never call
// this module. Only committed, privacy-masked live events reach the delivery bus.
type Source = { channel_id: string; host_user_id: number; rtc_channel_name: string | null; paused: boolean };
type Pending = { event: LiveGiftEvent; deliver: (event: LiveGiftEvent) => void; timer: ReturnType<typeof setTimeout> };
type Session = { id: string; source: Source; output: string; sourceUid: number; child: ChildProcess;
  ready: boolean; pending: Map<string, Pending[]>; delivered: Map<string, object>; startup: ReturnType<typeof setTimeout>; renewedAt: number };
const sessions = new Map<string, Session>();
let requested = false, revision = "0", fault: string | null = null, refreshing = false;
let catalog: any[] = [], catalogAt = 0;
let browserExecutable: string | undefined;
const maxWorkers = () => Math.max(1, Math.min(16, Number(process.env.PULSE_GIFT_MAX_WORKERS) || 4));
// esbuild places this module in dist/index.mjs; deployment cwd is not stable.
const deliveryAssets = path.dirname(fileURLToPath(import.meta.url));
const workerPath = () => process.env.PULSE_GIFT_TEST_ROOT ? path.join(process.env.PULSE_GIFT_TEST_ROOT, "scripts/live-gift-renderer.cjs") : path.join(deliveryAssets, "live-gift-renderer.cjs");
const configured = () => !!(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);
const assetCache = new Map<string, Buffer>();
const assetLoads = new Map<string, Promise<Buffer>>();
async function cachedAsset(id: string, load: () => Promise<Buffer>) {
  const found = assetCache.get(id);
  if (found) { assetCache.delete(id); assetCache.set(id, found); return found; }
  if (assetLoads.has(id)) return assetLoads.get(id)!;
  const promise = load().then(bytes => {
    if (bytes.length > 32 * 1024 * 1024) throw Error("Asset exceeds renderer limit");
    assetCache.set(id, bytes);
    while ([...assetCache.values()].reduce((n, value) => n + value.length, 0) > 96 * 1024 * 1024) assetCache.delete(assetCache.keys().next().value!);
    return bytes;
  }).finally(() => assetLoads.delete(id));
  assetLoads.set(id, promise); return promise;
}
async function bundledAsset(giftId: string, kind: string) {
  const definition = legacyAssets.find(asset => asset.giftId === giftId && asset.kind === kind);
  if (!definition) return null;
  const bytes = await cachedAsset(`bundled:${definition.file}`, async () => {
    return readFile(path.join(deliveryAssets, "legacy-gifts", definition.file));
  });
  return { format: definition.format, base64: bytes.toString("base64") };
}
export function liveGiftDeliveryState() {
  return { enabled: requested, effective: requested && !fault, revision, fault, configured: configured(), activeWorkers: sessions.size, maxWorkers: maxWorkers() };
}
function token(channel: string, uid: number, publisher = false) {
  return RtcTokenBuilder.buildTokenWithUid(process.env.AGORA_APP_ID!, process.env.AGORA_APP_CERTIFICATE!,
    channel, uid, publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER, 3600, 3600);
}
export function giftDeliveryStatus(channel: string) {
  const s = sessions.get(channel);
  return requested && !fault && s?.ready ? { id: s.id, channelName: s.output, publisherUid: s.source.host_user_id } : null;
}
export function stopGiftDelivery(channel: string) {
  const s = sessions.get(channel); if (!s) return;
  sessions.delete(channel); clearTimeout(s.startup); s.child.kill("SIGTERM");
  setTimeout(() => { if (s.child.exitCode === null) s.child.kill("SIGKILL"); }, 3000).unref();
  for (const pending of s.pending.values()) for (const p of pending) { clearTimeout(p.timer); p.deliver(p.event); }
  s.pending.clear();
}
function trip(reason: string) {
  fault = reason;
  for (const channel of [...sessions.keys()]) stopGiftDelivery(channel);
}
export async function setLiveGiftDelivery(enabled: boolean, actor: string) {
  if (enabled) {
    if (!configured()) throw Error("Configure the server renderer before enabling live gift delivery.");
    await access(workerPath());
    if (process.env.PULSE_PLAYWRIGHT_MODULE) await access(process.env.PULSE_PLAYWRIGHT_MODULE);
    browserExecutable = await giftBrowserExecutable();
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM live_stream_sessions WHERE ended_at IS NULL AND last_heartbeat_at > now()-interval '60 seconds'");
    if (rows[0].n > maxWorkers()) throw Error("Not enough renderer capacity for all active lives.");
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const changed = await db.query("UPDATE live_gift_delivery_settings SET enabled=$1,revision=revision+1,updated_at=now(),updated_by=$2 WHERE id=1", [enabled, actor]);
    if (changed.rowCount !== 1) throw Error("Delivery settings migration is required.");
    await db.query("INSERT INTO admin_audit_events(actor_clerk_id,action,target,outcome) VALUES($1,'gifts.live-delivery',$2,'allowed')", [actor, enabled ? "server" : "existing"]);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
  if (!enabled) { requested = false; for (const channel of [...sessions.keys()]) stopGiftDelivery(channel); }
  await refreshLiveGiftDelivery();
  return liveGiftDeliveryState();
}
async function gifts() {
  if (Date.now() - catalogAt < 60_000) return catalog;
  const result = await readPublishedGiftCatalog(pool, "android", ["svga", "webm-alpha", "packed-alpha-mp4"]);
  catalog = (result.collections as Array<{ gifts: any[] }>).flatMap(c => c.gifts); catalogAt = Date.now(); return catalog;
}
async function renderGift(event: LiveGiftEvent) {
  // Purchase snapshot wins. Legacy Premium/admission gifts resolve by name AND
  // unit price, never by a newly edited price or a client-supplied asset URL.
  const snapshot = event.giftSnapshot || (await gifts()).find(g => g.name === event.giftName && g.coinCost === event.amount);
  const legacy = Object.values(GIFT_CATALOG).find(g => g.name === event.giftName && g.coinCost === event.amount);
  const base = snapshot || { ...legacy, revisionId: `legacy:${event.giftName}:${event.amount}`, type: "image", framing: { preset: "contained", scale: 1, x: 0, y: 0 } };
  if (!base.id) throw Error("Unknown historical gift presentation");
  const asset = base.type === "image" ? base.thumbnail : base.androidAnimation || base.iosAnimation || base.thumbnail;
  const load = async (value: any) => {
    if (!value) return null;
    const bytes = await cachedAsset(value.id, async () => (await giftAssetDelivery(pool, value.id)).bytes);
    return { ...value, base64: bytes.toString("base64") };
  };
  return { revisionId: base.revisionId, type: base.type, emoji: base.emoji, framing: base.framing,
    asset: await load(asset) || await bundledAsset(base.id, base.type === "animation" ? "animation" : "thumbnail"),
    sound: await load(base.sound), defaultSound: await bundledAsset("__default_sound", "sound") };
}
function start(source: Source) {
  const child = fork(workerPath(), [], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const s: Session = { id: randomUUID(), source, output: `gift-live-${randomUUID()}`, sourceUid: randomInt(3000000000, 3900000000),
    child, ready: false, pending: new Map(), delivered: new Map(), renewedAt: Date.now(),
    startup: setTimeout(() => { if (sessions.get(source.channel_id) === s) trip("A renderer did not start. Existing delivery is active; turn the switch off/on to retry."); }, 30000) };
  sessions.set(source.channel_id, s);
  child.on("message", (message: any) => {
    if (sessions.get(source.channel_id) !== s) return;
    if (message?.type === "ready") {
      s.ready = true; clearTimeout(s.startup);
      // Bounded warm cache. All catalog gifts remain eligible; this is a preload
      // optimization, not a per-gift rollout list. Never delay the camera feed.
      void gifts().then(async catalog => {
        for (const gift of catalog.filter(g => g.type === "animation").slice(0, 2)) {
          if (sessions.get(source.channel_id) !== s || s.pending.size) break;
          const prepared = await renderGift({ type: "gift", channelId: source.channel_id, giftSnapshot: gift });
          if (sessions.get(source.channel_id) === s && !s.pending.size) s.child.send({ type: "prepare", gift: prepared }, () => {});
        }
      }).catch(() => {}); // A speculative preload cannot fail a paid gift.
    }
    else if (message?.type === "played") {
      const pending = s.pending.get(message.giftId); if (!pending) return;
      const delivery = { sessionId: s.id, channelId: source.channel_id, recipientUid: source.host_user_id, durationMs: message.durationMs };
      s.delivered.set(message.giftId, delivery); if (s.delivered.size > 512) s.delivered.delete(s.delivered.keys().next().value!);
      s.pending.delete(message.giftId);
      for (const p of pending) { clearTimeout(p.timer); p.deliver({ ...p.event, serverDelivery: delivery }); }
    } else if (message?.type === "ended") stopGiftDelivery(source.channel_id);
    else if (message?.type === "failed") trip("Gift rendering failed. Existing delivery is active; turn the switch off/on to retry.");
  });
  child.on("error", () => { if (sessions.get(source.channel_id) === s) trip("Renderer process failed; existing delivery is active."); });
  child.on("exit", () => { if (sessions.get(source.channel_id) === s) trip("Renderer stopped; existing delivery is active."); });
  const rtc = source.rtc_channel_name || source.channel_id;
  child.send({ appId: process.env.AGORA_APP_ID, sourceChannel: rtc, sourceUid: s.sourceUid, sourceToken: token(rtc, s.sourceUid),
    hostUid: source.host_user_id, outputChannel: s.output, outputToken: token(s.output, source.host_user_id, true), chromiumExecutable: browserExecutable, svgaScript: path.join(deliveryAssets, "admin/gift-svga.js") });
}
export async function refreshLiveGiftDelivery() {
  if (refreshing) return; refreshing = true;
  try {
    const row = (await pool.query("SELECT enabled,revision::text FROM live_gift_delivery_settings WHERE id=1")).rows[0];
    if (row?.revision !== revision) { revision = row?.revision || "0"; fault = null; }
    requested = row?.enabled === true;
    if (!requested || fault) { for (const channel of [...sessions.keys()]) stopGiftDelivery(channel); return; }
    if (!configured()) { trip("Renderer configuration is missing; existing delivery is active."); return; }
    if (!browserExecutable) {
      try { browserExecutable = await giftBrowserExecutable(); }
      catch (error) { trip(error instanceof Error ? error.message : 'Chromium unavailable'); return; }
    }
    // No Premium/private/party exclusions. Existing token routes remain the ACL.
    const sources: Source[] = (await pool.query("SELECT channel_id,host_user_id,rtc_channel_name,paused FROM live_stream_sessions WHERE ended_at IS NULL AND last_heartbeat_at > now()-interval '60 seconds'")).rows;
    if (sources.length > maxWorkers()) { trip("Renderer capacity exceeded; existing delivery is active globally."); return; }
    for (const [channel, s] of sessions) {
      const source = sources.find(row => row.channel_id === channel);
      if (!source || source.paused || source.rtc_channel_name !== s.source.rtc_channel_name) stopGiftDelivery(channel);
      else if (Date.now() - s.renewedAt > 20 * 60_000) {
        s.renewedAt = Date.now(); s.child.send({ type: "renew", sourceToken: token(source.rtc_channel_name || channel, s.sourceUid), outputToken: token(s.output, source.host_user_id, true) });
      }
    }
    for (const source of sources) if (!source.paused && !sessions.has(source.channel_id)) start(source);
  } catch { requested = false; for (const channel of [...sessions.keys()]) stopGiftDelivery(channel); }
  finally { refreshing = false; }
}
installLiveGiftDelivery((event, deliver) => {
  if (!requested || fault || !event.giftId || !event.recipientUid) return false;
  // Render party fanout once on the recipient feed, preserving each audience's
  // independently privacy-masked socket/chat event and original transaction ID.
  const s = [...sessions.values()].find(value => value.source.host_user_id === event.recipientUid);
  if (!s?.ready || !s.child.connected) return false;
  const delivered = s.delivered.get(event.giftId);
  if (delivered) { deliver({ ...event, serverDelivery: delivered }); return true; }
  const existing = s.pending.get(event.giftId);
  const timer = setTimeout(() => { if (sessions.get(s.source.channel_id) === s) trip("Gift preparation timed out; existing delivery is active globally."); }, 20000);
  const pending = { event, deliver, timer };
  if (existing) { existing.push(pending); return true; }
  if (s.pending.size >= 32) { clearTimeout(timer); trip("Gift renderer overloaded; existing delivery is active globally."); return false; }
  s.pending.set(event.giftId, [pending]);
  void renderGift(event).then(gift => {
    if (sessions.get(s.source.channel_id) !== s) return;
    s.child.send({ type: "play", event: { giftId: event.giftId, combo: event.combo }, gift }, error => { if (error && sessions.get(s.source.channel_id) === s) trip("Gift transport failed; existing delivery is active globally."); });
  }).catch(() => { if (sessions.get(s.source.channel_id) === s) trip("Gift asset unavailable; existing delivery is active globally."); });
  return true;
}, stopGiftDelivery);
export function startLiveGiftDeliveryMonitor() {
  void readFile(path.join(deliveryAssets, "gift-migrations/20261011_live_gift_delivery.sql"), "utf8")
    .then(sql => pool.query(sql)).then(() => refreshLiveGiftDelivery()).catch(() => { requested = false; });
  const timer = setInterval(() => void refreshLiveGiftDelivery(), 2000); timer.unref();
  return () => { clearInterval(timer); requested = false; for (const channel of [...sessions.keys()]) stopGiftDelivery(channel); };
}
