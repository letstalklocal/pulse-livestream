import React, { useState } from "react";
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { t, localizedTextStyle } from "@/i18n";
import { isReactionEmoji } from "@/utils/reactionEmoji";

import catalog from "@/data/emoji/catalog.json";
const CATEGORY_ICONS = ["😀", "👋", "🐻", "🍎", "🚗", "⚽", "💡", "❤️", "🏁"];
const QUICK_EMOJIS = ["❤️", "🔥", "👏", "😂", "😍", "🎉", "🥰", "🤣", "😊", "😘", "😎", "🥳", "🤩", "😮", "😭", "😈", "😅", "🤔", "👍", "👎", "🙌", "🙏", "🫶", "💪", "✌️", "🤝", "👋", "👌", "💯", "✨", "⭐", "🌟", "💖", "💕", "💜", "💙", "💚", "🧡", "🌹", "🌈", "🎶", "🎵", "🏆", "👑", "🚀", "🦋", "🐶", "🐱"];

export function ReactionEmojiChooser({ selected, onChoose, onCancel, showCancel = true, startExpanded = false }: { selected: string; onChoose: (emoji: string) => void; onCancel: () => void; showCancel?: boolean; startExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [category, setCategory] = useState(0);
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState("");
  const valid = isReactionEmoji(draft);
  const emojis = QUICK_EMOJIS.includes(selected) ? QUICK_EMOJIS : [selected, ...QUICK_EMOJIS];
  return <View style={styles.container}>
    <Text style={[localizedTextStyle(), styles.title]}>{t(expanded ? "Change emoji" : "Tap an emoji")}</Text>
    {expanded ? <>
      <View testID="reaction-emoji-preview" accessibilityLabel={t("Selected emoji")} style={styles.preview}>
        <Text style={styles.previewEmoji}>{draft}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categories} contentContainerStyle={styles.categoryRow}>
        {catalog.map((group, index) => <Pressable key={group.name} accessibilityRole="button" accessibilityLabel={t(group.name)} accessibilityState={{ selected: category === index }} onPress={() => setCategory(index)} style={[styles.category, category === index && styles.selected]}><Text style={styles.categoryEmoji}>{CATEGORY_ICONS[index]}</Text></Pressable>)}
      </ScrollView>
      <Text style={[localizedTextStyle(), styles.hint]}>{t(catalog[category].name)}</Text>
      <FlatList key={category} data={catalog[category].emojis} extraData={draft} numColumns={6}
        style={{ height: Math.max(96, Math.min(240, height - 370)), flexGrow: 0 }}
        keyExtractor={emoji => emoji} initialNumToRender={36} maxToRenderPerBatch={36} windowSize={3}
        getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
        renderItem={({ item: emoji }) => <Pressable accessibilityRole="button" accessibilityLabel={emoji} accessibilityState={{ selected: emoji === draft }} onPress={() => setDraft(emoji)} style={[styles.fullCell, emoji === draft && styles.selected]}><Text style={styles.emoji}>{emoji}</Text></Pressable>} />
    </> : <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
        {emojis.map(emoji => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={emoji} accessibilityState={{ selected: emoji === selected }} onPress={() => onChoose(emoji)} style={[styles.cell, emoji === selected && styles.selected]}><Text style={styles.emoji}>{emoji}</Text></Pressable>)}
      </ScrollView>
      <Pressable accessibilityRole="button" style={styles.more} onPress={() => { Keyboard.dismiss(); setDraft(""); setCategory(0); setExpanded(true); }}><Text style={[localizedTextStyle(), styles.label]}>{t("More emojis")}</Text></Pressable>
    </>}
    <View style={styles.actions}>
      {showCancel ? <Pressable accessibilityRole="button" onPress={onCancel} style={styles.button}><Text style={[localizedTextStyle(), styles.label]}>{t("Cancel")}</Text></Pressable> : null}
      {expanded ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid }} disabled={!valid} onPress={() => onChoose(draft)} style={[styles.button, styles.confirm, !valid && { opacity: 0.4 }]}><Text style={[localizedTextStyle(), styles.label]}>{t("Select")}</Text></Pressable> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { color: "#FFF", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  hint: { color: "#CCC", fontSize: 14 },
  scroll: { maxHeight: 240 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  cell: { width: "16.666%", minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  selected: { backgroundColor: "rgba(255,25,102,0.3)" },
  emoji: { fontSize: 28, lineHeight: 40, minHeight: 40, textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  more: { minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 8 },
  preview: { height: 52, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12 },
  previewEmoji: { fontSize: 32, lineHeight: 44, includeFontPadding: false },
  categories: { flexGrow: 0 },
  categoryRow: { gap: 2 },
  category: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  categoryEmoji: { fontSize: 23, lineHeight: 34, includeFontPadding: false },
  fullCell: { width: "16.666%", height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  actions: { flexDirection: "row", gap: 12 },
  button: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  confirm: { backgroundColor: "#FF1966" },
  label: { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
