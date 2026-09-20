import { logger } from "./logger";
import { db, usersTable, vipStoreAccessTable } from '@workspace/db';
import { and, eq, sql } from 'drizzle-orm';
import { syncVipAccess, vipEnvironment } from './vipAccess';

// Recover missed events and renew short grace leases. No work is triggered by
// opening a profile/list. Bounded batches keep provider traffic independent of taps.
export function startVipReconciliation() {
  let running = false;
  const timer = setInterval(async () => {
    if (running || !process.env.REVENUECAT_API_V2_SECRET_KEY) return;
    running = true;
    try {
      const rows = await db.select({ uid: usersTable.uid, clerkId: usersTable.clerkId })
        .from(vipStoreAccessTable).innerJoin(usersTable, eq(usersTable.uid, vipStoreAccessTable.userId))
        .where(and(eq(vipStoreAccessTable.environment, vipEnvironment()), sql`
          ${vipStoreAccessTable.checkedAt} < now() - interval '2 minutes' and (
            (${vipStoreAccessTable.active} and ${vipStoreAccessTable.expiresAt} < now() + interval '5 minutes')
            or ${vipStoreAccessTable.checkedAt} < now() - interval '24 hours'
          )`)).orderBy(vipStoreAccessTable.checkedAt).limit(20);
      for (const row of rows) {
        if (!row.clerkId) continue;
        try { await syncVipAccess(row.uid, row.clerkId, true); } catch { logger.warn("VIP reconciliation failed; retaining saved status for retry"); }
      }
    } catch { logger.warn("VIP reconciliation batch unavailable"); }
    finally { running = false; }
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
