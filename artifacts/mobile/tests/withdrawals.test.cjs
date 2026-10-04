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
    statement: async () => { statementRequests++; return "Pulse statement\nReserved gross USD: 15.00"; },
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
          if (sharingMissing) throw new Error("Cannot find native module 'ExpoSharing'");
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
  assert.equal(sharingImports, 0, "An older native build can load and render the route without ExpoSharing");
  v.button("Download statement").props.onPress();
  await new Promise((r) => setImmediate(r));
  assert.equal(sharingImports, 1);
  assert.equal(statementRequests, 0, "Missing native sharing fails before requesting a statement");
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
    ri = 0;
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
      maxWithdrawalCents: 1500,
      firstMinimumCents: 1500,
      repeatAllowed: false,
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
                "RefreshControl",
                "ScrollView",
                "Text",
                "TextInput",
                "TouchableOpacity",
                "View",
              ].map((key) => [key, key]),
            ),
            StyleSheet: { create: (x) => x },
            Platform: { OS: "ios" },
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
  assert.ok(v.texts.includes("10,000 coins"));
  assert.ok(v.texts.includes("$25.00"));
  assert.ok(
    v.texts.includes("Maximum withdrawal: $15.00, including fees and taxes."),
  );
  assert.ok(v.texts.includes("Amount sent: awaiting a current quote"));
  assert.ok(v.nodes.some((n) => n.type === "GoldCoinIcon"));
  assert.ok(!v.texts.includes("Disabled method"));
  assert.ok(!v.texts.includes("Unavailable country"));
  assert.ok(v.texts.some((value) => value.includes("Observed fee: $0.99")));
  states[3] = "25.00";
  v = render();
  assert.equal(
    v.button("Request withdrawal").props.disabled,
    true,
    "USD25 wallet cannot exceed USD15 withdrawal cap",
  );
  states[3] = "15.00";
  overview.enrolled = false;
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
  console.log(
    "wallet USD25 valuation, USD15 cap, unavailable route filtering and full contact/request handlers passed",
  );
}
verifyWalletRequestScreen().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
