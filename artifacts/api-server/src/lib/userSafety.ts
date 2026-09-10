import { and, eq, or } from "drizzle-orm";
import { db, userBlocksTable } from "@workspace/db";
export async function contactBlocked(a: number, b: number) {
  return !!(await db.select().from(userBlocksTable).where(or(
    and(eq(userBlocksTable.blockerUserId, a), eq(userBlocksTable.blockedUserId, b)),
    and(eq(userBlocksTable.blockerUserId, b), eq(userBlocksTable.blockedUserId, a)),
  )).limit(1))[0];
}
export async function requireContactAllowed(res: any, a: number, b: number) {
  if (!await contactBlocked(a, b)) return true;
  res.status(403).json({ error: "Contact with this account is unavailable" });
  return false;
}
