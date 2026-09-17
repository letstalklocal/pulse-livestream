import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { t, localizedTextStyle } from "@/i18n";
import { ReactionEmojiChooser } from "./ReactionEmojiChooser";
import type { useReactionFavorites } from "@/hooks/useReactionFavorites";

export function replaceFavorite(emojis: string[], index: number, emoji: string) {
  const next = [...emojis];
  const previousIndex = next.indexOf(emoji);
  if (previousIndex >= 0) next[previousIndex] = next[index];
  next[index] = emoji;
  return next;
}

export function ReactionFavoritesChooser({ preferences, selected, onChoose, onSaved, onCancel }: {
  preferences: ReturnType<typeof useReactionFavorites>;
  selected: string; onChoose: (emoji: string) => void; onSaved: (emojis: string[], activeEmoji?: string) => void; onCancel: () => void;
}) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [draft, setDraft] = useState(preferences.favorites);
  const [activeSelection, setActiveSelection] = useState(selected);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const saving = preferences.save.isPending;
  const changed = draft.some((emoji, index) => emoji !== preferences.favorites[index]);
  useEffect(() => { setActiveSelection(selected); }, [selected]);
  if (selectedSlot !== null) return <ReactionEmojiChooser startExpanded showCancel={false} selected={draft[selectedSlot]} onChoose={emoji => {
    Keyboard.dismiss();
    setDraft(replaceFavorite(draft, selectedSlot, emoji));
    setActiveSelection(emoji);
    setSelectedSlot(null);
  }} onCancel={() => { Keyboard.dismiss(); setSelectedSlot(null); }} />;
  const save = async () => {
    if (saving) return;
    setFailed(false);
    if (!changed || !preferences.signedIn) { onChoose(activeSelection); return; }
    try {
      const data = await preferences.save.mutateAsync(draft);
      if (mounted.current) onSaved(data.emojis, activeSelection);
    } catch { if (mounted.current) setFailed(true); }
  };
  const changeLabel = t("Change favorites").replace(/favorites/gi, "Favorite");
  return <View style={styles.container}>
    <Text style={[localizedTextStyle(), styles.title]}>{t("Tap an emoji")}</Text>
    <Text style={[localizedTextStyle(), styles.hint]}>{t("Tap an emoji, then change it if you want.")}</Text>
    <View style={styles.grid}>
      {draft.map((emoji, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={emoji} accessibilityState={{ selected: activeSelection === emoji, disabled: saving }} disabled={saving} onPress={() => setActiveSelection(emoji)} style={[styles.cell, activeSelection === emoji && styles.selected]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </Pressable>)}
    </View>
    {failed ? <Text accessibilityRole="alert" style={styles.error}>{t("Could not save favorites. Try again.")}</Text> : null}
    {preferences.signedIn && preferences.isPending ? <ActivityIndicator color="#FFF" /> : null}
    {preferences.isError ? <Pressable style={styles.button} onPress={() => void preferences.refetch()}><Text style={styles.error}>{t("Could not load favorites. Tap to retry.")}</Text></Pressable> : null}
    {!preferences.signedIn ? <Text style={[localizedTextStyle(), styles.hint]}>{t("Sign in to save favorites.")}</Text> : null}
    {preferences.signedIn && preferences.data ? <Pressable accessibilityRole="button" style={[styles.button, styles.confirm]} disabled={saving} onPress={() => { const index = draft.indexOf(activeSelection); setSelectedSlot(index >= 0 ? index : 0); }}><Text style={[localizedTextStyle(), styles.label]}>{changeLabel}</Text></Pressable> : null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" disabled={saving} style={[styles.button, styles.doneButton, saving && { opacity: 0.5 }]} onPress={() => void save()}><Text style={[localizedTextStyle(), styles.label]}>{t(saving ? "Saving…" : "Done")}</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 }, title: { color: "#FFF", fontSize: 18, fontFamily: "Inter_600SemiBold" }, hint: { color: "#CCC", fontSize: 14 }, grid: { flexDirection: "row", flexWrap: "wrap" }, cell: { width: "25%", minHeight: 58, alignItems: "center", justifyContent: "center", borderRadius: 12 }, selected: { backgroundColor: "rgba(255,25,102,0.3)" }, emoji: { fontSize: 30 }, actions: { flexDirection: "row", gap: 12 }, button: { flexGrow: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, paddingHorizontal: 8 }, confirm: { backgroundColor: "#FF1966" }, doneButton: { borderWidth: 0.5, borderColor: "rgba(255,255,255,0.85)", backgroundColor: "transparent" }, label: { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" }, error: { color: "#FF8D9B", fontSize: 14 },
});
