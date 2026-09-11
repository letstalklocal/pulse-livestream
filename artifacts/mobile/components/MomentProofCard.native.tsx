import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import React, { useState } from "react";
import { Alert, Modal, Text, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { exportMomentProof, latestMomentProof } from "@/utils/momentProof";
import MomentPlayer from "./MomentPlayer";
export default function MomentProofCard({ uid }: { uid: number }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const [playing, setPlaying] = useState(false),
    [details, setDetails] = useState(false);
  const insets = useSafeAreaInsets();
  const query = useQuery({
    queryKey: ["moment-capture-proof", uid],
    queryFn: () => latestMomentProof(uid),
    refetchInterval: 2000,
  });
  const row = query.data;
  if (!row) return null;
  const stale =
    row.status === "running" && Date.now() - Date.parse(row.createdAt) > 30000;
  return (
    <View
      style={{
        padding: 16,
        borderWidth: 1,
        borderColor: "#665090",
        borderRadius: 16,
        backgroundColor: "#171121",
        gap: 12,
      }}
    >
      <Text style={[localizedTextStyle(), { color: "white", fontSize: 17, fontWeight: "700" }]}>{t("Live capture test")}</Text>
      <Text style={[localizedTextStyle(), { color: "#D0C8DE" }]}>{t("Revision: {v0}{v1}", { v0: row.revision ?? "original mixer test", v1: row.videoSize
          ? ` · ${row.videoSize.width}×${row.videoSize.height}`
          : "" })}</Text>
      <Text style={[localizedTextStyle(), { color: "#D0C8DE" }]}>
        {row.error ??
          (stale
            ? t("The test was interrupted. Start a new test from the live menu.")
            : row.status === "captured"
              ? t("Raw file captured — gift inclusion still needs checking.")
              : t("Test in progress…"))}
      </Text>
      <Text style={[localizedTextStyle(), { color: "#D0C8DE" }]}>{t("This file comes directly from the native recorder. No gift is drawn over playback or added by the server.")}</Text>
      {row.revision === "camera-overlay-v3" ||
      row.revision === "centered-overlay-v4" ||
      row.revision === "pixel-overlay-v5" ||
      row.revision === "double-crown-v6" ? (
        <Text style={[localizedTextStyle(), { color: "#D0C8DE" }]}>{t("0–1s: camera only. 1–3s: still crown. 3–5.2s: moving crown. Then camera only. Note when any static starts in the host preview, viewer, and raw file.")}</Text>
      ) : null}
      {row.uri ? (
        <>
          <Text style={[localizedTextStyle(), { color: "#D0C8DE" }]}>{t("{v0}s ·{v1}{v2} MB", { v0: ((row.durationMs ?? 0) / 1000).toFixed(1), v1: " ", v2: ((row.bytes ?? 0) / 1024 / 1024).toFixed(2) })}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setPlaying(true)}
              style={{
                padding: 14,
                backgroundColor: "#7347A8",
                borderRadius: 10,
              }}
            >
              <Text style={[localizedTextStyle(), { color: "white" }]}>{t("Play raw test")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                void exportMomentProof(row)
                  .then(() =>
                    Alert.alert(
                      t("Exported"),
                      t("The unchanged MP4 and test log were saved to your selected folder. Open the MP4 in your phone's video player to verify the crown."),
                    ),
                  )
                  .catch((e) =>
                    Alert.alert(
                      t("Export unavailable"),
                      e instanceof Error ? e.message : t("Try again."),
                    ),
                  );
              }}
              style={{ padding: 14 }}
            >
              <Text style={[localizedTextStyle(), { color: "white" }]}>{t("Export raw MP4 + log")}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[localizedTextStyle(), { color: "#D0C8DE" }]}>{t("Pass only if: the viewer saw the moving crown; this raw MP4 shows it too; voice is in sync; the live camera returned normally. If the crown was live but missing here, the recorder is capturing the wrong video source.")}</Text>
        </>
      ) : null}
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => setDetails(!details)}
        style={{ paddingVertical: 8 }}
      >
        <Text style={[localizedTextStyle(), { color: "#C9A8F0" }]}>{t("{v0} test log", { v0: details ? "Hide" : "Show" })}</Text>
      </TouchableOpacity>
      {details ? (
        <Text selectable style={{ color: "#D0C8DE", fontSize: 12 }}>
          {row.events
            .map(
              (event) =>
                `${event.ms}ms: ${event.event}${event.code == null ? "" : ` (${event.code})`}`,
            )
            .join("\n")}
        </Text>
      ) : null}
      <Modal
        visible={playing}
        animationType="slide"
        onRequestClose={() => setPlaying(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "black",
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setPlaying(false)}
            style={{ padding: 18, alignSelf: "flex-end" }}
          >
            <Text style={[localizedTextStyle(), { color: "white" }]}>{t("Close raw playback")}</Text>
          </TouchableOpacity>
          {playing && row.uri ? <MomentPlayer uri={row.uri} /> : null}
        </View>
      </Modal>
    </View>
  );
}
