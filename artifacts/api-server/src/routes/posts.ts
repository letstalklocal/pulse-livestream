import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, postsTable, usersTable } from "@workspace/db";
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