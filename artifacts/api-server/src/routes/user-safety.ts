import { enforceAccountBlock } from "../lib/enforceAccountBlock";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, usersTable, userBlocksTable, userReportsTable, directMessagesTable } from "@workspace/db";
import { authenticatedUser } from "../lib/streamModeration";
import { contactBlocked } from "../lib/userSafety";
const router = Router();
async function accounts(req: any, res: any) {
  const viewer = await authenticatedUser(req);
  if (!viewer) { res.status(401).json({ error: "Sign in required" }); return null; }
  const uid = Number(req.params.uid);
  if (!Number.isInteger(uid) || uid <= 0 || uid > 2147483647 || uid === viewer.uid) { res.status(400).json({ error: "Choose another account" }); return null; }
  const target = (await db.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.uid, uid)).limit(1))[0];
  if (!target) { res.status(404).json({ error: "Account not found" }); return null; }
  return { viewer, uid };
}
router.get("/safety/users/:uid", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const a = await accounts(req,res); if (!a) return;
  const mine = (await db.select().from(userBlocksTable).where(and(eq(userBlocksTable.blockerUserId,a.viewer.uid),eq(userBlocksTable.blockedUserId,a.uid))).limit(1))[0];
  res.json({ blockedByMe: !!mine, contactBlocked: await contactBlocked(a.viewer.uid,a.uid) });
});
router.post("/safety/users/:uid/block", async (req,res) => {
  const a = await accounts(req,res); if (!a) return;
  if (typeof req.body?.blocked !== "boolean") return void res.status(400).json({ error: "Invalid block setting" });
  if (req.body.blocked) await db.insert(userBlocksTable).values({ blockerUserId:a.viewer.uid, blockedUserId:a.uid }).onConflictDoNothing();
  else await db.delete(userBlocksTable).where(and(eq(userBlocksTable.blockerUserId,a.viewer.uid),eq(userBlocksTable.blockedUserId,a.uid)));
  if (req.body.blocked) await enforceAccountBlock(a.viewer.uid, a.uid);
  res.json({ success:true });
});
router.post("/safety/users/:uid/reports", async (req,res) => {
  const a = await accounts(req,res); if (!a) return;
  const {reason,details="",source,messageId} = req.body ?? {};
  if (!["profile","dm"].includes(source) || !["harassment","spam","sexual_content","violence","child_safety","other"].includes(reason) || typeof details!=="string" || details.length>2000) return void res.status(400).json({ error:"Choose a reason and keep details under 2,000 characters" });
  if (messageId !== undefined && (source!=="dm" || !Number.isInteger(messageId) || messageId<=0 || messageId>2147483647)) return void res.status(400).json({ error:"Invalid message" });
  const result = await db.transaction(async tx => {
    if (messageId!==undefined) {
      const message=(await tx.select().from(directMessagesTable).where(eq(directMessagesTable.id,messageId)).for("share"))[0];
      if (!message || message.fromUserId!==a.uid || message.toUserId!==a.viewer.uid) return false;
    }
    await tx.insert(userReportsTable).values({ reporterUserId:a.viewer.uid,reportedUserId:a.uid,reportedUid:a.uid,
      source, messageId:messageId ?? null, reference:messageId===undefined ? "account" : `message:${messageId}`,reason,details:details.trim() }).onConflictDoNothing();
    return true;
  });
  if (!result) return void res.status(404).json({ error:"Message not found" });
  res.status(201).json({ success:true });
});
export default router;
