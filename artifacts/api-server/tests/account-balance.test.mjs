import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const { code } = transformSync(readFileSync(new URL('../../mobile/utils/accountBalance.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { accountBalance } = module.exports;
const missing = { dataUpdatedAt: 0 };
const result = (balance, dataUpdatedAt = 1) => ({ data: { balance }, dataUpdatedAt });
test('account balance remains visible before local profile sync', () => assert.equal(accountBalance(missing, result(31)), 31));
test('a request-status outage does not hide the profile wallet balance', () => assert.equal(accountBalance(result(1), missing), 1));
test('zero is a valid balance, not a loading state', () => assert.equal(accountBalance(result(0), missing), 0));
test('the newest successful balance wins after spending or receiving coins', () => {
  assert.equal(accountBalance(result(50, 10), result(20, 20)), 20);
  assert.equal(accountBalance(result(21, 30), result(20, 20)), 21);
});
test('missing or malformed balance is never displayed as zero', () => {
  assert.equal(accountBalance(missing, missing), undefined);
  assert.equal(accountBalance(result(NaN), result(Infinity)), undefined);
  assert.equal(accountBalance(result('10'), result(8)), 8);
});
