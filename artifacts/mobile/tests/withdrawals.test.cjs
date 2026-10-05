const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
function load(path, mocks = {}) {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(require.resolve(path), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      console,
      process: { env: {} },
      fetch: async () => {},
      require: (id) => {
        if (id in mocks) return mocks[id];
        throw Error(id);
      },
    },
  );
  return module.exports;
}
const utils = load("../utils/withdrawals.ts");
assert.equal(utils.usdCents("15"), 1500);
assert.equal(utils.usdCents("14.01"), 1401);
assert.equal(utils.usdCents("0.99"), 99);
assert.equal(utils.usdCents("15.001"), null);
assert.equal(utils.usdCents("1e3"), null);
assert.equal(utils.usdCents("-15"), null);

assert.equal(
  utils.safeProviderLink("https://www.remitly.com/us/en/recipient/test"),
  "https://www.remitly.com/us/en/recipient/test",
);
for (const link of [
  "http://remitly.com/",
  "https://remitly.com.evil.test/",
  "https://evilremitly.com/",
  "https://user:password@remitly.com/",
  "javascript:alert(1)",
])
  assert.equal(utils.safeProviderLink(link), null);
const pending = {
  accountId: "alice",
  methodId: "co-wallet",
  withdrawalCents: 1500,
  idempotencyKey: "stable-key",
};
assert.ok(utils.sameWithdrawal(pending, "alice", "co-wallet", 1500));
for (const amount of [2500, 50000])
  assert.equal(
    utils.parsePendingWithdrawal(
      JSON.stringify({ ...pending, withdrawalCents: amount }),
      "alice",
    ).withdrawalCents,
    amount,
  );
for (const amount of [2499, 50001, 2500.5])
  assert.equal(
    utils.parsePendingWithdrawal(
      JSON.stringify({ ...pending, withdrawalCents: amount }),
      "alice",
    ),
    null,
  );
assert.ok(!utils.sameWithdrawal(pending, "bob", "co-wallet", 1500));
assert.ok(!utils.sameWithdrawal(pending, "alice", "co-bank", 1500));
assert.equal(utils.parsePendingWithdrawal("{broken", "alice"), null);
assert.equal(
  utils.parsePendingWithdrawal(JSON.stringify(pending), "bob"),
  null,
);
assert.equal(
  utils.parsePendingWithdrawal(
    JSON.stringify({ ...pending, withdrawalCents: NaN }),
    "alice",
  ),
  null,
);
assert.equal(
  utils.withdrawalStatus("awaiting_confirmation"),
  "Review your quote",
);
assert.equal(utils.withdrawalStatus("delivered"), "Paid");
assert.equal(utils.withdrawalStatus("unknown"), "Payment outcome under review");
const hook = fs.readFileSync(
  require.resolve("../hooks/useWithdrawals.ts"),
  "utf8",
);
// Exercise the actual submit closure across network loss, relaunch, duplicate taps and account switch.
const walletInvalidations = [];
const stored = new Map(),
  refs = [],
  states = [];
let ri = 0,
  si = 0,
  effects = [],
  userId = "alice",
  uuid = 0,
  mode = "network",
  calls = [],
  resolver;
