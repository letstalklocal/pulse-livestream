import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, reactionPreferencesTable } from "@workspace/db";
import { authenticatedUser } from "../lib/streamModeration";
import { isReactionEmoji } from "../lib/reactionEmoji";
export const DEFAULT_REACTION_FAVORITES = ["❤️", "🔥", "👏", "😂", "😍", "🎉", "👍", "🙌"];
const router = Router();
router.get("/reaction-preferences", async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: "Sign in required." });
  const [row] = await db.select().from(reactionPreferencesTable).where(eq(reactionPreferencesTable.userId, user.uid));
  res.set("Cache-Control", "no-store").json({ emojis: row?.emojis ?? DEFAULT_REACTION_FAVORITES, customized: !!row });
});
router.put("/reaction-preferences", async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: "Sign in required." });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Array.isArray(body.emojis) || body.emojis.length !== 8 || !body.emojis.every(isReactionEmoji) || new Set(body.emojis).size !== 8) {
    return void res.status(400).json({ error: "Choose eight different emojis." });
  }
  const [row] = await db.insert(reactionPreferencesTable).values({ userId: user.uid, emojis: body.emojis })
    .onConflictDoUpdate({ target: reactionPreferencesTable.userId, set: { emojis: body.emojis, updatedAt: new Date() } }).returning();
  res.set("Cache-Control", "no-store").json({ emojis: row.emojis, customized: true });
});
export default router;
