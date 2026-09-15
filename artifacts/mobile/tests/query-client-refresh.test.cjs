const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const { QueryClient, QueryClientProvider, QueryObserver } = require('@tanstack/react-query');

// Re-evaluate the actual layout module as Metro does, preserving hook state as
// Fast Refresh does. Native rendering and unrelated providers are stubbed.
function refreshHarness() {
  const state = [];
  let slot = 0;
  const noop = () => {};
  const react = {
    useEffect: noop,
    useState(initial) {
      const index = slot++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], noop];
    },
  };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@tanstack/react-query': { QueryClient, QueryClientProvider },
    '@/i18n': { useAppLanguage: () => ({}) },
    '@/constants/colors': { light: {} },
    '@expo-google-fonts/inter': { useFonts: () => [true, null] },
    'expo-splash-screen': { preventAutoHideAsync: noop },
    'react-native': { StyleSheet: { create: value => value } },
    '@workspace/api-client-react': { setBaseUrl: noop },
  };
  const source = ts.transpileModule(readFileSync(`${__dirname}/../app/_layout.tsx`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  function findClient(node) {
    if (!node) return;
    if (node.type === QueryClientProvider) return node.props.client;
    for (const child of [node.props?.children].flat()) {
      const client = findClient(child);
      if (client) return client;
    }
  }
  return () => {
    const exports = {};
    runInNewContext(source, {
      exports,
      require: name => mocks[name] ?? {},
      process: { env: { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-key' } },
    });
    slot = 0;
    return findClient(exports.default());
  };
}

test('Metro module refresh retains the cache used by mounted screen observers', async () => {
  const refresh = refreshHarness();
  const original = refresh();
  assert.ok(original instanceof QueryClient);
  const key = ['refresh-regression'];
  original.setQueryData(key, 'before refresh');
  const observer = new QueryObserver(original, { queryKey: key, enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  try {
    const refreshed = refresh();
    assert.equal(refreshed, original, 'Fast Refresh must not replace the active QueryClient');
    assert.equal(refresh(), original, 'repeated edits must retain the same client');
    await refreshed.fetchQuery({ queryKey: key, queryFn: async () => 'after refresh', staleTime: 0 });
    assert.equal(observer.getCurrentResult().data, 'after refresh');
    assert.equal(refreshed.getDefaultOptions().queries.retry, 1);
    assert.equal(refreshed.getDefaultOptions().queries.staleTime, 10_000);
  } finally {
    unsubscribe();
    original.clear();
  }
});
