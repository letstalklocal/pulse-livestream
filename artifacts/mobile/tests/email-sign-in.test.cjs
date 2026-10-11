const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');
const source = fs.readFileSync(require.resolve('../app/(auth)/sign-in.tsx'), 'utf8');
function flow(signIn) {
  const state = { error: null, busy: false, route: null };
  const errorHandler = source.slice(source.indexOf('  const showError ='), source.indexOf('  useEffect('));
  const handlers = source.slice(source.indexOf('  const finalizeSignIn ='), source.indexOf('  if (needsEmailVerification)'));
  const js = ts.transpileModule(errorHandler + handlers + '\nreturn { handleSubmit, handleVerify, handleResend };', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions = new Function('signIn', 'email', 'password', 'verifyCode', 'setSubmitError', 'setBusy', 'router', 't', js)(signIn, ' user@example.com ', 'password', ' 123456 ', value => state.error = value, value => state.busy = value, { replace: value => state.route = value }, value => value);
  return { ...actions, state };
}
function resource(status = 'complete') {
  return { status, supportedSecondFactors: [{ strategy: 'email_code' }], password: async () => ({ error: null }), finalize: async ({ navigate }) => { navigate(); return { error: null }; }, mfa: { sendEmailCode: async () => ({ error: null }), verifyEmailCode: async () => ({ error: null }) } };
}
test('successful password sign-in finalizes and trims email', async () => {
  const signIn = resource(); signIn.password = async params => { assert.equal(params.emailAddress, 'user@example.com'); return { error: null }; };
  const f = flow(signIn); await f.handleSubmit(); assert.equal(f.state.route, '/(tabs)'); assert.equal(f.state.busy, false);
});
for (const status of ['needs_client_trust', 'needs_second_factor']) test(`${status} sends email verification before waiting for code`, async () => {
  const signIn = resource(status); let sent = 0; signIn.mfa.sendEmailCode = async () => { sent++; return { error: null }; };
  const f = flow(signIn); await f.handleSubmit(); assert.equal(sent, 1); assert.equal(f.state.route, null); assert.equal(f.state.error, null);
});
test('returned global auth failure is visible', async () => {
  const signIn = resource(); signIn.password = async () => ({ error: { errors: [{ longMessage: 'Account is locked.' }] } });
  const f = flow(signIn); await f.handleSubmit(); assert.equal(f.state.error, 'Account is locked.'); assert.equal(f.state.route, null);
});
test('thrown network failure is visible and retry is enabled', async () => {
  const signIn = resource(); signIn.password = async () => { throw new Error('Network request failed'); };
  const f = flow(signIn); await f.handleSubmit(); assert.equal(f.state.error, 'Network request failed'); assert.equal(f.state.busy, false);
});
test('failed email delivery is visible and can be retried', async () => {
  const signIn = resource('needs_client_trust'); signIn.mfa.sendEmailCode = async () => ({ error: { message: 'Try again later' } });
  const f = flow(signIn); await f.handleSubmit(); assert.equal(f.state.error, 'Try again later');
  signIn.mfa.sendEmailCode = async () => ({ error: null }); await f.handleResend(); assert.equal(f.state.error, null); assert.equal(f.state.busy, false);
});
test('invalid verification cannot finalize', async () => {
  const signIn = resource(); signIn.mfa.verifyEmailCode = async () => ({ error: { message: 'Incorrect code' } });
  const f = flow(signIn); await f.handleVerify(); assert.equal(f.state.error, 'Incorrect code'); assert.equal(f.state.route, null);
});
test('unsupported verification and incomplete statuses provide a next step', async () => {
  for (const status of ['needs_second_factor', 'needs_new_password']) {
    const signIn = resource(status); signIn.supportedSecondFactors = [];
    const f = flow(signIn); await f.handleSubmit(); assert.ok(f.state.error); assert.equal(f.state.route, null);
  }
});
test('finalization failure is visible', async () => {
  const signIn = resource(); signIn.finalize = async () => ({ error: { message: 'Session could not be activated' } });
  const f = flow(signIn); await f.handleSubmit(); assert.equal(f.state.error, 'Session could not be activated'); assert.equal(f.state.busy, false);
});
