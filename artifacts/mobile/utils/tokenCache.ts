import { Platform } from "react-native";

interface TokenCache {
  getToken(key: string): Promise<string | null | undefined>;
  saveToken(key: string, value: string): Promise<void>;
  clearToken?(key: string): void | Promise<void>;
}

// Web: use localStorage — SecureStore is a native-only module, never import it on web
const webCache: TokenCache = {
  getToken: (key: string) => Promise.resolve(localStorage.getItem(key)),
  saveToken: (key: string, value: string) => {
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  clearToken: (key: string) => {
    localStorage.removeItem(key);
  },
};

// Native: lazy-load SecureStore so the module is never evaluated on web
let _nativeCache: TokenCache | null = null;
async function nativeCache(): Promise<TokenCache> {
  if (_nativeCache) return _nativeCache;
  const SecureStore = await import("expo-secure-store");
  _nativeCache = {
    getToken: (key) => SecureStore.getItemAsync(key),
    saveToken: (key, value) => SecureStore.setItemAsync(key, value),
    clearToken: (key) => SecureStore.deleteItemAsync(key),
  };
  return _nativeCache;
}

export const tokenCache: TokenCache =
  Platform.OS === "web"
    ? webCache
    : {
        getToken: async (key) => (await nativeCache()).getToken(key),
        saveToken: async (key, value) => (await nativeCache()).saveToken(key, value),
        clearToken: async (key) => (await nativeCache()).clearToken!(key),
      };
