const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(`${__dirname}/../lib/${file}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: name => deps[name], Promise });
  return exports;
}
const config = load('revenuecat-config');
const { RevenueCatSession, hasPulsePro, coinPackages, purchaseErrorMessage } = load('revenuecat-session', { './revenuecat-config': config });
const info = (active = false) => ({ entitlements: { active: active ? { pulse_pro: { isActive: true } } : {} } });
function mock() {
  let id, configured = false;
  const calls = [];
  return { calls, configure: ({ appUserID }) => { configured = true; id = appUserID; calls.push(['configure', id]); },
    isConfigured: async () => configured, getAppUserID: async () => id, isAnonymous: async () => !id,
    logIn: async user => { id = user; calls.push(['login', id]); return { customerInfo: info() }; },
    logOut: async () => { id = undefined; calls.push(['logout']); return info(); },
    getCustomerInfo: async () => info(id === 'alice'), getOfferings: async () => ({ current: null }),
    restorePurchases: async () => info(), purchasePackage: async pkg => ({ customerInfo: info(), transaction: { transactionIdentifier: pkg.identifier } }),
  };
}
test('test key used for native development only, platform keys for releases, web unsupported', () => {
  assert.equal(config.purchaseConfiguration('ios', true, {}).apiKey, config.REVENUECAT_TEST_KEY);
  assert.equal(config.purchaseConfiguration('android', false, { mode: 'test' }).apiKey, config.REVENUECAT_TEST_KEY);
  assert.equal(config.purchaseConfiguration('ios', false, {}).apiKey, undefined);
  assert.equal(config.purchaseConfiguration('web', true, {}).apiKey, undefined);
  assert.equal(config.purchaseConfiguration('ios', false, { iosKey: 'secret_unsafe' }).apiKey, undefined);
  assert.equal(config.purchaseConfiguration('android', false, { androidKey: 'goog_public' }).apiKey, 'goog_public');
});
test('configure once, sign out, and switch accounts without retaining another entitlement', async () => {
  const sdk = mock(), session = new RevenueCatSession(sdk, 'test_key');
  assert.equal(hasPulsePro(await session.identify('alice')), true);
  assert.equal(hasPulsePro(await session.identify('bob')), false);
  await session.identify(null);
  await assert.rejects(session.run('bob', sdk => sdk.getCustomerInfo()), /account changed/);
  await session.identify('alice');
  assert.equal(sdk.calls.filter(([kind]) => kind === 'configure').length, 1);
  assert.equal(sdk.calls.filter(([kind]) => kind === 'logout').length, 1);
});
test('switching accounts during purchase rejects its stale result and serializes native login', async () => {
  const sdk = mock(), session = new RevenueCatSession(sdk, 'test_key');
  await session.identify('alice');
  let finish, began;
  const started = new Promise(resolve => { began = resolve; });
  const purchase = session.run('alice', async () => { began(); return new Promise(resolve => { finish = resolve; }); });
  await started;
  const rejection = assert.rejects(purchase, /account changed/);
  const login = session.identify('bob');
  finish(info(true));
  await rejection;
  assert.equal(hasPulsePro(await login), false);
  assert.equal(await sdk.getAppUserID(), 'bob');
});
test('failed SDK operation does not poison later purchases/restores', async () => {
  const sdk = mock(), session = new RevenueCatSession(sdk, 'test_key');
  await session.identify('alice');
  await assert.rejects(session.run('alice', async () => { throw new Error('network'); }), /network/);
  assert.equal(hasPulsePro(await session.run('alice', sdk => sdk.getCustomerInfo())), true);
});
test('coin cards use only known non-subscription products, server amounts and store-localized prices', () => {
  const pkg = (identifier, priceString, subscriptionPeriod = null) => ({ identifier, product: { identifier, priceString, subscriptionPeriod } });
  const results = coinPackages([pkg('consumable', '€4,99'), pkg('yearly', '$99', 'P1Y'), pkg('unknown', '$1')], { consumable: 500, yearly: 999 });
  assert.equal(results.length, 1);
  assert.equal(results[0].coins, 500);
  assert.equal(results[0].price, '€4,99');
  assert.equal(coinPackages([pkg('bad', '$1')], { bad: -1 }).length, 0);
  assert.equal(hasPulsePro(null), false);
  assert.equal(hasPulsePro({ entitlements: { active: {}, all: { pulse_pro: { isActive: false } } } }), false);
});
test('cancelled purchases are silent; pending/network errors are actionable', () => {
  assert.equal(purchaseErrorMessage({ userCancelled: true }), '');
  assert.match(purchaseErrorMessage({ code: '20' }), /pending/);
  assert.match(purchaseErrorMessage({ code: '10' }), /connect/);
});
test('production EAS guard rejects explicit test-store mode', () => {
  const file = require('../app.config.js');
  const oldProfile = process.env.EAS_BUILD_PROFILE, oldMode = process.env.EXPO_PUBLIC_REVENUECAT_MODE;
  try {
    process.env.EAS_BUILD_PROFILE = 'production'; process.env.EXPO_PUBLIC_REVENUECAT_MODE = 'test';
    assert.throws(() => file({ config: {} }), /cannot use RevenueCat Test Store/);
    process.env.EXPO_PUBLIC_REVENUECAT_MODE = 'store';
    assert.deepEqual(file({ config: { name: 'Pulse' } }), { name: 'Pulse' });
  } finally {
    if (oldProfile === undefined) delete process.env.EAS_BUILD_PROFILE; else process.env.EAS_BUILD_PROFILE = oldProfile;
    if (oldMode === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_MODE; else process.env.EXPO_PUBLIC_REVENUECAT_MODE = oldMode;
  }
});
