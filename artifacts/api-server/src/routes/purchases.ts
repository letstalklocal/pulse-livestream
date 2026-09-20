import { beginWebhookLog, finishWebhookLog } from "../lib/revenuecatWebhookLog";
import { syncVipAccess, hasVipAccess, vipEnvironment } from "../lib/vipAccess";
import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, usersTable, coinBalancesTable, coinTransactionsTable } from '@workspace/db';
import { authenticatedUser } from '../lib/streamModeration';

import approvedCoinProducts from '../config/coin-products.json';

const router = Router();
type CoinProduct = { productId: string; coins: number };
export function coinProductConfiguration() {
  const environment = process.env.REVENUECAT_ENVIRONMENT || 'SANDBOX';
  const appIds = (process.env.REVENUECAT_APP_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  let products: CoinProduct[] = [];
  try {
    const parsed: unknown = process.env.REVENUECAT_COIN_PRODUCTS === undefined ? approvedCoinProducts : JSON.parse(process.env.REVENUECAT_COIN_PRODUCTS);
    if (!Array.isArray(parsed) || parsed.length > 100) throw new Error('Invalid products');
    for (const value of parsed) {
      if (!value || typeof value.productId !== 'string' || !value.productId.trim() || value.productId.length > 200 ||
        !Number.isSafeInteger(value.coins) || value.coins <= 0 || value.coins > 1_000_000 || products.some(p => p.productId === value.productId)) throw new Error('Invalid product');
      products.push({ productId: value.productId, coins: value.coins });
    }
  } catch { products = []; }
  // TEMPORARY pre-launch testing: allow sandbox coins on the production API.
  // Real payments remain blocked. Rollback: docs/revenuecat-integration.md.
  const enabled = environment === 'SANDBOX' && !!secret && secret.length >= 32 && appIds.length > 0 && products.length > 0;
  return { products, environment, appIds, secret, enabled };
}
function transactionKey(appId: string, store: string, environment: string, transactionId: string) {
  return 'rc:' + createHash('sha256').update(JSON.stringify([appId, store, environment, transactionId])).digest('hex');
}

router.get('/purchases/coin-products', async (req, res) => {
  if (!await authenticatedUser(req)) return void res.status(401).json({ error: 'Authentication required' });
  const config = coinProductConfiguration();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ enabled: config.enabled, environment: config.environment, products: config.products });
});

// The app can check fulfillment, but cannot request a coin amount or submit
// proof of payment. Only the authenticated RevenueCat webhook grants coins.
router.get('/purchases/coin-transactions/:transactionId', async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: 'Authentication required' });
  const transactionId = String(req.params.transactionId || '');
  if (!transactionId || transactionId.length > 500) return void res.status(400).json({ error: 'Invalid transaction' });
  const { appIds, environment } = coinProductConfiguration();
  const keys = appIds.flatMap(appId => ['TEST_STORE', 'APP_STORE', 'PLAY_STORE'].map(store => transactionKey(appId, store, environment, transactionId)));
  const rows = keys.length ? await db.select({ amount: coinTransactionsTable.amount }).from(coinTransactionsTable)
    .where(and(eq(coinTransactionsTable.toUserId, user.uid), eq(coinTransactionsTable.type, 'purchase'), inArray(coinTransactionsTable.idempotencyKey, keys))).limit(1) : [];
  const balance = (await db.select({ balance: coinBalancesTable.balance }).from(coinBalancesTable).where(eq(coinBalancesTable.userId, user.uid)).limit(1))[0]?.balance ?? 0;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: rows[0] ? 'credited' : 'pending', coins: rows[0]?.amount ?? 0, balance });
});

// Authenticated purchase/restore/login catch-up; client cannot set access or expiry.
router.post('/purchases/vip/sync', async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user?.clerkId) return void res.status(401).json({ error: 'Authentication required' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    await syncVipAccess(user.uid, user.clerkId);
    res.json({ active: await hasVipAccess(user.uid) });
  } catch {
    res.status(503).json({ error: 'VIP status could not be synchronized. Please try again.' });
  }
});

