import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

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
    .values({
      uid,
      name: name.trim(),
      bio: (bio ?? "").trim(),
    })
    .onConflictDoUpdate({
      target: usersTable.uid,
      set: {
        name: name.trim(),
        bio: (bio ?? "").trim(),
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({ user: rows[0] });
});

router.get("/users/:uid/streams", async (req, res) => {
  const { streamHistoryTable } = await import("@workspace/db");
  const { desc } = await import("drizzle-orm");
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
