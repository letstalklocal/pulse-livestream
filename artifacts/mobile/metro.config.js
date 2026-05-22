const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Redirect ALL imports of expo-secure-store to an AsyncStorage-backed stub.
// expo-secure-store requires a compiled native module (ExpoSecureStore) that
// is not available in Expo Go or development builds that predate adding it.
// AsyncStorage works everywhere: Expo Go, dev builds, web — no native build step.
const asyncStorageMock = path.resolve(
  __dirname,
  "mocks/expo-secure-store-async-storage.js"
);

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "expo-secure-store") {
    return { filePath: asyncStorageMock, type: "sourceFile" };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
