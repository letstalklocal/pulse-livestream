import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, revenuecatWebhookLogsTable } from '@workspace/db';

const text = (value: unknown, length = 200) => typeof value === 'string' ? value.slice(0, length) : null;
const date = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 8.64e15 ? new Date(value) : null;
export async function beginWebhookLog(event: Record<string, unknown>) {
  const id = randomUUID();
  await db.insert(revenuecatWebhookLogsTable).values({
    id, eventId: text(event.id), eventType: text(event.type) ?? 'INVALID',
    appId: text(event.app_id), environment: text(event.environment), productId: text(event.product_id),
    customerRef: typeof event.app_user_id === 'string' ? createHash('sha256').update(event.app_user_id).digest('hex') : null,
    eventAt: date(event.event_timestamp_ms), eventExpiresAt: date(event.expiration_at_ms),
  });
  return id;
}
export async function finishWebhookLog(id: string, status: number, body: { error?: string; ignored?: boolean }, vipChanges: unknown[]) {
  await db.update(revenuecatWebhookLogsTable).set({
    completedAt: new Date(), httpStatus: status,
    outcome: status >= 500 || status === 409 ? 'failed' : status >= 400 ? 'rejected' : body.ignored ? 'ignored' : 'processed',
    reason: body.error ?? null, vipChanges,
  }).where(eq(revenuecatWebhookLogsTable.id, id));
}
