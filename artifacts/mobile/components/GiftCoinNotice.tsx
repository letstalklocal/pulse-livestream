import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import { GoldCoinIcon } from "./GoldCoinIcon";

/** Display historical system notices without changing the stored receipt. */
export function GiftCoinNotice({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const notice = /^(sent )?\u{1FA99} (\d[\d,]*) coins · (.+)$/u.exec(text);
  if (!notice) return <Text style={style}>{text}</Text>;
  const size = StyleSheet.flatten(style)?.fontSize ?? 13;
  return <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
    {notice[1] ? <Text style={style}>{notice[1].trimEnd()}</Text> : null}
    <GoldCoinIcon size={size} />
    <Text style={[style, { flexShrink: 1 }]}>{`${notice[2]} coins · ${notice[3]}`}</Text>
  </View>;
}
