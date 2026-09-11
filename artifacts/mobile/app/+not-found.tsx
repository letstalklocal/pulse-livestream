import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function NotFoundScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();

  return (
    <>
      <Stack.Screen options={{ title: t("Oops!") }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[localizedTextStyle(), [styles.title, { color: colors.foreground }]]}>{t("This screen doesn't exist.")}</Text>

        <Link href="/" style={styles.link}>
          <Text style={[localizedTextStyle(), [styles.linkText, { color: colors.primary }]]}>{t("Go to home screen!")}</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
  },
});
