const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleFixture = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('artifacts/mobile/utils/liveGiftDelivery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module: moduleFixture, exports: moduleFixture.exports });
const { deliveryFeed, giftIsInServerFeed } = moduleFixture.exports;
const own = { id: 'own', channelName: 'composed-own', publisherUid: 1 }, peer = { id: 'peer', channelName: 'composed-peer', publisherUid: 2 };
assert.equal(deliveryFeed(null), null); assert.equal(deliveryFeed({ id: 'bad' }), null);
assert.equal(giftIsInServerFeed({ sessionId: 'own', recipientUid: 1 }, [own, peer]), true);
assert.equal(giftIsInServerFeed({ sessionId: 'peer', recipientUid: 2 }, [own, peer]), true);
assert.equal(giftIsInServerFeed({ sessionId: 'peer', recipientUid: 1 }, [own, peer]), false);
assert.equal(giftIsInServerFeed({ sessionId: 'retired', recipientUid: 1 }, [own]), false);
assert.equal(giftIsInServerFeed(undefined, [own]), false);
console.log('PASS: suppress duplicate gift playback only for the actual recipient feed/session; preserve fallback and party ownership.');