const react = {
  useCallback: (fn) => fn,
  useRef: (value) => (refs[ri++] ??= { current: value }),
  useState: (initial) => {
    const i = si++;
    states[i] ??= initial;
    return [states[i], (v) => (states[i] = v)];
  },
  useEffect: (fn) => effects.push(fn),
};
// request uses fetch in its isolated context; reload with an injectable fetch via replacing the source boundary.
const source = ts.transpileModule(hook, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const module2 = { exports: {} };
const mocks = {
  react,
  "react-native": { AppState: { addEventListener: () => ({ remove() {} }) } },
  "@clerk/expo": {
    useAuth: () => ({ userId, getToken: async () => userId + "-token" }),
  },
  "@tanstack/react-query": {
    useQuery: () => ({ refetch: async () => {} }),
    useQueryClient: () => ({
      invalidateQueries: async (options) => {
        walletInvalidations.push(options.queryKey);
      },
    }),
  },
  "@react-native-async-storage/async-storage": {
    getItem: async (k) => stored.get(k) ?? null,
    setItem: async (k, v) => stored.set(k, v),
    removeItem: async (k) => stored.delete(k),
  },
  "expo-crypto": { randomUUID: () => `uuid-${++uuid}` },
  "@/utils/withdrawals": utils,
  "@/context/AuthContext": {
    useAuth: () => ({ user: { uid: 7, clerkId: userId } }),
  },
  "@workspace/api-client-react": {
    getGetCoinBalanceQueryKey: ({ uid }) => ["coin-balance", uid],
  },
};
vm.runInNewContext(source, {
  module: module2,
  exports: module2.exports,
  process: { env: {} },
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: async (url, options) => {
    calls.push({ url, ...options });
    if (mode === "network") throw Error("network");
    if (mode === "wait") await new Promise((r) => (resolver = r));
    return {
      ok: mode !== "rejected" && mode !== "server-error",
      status: mode === "rejected" ? 409 : mode === "server-error" ? 503 : 200,
      json: async () => ({ id: "wd-real", status: "awaiting_quote" }),
    };
  },
  require: (id) => mocks[id],
});
function render() {
  ri = si = 0;
  effects = [];
  return module2.exports.useWithdrawals();
}
(async () => {
  let api = render();
  await assert.rejects(api.submit("co-wallet", 1500));
  assert.equal(uuid, 1);
  assert.equal(
    JSON.parse(stored.get("pulse-withdrawal-pending:alice")).idempotencyKey,
    "uuid-1",
  );
  api = render();
  await assert.rejects(api.submit("co-bank", 1500));
  assert.equal(
    calls.length,
    1,
    "changing an uncertain request does not send another request",
  );
  mode = "wait";
  const submitting = api.submit("co-wallet", 1500);
  await new Promise((r) => setImmediate(r));
  await assert.rejects(api.submit("co-wallet", 1500));
  assert.equal(
    JSON.parse(calls.at(-1).body).idempotencyKey,
    "uuid-1",
    "retry reuses persisted key",
  );
  userId = "bob";
  render();
  resolver();
  await assert.rejects(submitting);
  assert.ok(
    stored.has("pulse-withdrawal-pending:alice"),
    "stale response cannot clear prior account pending request",
  );
  mode = "success";
  api = render();
  await api.submit("co-wallet", 1500);
  assert.equal(JSON.parse(calls.at(-1).body).idempotencyKey, "uuid-2");
  assert.equal(calls.at(-1).headers.Authorization, "Bearer bob-token");
  assert.ok(stored.has("pulse-withdrawal-pending:alice"));
  assert.ok(!stored.has("pulse-withdrawal-pending:bob"));
  assert.ok(
    walletInvalidations.some(
      (key) => key[0] === "coin-balance" && key[1] === 7,
    ),
    "successful wallet cashout refreshes spendable coin balance",
  );
  mode = "rejected";
  api = render();
  await assert.rejects(api.submit("co-wallet", 1500));
  assert.ok(
    !stored.has("pulse-withdrawal-pending:bob"),
    "definitive rejection unlocks selection",
  );
  mode = "server-error";
  api = render();
  await assert.rejects(api.submit("co-bank", 1500));
  const serverKey = JSON.parse(
    stored.get("pulse-withdrawal-pending:bob"),
  ).idempotencyKey;
  mode = "success";
  api = render();
  await api.submit("co-bank", 1500);
  assert.equal(
    JSON.parse(calls.at(-1).body).idempotencyKey,
    serverKey,
    "uncertain server errors retain retry key",
  );
  console.log(
    "withdrawal amount parsing, safe provider links, persistent retries, double taps and account isolation passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

async function verifyQuoteScreen() {
  let sharingAvailable = true;
  let sharingMissing = true;
  let sharingImports = 0;
  let statementRequests = 0;
  const cancelAlerts = [];
  const state = [],
    refs = [],
    approvals = [],
    links = [],
    shares = [],
    files = new Map();
  let si = 0,
    ri = 0;
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState: (initial) => {
      const i = si++;
      if (!(i in state)) state[i] = initial;
      return [state[i], (next) => (state[i] = next)];
    },
    useRef: (initial) => (refs[ri++] ??= { current: initial }),
    useCallback: (fn) => fn,
    useEffect: () => {},
  };
  const withdrawal = {
    id: "wd-current",
    status: "awaiting_confirmation",
    grossCents: 1500,
    createdAt: new Date().toISOString(),
    recipient: {
      legalFirstName: "Maria",
      legalLastName: "Gomez",
      countryCode: "CO",
    },
    quote: {
      hash: "actual-backend-quote-hash",
      sendAmountCents: 1401,
      feeCents: 99,
      taxCents: 0,
      totalEarningsDeductedCents: 1500,
      receiveAmount: "60000",
      receiveCurrency: "COP",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
    providerLink: "https://www.remitly.com/recipient/verified",
    providerOnboardingStatus: "pending",
    history: [],
  };
  const api = {
    userId: "alice",
    detail: { data: withdrawal },
    refresh: async () => {},
    approve: async (hash) => approvals.push(hash),
    cancel: async () => {
      withdrawal.status = "canceled";
    },
    statement: async () => {
      statementRequests++;
      return "Pulse statement\nReserved gross USD: 15.00";
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(require.resolve("../app/withdrawal/[id].tsx"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      URL,
      Blob,
      setTimeout,
      require: (id) => {
        if (id === "react") return react;
        if (id === "expo-file-system")
          return {
            Paths: { cache: "cache" },
            File: class {
              constructor(_, name) {
                this.uri = `file:///private/cache/${name}`;
              }
              create() {
                files.set(this.uri, "");
              }
              write(v) {
                files.set(this.uri, v);
              }
              get exists() {
                return files.has(this.uri);
              }
              delete() {
                files.delete(this.uri);
              }
            },
          };
        if (id === "expo-sharing") {
          sharingImports++;
          if (sharingMissing)
            throw new Error("Cannot find native module 'ExpoSharing'");
          return {
            isAvailableAsync: async () => sharingAvailable,
            shareAsync: async (url, options) => {
              shares.push({ url, ...options, content: files.get(url) });
            },
          };
        }
        if (id === "expo-crypto")
          return { randomUUID: () => "private-statement-id" };
        if (id === "react-native")
          return {
            ...Object.fromEntries(
              [
                "ActivityIndicator",
                "RefreshControl",
                "ScrollView",
                "Text",
                "TouchableOpacity",
                "View",
              ].map((key) => [key, key]),
            ),
            StyleSheet: { create: (x) => x },
            Platform: { OS: "ios" },
            useWindowDimensions: () => ({ width: 390, height: 844 }),
            Alert: { alert: (...args) => cancelAlerts.push(args) },
            Linking: { openURL: async (link) => links.push(link) },
          };
        if (id === "expo-router")
          return {
            useFocusEffect: () => {},
            useLocalSearchParams: () => ({ id: "wd-current" }),
            useRouter: () => ({ back() {} }),
          };
        if (id === "@expo/vector-icons") return { Ionicons: "Ionicons" };
        if (id === "react-native-safe-area-context")
          return { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) };
        if (id === "@/i18n")
          return {
            useAppLanguage: () => ({
              t: (key, values = {}) =>
                key.replace(/\{(v\d+)\}/g, (_, name) => values[name] ?? name),
              appLocale: () => "en",
              localizedTextStyle: () => ({}),
            }),
          };
        if (id === "@/hooks/useColors") return { useColors: () => ({}) };
        if (id === "@/hooks/useWithdrawals")
          return { useWithdrawals: () => api };
        if (id === "@/utils/withdrawals") return utils;
        if (id === "libphonenumber-js/min")
          return require("libphonenumber-js/min");
        throw Error(id);
      },
    },
  );
  function render() {
    si = ri = 0;
    const nodes = [];
    function walk(n) {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      nodes.push(n);
      walk(n.props?.children);
    }
    walk(module.exports.default());
    const texts = nodes
      .filter((n) => n.type === "Text")
      .flatMap((n) => n.props.children)
      .filter((v) => typeof v === "string");
    return {
      nodes,
      texts,
      button: (label) =>
        nodes.find(
          (n) =>
            n.type === "TouchableOpacity" &&
            n.props.children.some(
              (child) =>
                child?.type === "Text" && child.props.children.includes(label),
            ),
        ),
    };
  }
  let v = render();
  assert.equal(
    sharingImports,
    0,
    "An older native build can load and render the route without ExpoSharing",
  );
  v.button("Download statement").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(sharingImports, 1);
  assert.equal(
    statementRequests,
    0,
    "Missing native sharing fails before requesting a statement",
  );
  assert.ok(render().texts.includes("Sharing is unavailable on this device."));
  sharingMissing = false;
  assert.ok(v.texts.includes("Reserved withdrawal: $15.00"));
  assert.ok(v.texts.includes("Amount sent: $14.01"));
  assert.ok(v.texts.includes("Provider fee: $0.99"));
  assert.ok(v.texts.includes("Recipient receives: 60000 COP"));
  assert.ok(
    !v.button("Open Remitly recipient link"),
    "link stays hidden before human release",
  );
  v.button("Confirm this quote").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(approvals[0], "actual-backend-quote-hash");
  withdrawal.quote.expiresAt = new Date(Date.now() - 1).toISOString();
  v = render();
  assert.equal(
    v.button("Confirm this quote").props.disabled,
    true,
    "expired quote cannot be confirmed",
  );
  v.button("Cancel withdrawal").props.onPress();
  assert.equal(cancelAlerts.length, 1);
  assert.equal(
    withdrawal.status,
    "awaiting_confirmation",
    "cancel requires explicit confirmation",
  );
  cancelAlerts[0][2]
    .find((action) => action.text === "Cancel withdrawal")
    .onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(withdrawal.status, "canceled");
  withdrawal.quote.expiresAt = new Date(Date.now() + 60000).toISOString();
  withdrawal.status = "awaiting_recipient";
  v = render();
  v.button("Open Remitly recipient link").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(links[0], withdrawal.providerLink);
  assert.ok(
    v.texts.includes(
      "Enter your delivery details with Remitly. Returning to Pulse does not confirm completion.",
    ),
  );
  v = render();
  v.button("Download statement").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.ok(shares[0].url.startsWith("file:///private/cache/"));
  assert.ok(shares[0].content.includes("15.00"));
  assert.equal(files.size, 0, "exported statement cache removed after share");
  assert.ok(
    !render().button("Cancel withdrawal"),
    "provider preparation/release blocks creator cancellation",
  );
  withdrawal.status = "unknown";
  v = render();
  assert.ok(
    !v.button("Open Remitly recipient link"),
    "uncertain or human-declined payment cannot continue recipient setup",
  );
  withdrawal.status = "awaiting_recipient";
  withdrawal.quote.expiresAt = new Date(Date.now() - 1).toISOString();
  v = render();
  assert.ok(
    !!v.button("Open Remitly recipient link"),
    "an issued active recipient link remains usable after the original quote expires",
  );
  withdrawal.status = "delivered";
  v = render();
  assert.ok(
    !v.button("Open Remitly recipient link"),
    "resolved transfers cannot restart recipient setup",
  );
  sharingAvailable = false;
  v = render();
  v.button("Download statement").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.ok(render().texts.includes("Sharing is unavailable on this device."));
  assert.equal(files.size, 0);
  console.log(
    "quote screen exact hash, expiry, truthful amounts, release-gated links and authenticated statement file export passed",
  );
}
verifyQuoteScreen().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function verifyWalletRequestScreen() {
  const states = [
      "remitly",
      "co",
      "co-mobile",
      "15.00",
      {
        legalFirstName: "Maria",
        legalLastName: "Gomez",
        secondSurname: "",
        countryCode: "CO",
        phone: "+573001234567",
        email: "maria@example.test",
      },
      false,
      "",
    ],
    refs = [],
    saved = [],
    requests = [],
    routes = [],
    contactEffects = [];
  let si = 0,
    ri = 0,
    keyboardDismisses = 0;
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState: (initial) => {
      const i = si++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (next) =>
          (states[i] = typeof next === "function" ? next(states[i]) : next),
      ];
    },
    useRef: (initial) => (refs[ri++] ??= { current: initial }),
    useCallback: (fn) => fn,
    useEffect: (fn, dependencies) => {
      if (dependencies.length === 1 && dependencies[0] === overview.recipient)
        contactEffects.push(fn);
    },
  };
  const sample = {
    sendAmountCents: 1500,
    feeCents: 99,
    senderCountry: "US",
    fundingMethod: "debit_card",
    deliveryEstimate: "5 minutes",
  };
  const method = {
    id: "co-mobile",
    name: "Mobile wallet",
    enabled: true,
    availability: "available",
    receiveCurrency: "COP",
    lastVerifiedAt: "2026-10-04T00:00:00.000Z",
    observations: [sample],
  };
  const overview = {
    enrolled: true,
    policy: {
      fundingPolicyReady: true,
      maxWithdrawalCents: 50000,
      firstMinimumCents: 1500,
      repeatAllowed: true,
    },
    balances: {
      availableCoins: "10000",
      availableTicks: "10000",
      reservedCoins: "0",
      reservedTicks: "0",
      heldCoins: "0",
      heldTicks: "0",
    },
    withdrawals: [],
  };
  const api = {
    userId: "alice",
    overview: { data: overview },
    catalog: {
      data: {
        providers: [
          {
            id: "remitly",
            name: "Remitly",
            enabled: true,
            countries: [
              {
                id: "co",
                countryCode: "CO",
                name: "Colombia",
                enabled: true,
                availability: "available",
                methods: [
                  method,
                  {
                    ...method,
                    id: "co-bank",
                    name: "Bank deposit",
                    observations: [{ ...sample, feeCents: 0 }],
                  },
                  {
                    ...method,
                    id: "disabled-method",
                    name: "Disabled method",
                    availability: "unavailable",
                  },
                ],
              },
              {
                id: "ru",
                name: "Unavailable country",
                enabled: true,
                availability: "quote_error",
                methods: [method],
              },
            ],
          },
        ],
      },
    },
    pending: null,
    pendingReady: true,
    refresh: async () => {},
    saveRecipient: async (data) => {
      const body = JSON.parse(JSON.stringify(data));
      const allowed = [
        "legalFirstName",
        "legalLastName",
        "secondSurname",
        "countryCode",
        "email",
        "phone",
      ];
      if (Object.keys(body).some((key) => !allowed.includes(key)))
        throw Error("Unsupported request fields.");
      saved.push(body);
    },
    submit: async (methodId, cents) => {
      requests.push({ methodId, cents });
      return { id: "wd-requested" };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(require.resolve("../app/withdraw-money.tsx"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (id) => {
        if (id === "react") return react;
        if (id === "react-native")
          return {
            ...Object.fromEntries(
              [
                "ActivityIndicator",
                "KeyboardAvoidingView",
                "Modal",
                "RefreshControl",
                "ScrollView",
                "Text",
                "TextInput",
                "TouchableOpacity",
                "View",
              ].map((key) => [key, key]),
            ),
            StyleSheet: { create: (x) => x },
            Keyboard: { dismiss: () => keyboardDismisses++ },
            Platform: { OS: "ios" },
            useWindowDimensions: () => ({ width: 390, height: 844 }),
          };
        if (id === "expo-router")
          return {
            useFocusEffect: () => {},
            useRouter: () => ({
              back() {},
              push: (route) => routes.push(route),
            }),
          };
        if (id === "@expo/vector-icons") return { Ionicons: "Ionicons" };
        if (id === "@/components/KeyboardAwareScrollViewCompat")
          return {
            KeyboardAwareScrollViewCompat: "KeyboardAwareScrollViewCompat",
          };
        if (id === "@/components/GoldCoinIcon")
          return { GoldCoinIcon: "GoldCoinIcon" };
        if (id === "react-native-safe-area-context")
          return { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) };
        if (id === "@/i18n")
          return {
            useAppLanguage: () => ({
              t: (key, values = {}) =>
                key.replace(/\{(v\d+)\}/g, (_, name) => values[name] ?? name),
              appLocale: () => "en",
              localizedTextStyle: () => ({}),
            }),
          };
        if (id === "@/hooks/useColors") return { useColors: () => ({}) };
        if (id === "@/hooks/useWithdrawals")
          return { useWithdrawals: () => api };
        if (id === "@/utils/withdrawals") return utils;
        if (id === "libphonenumber-js/min")
          return require("libphonenumber-js/min");
        throw Error(id);
      },
    },
  );
  function render() {
    si = ri = 0;
    const nodes = [];
    function walk(n) {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      nodes.push(n);
      walk(n.props?.children);
    }
    walk(module.exports.default());
    return {
      nodes,
      texts: nodes
        .filter((n) => n.type === "Text")
        .flatMap((n) => n.props.children)
        .filter((v) => typeof v === "string"),
      button: (label) =>
        nodes.find(
          (n) =>
            n.type === "TouchableOpacity" &&
            n.props.children.some(
              (child) =>
                child?.type === "Text" && child.props.children.includes(label),
            ),
        ),
    };
  }
  let v = render();
  assert.ok(
    !v.texts.includes("Withdrawal history"),
    "history is removed from the withdrawal form",
  );
  assert.ok(!v.texts.includes("No withdrawals yet."));
  const more = () => v.nodes.find((n) => n.props.accessibilityLabel === "More");
  more().props.onPress();
  v = render();
  assert.ok(v.nodes.some((n) => n.type === "Modal"));
  assert.ok(
    !v.texts.includes("No withdrawals yet."),
    "menu lists actions, not history records",
  );
  v.button("Withdrawal history").props.onPress();
  v = render();
  assert.ok(v.texts.includes("No withdrawals yet."));
  v.nodes.find((n) => n.type === "Modal").props.onRequestClose();
  v = render();
  assert.ok(
    !v.texts.includes("Withdrawal history"),
    "system back returns to the unchanged form",
  );
  overview.withdrawals = [
    {
      id: "wd-old",
      grossCents: 1400,
      status: "delivered",
      createdAt: "2026-10-04T00:00:00.000Z",
    },
  ];
  more().props.onPress();
  v = render();
  v.button("Withdrawal history").props.onPress();
  v = render();
  assert.ok(v.texts.includes("Paid"));
  v.nodes
    .find(
      (n) =>
        n.type === "TouchableOpacity" &&
        n.props.children.some(
          (child) =>
            child?.type === "View" &&
            child.props.children.some(
              (text) =>
                text?.type === "Text" && text.props.children.includes("$14.00"),
            ),
        ),
    )
    .props.onPress();
  assert.equal(
    routes.pop().params.id,
    "wd-old",
    "history keeps withdrawal detail navigation",
  );
  v = render();
  assert.ok(!v.nodes.some((n) => n.type === "Modal"));
  assert.equal(states[3], "15.00");
  assert.equal(states[9], "6000");
  assert.equal(states[8], 0, "history preserves the amount-entry step");
  overview.withdrawals = [];
  v = render();
  const input = (label) =>
    v.nodes.find(
      (n) => n.type === "TextInput" && n.props.accessibilityLabel === label,
    );
  assert.ok(
    !v.texts.some((value) => value.includes("After completing your request")),
    "Remitly message is absent on amount screen",
  );
  assert.equal(input("Coins").props.value, "6000");
  assert.equal(input("Dollars (USD)").props.value, "15.00");
  assert.ok(v.texts.includes("Available to withdraw"));
  assert.ok(v.texts.includes("$25.00"));
  assert.ok(v.texts.includes("10,000"));
  assert.ok(v.texts.includes("Conversion: 400 coins = $1"));
  assert.equal(input("Coins").props.editable, false);
  assert.equal(input("Dollars (USD)").props.editable, false);
  input("Coins").props.onChangeText("2000");
  input("Dollars (USD)").props.onChangeText("5.00");
  v = render();
  assert.equal(input("Coins").props.value, "6000");
  assert.equal(input("Dollars (USD)").props.value, "15.00");
  overview.withdrawals = [
    { id: "failed", status: "failed" },
    { id: "canceled", status: "canceled" },
  ];
  v = render();
  assert.equal(
    input("Coins").props.editable,
    false,
    "failed or canceled attempts retain fixed first amount",
  );
  overview.withdrawals = [{ id: "returned", status: "returned" }];
  v = render();
  assert.equal(
    input("Coins").props.editable,
    true,
    "returned previously delivered withdrawal follows server repeat classification",
  );
  overview.withdrawals = [{ id: "delivered", status: "delivered" }];
  v = render();
  assert.equal(input("Coins").props.editable, true);
  assert.equal(input("Dollars (USD)").props.editable, true);
  assert.ok(v.nodes.some((n) => n.type === "GoldCoinIcon"));
  assert.ok(v.texts.includes("Remaining coins: 4,000"));
  assert.ok(!v.button("Request withdrawal"), "amount comes before submission");
  assert.ok(
    !v.nodes.some((n) => n.props.accessibilityLabel === "Select country"),
  );
  input("Coins").props.onChangeText("2000");
  v = render();
  assert.equal(input("Dollars (USD)").props.value, "5.00");
  assert.ok(v.texts.includes("Remaining coins: 8,000"));
  assert.equal(v.button("Next").props.disabled, true, "minimum enforced");
  input("Coins").props.onChangeText("6001");
  v = render();
  assert.equal(
    v.button("Next").props.disabled,
    true,
    "fractional cents are not rounded into a charge",
  );
  input("Dollars (USD)").props.onChangeText("25.01");
  v = render();
  assert.equal(input("Coins").props.value, "10004");
  assert.equal(
    v.button("Next").props.disabled,
    true,
    "cap and wallet funds enforced before navigation",
  );
  assert.ok(v.texts.includes("Remaining coins: —"));
  input("Dollars (USD)").props.onChangeText("15.00");
  v = render();
  assert.equal(input("Coins").props.value, "6000");
  assert.equal(v.button("Next").props.disabled, true, "later minimum is USD25");
  overview.withdrawals = [];
  v = render();
  assert.equal(v.button("Next").props.disabled, false);
  assert.ok(
    v.texts.includes(
      "Your first withdrawal must be $15. After your first withdrawal, the minimum is $25. Fees are deducted from the withdrawal amount based on the delivery method you select next.",
    ),
  );
  assert.ok(
    !v.texts.some(
      (value) =>
        value.startsWith("Minimum withdrawal:") ||
        value.startsWith("Maximum withdrawal:"),
    ),
    "simplified policy replaces duplicate limits",
  );
  v.button("Next").props.onPress();
  v = render();
  assert.equal(states[8], 1);
  assert.ok(
    !v.texts.includes("Available to withdraw"),
    "provider selection does not repeat available balance",
  );
  assert.ok(v.texts.includes("Select Provider and Country"));
  assert.ok(v.texts.indexOf("Provider:") < v.texts.indexOf("Remitly"));
  assert.ok(
    !v.nodes.some((n) => n.props.accessibilityRole === "radio"),
    "single provider requires no selection",
  );
  assert.ok(
    !v.nodes.some(
      (n) => n.type === "Ionicons" && /^radio-button/.test(n.props.name),
    ),
    "provider choices highlight without radio artwork",
  );
  assert.ok(
    !v.texts.some((value) => value.includes("After completing your request")),
    "Remitly instructions are absent on provider selection",
  );
  states[0] = "";
  v = render();
  assert.ok(
    !v.texts.some((value) => value.includes("After completing your request")),
    "provider must be selected for Remitly message",
  );
  const catalogProvider = api.catalog.data.providers[0];
  assert.ok(
    v.nodes.some((n) => n.props.accessibilityLabel === "Select country"),
    "country menu is available without choosing the sole provider",
  );
  api.catalog.data.providers.push({
    ...catalogProvider,
    id: "provider_other",
    name: "Other provider",
  });
  v = render();
  assert.ok(
    v.nodes.some((n) => n.props.accessibilityRole === "radio"),
    "multiple available providers retain explicit selection",
  );
  assert.ok(
    !v.nodes.some((n) => n.props.accessibilityLabel === "Select country"),
    "multiple providers require selection before country",
  );
  v.nodes.find((n) => n.props.accessibilityRole === "radio").props.onPress();
  v = render();
  assert.equal(states[0], "remitly");
  api.catalog.data.providers.pop();
  states[1] = "co";
  states[2] = "co-mobile";
  v = render();

  catalogProvider.id = "payoneer";
  states[0] = "payoneer";
  v = render();
  assert.ok(
    !v.texts.some((value) => value.includes("After completing your request")),
    "other providers do not inherit Remitly wording",
  );
  catalogProvider.id = "remitly";
  states[0] = "remitly";
  v = render();
  assert.equal(
    v.nodes.some(
      (n) =>
        n.props.accessibilityRole === "radio" &&
        n.props.children.some(
          (child) =>
            child?.type === "Text" && child.props.children.includes("Colombia"),
        ),
    ),
    false,
    "country choices do not appear inline",
  );
  const countryButton = v.nodes.find(
    (n) =>
      n.type === "TouchableOpacity" &&
      n.props.accessibilityLabel === "Select country",
  );
  const extraCountries = Array.from({ length: 20 }, (_, i) => ({
    id: `country-${i}`,
    countryCode: "NL",
    name: `Country ${i + 1}`,
    enabled: true,
    availability: "available",
    methods: [method],
  }));
  catalogProvider.countries.push(...extraCountries);
  const beforeDismiss = keyboardDismisses;
  countryButton.props.onPress();
  v = render();
  assert.equal(keyboardDismisses, beforeDismiss + 1);
  assert.ok(v.nodes.some((n) => n.type === "Modal"));
  const countryOption = v.nodes.find(
    (n) =>
      n.props.accessibilityRole === "radio" &&
      n.props.children.some(
        (child) =>
          child?.type === "Text" && child.props.children.includes("Colombia"),
      ),
  );
  assert.ok(v.texts.includes("Scroll to see all countries"));
  const finalCountry = v.nodes.find(
    (n) =>
      n.props.accessibilityRole === "radio" &&
      n.props.children.some(
        (child) =>
          child?.type === "Text" && child.props.children.includes("Country 20"),
      ),
  );
  assert.ok(finalCountry, "last available country remains in a long list");
  finalCountry.props.onPress();
  v = render();
  assert.equal(states[1], "country-19");
  assert.ok(!v.nodes.some((n) => n.type === "Modal"));
  countryButton.props.onPress();
  v = render();
  assert.ok(countryOption);
  countryOption.props.onPress();
  v = render();
  assert.equal(
    v.nodes.some((n) => n.type === "Modal"),
    false,
  );
  assert.equal(
    states[2],
    "",
    "country selection clears the previous payout type",
  );
  countryButton.props.onPress();
  v = render();
  v.nodes.find((n) => n.type === "Modal").props.onRequestClose();
  v = render();
  assert.equal(
    v.nodes.some((n) => n.type === "Modal"),
    false,
    "system back closes the country menu",
  );
  v.button("Next").props.onPress();
  v = render();
  assert.equal(states[8], 2);
  assert.ok(
    !v.texts.includes("Available to withdraw"),
    "payment-method selection does not repeat available balance",
  );
  assert.ok(
    !v.texts.some((value) => value.includes("After completing your request")),
    "Remitly instructions are absent on payment-method selection",
  );
  assert.equal(v.texts.filter((value) => value === "Method").length, 1);
  assert.equal(v.texts.filter((value) => value === "Fee").length, 1);
  assert.equal(v.texts.filter((value) => value === "Delivery").length, 1);
  assert.ok(
    !v.nodes.some(
      (n) => n.type === "Ionicons" && /^radio-button/.test(n.props.name),
    ),
    "payout row space is reserved for delivery data",
  );
  assert.ok(v.texts.includes("$0.99"));
  assert.equal(
    v.texts.filter((value) => value === "5 mins").length,
    2,
    "known delivery time remains visible even when a normal fee is unconfirmed",
  );
  assert.ok(!v.texts.some((value) => value.includes("Observed fee")));
  assert.equal(
    v.button("Next").props.disabled,
    true,
    "method must be selected",
  );
  v.nodes.find((n) => n.props.accessibilityRole === "radio").props.onPress();
  v = render();
  v.button("Next").props.onPress();
  v = render();
  assert.equal(states[8], 3);
  assert.ok(!v.button("Request withdrawal"));
  assert.equal(input("Country code").props.value, "+57");
  assert.equal(
    input("Phone number").props.value,
    "",
    "new country clears old phone",
  );
  input("Phone number").props.onChangeText("3001234567");
  v = render();
  assert.ok(
    v.texts.some((value) => value.includes("After completing your request")),
    "Remitly instructions appear on the details form",
  );
  catalogProvider.id = "payoneer";
  states[0] = "payoneer";
  v = render();
  assert.ok(
    !v.texts.some((value) => value.includes("After completing your request")),
    "other providers do not inherit Remitly form instructions",
  );
  catalogProvider.id = "remitly";
  states[0] = "remitly";
  v = render();
  v.nodes.find((n) => n.props.accessibilityLabel === "Back").props.onPress();
  v = render();
  assert.equal(states[8], 2);
  assert.equal(states[3], "15.00", "back retains amount");
  v.button("Next").props.onPress();
  v = render();
  assert.ok(
    v.texts.includes(
      "After completing your request, you will receive a link to confirm your preferred payment method.",
    ),
  );
  assert.ok(
    !v.texts.includes("Available to withdraw"),
    "details form does not repeat available balance",
  );
  assert.ok(!v.texts.some((value) => value.startsWith("Conversion:")));
  assert.ok(
    !v.texts.some((value) =>
      value.includes("Withdrawals use your wallet coins"),
    ),
  );

  input("Phone number").props.onChangeText("");
  v = render();
  assert.equal(
    v.button("Next").props.disabled,
    false,
    "validation must explain missing contact",
  );
  v.button("Next").props.onPress();
  v = render();
  assert.equal(states[8], 3);
  assert.ok(
    v.texts.includes(
      "Enter your legal name, email and phone number with country code.",
    ),
  );
  input("Phone number").props.onChangeText("300 123-4567");
  v = render();
  v.button("Next").props.onPress();
  v = render();
  assert.equal(states[8], 4);
  for (const value of [
    "Contact",
    "Withdrawal details",
    "Maria Gomez",
    "maria@example.test",
    "+573001234567",
    "$15.00",
    "-$0.99",
    "$14.01",
    "4,000",
    "Mobile wallet",
  ])
    assert.ok(v.texts.includes(value), value);
  assert.ok(
    v.texts.indexOf("Remaining coins") > v.texts.indexOf("Selected method"),
  );
  assert.equal(requests.length, 0, "review does not send payment");
  assert.ok(v.nodes.some((n) => n.type === "GoldCoinIcon"));
  assert.ok(!v.texts.includes("Disabled method"));
  assert.ok(!v.texts.includes("Unavailable country"));
  assert.ok(!v.texts.some((value) => value.includes("Observed fee")));
  assert.ok(
    !v.texts.some(
      (value) => value.startsWith("Reserved:") || value.startsWith("On hold:"),
    ),
    "zero holds do not clutter the balance card",
  );
  overview.balances.reservedCoins = "400";
  overview.balances.reservedTicks = "400";
  overview.balances.heldCoins = "2000";
  overview.balances.heldTicks = "2000";
  states[8] = 0;
  v = render();
  assert.ok(v.texts.includes("Reserved: 400 = $1.00"));
  assert.ok(v.texts.includes("On hold: 2,000 = $5.00"));
  overview.balances.reservedCoins =
    overview.balances.reservedTicks =
    overview.balances.heldCoins =
    overview.balances.heldTicks =
      "0";
  states[8] = 4;
  overview.withdrawals = [{ id: "delivered", status: "delivered" }];
  states[3] = "25.00";
  v = render();
  assert.equal(
    v.button("Request withdrawal").props.disabled,
    false,
    "returning USD25 withdrawal is allowed",
  );
  states[3] = "15.00";
  overview.withdrawals = [];
  overview.enrolled = false;
  states[8] = 0;
  v = render();
  assert.ok(v.texts.includes("Withdrawals have not been Enabled"));
  assert.equal(v.button("Next").props.disabled, true);
  assert.ok(
    v.nodes.indexOf(v.button("Next")) <
      v.nodes.findIndex(
        (n) =>
          n.type === "Text" &&
          n.props.children.includes("Withdrawals have not been Enabled"),
      ),
    "enrollment notice sits below Next",
  );
  states[8] = 4;
  v = render();
  assert.equal(
    v.button("Request withdrawal").props.disabled,
    true,
    "unenrolled account cannot request cashout",
  );
  overview.enrolled = true;
  v = render();
  v.button("Request withdrawal").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(saved[0].countryCode, "CO");
  assert.equal(saved[0].phone, "+573001234567");
  assert.deepEqual(requests[0], { methodId: "co-mobile", cents: 1500 });
  assert.equal(routes[0].params.id, "wd-requested");
  overview.recipient = {
    legalFirstName: "  Maria  ",
    legalLastName: " Gomez ",
    secondSurname: " Torres ",
    countryCode: "CO",
    phone: "+573009876543",
    email: "returning@example.test",
    revision: 9,
    status: "contact_saved",
  };
  v = render();
  contactEffects.at(-1)();
  assert.ok(!("revision" in states[4]));
  assert.ok(!("status" in states[4]));
  // Enforce the write allowlist too, even if a future form source carries metadata.
  states[4] = { ...states[4], revision: 88, status: "contact_saved" };
  v = render();
  v.button("Request withdrawal").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(
    saved.length,
    2,
    "returning recipient is accepted by strict contact endpoint",
  );
  assert.deepEqual(saved[1], {
    legalFirstName: "Maria",
    legalLastName: "Gomez",
    secondSurname: "Torres",
    countryCode: "CO",
    email: "returning@example.test",
    phone: "+573009876543",
  });
  assert.equal(
    requests.length,
    2,
    "returning contact continues to withdrawal request",
  );
  overview.recipient = { ...overview.recipient, secondSurname: null };
  v = render();
  contactEffects.at(-1)();
  assert.equal(states[4].secondSurname, undefined);
  v = render();
  v.button("Request withdrawal").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(saved.length, 3);
  assert.ok(
    !("secondSurname" in saved[2]),
    "nullable saved surname is omitted from strict input",
  );
  assert.ok(!("revision" in saved[2]));
  assert.ok(!("status" in saved[2]));
  assert.equal(requests.length, 3);
  overview.withdrawals = [
    {
      id: "completed",
      status: "delivered",
      providerOnboardingStatus: "ready",
      methodId: "co-mobile",
      recipient: overview.recipient,
    },
  ];
  states[8] = 0;
  states[3] = "25.00";
  v = render();
  v.button("Next").props.onPress();
  v = render();
  assert.equal(states[8], 4, "completed saved method bypasses setup");
  assert.ok(v.texts.includes("Your saved payment method will be used."));
  assert.ok(
    !v.texts.includes(
      "You will receive an email from Remitly to confirm your payment method.",
    ),
  );
  assert.ok(!v.nodes.some((n) => n.type === "TextInput"));
  v.button("Request withdrawal").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(saved.length, 3, "saved method does not save contact again");
  assert.equal(requests.at(-1).cents, 2500);
  v = render();
  v.nodes.find((n) => n.props.accessibilityLabel === "Back").props.onPress();
  assert.equal(states[8], 0);
  method.availability = "unavailable";
  v = render();
  v.button("Next").props.onPress();
  assert.equal(states[8], 1, "unavailable saved method returns to setup");
  method.availability = "available";
  console.log(
    "wallet valuation, first/repeat limits, contact validation, review and saved-method shortcut passed",
  );
}
verifyWalletRequestScreen().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
