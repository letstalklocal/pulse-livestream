import { t, useAppLanguage, initializeAppLanguage, refreshPhoneAppLanguage, localizedTextStyle } from "@/i18n";
import { InAppNotifications } from "@/components/InAppNotifications";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, ClerkLoaded, useAuth as useClerkAuth } from "@clerk/expo";
import { tokenCache } from "@/utils/tokenCache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppState, StyleSheet, Text, View } from "react-native";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { RtmProvider } from "@/context/RtmContext";
import colors from "@/constants/colors";

const domain = process.env["EXPO_PUBLIC_DOMAIN"];
if (domain) setBaseUrl(`https://${domain}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

const publishableKey = process.env["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"] ?? "";
const proxyUrl = process.env["EXPO_PUBLIC_CLERK_PROXY_URL"] || undefined;

function BuildConfigurationError() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  return (
    <View style={styles.configurationError}>
      <Text style={[localizedTextStyle(), styles.configurationErrorTitle]}>{t("Pulse could not start")}</Text>
      <Text style={[localizedTextStyle(), styles.configurationErrorMessage]}>{t("This build is missing its authentication configuration. Please install a newer build.")}</Text>
    </View>
  );
}

function RootLayoutNav() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: '#08080F' } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="profile/[hostUid]" options={{ headerShown: false }} />
      <Stack.Screen
        name="go-live"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="stream/[channelId]"
        options={{ headerShown: false, presentation: "fullScreenModal", animation: "none" }}
      />
      <Stack.Screen name="dm/[peerId]" options={{ headerShown: false }} />
      <Stack.Screen name="posts/[uid]" options={{ headerShown: false }} />
      <Stack.Screen name="connections/[uid]" options={{ headerShown: false }} />
      <Stack.Screen name="new-chat" options={{ headerShown: false }} />
      <Stack.Screen name="media-packs" options={{ headerShown: false }} />
      <Stack.Screen name="notification-settings" options={{ headerShown: false }} />
      <Stack.Screen name="message-settings" options={{ headerShown: false }} />
        <Stack.Screen name="my-vault" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="moments" options={{ headerShown: false }} />
      <Stack.Screen name="performance" options={{ headerShown: false }} />
      <Stack.Screen name="earnings" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ headerShown: false }} />
    </Stack>
  );
}

function ApiAuthBridge({ children }: { children: React.ReactNode }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const { getToken } = useClerkAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);
  return <>{children}</>;
}

export default function RootLayout() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  useEffect(() => {
    void initializeAppLanguage();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refreshPhoneAppLanguage(); });
    return () => listener.remove();
  }, []);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;
  if (!publishableKey) return <BuildConfigurationError />;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl}>
      <ClerkLoaded>
        <ApiAuthBridge><SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <AuthProvider>
                    <RtmProvider>
                      <RootLayoutNav />
                      <InAppNotifications />
                    </RtmProvider>
                  </AuthProvider>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider></ApiAuthBridge>
      </ClerkLoaded>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  configurationError: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
    backgroundColor: colors.light.background,
  },
  configurationErrorTitle: {
    color: colors.light.text,
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    textAlign: "center",
  },
  configurationErrorMessage: {
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
