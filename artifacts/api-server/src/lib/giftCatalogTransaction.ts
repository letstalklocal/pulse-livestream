import { sql } from "drizzle-orm";
import type { GiftDb } from "./managedGiftCatalog";
import { lockGiftCatalog, resolvePublishedGift } from "./managedGiftCatalog";

/** Bind catalog SQL to the caller's existing wallet/message transaction. */
export function giftCatalogDb(executor: { execute: (query: any) => Promise<any> }): GiftDb {
  return {
    query: (statement, values = []) => {
      const query = sql.empty();
      let offset = 0;
      for (const match of statement.matchAll(/\$(\d+)/g)) {
        query.append(sql.raw(statement.slice(offset, match.index)));
        // A SQL array must remain one bound parameter, not Drizzle's tuple expansion.
        query.append(sql`${sql.param(values[Number(match[1]) - 1])}`);
        offset = match.index! + match[0].length;
      }
      query.append(sql.raw(statement.slice(offset)));
      return executor.execute(query);
    },
  };
}

/** Read the current offer for sticker configuration, not a purchase consent. */
export async function currentCatalogGift(executor: { execute: (query: any) => Promise<any> }, giftId: string) {
  const catalog = giftCatalogDb(executor);
  await lockGiftCatalog(catalog);
  const row = (await catalog.query("SELECT current_revision_id FROM catalog_gifts WHERE id=$1", [giftId])).rows[0];
  return resolvePublishedGift(catalog, giftId, row?.current_revision_id ?? undefined);
}
