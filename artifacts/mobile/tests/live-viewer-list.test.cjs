const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../utils/liveViewerList.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject });
const viewer = (uid, name, fields = {}) => ({ uid, name, present: true, muted: false, removed: false, blocked: false, ...fields });
const people = exportsObject.mergeLiveViewers([
  viewer(1, 'Alice', { muted: true, avatarImageUrl: 'avatar' }), viewer(2, 'Bob'), viewer(4, 'Restricted', { removed: true, present: false }),
], [{ uid: 1, name: 'Old Alice', coins: 50, rank: 2 }, { uid: 3, name: 'Former viewer', coins: 100, rank: 1 }]);
assert.equal(people.length, 4, 'Gift sender and viewer must share one row');
assert.equal(people[0].uid, 3);
assert.equal(people[0].present, false, 'A departed gift sender is not an active viewer');
assert.equal(people[1].name, 'Alice');
assert.equal(people[1].muted, true);
assert.equal(people[1].avatarImageUrl, 'avatar');
assert.equal(people[1].coins, 50);
assert.equal(people.find(person => person.uid === 4).removed, true);
assert.equal(people.find(person => person.uid === 2).coins, 0);
console.log('PASS: unified roster deduplication, ranking, current identity, departure status and moderation preservation.');
