import { canViewPosts } from "../lib/privacy";
import { Router } from "express";
import { and, desc, eq, lt, count, or } from "drizzle-orm";
import { db, postsTable, usersTable, postReportsTable, postReactionsTable, postCommentsTable } from "@workspace/db";
import { contactBlocked } from "../lib/userSafety";
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

const validId = (value: unknown) => typeof value === "string" && /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647;
async function accessiblePost(req: any, res: any, uid?: number) {
  if (!validId(req.params.postId)) { res.status(400).json({ error: "Invalid post" }); return null; }
  const post = (await db.select().from(postsTable).where(eq(postsTable.id, Number(req.params.postId))).limit(1))[0];
  if (!post || !await canViewPosts(post.ownerUserId, uid)) {
    res.status(404).json({ error: "Photo is no longer available" }); return null;
  }
  return post;
}

router.get("/posts/saved", async (req, res) => {
  const user = await requireUser(req, res); if (!user) return;
  const rows = await db.select({ post: postsTable }).from(postReactionsTable)
    .innerJoin(postsTable, eq(postReactionsTable.postId, postsTable.id))
    .where(and(eq(postReactionsTable.userId, user.uid), eq(postReactionsTable.kind, "save")))
    .orderBy(desc(postReactionsTable.createdAt));
  const allowed = [];
  for (const { post } of rows) if (await canViewPosts(post.ownerUserId, user.uid)) allowed.push(post);
  res.set("Cache-Control", "no-store").json({ posts: await Promise.all(allowed.map(postResponse)) });
});

router.get("/posts/:postId/activity", async (req, res) => {
  const user = await currentUser(req);
  const post = await accessiblePost(req, res, user?.uid); if (!post) return;
  const [likes] = await db.select({ count: count() }).from(postReactionsTable).where(and(eq(postReactionsTable.postId, post.id), eq(postReactionsTable.kind, "like")));
  const [comments] = await db.select({ count: count() }).from(postCommentsTable).where(eq(postCommentsTable.postId, post.id));
  const mine = user ? await db.select().from(postReactionsTable).where(and(eq(postReactionsTable.postId, post.id), eq(postReactionsTable.userId, user.uid))) : [];
  res.set("Cache-Control", "no-store").json({ likeCount: likes.count, commentCount: comments.count, liked: mine.some(r => r.kind === "like"), saved: mine.some(r => r.kind === "save") });
});

router.put("/posts/:postId/activity", async (req, res) => {
  const user = await requireUser(req, res); if (!user) return;
  const { kind, active } = req.body ?? {};
  if (!["like", "save"].includes(kind) || typeof active !== "boolean") return void res.status(400).json({ error: "Invalid post action" });
  const post = await accessiblePost(req, res, user.uid); if (!post) return;
  const found = await db.transaction(async tx => {
    if (!(await tx.select().from(postsTable).where(eq(postsTable.id, post.id)).for("share"))[0]) return false;
    if (active) await tx.insert(postReactionsTable).values({ postId: post.id, userId: user.uid, kind }).onConflictDoNothing();
    else await tx.delete(postReactionsTable).where(and(eq(postReactionsTable.postId, post.id), eq(postReactionsTable.userId, user.uid), eq(postReactionsTable.kind, kind)));
    return true;
  });
  if (!found) return void res.status(404).json({ error: "Photo is no longer available" });
  res.json({ success: true });
});

router.get("/posts/:postId/comments", async (req, res) => {
  const user = await currentUser(req);
  const post = await accessiblePost(req, res, user?.uid); if (!post) return;
  if (req.query.before !== undefined && !validId(req.query.before)) return void res.status(400).json({ error: "Invalid cursor" });
  const rows = await db.select({ id: postCommentsTable.id, uid: postCommentsTable.userId, name: usersTable.name, text: postCommentsTable.text, createdAt: postCommentsTable.createdAt })
    .from(postCommentsTable).innerJoin(usersTable, eq(usersTable.uid, postCommentsTable.userId))
    .where(and(eq(postCommentsTable.postId, post.id), req.query.before ? lt(postCommentsTable.id, Number(req.query.before)) : undefined))
    .orderBy(desc(postCommentsTable.id)).limit(31);
  const page = rows.slice(0, 30);
  const comments = [];
  for (const row of page) if (!user || !await contactBlocked(user.uid, row.uid)) comments.push(row);
  res.set("Cache-Control", "no-store").json({ comments, nextCursor: rows.length > 30 ? page[page.length - 1].id : null });
});

router.post("/posts/:postId/comments", async (req, res) => {
  const user = await requireUser(req, res); if (!user) return;
  const { text, requestId } = req.body ?? {};
  if (typeof text !== "string" || !text.trim() || text.length > 1000 || typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return void res.status(400).json({ error: "Write a comment of up to 1,000 characters" });
  const post = await accessiblePost(req, res, user.uid); if (!post) return;
  const result = await db.transaction(async tx => {
    if (!(await tx.select().from(postsTable).where(eq(postsTable.id, post.id)).for("share"))[0]) return 404;
    await tx.insert(postCommentsTable).values({ postId: post.id, userId: user.uid, text: text.trim(), requestId }).onConflictDoNothing();
    const existing = (await tx.select().from(postCommentsTable).where(and(eq(postCommentsTable.userId, user.uid), eq(postCommentsTable.requestId, requestId))))[0];
    return existing?.postId === post.id && existing.text === text.trim() ? 200 : 409;
  });
  if (result !== 200) return void res.status(result).json({ error: result === 404 ? "Photo is no longer available" : "Comment request has already been used" });
  res.json({ success: true });
});

router.delete("/posts/:postId/comments/:commentId", async (req, res) => {
  const user = await requireUser(req, res); if (!user) return;
  const post = await accessiblePost(req, res, user.uid); if (!post) return;
  if (!validId(req.params.commentId)) return void res.status(400).json({ error: "Invalid comment" });
  const deleted = await db.delete(postCommentsTable).where(and(eq(postCommentsTable.id, Number(req.params.commentId)), eq(postCommentsTable.postId, post.id),
    or(eq(postCommentsTable.userId, user.uid), post.ownerUserId === user.uid ? eq(postCommentsTable.postId, post.id) : undefined))).returning();
  if (!deleted.length) return void res.status(404).json({ error: "Comment not found" });
  res.json({ success: true });
});

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
  const viewer = await currentUser(req);
  if (viewer && await contactBlocked(viewer.uid, uid)) return void res.status(404).json({ error: "Account not available" });
  if (!Number.isInteger(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  if (!await canViewPosts(uid, viewer?.uid)) return void res.status(403).json({ error: "Posts are visible to friends only." });
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
