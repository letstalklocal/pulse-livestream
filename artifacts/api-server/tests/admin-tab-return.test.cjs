const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('artifacts/admin/public/app.js', 'utf8');
const start = source.indexOf('document.addEventListener("visibilitychange",');
const end = source.indexOf('window.addEventListener("pagehide",', start);
assert.ok(start > 0 && end > start);
for (const section of ['Overview', 'Users', 'Gifts', 'Live streams', 'Reports', 'Verification', 'Account removals', 'Payout methods', 'Payout desk', 'Payout operators']) {
  let listener, checks = 0;
  const document = { hidden: true, addEventListener: (name, callback) => { assert.equal(name, 'visibilitychange'); listener = callback; } };
  const window = { Clerk: { loaded: true } };
  vm.runInNewContext(source.slice(start, end), {
    section, authorized: true, sessionId: 'same-session', document, window,
    checkAccess: () => checks++,
    clearPrivate: () => assert.fail(`${section}: tab switching must not clear state`),
    notice: () => assert.fail(`${section}: tab switching must not replace the page`),
  });
  listener(); assert.equal(checks, 0);
  document.hidden = false; listener(); assert.equal(checks, 1);
  window.Clerk.loaded = false; listener(); assert.equal(checks, 1);
}
console.log('PASS: all admin sections retain state on browser-tab switches and revalidate access on return. Handler test, not full section UI coverage.');
