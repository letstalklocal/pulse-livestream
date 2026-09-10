import { Router } from "express";
import { authenticatedUser } from "../lib/streamModeration";
import { countryName, updateCountryFromRequest } from "../lib/countryLocation";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
const router = Router();
router.post("/location/country", async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: "Sign in to update country." });
  try { await updateCountryFromRequest(req, user.uid); }
  catch { /* Country detection is best effort and must not prevent app access. */ }
  const [current] = await db.select({ countryCode: usersTable.countryCode }).from(usersTable).where(eq(usersTable.uid, user.uid));
  const countryCode = current?.countryCode ?? null;
  res.set("Cache-Control", "no-store").json({ countryCode, country: countryName(countryCode) });
});
export default router;
