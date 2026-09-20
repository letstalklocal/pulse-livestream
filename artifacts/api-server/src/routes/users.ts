import { hasVipAccess } from "../lib/vipAccess";
import { getAuth } from "@clerk/express";
import { signupEligibility, SIGNUP_TERMS_VERSION } from "../lib/signupEligibility";
import { countryName } from "../lib/countryLocation";
import { canViewPosts, privacyPreferences, redactProfileLocation } from "../lib/privacy";
import { authenticatedUser } from "../lib/streamModeration";
import { contactBlocked } from "../lib/userSafety";
import { Router } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, usersTable, userOnboardingTable, streamHistoryTable, followsTable } from "@workspace/db";
import { createPrivateGetUrl, createPrivateUploadUrl } from "../lib/objectStorage";

const router = Router();
router.use("/users/:uid", async (req, res, next) => {
  const user = await authenticatedUser(req);
  const uid = Number(req.params.uid);
  if (user && Number.isInteger(uid) && await contactBlocked(user.uid, uid)) return void res.status(404).json({ error: "Account not available" });
  next();
});


async function withUserImageUrls(user: typeof usersTable.$inferSelect) {
  return {
    ...redactProfileLocation({ ...user, country: countryName(user.countryCode) }, (await privacyPreferences(user.uid)).hideLocation),
    avatarImageUrl: user.avatarImagePath
      ? await createPrivateGetUrl(user.avatarImagePath)
      : null,
    streamBackgroundImageUrl: user.streamBackgroundImagePath
      ? await createPrivateGetUrl(user.streamBackgroundImagePath)
      : null,
  };
}

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
  res.json({ user: await withUserImageUrls(rows[0]) });
});

router.put("/users/:uid", async (req, res) => {
  const uid = parseInt(req.params["uid"] ?? "", 10);
  if (isNaN(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  const { name, bio, avatarImagePath, streamBackgroundImagePath } = req.body as {
    name?: string;
    bio?: string;
    avatarImagePath?: string | null;
    streamBackgroundImagePath?: string | null;
  };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const actor = await authenticatedUser(req);
  if (!actor) return void res.status(401).json({ error: "Authentication required" });
  if (actor.uid !== uid) return void res.status(403).json({ error: "You can only update your own profile" });
  // Updates cannot create an account or bypass signup eligibility.
  const rows = await db.update(usersTable).set({
    name: name.trim(), bio: (bio ?? "").trim(),
    ...(avatarImagePath !== undefined ? { avatarImagePath } : {}),
    ...(streamBackgroundImagePath !== undefined ? { streamBackgroundImagePath } : {}),
    updatedAt: new Date(),
  }).where(eq(usersTable.uid, uid)).returning();
  if (!rows[0]) return void res.status(404).json({ error: "User not found" });

  res.json({ user: await withUserImageUrls(rows[0]!) });
});

router.post("/users/:uid/avatar/upload", async (req, res) => {
  const uid = parseInt(req.params["uid"] ?? "", 10);
  if (isNaN(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  try {
    res.status(201).json(await createPrivateUploadUrl());
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Upload URL could not be created",
    });
  }
});

router.post("/users/:uid/stream-background/upload", async (req, res) => {
  const uid = parseInt(req.params["uid"] ?? "", 10);
  if (isNaN(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  try {
    res.status(201).json(await createPrivateUploadUrl());
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Upload URL could not be created",
    });
  }
});

// The authenticated identity owns the account; a body-supplied ID is never authority.
router.post("/users/clerk-sync", async (req, res) => {
  const clerkId = getAuth(req).userId;
  if (!clerkId) return void res.status(401).json({ error: "Authentication required" });
  const { clerkId: claimedId, name, onboarding } = req.body ?? {};
  if (claimedId !== undefined && claimedId !== clerkId) return void res.status(403).json({ error: "Account mismatch" });
  if (typeof name !== "string" || !name.trim() || name.length > 200) return void res.status(400).json({ error: "A valid name is required" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const result = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clerkId}))`);
      const [existing] = await tx.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
      // Preserve existing profiles. Legacy-account onboarding is a separate rollout.
      if (existing) return { user: existing };
      const error = signupEligibility(onboarding);
      if (error) return { error };
      for (let attempt = 0; attempt < 20; attempt++) {
        const uid = Math.floor(Math.random() * 90000) + 10000;
        const [user] = await tx.insert(usersTable).values({ uid, clerkId, name: name.trim(), bio: "" }).onConflictDoNothing().returning();
        if (!user) continue;
        await tx.insert(userOnboardingTable).values({ userId: uid, dateOfBirth: onboarding.dateOfBirth, termsVersion: SIGNUP_TERMS_VERSION });
        return { user };
      }
      throw new Error("Account allocation unavailable");
    });
    if (result.error) return void res.status(422).json({ code: "ONBOARDING_REQUIRED", error: result.error, termsVersion: SIGNUP_TERMS_VERSION });
    res.json({ user: await withUserImageUrls(result.user!) });
  } catch {
    // Do not log birthdays, submitted declarations or database parameter values.
    res.status(503).json({ error: "Your account could not be saved. Please try again." });
  }
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

for (const direction of ["following", "followers"] as const) {
  router.get(`/users/:uid/${direction}`, async (req, res) => {
    const uid = Number(req.params["uid"]);
    if (!Number.isInteger(uid) || uid <= 0) {
      res.status(400).json({ error: "Invalid uid" });
      return;
    }
    const viewer = await authenticatedUser(req);
    if (!viewer) return void res.status(401).json({ error: "Sign in required" });
    res.setHeader("Cache-Control", "private, no-store");
    if (viewer.uid !== uid) {
      try {
        if (!await hasVipAccess(viewer.uid)) {
          return void res.status(403).json({ error: "Pulse VIP is required to view these lists", code: "VIP_REQUIRED" });
        }
      } catch {
        return void res.status(503).json({ error: "VIP status could not be verified. Please try again.", code: "VIP_UNAVAILABLE" });
      }
    }
    const personId = direction === "following" ? followsTable.followedId : followsTable.followerId;
    const ownerId = direction === "following" ? followsTable.followerId : followsTable.followedId;
    const rows = await db
      .select({ uid: usersTable.uid, name: usersTable.name, bio: usersTable.bio, avatarImagePath: usersTable.avatarImagePath,
        ...(direction === "following" ? {
          postIds: sql<number[]>`coalesce((select json_agg(id order by id desc) from posts where owner_user_id = ${usersTable.uid}), '[]'::json)`,
        } : {}),
      })
      .from(followsTable)
      .innerJoin(usersTable, eq(usersTable.uid, personId))
      .where(eq(ownerId, uid))
      .orderBy(usersTable.name, usersTable.uid);
    const unblocked = await Promise.all(rows.map(async row => await contactBlocked(viewer.uid, row.uid) ? null : row));
    const allowedRows = unblocked.filter((row): row is NonNullable<typeof row> => row !== null);
    const visibleRows = await Promise.all(allowedRows.map(async row => ({ ...row, ...("postIds" in row && !await canViewPosts(row.uid, viewer.uid) ? { postIds: [] } : {}) })));
    const users = await Promise.all(visibleRows.map(async ({ avatarImagePath, ...user }) => ({
      ...user,
      avatarImageUrl: avatarImagePath ? await createPrivateGetUrl(avatarImagePath) : null,
    })));
    res.json({ users });
  });
}

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
