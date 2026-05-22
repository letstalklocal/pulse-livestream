const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const webMock = path.resolve(__dirname, "mocks/expo-secure-store-web.js");

// On web, redirect expo-secure-store to a localStorage-backed stub
// so @clerk/expo doesn't crash trying to load the native ExpoSecureStore module.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "expo-secure-store") {
    return { filePath: webMock, type: "sourceFile" };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
