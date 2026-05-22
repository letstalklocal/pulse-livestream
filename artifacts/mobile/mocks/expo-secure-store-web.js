// Web-safe stub for expo-secure-store.
// The native ExpoSecureStore module does not exist in web builds;
// this replaces it so @clerk/expo can import without crashing.
const store = typeof localStorage !== "undefined" ? localStorage : new Map();

function getItem(key) {
  if (store instanceof Map) return store.get(key) ?? null;
  return store.getItem(key);
}
function setItem(key, value) {
  if (store instanceof Map) store.set(key, value);
  else store.setItem(key, value);
}
function removeItem(key) {
  if (store instanceof Map) store.delete(key);
  else store.removeItem(key);
}

module.exports = {
  getItemAsync: (key) => Promise.resolve(getItem(key)),
  setItemAsync: (key, value) => { setItem(key, value); return Promise.resolve(); },
  deleteItemAsync: (key) => { removeItem(key); return Promise.resolve(); },
  getItem,
  setItem,
  deleteItem: removeItem,
  isAvailableAsync: () => Promise.resolve(true),
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
  ALWAYS: "ALWAYS",
  ALWAYS_THIS_DEVICE_ONLY: "ALWAYS_THIS_DEVICE_ONLY",
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: "WHEN_PASSCODE_SET_THIS_DEVICE_ONLY",
  WHEN_UNLOCKED: "WHEN_UNLOCKED",
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
};
