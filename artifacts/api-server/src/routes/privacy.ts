import { privacyPreferences } from "../lib/privacy";
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, count, eq, gt } from "drizzle-orm";
import { db, usersTable, userBlocksTable, privacyPreferencesTable } from "@workspace/db";
import { createPrivateGetUrl } from "../lib/objectStorage";

const router = Router();
async function viewer(req: Parameters<typeof getAuth>[0]) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  return (await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1))[0] ?? null;
}
const validUid = (value: unknown) => typeof value === "string" && /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647;
router.get("/privacy/blocks", async (req, res) => {
  const user = await viewer(req);
  if (!user) return void res.status(401).json({ error: "Sign in to manage privacy." });
  if (req.query.after !== undefined && !validUid(req.query.after)) return void res.status(400).json({ error: "Invalid blocked list." });
  const table = userBlocksTable;
  const owner = userBlocksTable.blockerUserId;
  const target = userBlocksTable.blockedUserId;
  const [rows, totals] = await Promise.all([
    db.select({ uid: usersTable.uid, name: usersTable.name, avatarImagePath: usersTable.avatarImagePath }).from(table).innerJoin(usersTable, eq(usersTable.uid, target))
      .where(and(eq(owner, user.uid), req.query.after ? gt(target, Number(req.query.after)) : undefined)).orderBy(target).limit(51),
    db.select({ total: count() }).from(table).where(eq(owner, user.uid)),
  ]);
  const page = rows.slice(0, 50);
  const accounts = await Promise.all(page.map(async ({ avatarImagePath, ...account }) => ({ ...account,
    avatarImageUrl: avatarImagePath ? await createPrivateGetUrl(avatarImagePath).catch(() => null) : null,
  })));
  res.set("Cache-Control", "no-store").json({ accounts, total: totals[0]?.total ?? 0, nextCursor: rows.length > 50 ? page[page.length - 1]!.uid : null });
});
router.delete("/privacy/blocks/:uid", async (req, res) => {
  const user = await viewer(req);
  if (!user) return void res.status(401).json({ error: "Sign in to manage privacy." });
  if (!validUid(req.params.uid)) return void res.status(400).json({ error: "Invalid blocked account." });
  await db.delete(userBlocksTable).where(and(eq(userBlocksTable.blockerUserId, user.uid), eq(userBlocksTable.blockedUserId, Number(req.params.uid))));
  res.json({ success: true });
});
router.get("/privacy/preferences", async (req,res) => {
  const user = await viewer(req);
  if (!user) return void res.status(401).json({ error: "Sign in to manage privacy." });
  res.set("Cache-Control","no-store").json(await privacyPreferences(user.uid));
});
router.patch("/privacy/preferences", async (req,res) => {
  const user = await viewer(req);
  if (!user) return void res.status(401).json({ error: "Sign in to manage privacy." });
  const patch = req.body;
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length || Object.entries(patch).some(([key,value]) =>
    key === "hideLocation" ? typeof value !== "boolean" : !["partyInvites","postsVisibility"].includes(key) || !["everyone","friends"].includes(String(value)) || typeof value !== "string"
  )) return void res.status(400).json({ error: "Invalid privacy preferences." });
  await db.insert(privacyPreferencesTable).values({ userId: user.uid, ...patch }).onConflictDoUpdate({ target: privacyPreferencesTable.userId, set: { ...patch, updatedAt: new Date() } });
  res.json(await privacyPreferences(user.uid));
});
export default router;
