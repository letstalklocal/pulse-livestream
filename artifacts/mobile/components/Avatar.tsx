import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

const AVATAR_COLORS = ["#FF1966", "#7B4FFF", "#00C896", "#FF8C00", "#4FC3F7"];

function getAvatarColor(uid: number): string {
  return AVATAR_COLORS[uid % AVATAR_COLORS.length] ?? "#FF1966";
}

interface Props {
  uid: number;
  name: string;
  avatarUri?: string;
  size?: number;
  borderWidth?: number;
}

export function Avatar({ uid, name, avatarUri, size = 40, borderWidth = 0 }: Props) {
  const color = getAvatarColor(uid);
  const initials = name.slice(0, 2).toUpperCase();
  const fontSize = size * 0.38;
  const radius = size / 2;

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: color + "33",
          borderColor: color,
          borderWidth,
        },
      ]}
    >
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={[styles.image, { borderRadius: radius }]}
        />
      ) : (
        <Text style={[styles.initials, { color, fontSize }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  initials: {
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});
