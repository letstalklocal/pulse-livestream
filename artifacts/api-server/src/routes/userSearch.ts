import { Router } from "express";
import { and, asc, eq, ilike, notExists, or, sql } from "drizzle-orm";
import { db, userBlocksTable, usersTable } from "@workspace/db";
import { authenticatedUser } from "../lib/streamModeration";
import { createPrivateGetUrl } from "../lib/objectStorage";

const router = Router();

router.get("/users", async (req, res) => {
  if (req.query.q !== undefined && typeof req.query.q !== "string") {
    res.status(400).json({ error: "q must be a string" });
    return;
  }
  const query = ((req.query.q as string | undefined) ?? "").trim();
  if (query.length > 64) {
    res.status(400).json({ error: "Search is limited to 64 characters" });
    return;
  }
  if (!query) {
    res.json({ users: [] });
    return;
  }
  const viewer = await authenticatedUser(req);
  // Treat SQL pattern characters literally, so searching for '_' or '%' is not a directory dump.
  const pattern = query.replace(/[\\%_]/g, "\\$&");
  const visible = viewer ? notExists(db.select({ one: sql`1` }).from(userBlocksTable).where(or(
    and(eq(userBlocksTable.blockerUserId, viewer.uid), eq(userBlocksTable.blockedUserId, usersTable.uid)),
    and(eq(userBlocksTable.blockedUserId, viewer.uid), eq(userBlocksTable.blockerUserId, usersTable.uid)),
  ))) : undefined;
  const users = await db.select({
    uid: usersTable.uid,
    name: usersTable.name,
    avatarImagePath: usersTable.avatarImagePath,
  }).from(usersTable)
    .where(and(ilike(usersTable.name, `%${pattern}%`), visible))
    .orderBy(sql`case when lower(${usersTable.name}) = lower(${query}) then 0 when ${usersTable.name} ilike ${`${pattern}%`} then 1 else 2 end`, asc(usersTable.name), asc(usersTable.uid))
    .limit(30);
  res.json({ users: await Promise.all(users.map(async ({ avatarImagePath, ...user }) => ({
    ...user,
    avatarImageUrl: avatarImagePath ? await createPrivateGetUrl(avatarImagePath) : null,
  }))) });
});

export default router;
