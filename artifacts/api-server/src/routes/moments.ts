import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  createPrivateUploadUrl,
  createPrivatePutUrl,
  createPrivateGetUrl,
  privateObjectMetadata,
  deletePrivateObject,
} from "../lib/objectStorage";
import { pushGiftInVideo } from "../lib/wsHub";
import { findParty } from "../lib/liveParty";
const router = Router();
async function owner(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  return (
    (
      await db
        .select({ uid: usersTable.uid })
        .from(usersTable)
        .where(eq(usersTable.clerkId, userId))
        .limit(1)
    )[0] ?? null
  );
}
router.get("/moments", async (req, res) => {
  const user = await owner(req);
  if (!user)
    return void res.status(401).json({ error: "Sign in to view Moments" });
  const rows = await db.execute(sql`
    select m.id, m.status, m.capture_mode as "captureMode", m.duration_ms as "durationMs", m.created_at as "createdAt",
      t.idempotency_key as "giftId", t.amount, t.gift_name as "giftName", u.name as "senderName"
    from moments m join coin_transactions t on t.id=m.gift_transaction_id
    left join users u on u.uid=t.from_user_id
    where m.owner_user_id=${user.uid} and m.status <> 'deleted' order by m.created_at desc limit 100
  `);
  res.json({ moments: rows.rows });
});
router.post("/moments/uploads", async (req, res) => {
  const user = await owner(req);
  if (!user)
    return void res.status(401).json({ error: "Sign in to save Moments" });
  const giftId = req.body?.giftId;
  if (typeof giftId !== "string" || giftId.length > 100)
    return void res.status(400).json({ error: "Gift ID required" });
  const gift = await db.execute<{
    id: number;
  }>(sql`select id from coin_transactions where idempotency_key=${giftId}
    and to_user_id=${user.uid} and type='gift' and amount >= 500 and channel_id is not null and channel_id <> ''`);
  if (!gift.rows[0])
    return void res.status(404).json({ error: "Qualifying gift not found" });
  const existing = await db.execute<{
    id: number;
    object_path: string;
    status: string;
  }>(
    sql`select id, object_path, status from moments where gift_transaction_id=${gift.rows[0].id}`,
  );
  let moment = existing.rows[0];
  if (!moment) {
    const upload = await createPrivateUploadUrl();
    await db.execute(
      sql`insert into moments(owner_user_id, gift_transaction_id, object_path) values(${user.uid}, ${gift.rows[0].id}, ${upload.objectPath}) on conflict(gift_transaction_id) do nothing`,
    );
    moment = (
      await db.execute<{ id: number; object_path: string; status: string }>(
        sql`select id, object_path, status from moments where gift_transaction_id=${gift.rows[0].id}`,
      )
    ).rows[0]!;
  }
  if (moment.status === "deleted")
    return void res.status(410).json({ error: "Moment was deleted" });
  if (moment.status === "ready")
    return void res.json({ id: moment.id, ready: true });
  res.json({
    id: moment.id,
    uploadUrl: await createPrivatePutUrl(moment.object_path),
    ready: false,
  });
});
// Reports a native frame or an explicit pre-render failure; never initiates payment.
router.post("/moments/live-gift", async (req, res) => {
  const user = await owner(req);
  if (!user) return void res.status(401).json({ error: "Sign in required" });
  const giftId = req.body?.giftId;
  if (typeof giftId !== "string" || giftId.length > 100)
    return void res.status(400).json({ error: "Gift ID required" });
  const gift = (
    await db.execute<{
      channel_id: string;
    }>(sql`select channel_id from coin_transactions
    where idempotency_key=${giftId} and to_user_id=${user.uid} and type='gift' and amount>=500
      and gift_name='Crown' and channel_id is not null and channel_id <> '' and created_at > now() - interval '30 seconds'`)
  ).rows[0];
  if (!gift)
    return void res
      .status(404)
      .json({ error: "Recent qualifying gift not found" });
  if (req.body?.inVideo != null && typeof req.body.inVideo !== "boolean")
    return void res.status(400).json({ error: "Invalid gift presentation" });
  const inVideo = req.body?.inVideo !== false;
  pushGiftInVideo(gift.channel_id, giftId, inVideo);
  const party = await findParty(gift.channel_id);
  if (party)
    pushGiftInVideo(
      party.firstChannelId === gift.channel_id
        ? party.secondChannelId
        : party.firstChannelId,
      giftId,
      inVideo,
    );
  res.json({ success: true });
});
router.post("/moments/:id/complete", async (req, res) => {
  const user = await owner(req);
  if (!user) return void res.status(401).json({ error: "Sign in required" });
  const id = Number(req.params.id),
    duration = req.body?.durationMs;
  if (
    !Number.isSafeInteger(id) ||
    !Number.isInteger(duration) ||
    duration < 1000 ||
    duration > 10000
  )
    return void res.status(400).json({ error: "Invalid recording duration" });
  const row = (
    await db.execute<{ object_path: string }>(
      sql`select object_path from moments where id=${id} and owner_user_id=${user.uid} and status <> 'deleted'`,
    )
  ).rows[0];
  if (!row) return void res.status(404).json({ error: "Moment not found" });
  try {
    const metadata = await privateObjectMetadata(row.object_path);
    const size = Number(metadata.size);
    if (
      !size ||
      size > 30 * 1024 * 1024 ||
      metadata.contentType !== "video/mp4"
    )
      return void res
        .status(400)
        .json({ error: "A valid MP4 upload is required" });
  } catch {
    return void res
      .status(409)
      .json({ error: "Recording upload is not available yet" });
  }
  const captureMode = req.body?.captureMode;
  if (captureMode != null && captureMode !== "live-gift-v1")
    return void res.status(400).json({ error: "Invalid capture mode" });
  const updated =
    await db.execute(sql`update moments set status='ready', duration_ms=${duration}, capture_mode=${captureMode ?? null}
    where id=${id} and owner_user_id=${user.uid} and status='uploading' returning id`);
  // Retries of a completed upload are idempotent; never rewrite its identity.
  if (!updated.rows.length) {
    const ready = await db.execute(
      sql`select id from moments where id=${id} and owner_user_id=${user.uid} and status='ready'`,
    );
    if (!ready.rows.length)
      return void res.status(404).json({ error: "Moment not found" });
  }
  res.json({ success: true });
});
router.get("/moments/:id/play", async (req, res) => {
  const user = await owner(req);
  if (!user) return void res.status(401).json({ error: "Sign in required" });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id))
    return void res.status(400).json({ error: "Invalid Moment" });
  const row = (
    await db.execute<{ object_path: string }>(
      sql`select case when capture_mode='live-gift-v1' then object_path else coalesce(embedded_object_path, object_path) end as object_path from moments where id=${id} and owner_user_id=${user.uid} and status='ready'`,
    )
  ).rows[0];
  if (!row) return void res.status(404).json({ error: "Moment not found" });
  // Serve the saved bytes. Legacy finished clips remain playable, but no
  // recording is composed, re-encoded, or modified during playback.
  res.json({ url: await createPrivateGetUrl(row.object_path) });
});
router.delete("/moments/:id", async (req, res) => {
  const user = await owner(req);
  if (!user) return void res.status(401).json({ error: "Sign in required" });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id))
    return void res.status(400).json({ error: "Invalid Moment" });
  const row = (
    await db.execute<{
      object_path: string;
      embedded_object_path: string | null;
    }>(
      sql`select object_path, embedded_object_path from moments where id=${id} and owner_user_id=${user.uid}`,
    )
  ).rows[0];
  if (!row) return void res.status(404).json({ error: "Moment not found" });
  await db.execute(
    sql`update moments set status='deleted' where id=${id} and owner_user_id=${user.uid}`,
  );
  await deletePrivateObject(row.object_path);
  // Remove legacy derived objects as well as the original recording.
  await deletePrivateObject(
    row.embedded_object_path ?? `${row.object_path}.gift-v1.mp4`,
  );
  res.json({ success: true });
});
export default router;