router.post('/purchases/revenuecat/webhook', async (req, res) => {
  const config = coinProductConfiguration();
  if (!config.secret || config.secret.length < 32 || !config.appIds.length) return void res.status(503).json({ error: 'Purchases are not configured' });
  const received = Buffer.from(req.get('authorization') || '');
  const expected = Buffer.from(config.secret!);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return void res.status(401).json({ error: 'Invalid authorization' });
  const event = req.body?.event;
  let logId: string;
  try { logId = await beginWebhookLog(event && typeof event === 'object' ? event : {}); }
  catch { return void res.status(503).json({ error: 'Webhook logging unavailable; retry delivery' }); }
  const vipChanges: unknown[] = [];
  const reply = async (status: number, body: { error?: string; received?: boolean; ignored?: boolean }) => {
    try { await finishWebhookLog(logId, status, body, vipChanges); }
    catch { return void res.status(503).json({ error: 'Webhook result could not be logged; retry delivery' }); }
    res.status(status).json(body);
  };
  if (!event || typeof event.type !== 'string') return await reply(400, { error: 'Invalid event' });
  if (event.type === 'TEST') return await reply(200, { received: true });
  if (event.environment !== config.environment || !config.appIds.includes(event.app_id)) return await reply(403, { error: 'Wrong purchase environment or app' });
  const vipEvent = ['monthly', 'yearly', 'lifetime'].includes(event.product_id) || event.entitlement_ids?.includes('pulse_pro') || event.type === 'TRANSFER';
  if (vipEvent) {
    if (event.environment !== vipEnvironment().toUpperCase()) return await reply(403, { error: 'Wrong VIP environment' });
    const ids = event.type === 'TRANSFER' ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])] : [event.app_user_id];
    if (!ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || id.length > 1500)) return await reply(400, { error: 'Invalid VIP account' });
    try {
      const users = await db.select({ uid: usersTable.uid, clerkId: usersTable.clerkId }).from(usersTable).where(inArray(usersTable.clerkId, ids));
      if (!users.length) return await reply(409, { error: 'Purchase account not found' });
      // Re-read authoritative current state instead of applying potentially stale,
      // duplicated or out-of-order event payloads. Synchronization is serialized.
      for (const user of users) if (user.clerkId) {
        const state = await syncVipAccess(user.uid, user.clerkId, true);
        vipChanges.push({ userId: user.uid, before: state.previous, after: { active: state.active, expiresAt: state.expiresAt } });
      }
      return await reply(200, { received: true });
    } catch {
      return await reply(503, { error: 'VIP update could not be saved' });
    }
  }
  if (!config.enabled) return await reply(503, { error: 'Coin purchases are not configured' });
  if (event.type !== 'NON_RENEWING_PURCHASE') return await reply(200, { received: true, ignored: true });
  const product = config.products.find(p => p.productId === event.product_id);
  // Lifetime and subscriptions never credit coins merely by granting pulse_pro.
  if (!product) return await reply(200, { received: true, ignored: true });
  if (!['TEST_STORE', 'APP_STORE', 'PLAY_STORE'].includes(event.store) || typeof event.transaction_id !== 'string' ||
    !event.transaction_id || event.transaction_id.length > 500 || typeof event.app_user_id !== 'string') return await reply(400, { error: 'Invalid purchase' });
  const user = (await db.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.clerkId, event.app_user_id)).limit(1))[0];
  if (!user) return await reply(409, { error: 'Purchase account not found' });
  const key = transactionKey(event.app_id, event.store, event.environment, event.transaction_id);
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const previous = (await tx.select().from(coinTransactionsTable).where(eq(coinTransactionsTable.idempotencyKey, key)).limit(1))[0];
      if (previous) {
        if (previous.toUserId !== user.uid) throw new Error('Transaction already assigned');
        return;
      }
      await tx.insert(coinBalancesTable).values({ userId: user.uid, balance: 0 }).onConflictDoNothing();
      const [updated] = await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} + ${product.coins}`, updatedAt: new Date() })
        .where(and(eq(coinBalancesTable.userId, user.uid), sql`${coinBalancesTable.balance} <= ${2147483647 - product.coins}`)).returning();
      if (!updated) throw new Error('Balance limit reached');
      await tx.insert(coinTransactionsTable).values({ toUserId: user.uid, amount: product.coins, type: 'purchase',
        description: `RevenueCat ${event.product_id}`, idempotencyKey: key, balanceAfter: updated.balance });
    });
    await reply(200, { received: true });
  } catch {
    // Non-2xx makes RevenueCat retry; never acknowledge a failed credit.
    await reply(409, { error: 'Purchase could not be credited' });
  }
});
export default router;
