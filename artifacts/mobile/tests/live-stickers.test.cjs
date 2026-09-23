const assert = require("node:assert/strict");
const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const tick = () => new Promise(setImmediate);
const gift = { id: "rose", name: "Rose", coins: 1, emoji: "🌹" };
const sticker = {
  id: "pack",
  kind: "pack",
  giftId: "rose",
  packId: 7,
  price: 40,
  videos: 2,
  pictures: 2,
  owned: false,
};
const nodes = (n) =>
  !n || typeof n !== "object"
    ? []
    : Array.isArray(n)
      ? n.flatMap(nodes)
      : [n, ...(n.children ?? []).flatMap(nodes)];
function fixture(component) {
  let cursor = 0,
    seq = 0;
  const slots = [],
    effects = [],
    data = new Map(),
    alerts = [],
    calls = [],
    store = new Map();
  const key = ["live-stickers", "live", 1];
  data.set(JSON.stringify(key), { hostUid: 2, stickers: [{ ...sticker }] });
  const dk = ["dismissed-live-stickers", 1, "live"];
  data.set(JSON.stringify(dk), []);
  const state = {
    fail: false,
    wait: null,
    storageFail: false,
    packs: [
      {
        id: "7",
        name: "Pack",
        price: 40,
        giftId: "heart",
        items: [
          { id: "photo", mediaType: "image", mediaUrl: "private-preview" },
        ],
      },
    ],
  };
  const routes = [];
  const client = {
    cancelQueries: async () => {},
    invalidateQueries: async () => {},
    setQueryData(k, v) {
      const id = JSON.stringify(k);
      data.set(id, typeof v === "function" ? v(data.get(id)) : v);
    },
  };
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: props ?? {},
      children,
    }),
    useRef(value) {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (v) => (slots[i] = typeof v === "function" ? v(slots[i]) : v),
      ];
    },
    useEffect(fn) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = true;
        effects.push(fn());
      }
    },
  };
  const api = async (path, token, method, body) => {
    calls.push({ path, method, body });
    if (state.wait) await state.wait;
    if (state.fail) throw Error("offline");
    return path.endsWith("/unlock") || path === "/coins/spend"
      ? { balance: 960 }
      : {
          pack: {
            unlocked: true,
            items: [
              { id: "photo", mediaType: "image", mediaUrl: "private-url" },
            ],
          },
        };
  };
  const mocks = {
    react,
    "react-native": {
      View: "View",
      Text: "Text",
      TouchableOpacity: "Button",
      Modal: "Modal",
      ScrollView: "ScrollView",
      ActivityIndicator: "Spinner",
      StyleSheet: { create: (x) => x },
      Alert: { alert: (...a) => alerts.push(a) },
    },
    "@clerk/expo": { useAuth: () => ({ getToken: async () => "token" }) },
    "@tanstack/react-query": {
      useQueryClient: () => client,
      useQuery: ({ queryKey }) =>
        queryKey[0] === "sticker-packs"
          ? {
              data: {
                packs: state.packs,
              },
            }
          : {
              data: data.get(JSON.stringify(queryKey)),
              isSuccess: true,
              isError: false,
            },
    },
    "@react-native-async-storage/async-storage": {
      getItem: async (k) => store.get(k) ?? null,
      setItem: async (k, v) => {
        if (state.storageFail) throw Error("disk");
        store.set(k, v);
      },
    },
    "expo-image": { Image: "Image" },
    "expo-router": {
      useRouter: () => ({ push: (route) => routes.push(route) }),
    },
    "expo-crypto": { randomUUID: () => `key-${++seq}` },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@workspace/api-client-react": {
      getGetCoinBalanceQueryKey: (x) => ["balance", x.uid],
      getGetMediaPackQueryKey: (id) => ["pack", id],
    },
    "@/context/AuthContext": {
      useAuth: () => ({ user: { uid: 1, name: "Buyer" } }),
    },
    "@/i18n": {
      useAppLanguage: () => ({ t: (x) => x, appNumber: (x) => String(x) }),
    },
    "@/utils/liveStickers": {
      stickerApi: api,
      stickerQueryKey: (ch, uid) => ["live-stickers", ch, uid],
    },
    "./GiftPicker": { GIFTS: [gift] },
    "./LiveStickerCard": { LiveStickerCard: "Card" },
    "./LiveStickerSetup": { LiveStickerPicker: "Picker" },
    "./CrownArtwork": { CrownArtwork: "Crown" },
    "@/components/GiftImageArtwork": { GiftImageArtwork: "GiftImage", hasGiftImage: id => ["rose", "heart", "lips", "strawberry"].includes(id?.toLowerCase()) },
    "./GoldCoinIcon": { GoldCoinIcon: "Coin" },
    "./MediaPackGallery": { MediaPackGallery: "Gallery" },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ bottom: 0 }),
    },
  };
  const code = ts.transpileModule(
    fs.readFileSync(
      require.resolve(
        `../components/${component === "LiveStickerPicker" ? "LiveStickerSetup" : component}.tsx`,
      ),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      },
    },
  ).outputText;
  const exports = {};
  vm.runInNewContext(
    code +
      (component === "LiveStickerOverlay"
        ? "\nexports.test=StickerSession;"
        : ""),
    {
      exports,
      require: (id) => {
        if (!(id in mocks)) throw Error(id);
        return mocks[id];
      },
      AbortController,
      Map,
      Set,
      JSON,
    },
  );
  const props = {
    channelId: "live",
    enabled: true,
    visible: true,
    top: 100,
    uid: 1,
    senderName: "Buyer",
  };
  return {
    render(p = props) {
      cursor = 0;
      return (exports.test ?? exports[component])(p);
    },
    props,
    routes,
    data,
    key,
    dk,
    alerts,
    calls,
    state,
    store,
    unmount() {
      effects.forEach((fn) => fn?.());
    },
  };
}
(async () => {
  const f = fixture("LiveStickerOverlay");
  let tree = f.render();
  const card = () => nodes(tree).find((n) => n.type === "Card");
  card().props.onPress();
  assert.equal(f.calls.length, 0, "Pack waits for the same confirmation as DM");
  const confirm = f.alerts.at(-1)[2][1].onPress;
  let release;
  f.state.wait = new Promise((r) => (release = r));
  confirm();
  confirm();
  assert.equal(
    f.calls.length,
    1,
    "In-flight taps cannot start a second charge",
  );
  release();
  f.state.wait = null;
  await tick();
  await tick();
  tree = f.render();
  assert.equal(card().props.sticker.owned, true, "Purchase becomes View pack");
  card().props.onPress();
  await tick();
  await tick();
  tree = f.render();
  assert.equal(card(), undefined, "Opening pack dismisses the offer");
  assert.ok(
    nodes(tree).some((n) => n.type === "Gallery"),
    "Unlocked pack opens in place",
  );
  assert.deepEqual(JSON.parse(f.store.get("dismissed-live-stickers:1")), {
    live: ["pack"],
  });
  assert.equal(
    f.calls.filter((c) => c.path.endsWith("/unlock")).length,
    1,
    "Viewing never charges",
  );
  assert.equal(f.calls.find(c => c.path.endsWith("/unlock")).body.expectedPrice, 40, "Live checkout sends the confirmed pack price");
  const retry = fixture("LiveStickerOverlay");
  retry.data.get(JSON.stringify(retry.key)).stickers = [
    { ...sticker, kind: "gift", id: "gift", price: 1 },
  ];
  retry.state.fail = true;
  tree = retry.render();
  nodes(tree)
    .find((n) => n.type === "Card")
    .props.onPress();
  await tick();
  retry.state.fail = false;
  tree = retry.render();
  nodes(tree)
    .find((n) => n.type === "Card")
    .props.onPress();
  await tick();
  assert.equal(
    retry.calls[0].body.idempotencyKey,
    retry.calls[1].body.idempotencyKey,
    "Uncertain gift response retries same charge",
  );
  tree = retry.render({ ...retry.props, visible: false });
  assert.equal(
    nodes(tree).filter((n) => n.type === "Card").length,
    0,
    "Hidden controls hide stickers",
  );
  const late = fixture("LiveStickerOverlay");
  late.data.get(JSON.stringify(late.key)).stickers[0].owned = true;
  let done;
  late.state.wait = new Promise((r) => (done = r));
  tree = late.render();
  nodes(tree)
    .find((n) => n.type === "Card")
    .props.onPress();
  late.unmount();
  done();
  await tick();
  assert.equal(
    late.store.size,
    0,
    "Late pack load cannot dismiss after leaving",
  );
  const setup = fixture("LiveStickerSetup");
  let value = [{ kind: "gift", giftId: "rose" }];
  const props = () => ({
    value,
    onChange: (v) => (value = v),
    disabled: false,
  });
  tree = setup.render(props());
  nodes(tree)
    .find((n) => n.type === "Card")
    .props.onDoublePress();
  setup.alerts
    .at(-1)[2]
    .find((b) => b.text === "Replace sticker")
    .onPress();
  assert.equal(value.length, 1, "Editing preserves saved selection");
  tree = setup.render(props());
  nodes(tree)
    .find((n) => n.type?.name === "LiveStickerPicker")
    .props.onClose();
  assert.equal(value.length, 1, "Cancel preserves setup");
  const host = fixture("LiveStickerOverlay");
  tree = host.render({ ...host.props, isHost: true });
  const hostCard = nodes(tree).find((n) => n.type === "Card");
  assert.equal(
    hostCard.props.onPress,
    undefined,
    "Host never purchases by tapping",
  );
  hostCard.props.onDoublePress();
  const options = host.alerts.at(-1)[2];
  assert.deepEqual(
    Array.from(options, (b) => b.text),
    ["Close sticker", "Replace sticker", "Cancel"],
  );
  options.find((b) => b.text === "Replace sticker").onPress();
  tree = host.render({ ...host.props, isHost: true });
  nodes(tree)
    .find((n) => n.type === "Picker")
    .props.onSelect({ kind: "gift", giftId: "rose" });
  await tick();
  assert.equal(
    host.calls.at(-1).method,
    "PUT",
    "Replacement calls host endpoint",
  );
  const picker = fixture("LiveStickerPicker");
  let pickerClosed = 0,
    selected = null;
  const pickerProps = {
    initialKind: "pack",
    excludedPackIds: [],
    disabled: false,
    onClose: () => pickerClosed++,
    onSelect: (value) => (selected = value),
  };
  tree = picker.render(pickerProps);
  assert.equal(nodes(tree).some(n => n.props.testID === "sticker-picker-back"), false, "First step has no redundant Back control");
  assert.equal(
    nodes(tree).filter((n) => n.type === "Image").length,
    1,
    "Saved pack displays a real photo thumbnail",
  );
  nodes(tree)
    .find((n) => n.props.testID === "sticker-pack-preview-7")
    .props.onPress();
  tree = picker.render(pickerProps);
  assert.ok(
    nodes(tree).some((n) => n.type === "Gallery" && n.props.embedded),
    "Preview uses the existing modal",
  );
  assert.equal(selected, null, "Preview does not select or charge");
  nodes(tree)
    .find((n) => n.type === "Gallery")
    .props.onClose();
  tree = picker.render(pickerProps);
  nodes(tree)
    .find((n) => n.props.testID === "sticker-pack-option-7")
    .props.onPress();
  tree = picker.render(pickerProps);
  assert.equal(nodes(tree).some(n => n.props.testID === "sticker-picker-next"), false, "Pack picker has no Next step");
  assert.equal(nodes(tree).filter(n => n.type === "Card").length, 0, "No second artwork picker");
  assert.equal(selected.packId, 7);
  assert.equal(selected.kind, "pack");
  assert.equal(selected.giftId, "heart", "Pack uses the gift saved during creation");
  selected = null;
  tree = picker.render({ ...pickerProps, disabled: true });
  nodes(tree).find(n => n.props.testID === "sticker-pack-option-7").props.onPress();
  assert.equal(selected, null, "Disabled picker cannot add a pack");
  const empty = fixture("LiveStickerPicker");
  empty.state.packs = [];
  tree = empty.render(pickerProps);
  assert.equal(
    nodes(tree).filter((n) =>
      n.props.testID?.startsWith("sticker-pack-option-"),
    ).length,
    0,
    "No placeholder/test pack when empty",
  );
  nodes(tree)
    .find((n) => n.props.testID === "sticker-create-pack")
    .props.onPress();
  assert.equal(pickerClosed, 1, "Picker closes before creation navigation");
  assert.equal(empty.routes[0].pathname, "/media-packs");
  assert.equal(empty.routes[0].params.create, "1");
  assert.equal(empty.routes[0].params.returnToSticker, "1");
  const visual = fixture("LiveStickerCard");
  let manages = 0,
    sends = 0;
  tree = visual.render({ sticker, onDoublePress: () => manages++ });
  tree.props.onPress();
  assert.equal(manages, 0, "One host tap does nothing");
  tree.props.onPress();
  assert.equal(manages, 1, "Double tap manages sticker");
  tree = visual.render({ sticker, onPress: () => sends++ });
  tree.props.onPress();
  assert.equal(sends, 1, "Viewer purchase remains single tap");
  value = [
    { kind: "gift", giftId: "rose" },
    { kind: "pack", giftId: "rose", packId: 7 },
  ];
  tree = setup.render(props());
  assert.ok(
    nodes(tree)
      .filter(
        (n) => n.type === "Button" && n.props.accessibilityRole === "button",
      )
      .every((n) => n.props.disabled),
    "Two stickers disables both add buttons",
  );
  console.log(
    "PASS: setup limit/edit cancellation, pack confirmation, in-flight guard, View pack/dismissal persistence, no repurchase, retry key reuse, hidden controls and late-response cleanup. Mocked UI, not device proof.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

// User-approved setup order: stickers, categories, then background/title.
const setupSource = fs.readFileSync(
  require.resolve("../app/go-live.tsx"),
  "utf8",
);
const dockStart = setupSource.indexOf("<View style={[styles.setupBottomDock");
const stickerPosition = setupSource.indexOf("<LiveStickerSetup", dockStart);
const categoryPosition = setupSource.indexOf(
  "contentContainerStyle={styles.compactCategoryRow}",
  dockStart,
);
const titlePosition = setupSource.indexOf(
  "<View style={styles.setupMetaRow}>",
  dockStart,
);
assert.ok(
  dockStart >= 0 &&
    stickerPosition > dockStart &&
    stickerPosition < categoryPosition &&
    categoryPosition < titlePosition,
  "Stickers sit above categories and the background/title row",
);

// Android Back belongs to the pack-creation page while it is above the live.
const backStart = setupSource.indexOf(
  'const subscription = BackHandler.addEventListener("hardwareBackPress"',
);
const backEnd =
  setupSource.indexOf("\n    });", backStart) + "\n    });".length;
let focused = false,
  endPrompts = 0,
  backHandler;
new Function(
  "navigation",
  "showLiveMenu",
  "setShowLiveMenu",
  "confirmStopLive",
  "BackHandler",
  setupSource.slice(backStart, backEnd),
)(
  { isFocused: () => focused },
  false,
  () => {},
  () => endPrompts++,
  {
    addEventListener: (_event, handler) => {
      backHandler = handler;
      return { remove() {} };
    },
  },
);
assert.equal(
  backHandler(),
  false,
  "Pack page handles Back without the hidden broadcaster intercepting it",
);
assert.equal(endPrompts, 0);
focused = true;
assert.equal(backHandler(), true);
assert.equal(
  endPrompts,
  1,
  "Focused broadcaster retains its end-live confirmation",
);
