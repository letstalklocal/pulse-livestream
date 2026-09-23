import { Router } from "express";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authenticatedUser } from "../lib/streamModeration";
import { contactBlocked } from "../lib/userSafety";
import { availableCreatorVideo as available } from "../lib/creatorVideoAccess";
import { createPrivateGetUrl } from "../lib/objectStorage";
import { validateStickers, StickerError } from "../lib/liveStickers";
import { purchaseMediaPack } from "../lib/mediaPackPurchase";
import {
  bunnyConfig,
  bunnyRequest,
  signedVideoUpload,
} from "../lib/bunnyStream";

const router = Router();
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const wrap =
  (fn: (req: any, res: any, user: any) => Promise<any>) =>
  async (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    try {
      const user = await authenticatedUser(req);
      if (!user) return res.status(401).json({ error: "Sign in required." });
      if (req.params.id && !uuid(req.params.id))
        return res.status(400).json({ error: "Invalid video." });
      await fn(req, res, user);
    } catch (error) {
      req.log?.error({ err: error }, "Creator video request failed");
      if (!res.headersSent)
        res
          .status(503)
          .json({ error: "Video service unavailable. Try again." });
    }
  };
// All settings changes serialize with the live-session insert using this account lock.
export async function lockVideoOwner(tx: any, uid: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(190918, ${uid})`);
}
export async function disableVideoBeforeLive(tx: any, uid: number) {
  await lockVideoOwner(tx, uid);
  await tx.execute(
    sql`update creator_video_settings set enabled=false where owner_user_id=${uid}`,
  );
}
async function owned(id: string, uid: number) {
  return (
    await db.execute(
      sql`select * from creator_videos where id=${id} and owner_user_id=${uid}`,
    )
  ).rows[0] as any;
}

function present(row: any) {
  return {
    id: row.id,
    ownerUid: row.owner_user_id,
    ownerName: row.ownerName,
    filename: row.filename,
    status: row.status,
    playbackUrl: row.playback_url,
    thumbnailUrl: row.thumbnail_url,
    durationSeconds: row.duration_seconds,
    stickers: Array.isArray(row.stickers) ? row.stickers : [],
    createdAt: row.created_at,
  };
}
const stickerRows = async (video: any, uid: number) => {
  const stickers = Array.isArray(video.stickers) ? video.stickers : [];
  const rows = await Promise.all(stickers.map(async (sticker: any) => {
    const gift = gifts[sticker.giftId];
    if (!gift) return null;
    if (sticker.kind === "gift") return { ...sticker, name: gift.name, price: gift.coins, videos: 0, pictures: 0, owned: false };
    const pack = (await db.execute(sql`select p.id,p.name,p.coin_price,p.gift_id,
      exists(select 1 from media_pack_purchases x where x.pack_id=p.id and x.buyer_user_id=${uid}) as owned,
      count(i.id) filter(where i.content_type like 'video/%')::int as videos,
      count(i.id) filter(where i.content_type like 'image/%')::int as pictures
      from media_packs p left join media_pack_items i on i.pack_id=p.id
      where p.id=${sticker.packId} and p.owner_user_id=${video.owner_user_id} group by p.id`)).rows[0] as any;
    return pack ? { ...sticker, giftId: pack.gift_id, name: pack.name, price: pack.coin_price, videos: pack.videos, pictures: pack.pictures, owned: pack.owned } : null;
  }));
  return rows.filter(Boolean);
};
router.get(
  "/creator-videos/library",
  wrap(async (_req, res, user) => {
    const videos = await db.execute(
      sql`select * from creator_videos where owner_user_id=${user.uid} order by created_at desc`,
    );
    const settings = (
      await db.execute(
        sql`select * from creator_video_settings where owner_user_id=${user.uid}`,
      )
    ).rows[0] as any;
    res.json({
      videos: videos.rows.map(present),
      selectedId: settings?.selected_video_id ?? null,
      enabled: settings?.enabled ?? false,
      uploadsConfigured: !!bunnyConfig(),
    });
  }),
);
router.post(
  "/creator-videos/uploads",
  wrap(async (req, res, user) => {
    if (!bunnyConfig())
      return res
        .status(503)
        .json({ error: "Video uploads are not configured yet." });
    const { filename, bytes } = req.body ?? {};
    if (
      typeof filename !== "string" ||
      !filename.trim() ||
      filename.length > 200 ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > 256 * 1024 * 1024
    )
      return res
        .status(400)
        .json({ error: "Choose a video smaller than 256 MB." });
    const pending = await db.execute(
      sql`select count(*)::int as n from creator_videos where owner_user_id=${user.uid} and status='uploading' and created_at>now()-interval '2 hours'`,
    );
    if (Number(pending.rows[0].n) >= 3)
      return res
        .status(429)
        .json({ error: "Finish your current upload before starting another." });
    const remote = await bunnyRequest("", "POST", { title: filename });
    if (!uuid(remote.guid)) throw new Error("Invalid provider video id");
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await lockVideoOwner(tx, user.uid);
      await tx.execute(
        sql`insert into creator_videos(id,owner_user_id,bunny_id,filename) values(${id},${user.uid},${remote.guid},${filename.trim()})`,
      );
      await tx.execute(sql`insert into creator_video_settings(owner_user_id,pending_video_id,enabled) values(${user.uid},${id},false)
        on conflict(owner_user_id) do update set pending_video_id=excluded.pending_video_id`);
    });
    res.status(201).json({ id, ...signedVideoUpload(remote.guid) });
  }),
);
router.post(
  "/creator-videos/:id/refresh",
  wrap(async (req, res, user) => {
    const video = await owned(req.params.id, user.uid);
    if (!video) return res.status(404).json({ error: "Video not found." });
    if (video.status === "ready" || video.status === "failed")
      return res.json(present(video));
    const remote = await bunnyRequest(`/${video.bunny_id}`);
    let status = [5, 6].includes(remote.status)
      ? "failed"
      : remote.status === 0
        ? "uploading"
        : "processing";
    let playback: string | null = null,
      thumbnail: string | null = null;
    if (remote.status === 4) {
      const rotated = [90, 270].includes(
        Math.abs(Number(remote.rotation ?? 0)) % 360,
      );
      const width = rotated ? remote.height : remote.width,
        height = rotated ? remote.width : remote.height;
      if (
        !(width > 0 && height > 0 && Math.abs(width / height - 9 / 16) < 0.025)
      )
        status = "failed";
      else if (remote.hasMP4Fallback) {
        const levels = String(remote.availableResolutions)
          .split(",")
          .map((value) =>
            /^\d+p?$/.test(value.trim())
              ? Number(value.trim().replace(/p$/, ""))
              : NaN,
          )
          .filter((x) => [240, 360, 480, 720, 1080].includes(x));
        const level =
          levels.filter((x) => x <= 720).sort((a, b) => b - a)[0] ??
          levels.sort((a, b) => a - b)[0];
        if (level) {
          const base = `https://${bunnyConfig()!.hostname}/${video.bunny_id}`;
          playback = `${base}/play_${level}p.mp4`;
          thumbnail = `${base}/${encodeURIComponent(remote.thumbnailFileName || "thumbnail.jpg")}`;
          // A ready flag must not publish a missing or oversized cache file.
          const check = await fetch(playback, {
            method: "HEAD",
            signal: AbortSignal.timeout(15_000),
          });
          if (
            check.ok &&
            Number(check.headers.get("content-length")) > 0 &&
            Number(check.headers.get("content-length")) <= 256 * 1024 * 1024
          )
            status = "ready";
        }
      }
    }
    const rows = await db.transaction(async (tx) => {
      await lockVideoOwner(tx, user.uid);
      const result = await tx.execute(
        sql`update creator_videos set status=${status}, playback_url=${playback}, thumbnail_url=${thumbnail}, duration_seconds=${Math.max(0, Math.round(Number(remote.length) || 0))} where id=${video.id} and status not in ('ready','failed') returning *`,
      );
      if (result.rows.length && status === "ready") {
        await tx.execute(
          sql`update creator_video_settings set selected_video_id=${video.id},pending_video_id=null,enabled=false where owner_user_id=${user.uid} and pending_video_id=${video.id}`,
        );
      }
      return result.rows.length
        ? result
        : tx.execute(sql`select * from creator_videos where id=${video.id}`);
    });
    if (!rows.rows[0])
      return res.status(404).json({ error: "Video not found." });
    const encodingProgress =
      typeof remote.encodeProgress === "number" && Number.isFinite(remote.encodeProgress)
        ? Math.min(100, Math.max(0, Math.round(remote.encodeProgress)))
        : null;
    res.json({ ...present(rows.rows[0]), encodingProgress });
  }),
);
// Only incomplete uploads can be removed here; ready history and its stats stay saved.
router.delete(
  "/creator-videos/:id",
  wrap(async (req, res, user) => {
    const outcome = await db.transaction(async (tx) => {
      await lockVideoOwner(tx, user.uid);
      const video = (
        await tx.execute(sql`select * from creator_videos where id=${req.params.id} and owner_user_id=${user.uid} for update`)
      ).rows[0];
      if (!video) return 404;
      if (video.status === "ready") return 409;
      await bunnyRequest(`/${video.bunny_id}`, "DELETE");
      // Foreign keys clear only pointers to this upload, preserving other selections.
      await tx.execute(sql`delete from creator_videos where id=${video.id} and owner_user_id=${user.uid}`);
      return 200;
    });
    res.status(outcome).json(
      outcome === 200
        ? { removed: true }
        : { error: outcome === 409 ? "This video is ready and saved in your history." : "Video not found." },
    );
  }),
);
router.put(
  "/creator-videos/selection",
  wrap(async (req, res, user) => {
    const id = req.body?.id;
    if (!uuid(id)) return res.status(400).json({ error: "Invalid video." });
    const result = await db.transaction(async (tx) => {
      await lockVideoOwner(tx, user.uid);
      const video = await tx.execute(
        sql`select id from creator_videos where id=${id} and owner_user_id=${user.uid} and status='ready'`,
      );
      if (!video.rows[0]) return false;
      await tx.execute(sql`insert into creator_video_settings(owner_user_id,selected_video_id,enabled) values(${user.uid},${id},false)
      on conflict(owner_user_id) do update set selected_video_id=excluded.selected_video_id, pending_video_id=null, enabled=false`);
      return true;
    });
    res
      .status(result ? 200 : 404)
      .json(
        result
          ? { selectedId: id, enabled: false }
          : { error: "Video not found." },
      );
  }),
);
router.put(
  "/creator-videos/visibility",
  wrap(async (req, res, user) => {
    if (typeof req.body?.enabled !== "boolean")
      return res.status(400).json({ error: "Invalid visibility." });
    const enabled = req.body.enabled;
    const ok = await db.transaction(async (tx) => {
      await lockVideoOwner(tx, user.uid);
      if (enabled) {
        const live = await tx.execute(
          sql`select id from live_stream_sessions where host_user_id=${user.uid} and ended_at is null and last_heartbeat_at>now()-interval '90 seconds' limit 1`,
        );
        if (live.rows.length) return false;
      }
      const result =
        await tx.execute(sql`update creator_video_settings s set enabled=${enabled} where owner_user_id=${user.uid}
      and exists(select 1 from creator_videos v where v.id=s.selected_video_id and v.owner_user_id=${user.uid} and v.status='ready') returning owner_user_id`);
      return !!result.rows.length;
    });
    res.status(ok ? 200 : 409).json(
      ok
        ? { enabled }
        : {
            error:
              "Select an uploaded video and finish your live before enabling it.",
          },
    );
  }),
);
router.get(
  "/creator-videos/feed",
  wrap(async (_req, res, user) => {
    const rows =
      await db.execute(sql`select v.*, u.name as "ownerName" from creator_videos v join creator_video_settings s on s.selected_video_id=v.id and s.enabled
    join users u on u.uid=v.owner_user_id where v.status='ready'
    and not exists(select 1 from live_stream_sessions l where l.host_user_id=v.owner_user_id and l.ended_at is null and l.last_heartbeat_at>now()-interval '90 seconds')
    order by v.created_at desc limit 100`);
    const permitted = [];
    for (const row of rows.rows as any[])
      if (!(await contactBlocked(user.uid, row.owner_user_id)))
        permitted.push(present(row));
    res.json({ videos: permitted });
  }),
);
router.get("/creator-videos/:id/stickers", wrap(async (req, res, user) => {
  const video = await available(req.params.id, user.uid);
  if (!video) return res.status(404).json({ error: "Video not found." });
  res.json({ ownerUid: video.owner_user_id, stickers: await stickerRows(video, user.uid) });
}));
router.put("/creator-videos/:id/stickers", wrap(async (req, res, user) => {
  const stickers = await db.transaction(async tx => {
    await lockVideoOwner(tx, user.uid);
    const row = (await tx.execute(sql`select * from creator_videos where id=${req.params.id} and owner_user_id=${user.uid} for update`)).rows[0] as any;
    if (!row) return null;
    const drafts = req.body?.stickers;
    if (!Array.isArray(drafts) || drafts.filter((sticker: any) => sticker?.kind === "gift").length > 1 || drafts.filter((sticker: any) => sticker?.kind === "pack").length > 1)
      throw new StickerError(400, "A video can have one gift sticker and one pack sticker");
    const value = await validateStickers(drafts, user.uid);
    await tx.execute(sql`update creator_videos set stickers=${JSON.stringify(value)}::jsonb where id=${row.id}`);
    return value;
  });
  if (!stickers) return res.status(404).json({ error: "Video not found." });
  res.json({ stickers });
}));
router.post("/creator-videos/:id/stickers/:stickerId/unlock", wrap(async (req, res, user) => {
  const packId = Number(req.body?.packId), expectedPrice = req.body?.expectedPrice;
  if (!Number.isSafeInteger(packId) || !Number.isSafeInteger(expectedPrice) || expectedPrice <= 0 || !uuid(req.body?.idempotencyKey)) return res.status(400).json({ error: "Invalid sticker purchase." });
  try {
    const result = await purchaseMediaPack(user, packId, req.body.idempotencyKey, undefined, expectedPrice, { videoId: req.params.id, stickerId: req.params.stickerId });
    res.json({ balance: result.balance });
  } catch (error) {
    if (error instanceof StickerError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));
router.get(
  "/creator-videos/:id",
  wrap(async (req, res, user) => {
    const video = await available(req.params.id, user.uid);
    if (!video) return res.status(404).json({ error: "Video not found." });
    const counts = (
      await db.execute(sql`select
    (select count(distinct viewer_user_id)::int from creator_video_views where video_id=${video.id} and last_seen_at>now()-interval '30 seconds' and viewer_user_id<>${video.owner_user_id}) as viewers,
    (select coalesce(sum(t.amount),0)::int from creator_video_gifts g join coin_transactions t on t.id=g.transaction_id where g.video_id=${video.id}) as coins`)
    ).rows[0];
    res.json({ ...present(video), ...counts });
  }),
);
router.get(
  "/creator-videos/:id/viewers",
  wrap(async (req, res, user) => {
    const video = await available(req.params.id, user.uid);
    if (!video) return res.status(404).json({ error: "Video not found." });
    const isOwner = video.owner_user_id === user.uid;
    const [people, totals] = await Promise.all([
      db.execute(sql`with present as (
        select distinct viewer_user_id as uid from creator_video_views
        where video_id=${video.id} and viewer_user_id<>${video.owner_user_id}
          and last_seen_at>now()-interval '30 seconds'
      ), gifters as (
        select t.from_user_id as uid,sum(t.amount)::int as coins,count(*)::int as gifts
        from creator_video_gifts g join coin_transactions t on t.id=g.transaction_id
        where g.video_id=${video.id} group by t.from_user_id
      )
      select u.uid,u.name,u.avatar_image_path,coalesce(g.coins,0)::int as coins,
        coalesce(g.gifts,0)::int as gifts,(p.uid is not null) as watching
      from users u left join present p on p.uid=u.uid left join gifters g on g.uid=u.uid
      where (g.uid is not null or (${isOwner} and p.uid is not null))
        and not exists(select 1 from user_blocks b where
          (b.blocker_user_id=${user.uid} and b.blocked_user_id=u.uid) or
          (b.blocked_user_id=${user.uid} and b.blocker_user_id=u.uid))
      order by coalesce(g.coins,0) desc,u.name,u.uid`),
      db.execute(sql`select
        (select count(distinct viewer_user_id)::int from creator_video_views where video_id=${video.id}
          and viewer_user_id<>${video.owner_user_id} and last_seen_at>now()-interval '30 seconds') as viewers,
        (select coalesce(sum(t.amount),0)::int from creator_video_gifts g join coin_transactions t on t.id=g.transaction_id where g.video_id=${video.id}) as coins`),
    ]);
    const entries = await Promise.all(people.rows.map(async (person) => ({
      uid: person.uid, name: person.name, coins: person.coins, gifts: person.gifts,
      avatarImageUrl: person.avatar_image_path ? await createPrivateGetUrl(String(person.avatar_image_path)) : null,
      // Audience gets gift rankings only, without individual presence information.
      ...(isOwner ? { watching: person.watching } : {}),
    })));
    res.json({ ...totals.rows[0], isOwner, entries });
  }),
);
router.get(
  "/creator-videos/:id/stats",
  wrap(async (req, res, user) => {
    if (!(await owned(req.params.id, user.uid)))
      return res.status(404).json({ error: "Video not found." });
    const id = req.params.id;
    const totals = (
      await db.execute(sql`select count(distinct viewer_user_id)::int as viewers, count(*)::int as sessions,
    coalesce(round(avg(watched_seconds)),0)::int as "averageWatchSeconds" from creator_video_views where video_id=${id} and viewer_user_id<>${user.uid} and watched_seconds>0`)
    ).rows[0];
    const gifts = (
      await db.execute(sql`select t.id,t.from_user_id as "senderUid",u.name as "senderName",t.gift_name as "giftName",t.amount,t.created_at as "createdAt"
    from creator_video_gifts g join coin_transactions t on t.id=g.transaction_id left join users u on u.uid=t.from_user_id
    where g.video_id=${id} order by t.created_at desc limit 200`)
    ).rows;
    const senders = (
      await db.execute(sql`select t.from_user_id as "senderUid",u.name as "senderName",sum(t.amount)::int as coins,count(*)::int as gifts
    from creator_video_gifts g join coin_transactions t on t.id=g.transaction_id left join users u on u.uid=t.from_user_id
    where g.video_id=${id} group by t.from_user_id,u.name order by sum(t.amount) desc`)
    ).rows;
    const total = senders.reduce((n, row) => n + Number(row.coins), 0);
    res.json({ ...totals, coins: total, senders, gifts });
  }),
);
router.post(
  "/creator-videos/:id/views",
  wrap(async (req, res, user) => {
    const video = await available(req.params.id, user.uid);
    if (!video) return res.status(404).json({ error: "Video not found." });
    const { sessionId, watchedSeconds } = req.body ?? {};
    if (
      !uuid(sessionId) ||
      !Number.isSafeInteger(watchedSeconds) ||
      watchedSeconds < 0
    )
      return res.status(400).json({ error: "Invalid viewing session." });
    const result =
      await db.execute(sql`insert into creator_video_views(id,video_id,viewer_user_id,watched_seconds)
    values(${sessionId},${video.id},${user.uid},0)
    on conflict(id) do update set watched_seconds=greatest(creator_video_views.watched_seconds,
      least(${watchedSeconds},creator_video_views.watched_seconds+least(15,greatest(0,extract(epoch from now()-creator_video_views.last_seen_at)::int)))),last_seen_at=now()
    where creator_video_views.video_id=${video.id} and creator_video_views.viewer_user_id=${user.uid} returning id`);
    res
      .status(result.rows.length ? 200 : 409)
      .json({ ok: !!result.rows.length });
  }),
);
router.delete(
  "/creator-videos/:id/views/:sessionId",
  wrap(async (req, res, user) => {
    if (!uuid(req.params.sessionId))
      return res.status(400).json({ error: "Invalid viewing session." });
    await db.execute(
      sql`update creator_video_views set last_seen_at=now()-interval '31 seconds' where id=${req.params.sessionId} and video_id=${req.params.id} and viewer_user_id=${user.uid}`,
    );
    res.json({ ok: true });
  }),
);
router.get(
  "/creator-videos/:id/chat",
  wrap(async (req, res, user) => {
    if (!(await available(req.params.id, user.uid)))
      return res.status(404).json({ error: "Video not found." });
    const messages =
      await db.execute(sql`select c.id,c.sender_user_id as "senderUid",u.name as "senderName",c.message,c.created_at as "createdAt"
    from creator_video_chat c join users u on u.uid=c.sender_user_id where video_id=${req.params.id}
    and not exists(select 1 from user_blocks b where (b.blocker_user_id=${user.uid} and b.blocked_user_id=c.sender_user_id) or (b.blocked_user_id=${user.uid} and b.blocker_user_id=c.sender_user_id))
    order by c.id desc limit 100`);
    res.json({ messages: messages.rows.reverse() });
  }),
);
router.post(
  "/creator-videos/:id/chat",
  wrap(async (req, res, user) => {
    if (!(await available(req.params.id, user.uid)))
      return res.status(404).json({ error: "Video not found." });
    const message =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > 500 || !uuid(req.body?.clientId))
      return res.status(400).json({ error: "Invalid message." });
    const sent = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(190919,${user.uid})`);
      const prior = (
        await tx.execute(
          sql`select * from creator_video_chat where client_id=${req.body.clientId}`,
        )
      ).rows[0] as any;
      if (prior)
        return (
          prior.sender_user_id === user.uid &&
          prior.video_id === req.params.id &&
          prior.message === message
        );
      const recent = await tx.execute(
        sql`select count(*)::int as n from creator_video_chat where sender_user_id=${user.uid} and created_at>now()-interval '10 seconds'`,
      );
      if (Number(recent.rows[0].n) >= 8) return false;
      await tx.execute(
        sql`insert into creator_video_chat(video_id,sender_user_id,client_id,message) values(${req.params.id},${user.uid},${req.body.clientId},${message})`,
      );
      return true;
    });
    res
      .status(sent ? 200 : 429)
      .json(
        sent
          ? { ok: true }
          : { error: "Please wait before sending another message." },
      );
  }),
);
const gifts: Record<string, { name: string; coins: number }> = {
  rose: { name: "Rose", coins: 1 },
  heart: { name: "Heart", coins: 5 },
  party: { name: "Party", coins: 10 },
  strawberry: { name: "Strawberry", coins: 49 },
  diamond: { name: "Diamond", coins: 50 },
  lips: { name: "Lips", coins: 99 },
  rocket: { name: "Rocket", coins: 100 },
  crown: { name: "Crown", coins: 500 },
};
router.post(
  "/creator-videos/:id/gifts",
  wrap(async (req, res, user) => {
    const video = await available(req.params.id, user.uid);
    if (!video || video.owner_user_id === user.uid)
      return res.status(403).json({ error: "Gift unavailable." });
    const gift =
      typeof req.body?.giftId === "string" &&
      Object.hasOwn(gifts, req.body.giftId)
        ? gifts[req.body.giftId]
        : null;
    if (!gift || !uuid(req.body?.requestId))
      return res.status(400).json({ error: "Invalid gift." });
    const key = `video:${req.body.requestId}`;
    const result = await db.transaction(async (tx) => {
      await lockVideoOwner(tx, video.owner_user_id);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const prior = (
        await tx.execute(
          sql`select t.*,g.video_id from coin_transactions t join creator_video_gifts g on g.transaction_id=t.id where t.idempotency_key=${key}`,
        )
      ).rows[0] as any;
      if (prior)
        return prior.from_user_id === user.uid &&
          prior.video_id === video.id &&
          prior.amount === gift.coins
          ? { status: 200, balance: prior.balance_after }
          : { status: 409 };
      const enabled = await tx.execute(
        sql`select owner_user_id from creator_video_settings where owner_user_id=${video.owner_user_id} and enabled and selected_video_id=${video.id}`,
      );
      if (!enabled.rows.length) return { status: 409 };
      // Lock both existing wallet rows in a stable order to avoid reciprocal gift deadlocks.
      for (const uid of [user.uid, video.owner_user_id].sort((a, b) => a - b)) {
        await tx.execute(
          sql`insert into coin_balances(user_id,balance) values(${uid},0) on conflict do nothing`,
        );
        await tx.execute(
          sql`select user_id from coin_balances where user_id=${uid} for update`,
        );
      }
      const paid = await tx.execute(
        sql`update coin_balances set balance=balance-${gift.coins},updated_at=now() where user_id=${user.uid} and balance>=${gift.coins} returning balance`,
      );
      if (!paid.rows.length) return { status: 402 };
      await tx.execute(
        sql`update coin_balances set balance=balance+${gift.coins},updated_at=now() where user_id=${video.owner_user_id}`,
      );
      const transaction =
        await tx.execute(sql`insert into coin_transactions(from_user_id,to_user_id,amount,type,gift_name,description,idempotency_key,balance_after)
      values(${user.uid},${video.owner_user_id},${gift.coins},'gift',${gift.name},'Video gift',${key},${paid.rows[0].balance}) returning id`);
      await tx.execute(
        sql`insert into creator_video_gifts(transaction_id,video_id) values(${transaction.rows[0].id},${video.id})`,
      );
      return { status: 200, balance: paid.rows[0].balance };
    });
    res.status(result.status).json(
      result.status === 200
        ? { balance: result.balance }
        : {
            error:
              result.status === 402
                ? "Insufficient coins"
                : "Gift unavailable.",
          },
    );
  }),
);

export default router;
