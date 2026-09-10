import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, postsTable, usersTable, postReportsTable } from "@workspace/db";
import {
  createPrivateGetUrl,
  createPrivateUploadUrl,
  deletePrivateObject,
} from "../lib/objectStorage";

const router = Router();

async function currentUser(req: any) {
  const clerkId = req.auth?.()?.userId;
  if (!clerkId) return null;
  return (await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0] ?? null;
}

async function requireUser(req: any, res: any) {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}

async function postResponse(post: typeof postsTable.$inferSelect) {
  return {
    id: post.id,
    ownerUserId: post.ownerUserId,
    imageUrl: await createPrivateGetUrl(post.imageObjectPath),
    caption: post.caption,
    createdAt: post.createdAt,
  };
}

router.post("/posts/uploads", async (req, res) => {
  if (!await requireUser(req, res)) return;
  try {
    res.status(201).json(await createPrivateUploadUrl());
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Upload URL could not be created",
    });
  }
});

router.post("/posts", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const { imageObjectPath, caption } = req.body ?? {};
  if (
    typeof imageObjectPath !== "string" ||
    !imageObjectPath.startsWith("/objects/") ||
    typeof caption !== "string" ||
    caption.length > 2200
  ) {
    res.status(400).json({ error: "A valid image and caption are required" });
    return;
  }
  const [created] = await db.insert(postsTable).values({
    ownerUserId: user.uid,
    imageObjectPath,
    caption: caption.trim(),
  }).returning();
  res.status(201).json({ post: await postResponse(created!) });
});

router.get("/users/:uid/posts", async (req, res) => {
  const uid = Number(req.params.uid);
  if (!Number.isInteger(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.ownerUserId, uid))
    .orderBy(desc(postsTable.createdAt));
  res.json({ posts: await Promise.all(posts.map(postResponse)) });
});

router.post("/posts/:postId/reports", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const postId = Number(req.params.postId);
  const { reason, details = "" } = req.body ?? {};
  if (!Number.isInteger(postId) || postId <= 0 || postId > 2147483647 ||
    !["harassment", "spam", "sexual_content", "violence", "child_safety", "other"].includes(reason) ||
    typeof details !== "string" || details.length > 2000) {
    res.status(400).json({ error: "Choose a reason and keep details under 2,000 characters" });
    return;
  }
  const result = await db.transaction(async tx => {
    // Keep the post from disappearing between validation and report creation.
    const post = (await tx.select().from(postsTable).where(eq(postsTable.id, postId)).for("share"))[0];
    if (!post) return 404;
    if (post.ownerUserId === user.uid) return 400;
    await tx.insert(postReportsTable).values({ postId, reportedPostId: postId, ownerUserId: post.ownerUserId,
      reporterUserId: user.uid, reason, details: details.trim() }).onConflictDoNothing();
    return 201;
  });
  if (result === 404) return void res.status(404).json({ error: "Photo is no longer available" });
  if (result === 400) return void res.status(400).json({ error: "You cannot report your own photo" });
  res.status(201).json({ success: true });
});

router.delete("/posts/:postId", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const postId = Number(req.params.postId);
  const deleted = Number.isInteger(postId)
    ? await db.delete(postsTable).where(and(
        eq(postsTable.id, postId),
        eq(postsTable.ownerUserId, user.uid),
      )).returning()
    : [];
  if (!deleted[0]) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  try {
    await deletePrivateObject(deleted[0].imageObjectPath);
  } catch (error) {
    req.log?.warn?.({ error, postId }, "Post image cleanup failed");
  }
  res.json({ success: true });
});

export default router;