import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../mobile/app/go-live.tsx', import.meta.url), 'utf8');
const expression = source.match(/const backgroundImageUrl = ([\s\S]*?);/)[1];
const imageUrl = new Function('backgroundProfile', 'user', `return ${expression};`);
test('preview replaces an expired cached URL with the refreshed URL for the saved object', () => {
  const user = { streamBackgroundImagePath: '/objects/background', streamBackgroundImageUrl: 'expired-url' };
  assert.equal(imageUrl({ user: { ...user, streamBackgroundImageUrl: 'fresh-url' } }, user), 'fresh-url');
  assert.equal(imageUrl(undefined, user), 'expired-url');
});
test('an older profile response cannot overwrite a newly uploaded background preview', () => {
  assert.equal(imageUrl({ user: { streamBackgroundImagePath: '/objects/old', streamBackgroundImageUrl: 'old-url' } },
    { streamBackgroundImagePath: '/objects/new', streamBackgroundImageUrl: 'new-url' }), 'new-url');
});
test('preview refreshes on entry and foreground, and stops its listener when leaving', () => {
  const start = source.indexOf('  useFocusEffect(useCallback(() => {');
  const end = source.indexOf('  }, [user?.uid, isLive, refreshBackground]));', start);
  const effect = source.slice(start, end + '  }, [user?.uid, isLive, refreshBackground]));'.length);
  for (const live of [false, true]) {
    let refreshes = 0, listener, cleanup, removed = false;
    new Function('useFocusEffect', 'useCallback', 'user', 'isLive', 'refreshBackground', 'AppState', effect)(
      fn => { cleanup = fn(); }, fn => fn, { uid: 1 }, live, () => { refreshes++; },
      { addEventListener: (event, fn) => { assert.equal(event, 'change'); listener = fn; return { remove: () => { removed = true; } }; } },
    );
    assert.equal(refreshes, live ? 0 : 1);
    if (!live) {
      listener('background'); assert.equal(refreshes, 1);
      listener('active'); assert.equal(refreshes, 2);
      cleanup(); assert.equal(removed, true);
    } else assert.equal(listener, undefined);
  }
});
