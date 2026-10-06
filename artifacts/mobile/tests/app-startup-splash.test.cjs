const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/_layout.tsx'), 'utf8');
const ast = ts.createSourceFile('layout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['RootLayout', 'ApiAuthBridge', 'BuildConfigurationError', 'StartupLoading'];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast).replace(/^export default /, '')).join('\n');
let effects = [], hidden = 0, fontsLoaded = false, languageReady = false;
const scope = {
  React: { createElement: (type, props, ...children) => ({ type, props, children }) },
  useEffect: fn => effects.push(fn), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useAppLanguage: () => ({ ready: languageReady, t: text => text, localizedTextStyle: () => ({}) }),
  useFonts: () => [fontsLoaded, null], useClerkAuth: () => ({ getToken: async () => 'fixture' }),
  initializeAppLanguage: async () => {}, refreshPhoneAppLanguage() {},
  AppState: { addEventListener: () => ({ remove() {} }) },
  SplashScreen: { hideAsync: async () => { hidden++; } },
  QueryClient: class {}, setAuthTokenGetter() {}, publishableKey: 'fixture', tokenCache: {}, proxyUrl: undefined, styles: {},
  colors: { light: { primary: '#FF1966' } }, require: name => name,
};
for (const name of ['Inter_400Regular','Inter_500Medium','Inter_600SemiBold','Inter_700Bold','ClerkProvider','ClerkLoaded','ClerkLoading','SafeAreaProvider','ErrorBoundary','QueryClientProvider','GestureHandlerRootView','KeyboardProvider','AuthProvider','PurchasesProvider','RtmProvider','LivePlaybackProvider','RootLayoutNav','LivePictureInPicture','VideoCacheMaintenance','InAppNotifications','View','Text','Image','ActivityIndicator']) scope[name] = name;
const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const app = new Function(...Object.keys(scope), code + ';return {RootLayout,ApiAuthBridge,BuildConfigurationError,StartupLoading};')(...Object.values(scope));
function commit() { const pending = effects; effects = []; pending.forEach(fn => fn()); }
assert.equal(app.RootLayout(), null); commit(); assert.equal(hidden, 0, 'loading fonts/language must retain splash');
fontsLoaded = true;
assert.equal(app.RootLayout(), null); commit(); assert.equal(hidden, 0, 'font readiness alone must not hide splash');
languageReady = true;
const root = app.RootLayout(); commit();
assert.equal(hidden, 0, 'Clerk still loading: no premature hide and blank screen');
assert.equal(root.children[0].type, 'ClerkLoading');
assert.equal(root.children[0].children[0].type, app.StartupLoading);
const loading = app.StartupLoading();
assert.equal(loading.children[0].type, 'Image');
assert.equal(loading.children[1].children[0], 'Loading VIP Experience...');
assert.equal(loading.children[2].type, 'ActivityIndicator');
assert.equal(hidden, 0, 'native splash stays until the loading view commits');
commit(); assert.equal(hidden, 1, 'reveal the visible loading screen during Clerk startup');
assert.equal(root.children[1].type, 'ClerkLoaded');
assert.equal(root.children[1].children[0].type, app.ApiAuthBridge, 'app readiness must be inside ClerkLoaded');
app.ApiAuthBridge({ children: 'screens' }); commit();
assert.equal(hidden, 2, 'release splash when loaded directly without a loading-screen phase');
app.BuildConfigurationError(); commit();
assert.equal(hidden, 3, 'a missing-key error must be visible rather than trapped behind splash');
console.log('PASS: fonts/language retain native splash; delayed Clerk renders logo, translated Loading text and spinner; loaded app and configuration errors release splash. Actual Android launch timing remains device-pending.');
