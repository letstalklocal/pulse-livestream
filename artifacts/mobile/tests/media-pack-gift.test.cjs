const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/media-packs.tsx'), 'utf8');
const start = source.indexOf('  const save = async () =>');
const end = source.indexOf('\n  const packs =', start);
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
async function run(giftId, { fail = false, returning = false, editing = false, retainedOnly = false, empty = false, duplicate = false } = {}) {
  const state = { uploaded: 0, created: [], updated: [], error: null, gift: giftId, back: 0, invalidated: [], saving: false };
  const scope = {
    giftId, saving: false, busyRef: { current: false }, editingId: editing ? '7' : null, price: '299', name: 'My pack', assets: [{ uri: 'local-photo', mimeType: 'image/jpeg', type: 'image', width: 100, height: 100 }],
    returnToSticker: returning ? '1' : undefined, recipientId: undefined,
    setError: value => { state.error = value; }, setSaving: value => { state.saving = value; },
    setEditingId() {},
    update: { mutateAsync: async request => { state.updated.push(request); if (fail) throw Error("offline"); return { pack: { id: "7" } }; } },
    setGiftId: value => { state.gift = value; }, setVisible() {}, setName() {}, setPrice() {}, setAssets() {},
    requestUpload: { mutateAsync: async () => { state.uploaded++; return { uploadUrl: 'https://fixture.invalid/upload', objectPath: '/objects/photo' }; } },
    File: class { constructor(uri) { this.uri = uri; } }, fetch: async () => ({ ok: true }),
    create: { mutateAsync: async request => { state.created.push(request); if (fail) throw Error('offline'); return { pack: { id: '7' } }; } },
    packsQuery: { refetch: async () => {} }, queryClient: { invalidateQueries: async key => state.invalidated.push(key) },
    router: { back: () => { state.back++; } }, sendPack: { mutateAsync: async () => { throw Error('Unexpected DM send'); } },
  };
  if (editing) scope.assets.unshift({ savedItemId: '42', uri: 'https://fixture.invalid/saved', type: 'image', width: 100, height: 100 });
  if (retainedOnly) scope.assets = scope.assets.filter(a => a.savedItemId);
  if (empty) scope.assets = [];
  const save = new Function(...Object.keys(scope), code + '\nreturn save;')(...Object.values(scope));
  await Promise.all(duplicate ? [save(), save()] : [save()]);
  return state;
}
(async () => {
  assert.doesNotMatch(source, /value=\{price\}|setPrice|price: coinPrice/, 'Manual pricing is removed');
  const hydration = {};
  const scope = { busyRef: { current: false } };
  for (const field of ['EditingId','Name','Price','GiftId','Error','Assets','Visible']) scope[`set${field}`] = value => { hydration[field] = value; };
  const editSource = source.slice(source.indexOf('  const openEdit ='), source.indexOf('  useEffect(', source.indexOf('  const openEdit =')));
  const editCode = ts.transpileModule(editSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const editor = new Function(...Object.keys(scope), editCode + '\nreturn { openEdit, closeEditor };')(...Object.values(scope));
  editor.openEdit({ id: '7', name: 'Existing', price: 299, giftId: 'heart', items: [{ id: '42', mediaUrl: 'private-photo', mediaType: 'image', contentType: 'image/jpeg', width: 100, height: 100 }] });
  assert.equal(hydration.GiftId, 'heart');
  assert.equal(hydration.Assets[0].savedItemId, '42');
  assert.equal(hydration.Assets[0].uri, 'private-photo');
  scope.busyRef.current = true;
  editor.closeEditor();
  assert.equal(hydration.Visible, true, 'Cannot dismiss while saving');
  scope.busyRef.current = false;
  editor.closeEditor();
  assert.equal(hydration.Visible, false, 'Cancel closes without a save');
  const missing = await run(null);
  assert.equal(missing.uploaded, 0, 'No upload starts before gift selection');
  assert.equal(missing.created.length, 0);
  assert.equal(missing.error, 'Choose a gift');
  const saved = await run('diamond');
  assert.equal(saved.created[0].data.giftId, 'diamond');
  assert.equal(saved.created[0].data.price, undefined, 'Only the server gift catalog sets the price');
  assert.equal(saved.gift, null, 'Fresh creation resets the saved gift choice');
  const failed = await run('crown', { fail: true });
  assert.equal(failed.gift, 'crown', 'Failure preserves gift selection for retry');
  assert.equal(failed.saving, false);
  const returned = await run('heart', { returning: true });
  assert.equal(returned.back, 1);
  assert.deepEqual(returned.invalidated, [{ queryKey: ['sticker-packs'] }, { queryKey: ['live-stickers'] }], 'Returning to Go Live refreshes saved pack artwork');
  const edited = await run('rocket', { editing: true, duplicate: true });
  assert.equal(edited.created.length, 0, 'Editing does not create another pack');
  assert.equal(edited.updated.length, 1, 'Rapid saves cannot duplicate uploads or updates');
  assert.equal(edited.uploaded, 1, 'Only newly added media uploads');
  assert.equal(edited.updated[0].packId, 7);
  assert.deepEqual(edited.updated[0].data.items[0], { id: '42' });
  assert.equal(edited.updated[0].data.giftId, 'rocket');
  assert.equal(edited.updated[0].data.price, undefined, 'Editing sends the gift, never an independent price');
  const giftOnly = await run('crown', { editing: true, retainedOnly: true });
  assert.equal(giftOnly.uploaded, 0, 'Gift-only edits never reupload saved media');
  assert.equal(giftOnly.updated.length, 1);
  const noMedia = await run('rose', { editing: true, empty: true });
  assert.equal(noMedia.updated.length, 0, 'Cannot save an empty pack');
  const editFailed = await run('party', { editing: true, fail: true });
  assert.equal(editFailed.gift, 'party', 'Failed edit preserves draft choice');
  assert.equal(editFailed.saving, false);
  console.log('PASS: pack creation and editing preserve saved media, ownership identity, gift selection, gift-derived price, failed drafts, duplicate-save guards and cache refresh.');
})().catch(error => { console.error(error); process.exitCode = 1; });
