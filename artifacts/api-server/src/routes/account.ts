import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  accountDeletionRequestsTable,
  coinBalancesTable,
  usersTable,
} from "@workspace/db";

const router = Router();
const publicRequest = (
  request: typeof accountDeletionRequestsTable.$inferSelect | undefined,
) =>
  request
    ? {
        id: request.id,
        status: request.status,
        requestedAt: request.requestedAt,
      }
    : null;

router.get("/account/deletion-request", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId)
    return void res
      .status(401)
      .json({ error: "Sign in to manage your account." });
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, userId))
    .limit(1);
  if (!user)
    return void res.status(404).json({
      error: "Your Pulse profile is not ready. Please sign in again.",
    });
  const [request] = await db
    .select()
    .from(accountDeletionRequestsTable)
    .where(eq(accountDeletionRequestsTable.userId, user.uid))
    .orderBy(
      desc(accountDeletionRequestsTable.requestedAt),
      desc(accountDeletionRequestsTable.id),
    )
    .limit(1);
  const [wallet] = await db
    .select()
    .from(coinBalancesTable)
    .where(eq(coinBalancesTable.userId, user.uid))
    .limit(1);
  res.json({ request: publicRequest(request), balance: wallet?.balance ?? 0 });
});

router.post("/account/deletion-request", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId)
    return void res
      .status(401)
      .json({ error: "Sign in to manage your account." });
  const { confirmation, reason = "" } = req.body ?? {};
  if (
    confirmation !== "DELETE" ||
    typeof reason !== "string" ||
    reason.length > 2000
  ) {
    return void res.status(400).json({
      error:
        "Type DELETE to confirm and keep your reason under 2,000 characters.",
    });
  }
  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))
      .for("update");
    if (!user)
      return {
        status: 404,
        error: "Your Pulse profile is not ready. Please sign in again.",
      };
    const [pending] = await tx
      .select()
      .from(accountDeletionRequestsTable)
      .where(
        and(
          eq(accountDeletionRequestsTable.userId, user.uid),
          eq(accountDeletionRequestsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) return { request: publicRequest(pending) };
    // This is a manual-review report, not authorization to delete or spend coins.
    // Operators must resolve any remaining balance before actual account removal.
    const [request] = await tx
      .insert(accountDeletionRequestsTable)
      .values({ userId: user.uid, reason: reason.trim() })
      .returning();
    return { request: publicRequest(request) };
  });
  if ("error" in result)
    return void res.status(result.status!).json({ error: result.error });
  res.status(202).json(result);
});

router.delete("/account/deletion-request", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId)
    return void res
      .status(401)
      .json({ error: "Sign in to manage your account." });
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, userId))
    .limit(1);
  if (!user)
    return void res.status(404).json({
      error: "Your Pulse profile is not ready. Please sign in again.",
    });
  await db
    .update(accountDeletionRequestsTable)
    .set({ status: "cancelled", reviewedAt: new Date() })
    .where(
      and(
        eq(accountDeletionRequestsTable.userId, user.uid),
        eq(accountDeletionRequestsTable.status, "pending"),
      ),
    );
  res.json({ success: true });
});
export default router;
