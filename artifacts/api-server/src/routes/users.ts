import { Router } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, usersTable, streamHistoryTable, followsTable } from "@workspace/db";

const router = Router();

router.get("/users/:uid", async (req, res) => {
  const uid = parseInt(req.params["uid"] ?? "", 10);
  if (isNaN(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  const rows = await db.select().from(usersTable).where(eq(usersTable.uid, uid)).limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: rows[0] });
});

router.put("/users/:uid", async (req, res) => {
  const uid = parseInt(req.params["uid"] ?? "", 10);
  if (isNaN(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  const { name, bio } = req.body as { name?: string; bio?: string };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const rows = await db
    .insert(usersTable)
    .values({ uid, name: name.trim(), bio: (bio ?? "").trim() })
    .onConflictDoUpdate({
      target: usersTable.uid,
      set: { name: name.trim(), bio: (bio ?? "").trim(), updatedAt: new Date() },
    })
    .returning();

  res.json({ user: rows[0] });
});

// Find-or-create a user by Clerk ID (called on every sign-in)
router.post("/users/clerk-sync", async (req, res) => {
  const { clerkId, name } = req.body as { clerkId?: string; name?: string };
  if (!clerkId || !name) {
    res.status(400).json({ error: "clerkId and name are required" });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);

  if (existing[0]) {
    // Update name in case they changed it in Clerk
    const updated = await db
      .update(usersTable)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    res.json({ user: updated[0] });
    return;
  }

  // Create new user — generate a random 5-digit numeric uid
  let uid: number;
  let attempts = 0;
  while (true) {
    uid = Math.floor(Math.random() * 90000) + 10000;
    const clash = await db.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.uid, uid)).limit(1);
    if (!clash[0]) break;
    if (++attempts > 10) { uid = Date.now() % 1_000_000; break; }
  }

  const rows = await db
    .insert(usersTable)
    .values({ uid, clerkId, name: name.trim(), bio: "" })
    .returning();

  res.json({ user: rows[0] });
});

router.post("/users/:uid/follow", async (req, res) => {
  const followedId = parseInt(req.params["uid"] ?? "", 10);
  const { followerUid } = req.body as { followerUid?: number };
  if (isNaN(followedId) || !followerUid || isNaN(followerUid)) {
    res.status(400).json({ error: "Invalid uid or followerUid" });
    return;
  }
  if (followerUid === followedId) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }

  const existing = await db
    .select()
    .from(followsTable)
    .where(and(eq(followsTable.followerId, followerUid), eq(followsTable.followedId, followedId)))
    .limit(1);

  if (existing[0]) {
    res.status(409).json({ error: "Already following" });
    return;
  }

  await db.insert(followsTable).values({ followerId: followerUid, followedId });

  await db
    .update(usersTable)
    .set({ followingCount: sql`${usersTable.followingCount} + 1` })
    .where(eq(usersTable.uid, followerUid));

  await db
    .update(usersTable)
    .set({ followersCount: sql`${usersTable.followersCount} + 1` })
    .where(eq(usersTable.uid, followedId));

  res.json({ success: true });
});

router.delete("/users/:uid/follow", async (req, res) => {
  const followedId = parseInt(req.params["uid"] ?? "", 10);
  const { followerUid } = req.body as { followerUid?: number };
  if (isNaN(followedId) || !followerUid || isNaN(followerUid)) {
    res.status(400).json({ error: "Invalid uid or followerUid" });
    return;
  }

  const deleted = await db
    .delete(followsTable)
    .where(and(eq(followsTable.followerId, followerUid), eq(followsTable.followedId, followedId)))
    .returning();

  if (!deleted[0]) {
    res.status(404).json({ error: "Not following" });
    return;
  }

  await db
    .update(usersTable)
    .set({ followingCount: sql`GREATEST(${usersTable.followingCount} - 1, 0)` })
    .where(eq(usersTable.uid, followerUid));

  await db
    .update(usersTable)
    .set({ followersCount: sql`GREATEST(${usersTable.followersCount} - 1, 0)` })
    .where(eq(usersTable.uid, followedId));

  res.json({ success: true });
});

router.get("/users/:uid/follow-status", async (req, res) => {
  const followedId = parseInt(req.params["uid"] ?? "", 10);
  const followerUid = parseInt((req.query["followerUid"] as string) ?? "", 10);
  if (isNaN(followedId) || isNaN(followerUid)) {
    res.status(400).json({ error: "Invalid uid or followerUid" });
    return;
  }

  const row = await db
    .select()
    .from(followsTable)
    .where(and(eq(followsTable.followerId, followerUid), eq(followsTable.followedId, followedId)))
    .limit(1);

  res.json({ isFollowing: !!row[0] });
});

router.get("/users/:uid/streams", async (req, res) => {
  const uid = parseInt(req.params["uid"] ?? "", 10);
  if (isNaN(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  const history = await db
    .select()
    .from(streamHistoryTable)
    .where(eq(streamHistoryTable.hostUid, uid))
    .orderBy(desc(streamHistoryTable.startedAt))
    .limit(30);

  res.json({ streams: history });
});

export default router;
