import { Router } from "express";
import { authenticatedUser } from "../lib/streamModeration";
import { countryName, updateCountryFromRequest } from "../lib/countryLocation";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
const router = Router();
router.post("/location/country", async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: "Sign in to update country." });
  try {
    const detection = await updateCountryFromRequest(req, user.uid);
    // Country-only diagnostics: never log visitor IPs or forwarded headers.
    req.log?.info({ uid: user.uid, ...detection }, "Profile country detection");
  } catch {
    req.log?.warn({ uid: user.uid, outcome: "lookup_failed" }, "Profile country detection");
    // Country detection must not prevent app access or erase the last result.
  }
  const [current] = await db.select({ countryCode: usersTable.countryCode }).from(usersTable).where(eq(usersTable.uid, user.uid));
  const countryCode = current?.countryCode ?? null;
  res.set("Cache-Control", "no-store").json({ countryCode, country: countryName(countryCode) });
});
export default router;
