import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';

const root = fileURLToPath(new URL('../../mobile/', import.meta.url));
const output = fileURLToPath(new URL(`.first-language-${randomUUID()}.cjs`, import.meta.url));
const require = createRequire(import.meta.url);
const mocks = {
  react: 'export const useSyncExternalStore=(subscribe,snapshot)=>snapshot();',
  'expo-localization': 'if(globalThis.pulseLocaleFixture.missing)throw Error("Cannot find native module ExpoLocalization"); export const getLocales=()=>{const f=globalThis.pulseLocaleFixture;if(f.fail)throw Error("unavailable");return [{languageTag:f.locale}];};',
  '@react-native-async-storage/async-storage': 'export default {getItem:async()=>globalThis.pulseLocaleFixture.saved,setItem:async(key,value)=>{globalThis.pulseLocaleFixture.saved=value;}};',
};
try {
  await build({ stdin: { contents: "export * from './i18n';", resolveDir: root }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{ name: 'native-settings', setup(b) {
    b.onResolve({ filter: /.*/ }, a => a.path in mocks ? { path: a.path, namespace: 'mock' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: mocks[a.path] }));
  } }] });
  function load(locale, saved = null, fail = false, missing = false) {
    globalThis.pulseLocaleFixture = { locale, saved, fail, missing };
    delete require.cache[output];
    return require(output);
  }
  // Node Intl defaults to English here: the native Spanish setting must win.
  let app = load('es-CO');
  assert.equal(app.useAppLanguage().language, 'es', 'Spanish is selected before storage, auth or network');
  assert.equal(app.t('Create Account'), 'Crear cuenta');
  await app.initializeAppLanguage();
  assert.equal(app.useAppLanguage().ready, true);
  assert.equal(app.appLocale(), 'es-CO');
  globalThis.pulseLocaleFixture.locale = 'pt-BR';
  app.refreshPhoneAppLanguage();
  assert.equal(app.useAppLanguage().language, 'pt-BR');
  await app.setAppLanguage('fr');
  globalThis.pulseLocaleFixture.locale = 'es-CO';
  app.refreshPhoneAppLanguage();
  assert.equal(app.useAppLanguage().language, 'fr', 'manual language selection is preserved');
  app = load('es-CO', 'de'); await app.initializeAppLanguage();
  assert.equal(app.useAppLanguage().language, 'de', 'saved choice wins when startup is ready');
  app = load('es-CO', 'invalid'); await app.initializeAppLanguage();
  assert.equal(app.useAppLanguage().language, 'es');
  app = load('xx-XX'); await app.initializeAppLanguage();
  assert.equal(app.useAppLanguage().language, 'en');
  app = load('es-CO', null, true); await app.initializeAppLanguage();
  assert.equal(app.useAppLanguage().language, 'en', 'native failure has a safe fallback');
  app = load('es-CO', 'es', false, true);
  await app.initializeAppLanguage();
  assert.equal(app.useAppLanguage().language, 'es', 'missing native module does not crash startup or discard saved language');
  const config = JSON.parse(readFileSync(root + 'app.json', 'utf8')).expo;
  const plugin = config.plugins.find(item => Array.isArray(item) && item[0] === 'expo-localization');
  assert.ok(plugin[1].supportedLocales.includes('es'));
  assert.equal(plugin[1].supportsRTL, false, 'Arabic wording does not globally mirror approved layouts');
  const layout = readFileSync(root + 'app/_layout.tsx', 'utf8');
  assert.match(layout, /\|\| !languageReady\) return null/, 'wait for saved preference before displaying screens');
  console.log('PASS: native Spanish before sign-in/network, saved choices, foreground refresh, fallbacks, supported-language configuration and startup readiness. Physical-device checks remain pending.');
} finally {
  delete globalThis.pulseLocaleFixture;
  try { unlinkSync(output); } catch {}
}
