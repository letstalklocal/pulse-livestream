import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';
const { code } = transformSync(readFileSync(new URL('../src/lib/vipAccess.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' });
const entitlement = { items: [{ id: 'entl41ad621812' }] };
function fixture(pages, env = 'development') {
  const calls = [];
  const module = { exports: {} };
  new Function('module', 'exports', 'require', 'process', 'fetch', code)(module, module.exports, () => ({}), {
    env: { NODE_ENV: env, REVENUECAT_API_V2_SECRET_KEY: 'test-only' },
  }, async url => {
    calls.push(String(url));
    const page = pages.shift();
    if (page instanceof Error) throw page;
    assert.ok(page, 'unexpected provider request');
    return { ok: (page.status ?? 200) === 200, status: page.status ?? 200, json: async () => page };
  });
  return { check: async id => (await module.exports.fetchVipSnapshot(id)).active, calls };
}
const sub = (extra = {}) => ({ environment: 'sandbox', gives_access: true, ends_at: Date.now() + 3600000, entitlements: entitlement, ...extra });
test('active subscription grants persisted VIP access', async () => {
  const f = fixture([{ items: [sub()] }, { items: [] }]);
  assert.equal(await f.check('user_test'), true);
  assert.equal(f.calls.length, 2);
});
test('inactive/revoked access is denied; unrelated entitlements do not grant VIP', async () => {
  for (const item of [sub({ gives_access: false }), sub({ entitlements: { items: [{ id: 'other' }] } })]) {
    assert.equal(await fixture([{ items: [item] }, { items: [] }]).check('user_test'), false);
  }
});
test('lifetime purchase grants access; refunds and coin purchases do not', async () => {
  for (const [product_id, status, expected] of [['prod351de29723', 'owned', true], ['prod351de29723', 'refunded', false], ['coin_product', 'owned', false]]) {
    const f = fixture([{ items: [] }, { items: [{ environment: 'sandbox', product_id, status, entitlements: entitlement }] }]);
    assert.equal(await f.check('user_test'), expected);
  }
});
test('temporary production-server override fetches sandbox VIP', async () => {
  const f = fixture([{ items: [sub()] }, { items: [] }], 'production');
  assert.equal(await f.check('user_test'), true);
  assert.ok(f.calls.every(url => url.includes('environment=sandbox')));
});
test('temporary sandbox override excludes production purchases', async () => {
  assert.equal(await fixture([{ items: [sub({ environment: 'production' })] }, { items: [] }], 'production').check('user_test'), false);
});
test('provider errors fail closed and are not retained as success', async () => {
  const f = fixture([{ status: 503 }, { items: [sub()] }, { items: [] }]);
  await assert.rejects(f.check('user_test'));
  assert.equal(await f.check('user_test'), true);
});
test('no positive caching: access revoked between requests is denied', async () => {
  const f = fixture([{ items: [sub()] }, { items: [] }, { items: [] }, { items: [] }]);
  assert.equal(await f.check('user_test'), true);
  assert.equal(await f.check('user_test'), false);
});
test('valid pagination is followed but foreign URLs cannot receive credentials', async () => {
  const root = '/v2/projects/proj2b054d16/customers/user_test/subscriptions?starting_after=x';
  assert.equal(await fixture([{ items: [], next_page: root }, { items: [sub()] }, { items: [] }]).check('user_test'), true);
  const f = fixture([{ items: [], next_page: 'https://other.example/steal' }]);
  await assert.rejects(f.check('user_test'), /pagination/);
  assert.equal(f.calls.length, 1);
});
