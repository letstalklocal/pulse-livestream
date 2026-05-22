import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface TokenCache {
  getToken(key: string): Promise<string | null | undefined>;
  saveToken(key: string, value: string): Promise<void>;
  clearToken?(key: string): void | Promise<void>;
}

// Use AsyncStorage on native (works in Expo Go + dev builds, no native linking needed)
// Use localStorage on web
export const tokenCache: TokenCache =
  Platform.OS === "web"
    ? {
        getToken: (key) => Promise.resolve(localStorage.getItem(key)),
        saveToken: (key, value) => { localStorage.setItem(key, value); return Promise.resolve(); },
        clearToken: (key) => localStorage.removeItem(key),
      }
    : {
        getToken: (key) => AsyncStorage.getItem(key),
        saveToken: (key, value) => AsyncStorage.setItem(key, value),
        clearToken: (key) => AsyncStorage.removeItem(key),
      };
