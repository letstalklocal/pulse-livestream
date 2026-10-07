import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const output = `${root}/tests/.dm-managed-history-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents:
      "export {pool} from '@workspace/db'; export {drizzle} from 'drizzle-orm/node-postgres'; export {purchaseDmGift} from './src/lib/dmGiftPurchase'; export * from './src/lib/managedGiftCatalog';",
    resolveDir: root,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
});
const m = createRequire(import.meta.url)(output);
const client = await m.pool.connect();
const prefix = randomUUID().replaceAll("-", "");
const actor = `managed-history-${prefix}`;
const giftId = `history_${prefix}`;
const sender = 1800000000 + Math.floor(Math.random() * 10000000) * 2;
const recipient = sender + 1;
const thumbnailIds = [randomUUID(), randomUUID()];
const rollback = new Error("rollback integration fixtures");
try {
  await assert.rejects(
    m.drizzle(client).transaction(async (outer) => {
      const provider = { transaction: outer.transaction.bind(outer) };
      for (const uid of [sender, recipient])
        await client.query(
          "INSERT INTO users(uid,clerk_id,name) VALUES($1,$2,'History fixture')",
          [uid, `${actor}-${uid}`],
        );
      await client.query(
        "INSERT INTO coin_balances(user_id,balance) VALUES($1,100)",
        [sender],
      );
      for (const id of thumbnailIds)
        await client.query(
          "INSERT INTO gift_assets(id,owner_clerk_id,kind,format,object_path,sha256,byte_size,width,height) VALUES($1,$2,'thumbnail','png',$3,$4,12,20,20)",
          [id, actor, `/objects/gifts/${id}`, "a".repeat(64)],
        );
      const original = await m.draftManagedGift(
        client,
        actor,
        giftId,
        {
          collectionId: "luxury",
          name: "Original history gift",
          emoji: "🎁",
          coinCost: 7,
          thumbnailAssetId: thumbnailIds[0],
        },
        true,
      );
      await m.publishManagedGift(client, actor, giftId, original.revisionId);
      const originalSelection = {
        giftRevisionId: original.revisionId,
        expectedCoinCost: 7,
      };
      const firstKey = randomUUID();
      const buy = (key, selection) =>
        m.purchaseDmGift(
          sender,
          recipient,
          giftId,
          key,
          new Date(),
          selection,
          provider,
        );
      const first = await buy(firstKey, originalSelection);
      assert.equal(first.balance, 93);
      const second = await buy(randomUUID(), originalSelection);
      assert.equal(second.combo.id, first.combo.id);
      assert.equal(second.combo.count, 2);
      assert.equal(second.balance, 86);
      assert.match(
        second.message.text,
        /Original history gift gift • 14 coins ×2$/,
      );
      // Preserve read status, replies and all historical message fields across edits.
      await client.query(
        "UPDATE direct_messages SET read_at=now() WHERE id=$1",
        [first.message.id],
      );
      const historical = (
        await client.query("SELECT * FROM direct_messages WHERE id=$1", [
          first.message.id,
        ])
      ).rows[0];
      const reply = (
        await client.query(
          "INSERT INTO direct_messages(from_user_id,to_user_id,text,kind,reply_to_message_id) VALUES($1,$2,'Reply to original gift','text',$3) RETURNING *",
          [recipient, sender, first.message.id],
        )
      ).rows[0];
      const changed = await m.draftManagedGift(client, actor, giftId, {
        name: "Replaced gift",
        coinCost: 9,
        thumbnailAssetId: thumbnailIds[1],
      });
      await m.publishManagedGift(client, actor, giftId, changed.revisionId);
      await assert.rejects(
        buy(randomUUID(), originalSelection),
        (error) => error.status === 409,
      );
      assert.equal(
        (
          await client.query(
            "SELECT balance FROM coin_balances WHERE user_id=$1",
            [sender],
          )
        ).rows[0].balance,
        86,
      );
      assert.deepEqual(
        (
          await client.query("SELECT * FROM direct_messages WHERE id=$1", [
            first.message.id,
          ])
        ).rows[0],
        historical,
      );
      assert.deepEqual(
        (
          await client.query("SELECT * FROM direct_messages WHERE id=$1", [
            reply.id,
          ])
        ).rows[0],
        reply,
      );
      const updatedSelection = {
        giftRevisionId: changed.revisionId,
        expectedCoinCost: 9,
      };
      const updated = await buy(randomUUID(), updatedSelection);
      assert.equal(updated.balance, 77);
      assert.notEqual(updated.combo.id, first.combo.id);
      assert.equal(updated.combo.count, 1);
      assert.equal(updated.message.giftSnapshot.name, "Replaced gift");
      assert.equal(updated.message.giftSnapshot.thumbnail.id, thumbnailIds[1]);
      assert.equal(historical.gift_snapshot.name, "Original history gift");
      assert.equal(historical.gift_snapshot.coinCost, 7);
      assert.equal(historical.gift_snapshot.thumbnail.id, thumbnailIds[0]);
      await m.archiveManagedGift(client, actor, giftId);
      const retry = await buy(firstKey, originalSelection);
      assert.equal(retry.duplicate, true);
      assert.equal(retry.balance, 77);
      assert.deepEqual(retry.giftSnapshot, first.giftSnapshot);
      assert.equal((await buy(firstKey, updatedSelection)).error, "conflict");
      assert.equal(
        (await buy(firstKey, { ...originalSelection, expectedCoinCost: 9 }))
          .error,
        "conflict",
      );
      assert.deepEqual(
        (
          await client.query("SELECT * FROM direct_messages WHERE id=$1", [
            first.message.id,
          ])
        ).rows[0],
        historical,
      );
      const ledger = (
        await client.query(
          "SELECT amount,gift_name,gift_snapshot FROM coin_transactions WHERE from_user_id=$1 ORDER BY id",
          [sender],
        )
      ).rows;
      assert.deepEqual(
        ledger.map((row) => row.amount),
        [7, 7, 9],
      );
      assert.equal(ledger[0].gift_name, "Original history gift");
      assert.equal(ledger[0].gift_snapshot.thumbnail.id, thumbnailIds[0]);
      assert.equal(
        (
          await client.query(
            "SELECT balance FROM coin_balances WHERE user_id=$1",
            [recipient],
          )
        ).rows[0].balance,
        23,
      );
      assert.equal(
        (
          await client.query(
            "SELECT count(*)::int n FROM direct_messages WHERE from_user_id=$1",
            [sender],
          )
        ).rows[0].n,
        2,
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int n FROM users WHERE uid=ANY($1::int[])",
        [[sender, recipient]],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int n FROM catalog_gifts WHERE id=$1",
        [giftId],
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "PASS: managed DM gift history, revision-isolated combos, stale selection without charge, balanced payments and archive-safe exact retries. All fixtures rolled back.",
  );
} finally {
  client.release();
  await m.pool.end();
  await unlink(output).catch(() => {});
}
