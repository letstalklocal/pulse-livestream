import { db, vipStoreAccessTable } from '@workspace/db';
import { and, eq, sql } from 'drizzle-orm';
// Provider calls happen only during synchronization, never while opening a list.
const PROJECT = 'proj2b054d16';
const ENTITLEMENT = 'entl41ad621812';
const LIFETIME_PRODUCTS = new Set(['prod351de29723', 'prodd6b7e1520d']);
export type VipSnapshot = { active: boolean; expiresAt: Date | null };
// TEMPORARY: pre-launch TestFlight uses Apple sandbox on the production API.
// Revert before real payments; exact rollback: docs/revenuecat-integration.md.
export const vipEnvironment = () => 'sandbox' as const;

type AccessItem = {
  environment?: string; product_id?: string; gives_access?: boolean; status?: string;
  ends_at?: number | null; current_period_ends_at?: number | null;
  entitlements?: { items?: { id?: string }[] };
};

export async function fetchVipSnapshot(clerkId: string): Promise<VipSnapshot> {
  const key = process.env.REVENUECAT_API_V2_SECRET_KEY;
  if (!key) throw new Error('VIP verification is not configured');
  const environment = vipEnvironment();
  let expiresAt = 0;
  let lifetime = false;
  let activeGrace = false;
  const root = `/v2/projects/${PROJECT}/customers/${encodeURIComponent(clerkId)}`;
  async function collect(kind: 'subscriptions' | 'purchases'): Promise<void> {
    let path: string | null = `${root}/${kind}?environment=${environment}&limit=100`;
    const visited = new Set<string>();
    while (path) {
      // Follow only provider pagination for this exact customer/resource.
      if (!path.startsWith(`${root}/${kind}?`) || visited.has(path)) throw new Error('Invalid VIP pagination');
      visited.add(path);
      const url = new URL(path, 'https://api.revenuecat.com');
      url.searchParams.set('environment', environment);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`VIP provider unavailable (${response.status})`);
      const body = await response.json() as { items?: AccessItem[]; next_page?: string | null };
      if (!Array.isArray(body.items)) throw new Error('Invalid VIP response');
      for (const item of body.items) {
        if (item.environment !== environment || !item.entitlements?.items?.some(e => e.id === ENTITLEMENT)) continue;
        if (kind === 'purchases' && item.status === 'owned' && LIFETIME_PRODUCTS.has(item.product_id ?? '')) lifetime = true;
        if (kind === 'subscriptions' && item.gives_access === true) {
          const end = item.ends_at ?? item.current_period_ends_at;
          if (typeof end === 'number' && Number.isFinite(end)) expiresAt = Math.max(expiresAt, end);
          if (item.status === 'in_grace_period') activeGrace = true;
        }
      }
      path = body.next_page ?? null;
    }
  }
  await collect('subscriptions');
  await collect('purchases');
  // RevenueCat is authoritative in grace. A short persisted lease is renewed by
  // background reconciliation, without a provider call from a list request.
  if (activeGrace) expiresAt = Math.max(expiresAt, Date.now() + 5 * 60_000);
  return { active: lifetime || expiresAt > Date.now(), expiresAt: lifetime ? null : expiresAt ? new Date(expiresAt) : null };
}

export async function hasVipAccess(userId: number): Promise<boolean> {
  const [row] = await db.select().from(vipStoreAccessTable).where(and(
    eq(vipStoreAccessTable.userId, userId), eq(vipStoreAccessTable.environment, vipEnvironment()),
  )).limit(1);
  return !!row?.active && (row.expiresAt === null || row.expiresAt.getTime() > Date.now());
}

export async function syncVipAccess(userId: number, clerkId: string, force = false): Promise<VipSnapshot & { previous?: VipSnapshot }> {
  return db.transaction(async tx => {
    const environment = vipEnvironment();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`vip:${environment}:${userId}`}))`);
    const [old] = await tx.select().from(vipStoreAccessTable).where(and(
      eq(vipStoreAccessTable.userId, userId), eq(vipStoreAccessTable.environment, environment),
    )).limit(1);
    // Client-triggered catch-up is bounded; authenticated provider events bypass this.
    if (!force && old && Date.now() - old.checkedAt.getTime() < 10_000) return old;
    const snapshot = await fetchVipSnapshot(clerkId);
    await tx.insert(vipStoreAccessTable).values({ userId, environment, ...snapshot, checkedAt: new Date() })
      .onConflictDoUpdate({ target: [vipStoreAccessTable.userId, vipStoreAccessTable.environment], set: { ...snapshot, checkedAt: new Date() } });
    return { ...snapshot, previous: old ? { active: old.active, expiresAt: old.expiresAt } : { active: false, expiresAt: null } };
  });
}
