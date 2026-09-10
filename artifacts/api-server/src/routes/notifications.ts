import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, notificationPreferencesTable } from "@workspace/db";

export const notificationDefaults = {
  enabled: true,
  previews: true,
  messages: true,
  live: true,
  privateInvitations: true,
  gifts: true,
  followers: true,
  posts: true,
};
const router = Router();
async function viewer(req: Parameters<typeof getAuth>[0]) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  return (
    (
      await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkId, userId))
        .limit(1)
    )[0] ?? null
  );
}
async function preferences(uid: number) {
  const [row] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, uid));
  return Object.fromEntries(
    Object.entries(notificationDefaults).map(([key, fallback]) => [
      key,
      typeof row?.preferences[key] === "boolean"
        ? row.preferences[key]
        : fallback,
    ]),
  ) as typeof notificationDefaults;
}
router.get("/notification-preferences", async (req, res) => {
  const user = await viewer(req);
  if (!user)
    return void res
      .status(401)
      .json({ error: "Sign in to manage notifications." });
  res.set("Cache-Control", "no-store").json(await preferences(user.uid));
});
router.patch("/notification-preferences", async (req, res) => {
  const user = await viewer(req);
  if (!user)
    return void res
      .status(401)
      .json({ error: "Sign in to manage notifications." });
  const patch = req.body;
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    !Object.keys(patch).length ||
    Object.entries(patch).some(
      ([key, value]) =>
        !Object.hasOwn(notificationDefaults, key) || typeof value !== "boolean",
    )
  ) {
    return void res
      .status(400)
      .json({ error: "Invalid notification preferences." });
  }
  await db
    .insert(notificationPreferencesTable)
    .values({ userId: user.uid, preferences: patch })
    .onConflictDoUpdate({
      target: notificationPreferencesTable.userId,
      set: {
        preferences: sql`${notificationPreferencesTable.preferences} || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      },
    });
  res.json(await preferences(user.uid));
});
router.get("/notifications/in-app", async (req, res) => {
  const user = await viewer(req);
  if (!user)
    return void res
      .status(401)
      .json({ error: "Sign in to receive notifications." });
  const now = Date.now();
  const settings = await preferences(user.uid);
  if (req.query.since === undefined)
    return void res
      .set("Cache-Control", "no-store")
      .json({ notifications: [], cursor: now, preferences: settings });
  const cursor =
    typeof req.query.since === "string" ? Number(req.query.since) : NaN;
  if (!Number.isFinite(cursor) || cursor < 0 || cursor > now + 60_000)
    return void res.status(400).json({ error: "Invalid notification cursor." });
  if (!settings.enabled)
    return void res.json({
      notifications: [],
      cursor: now,
      preferences: settings,
    });
  const since = new Date(Math.max(cursor - 30_000, now - 300_000));
  const uid = user.uid;
  const enabledCategories = Object.keys(settings).filter(
    (key) =>
      settings[key as keyof typeof settings] &&
      !["enabled", "previews"].includes(key),
  );
  // Read committed activity already owned by this recipient. The short overlap covers
  // transaction/poll timing; clients deduplicate stable IDs and skip launch history.
  const events = await db.execute(sql`
    WITH events AS (
      SELECT 'dm:' || m.id AS id, CASE WHEN m.kind = 'private_stream_invitation' THEN 'privateInvitations' ELSE 'messages' END AS category,
        m.from_user_id AS actor, m.created_at AS happened_at,
        CASE WHEN m.kind = 'private_stream_invitation' THEN 'Private live invitation' ELSE 'New message' END AS title,
        CASE WHEN m.kind = 'text' THEN left(m.text, 140) WHEN m.kind = 'private_stream_invitation' THEN 'Invited you to a private live' ELSE 'Sent you media' END AS body,
        '/dm/' || m.from_user_id AS route
      FROM direct_messages m LEFT JOIN private_stream_invitations i ON i.id=m.private_stream_invitation_id
      WHERE m.to_user_id=${uid} AND m.created_at > ${since} AND m.read_at IS NULL
        AND (m.kind <> 'private_stream_invitation' OR (i.status='pending' AND i.expires_at > now()))
      UNION ALL
      SELECT 'follow:' || f.follower_id || ':' || extract(epoch from f.created_at), 'followers', f.follower_id, f.created_at,
        'New follower', 'Started following you', '/profile/' || f.follower_id
      FROM follows f WHERE f.followed_id=${uid} AND f.created_at > ${since}
      UNION ALL
      SELECT 'gift:' || c.id, 'gifts', c.from_user_id, c.created_at, 'Gifts and earnings',
        'You received ' || c.amount || ' coins in a DM', '/dm/' || c.from_user_id
      FROM coin_transactions c WHERE c.to_user_id=${uid} AND c.amount > 0 AND c.created_at > ${since}
        AND c.type='gift' AND c.channel_id IS NULL AND c.from_user_id IS NOT NULL
        AND (nullif(c.gift_name, '') IS NOT NULL OR EXISTS (
          SELECT 1 FROM direct_media_purchases purchase JOIN direct_messages message ON message.id=purchase.message_id
          WHERE purchase.idempotency_key=c.idempotency_key AND purchase.buyer_user_id=c.from_user_id
            AND message.from_user_id=c.to_user_id AND message.to_user_id=c.from_user_id
        ))
      UNION ALL
      SELECT 'comment:' || c.id, 'posts', c.user_id, c.created_at, 'New comment', left(c.text,140), '/posts/' || p.owner_user_id
      FROM post_comments c JOIN posts p ON p.id=c.post_id WHERE p.owner_user_id=${uid} AND c.created_at > ${since}
      UNION ALL
      SELECT 'like:' || r.post_id || ':' || r.user_id || ':' || extract(epoch from r.created_at), 'posts', r.user_id, r.created_at,
        'New like', 'Liked your post', '/posts/' || p.owner_user_id
      FROM post_reactions r JOIN posts p ON p.id=r.post_id WHERE p.owner_user_id=${uid} AND r.kind='like' AND r.created_at > ${since}
      UNION ALL
      SELECT 'live:' || s.id, 'live', s.host_user_id, s.started_at, CASE WHEN s.required_gift_id IS NOT NULL THEN 'Premium live' ELSE 'Live now' END, left(s.title,140), '/stream/' || s.channel_id
      FROM live_stream_sessions s JOIN follows f ON f.followed_id=s.host_user_id AND f.follower_id=${uid}
      WHERE s.started_at > ${since} AND s.ended_at IS NULL AND s.last_heartbeat_at > now()-interval '60 seconds'
        AND NOT s.is_private
        AND NOT EXISTS (SELECT 1 FROM creator_blocks b WHERE b.host_user_id=s.host_user_id AND b.viewer_user_id=${uid})

    )
    SELECT e.*, u.name AS actor_name FROM events e LEFT JOIN users u ON u.uid=e.actor
    WHERE e.category = ANY(ARRAY[${sql.join(
      enabledCategories.map((category) => sql`${category}`),
      sql`, `,
    )}]::text[]) AND (e.actor IS NULL OR e.actor<>${uid}) AND NOT EXISTS (
      SELECT 1 FROM user_blocks b WHERE (b.blocker_user_id=${uid} AND b.blocked_user_id=e.actor) OR (b.blocked_user_id=${uid} AND b.blocker_user_id=e.actor)
    ) ORDER BY happened_at DESC, id DESC LIMIT 100
  `);
  const notifications = events.rows
    .filter((event) => settings[event.category as keyof typeof settings])
    .map((event) => ({
      id: String(event.id),
      category: String(event.category),
      title: String(event.title),
      body:
        settings.previews ||
        !["messages", "posts"].includes(String(event.category))
          ? `${event.actor_name ? `${event.actor_name}: ` : ""}${event.body}`
          : "Open Pulse to view it.",
      route: String(event.route),
      createdAt: new Date(event.happened_at as string).getTime(),
    }));
  res
    .set("Cache-Control", "no-store")
    .json({ notifications, cursor: now, preferences: settings });
});
export default router;
