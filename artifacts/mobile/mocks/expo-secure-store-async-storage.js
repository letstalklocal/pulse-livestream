/**
 * Cross-platform drop-in replacement for expo-secure-store.
 * Uses @react-native-async-storage/async-storage on native and
 * localStorage on web — no native ExpoSecureStore module required.
 */
"use strict";

var AsyncStorage;
try {
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch (_) {
  // Web fallback if AsyncStorage somehow isn't available
  AsyncStorage = null;
}

function get(key) {
  if (AsyncStorage) return AsyncStorage.getItem(key);
  try { return Promise.resolve(localStorage.getItem(key)); } catch (_) { return Promise.resolve(null); }
}
function set(key, value) {
  if (AsyncStorage) return AsyncStorage.setItem(key, value);
  try { localStorage.setItem(key, value); } catch (_) {}
  return Promise.resolve();
}
function del(key) {
  if (AsyncStorage) return AsyncStorage.removeItem(key);
  try { localStorage.removeItem(key); } catch (_) {}
  return Promise.resolve();
}

module.exports = {
  getItemAsync: get,
  setItemAsync: set,
  deleteItemAsync: del,
  getItem: (key) => { try { return localStorage.getItem(key); } catch(_) { return null; } },
  setItem: (key, v) => { try { localStorage.setItem(key, v); } catch(_) {} },
  deleteItem: (key) => { try { localStorage.removeItem(key); } catch(_) {} },
  isAvailableAsync: () => Promise.resolve(true),
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
  ALWAYS: "ALWAYS",
  ALWAYS_THIS_DEVICE_ONLY: "ALWAYS_THIS_DEVICE_ONLY",
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: "WHEN_PASSCODE_SET_THIS_DEVICE_ONLY",
  WHEN_UNLOCKED: "WHEN_UNLOCKED",
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
};
