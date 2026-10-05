import React, { useEffect, useRef, useState } from "react";
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import {
  getGetCoinBalanceQueryKey,
  getGetMediaPackQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useAppLanguage } from "@/i18n";
import {
  stickerApi,
  stickerQueryKey,
  type LiveSticker,
  type StickerStatus,
} from "@/utils/liveStickers";
import { GIFTS } from "./GiftPicker";
import { LiveStickerPicker } from "./LiveStickerSetup";
import type { StickerDraft } from "@/utils/liveStickers";
import { LiveStickerCard } from "./LiveStickerCard";

export function LiveStickerOverlay(props: {
  channelId: string;
  enabled: boolean;
  visible: boolean;
  top: number;
  isHost?: boolean;
  manageVisible?: boolean;
  onManageClose?: () => void;
}) {
  const { user } = useAuth();
  return user ? (
    <StickerSession
      key={`${user.uid}:${props.channelId}`}
      {...props}
      uid={user.uid}
      senderName={user.name ?? "Viewer"}
    />
  ) : null;
}
function StickerSession({
  channelId,
  enabled,
  visible,
  top,
  isHost = false,
  manageVisible = false,
  onManageClose,
  uid,
  senderName,
}: {
  channelId: string;
  enabled: boolean;
  visible: boolean;
  top: number;
  isHost?: boolean;
  manageVisible?: boolean;
  onManageClose?: () => void;
  uid: number;
  senderName: string;
}) {
  const { t } = useAppLanguage();
  const { getToken } = useClerkAuth();
  const router = useRouter();
  const client = useQueryClient();
  const key = stickerQueryKey(channelId, uid);
  const dismissedKey = ["dismissed-live-stickers", uid, channelId] as const;
  const storageKey = `dismissed-live-stickers:${uid}`;
  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: ({ signal }) =>
      stickerApi<StickerStatus>(
        `/streams/${encodeURIComponent(channelId)}/stickers`,
        getToken,
        "GET",
        undefined,
        signal,
      ),
    refetchInterval: enabled ? 5000 : false,
    retry: false,
  });
  const dismissed = useQuery({
    queryKey: dismissedKey,
    enabled: enabled && !isHost,
    queryFn: async () => {
      const saved = JSON.parse(
        (await AsyncStorage.getItem(storageKey)) ?? "{}",
      );
      return (saved[channelId] ?? []) as string[];
    },
  });
  const [replacement, setReplacement] = useState<LiveSticker | null>(null);
  const [adding, setAdding] = useState<"gift" | "pack" | null>(null);
  const additionKeys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(enabled);
  active.current = enabled;
  const paymentKeys = useRef(new Map<string, string>());
  useEffect(() => {
    if (!enabled) {
      controller.current?.abort();
      setReplacement(null);
      setAdding(null);
    }
  }, [enabled]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const perform = async (sticker: LiveSticker) => {
    if (busyRef.current || !active.current) return;
    busyRef.current = true;
    setBusy(true);
    controller.current = new AbortController();
    try {
      if (sticker.kind === "pack" && sticker.owned) {
        const hostUid = query.data?.hostUid;
        if (!hostUid) throw new Error("Pack conversation is unavailable");
        const saved = JSON.parse(
          (await AsyncStorage.getItem(storageKey)) ?? "{}",
        );
        if (!mounted.current || !active.current) return;
        const ids = [...new Set([...(dismissed.data ?? []), sticker.id])];
        const retained = Object.fromEntries(
          Object.entries(saved)
            .filter(([id]) => id !== channelId)
            .slice(-19),
        );
        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify({ ...retained, [channelId]: ids }),
        );
        if (!mounted.current || !active.current) return;
        client.setQueryData(dismissedKey, ids);
        router.push({ pathname: "/dm/[peerId]", params: { peerId: String(hostUid) } });
        return;
      }
      let requestKey = paymentKeys.current.get(sticker.id);
      if (!requestKey) {
        requestKey = Crypto.randomUUID();
        paymentKeys.current.set(sticker.id, requestKey);
      }
      const gift = GIFTS.find((g) => g.id === sticker.giftId)!;
      const result =
        sticker.kind === "pack"
          ? await stickerApi<{ balance: number }>(
              `/media-packs/${sticker.packId}/unlock`,
              getToken,
              "POST",
              {
                idempotencyKey: requestKey,
                expectedPrice: sticker.price,
                live: { channelId, stickerId: sticker.id },
              },
              controller.current.signal,
            )
          : await stickerApi<{ balance: number }>(
              "/coins/spend",
              getToken,
              "POST",
              {
                uid,
                recipientUid: query.data?.hostUid,
                amount: sticker.price,
                giftName: gift.name,
                senderName,
                channelId,
                stickerId: sticker.id,
                description: gift.name,
                idempotencyKey: requestKey,
              },
              controller.current.signal,
            );
      paymentKeys.current.delete(sticker.id);
      await client.cancelQueries({ queryKey: key });
      client.setQueryData(getGetCoinBalanceQueryKey({ uid }), {
        balance: result.balance,
      });
      if (sticker.kind === "pack") {
        client.setQueryData<StickerStatus>(key, (old) =>
          old
            ? {
                ...old,
                stickers: old.stickers.map((s) =>
                  s.packId === sticker.packId ? { ...s, owned: true } : s,
                ),
              }
            : old,
        );
        void client.invalidateQueries({
          queryKey: getGetMediaPackQueryKey(sticker.packId!),
        });
        if (mounted.current && active.current)
          Alert.alert(t("Sent to your messages"));
      }
      void client.invalidateQueries({ queryKey: key });
    } catch (error) {
      if (mounted.current && active.current)
        Alert.alert(
          t("Please try again."),
          t(error instanceof Error ? error.message : "Please try again."),
        );
      void client.invalidateQueries({ queryKey: key });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const tap = (sticker: LiveSticker) => {
    if (sticker.kind === "gift" || sticker.owned) {
      void perform(sticker);
      return;
    }
    Alert.alert(
      t("Unlock media pack?"),
      t(
        "This will deduct {v0} coins from your balance. You can view these {v1} items again after unlocking.",
        { v0: sticker.price, v1: sticker.videos + sticker.pictures },
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Unlock for {v0}", { v0: sticker.price }),
          onPress: () => void perform(sticker),
        },
      ],
    );
  };
  const remove = async (id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await stickerApi(
        `/streams/${encodeURIComponent(channelId)}/stickers/${encodeURIComponent(id)}`,
        getToken,
        "DELETE",
      );
      await client.invalidateQueries({ queryKey: key });
    } catch (error) {
      if (mounted.current && active.current)
        Alert.alert(
          t("Please try again."),
          t(error instanceof Error ? error.message : "Please try again."),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const replace = async (draft: StickerDraft) => {
    if (!replacement || busyRef.current || !active.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await stickerApi(
        `/streams/${encodeURIComponent(channelId)}/stickers/${encodeURIComponent(replacement.id)}`,
        getToken,
        "PUT",
        draft,
      );
      if (mounted.current) setReplacement(null);
      await client.invalidateQueries({ queryKey: key });
    } catch (error) {
      if (mounted.current && active.current)
        Alert.alert(
          t("Please try again."),
          t(error instanceof Error ? error.message : "Please try again."),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const add = async (draft: StickerDraft) => {
    if (!isHost || !adding || busyRef.current || !active.current) return;
    busyRef.current = true;
    setBusy(true);
    controller.current = new AbortController();
    const draftKey = `${draft.kind}:${draft.giftId}:${draft.packId ?? ""}`;
    let requestId = additionKeys.current.get(draftKey);
    if (!requestId) {
      requestId = Crypto.randomUUID();
      additionKeys.current.set(draftKey, requestId);
    }
    try {
      await stickerApi(`/streams/${encodeURIComponent(channelId)}/stickers`, getToken,
        "POST", { ...draft, requestId }, controller.current.signal);
      additionKeys.current.delete(draftKey);
      if (mounted.current && active.current) setAdding(null);
      await client.invalidateQueries({ queryKey: key });
    } catch (error) {
      // Keep the key and picker for a safe retry after a lost response.
      if (mounted.current && active.current)
        Alert.alert(t("Please try again."), t(error instanceof Error ? error.message : "Please try again."));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const stickers = query.isError
    ? []
    : (query.data?.stickers ?? []).filter(
        (s) => isHost || !dismissed.data?.includes(s.id),
      );
  return (
    <>
      {enabled && visible && (isHost || dismissed.isSuccess) ? (
        <View pointerEvents="box-none" style={[styles.stack, { top }]}>
          {stickers.map((sticker) => (
            <View key={sticker.id}>
              <LiveStickerCard
                sticker={sticker}
                disabled={busy}
                showOwned={!isHost}
                onPress={isHost ? undefined : () => tap(sticker)}
                onDoublePress={
                  isHost
                    ? () =>
                        Alert.alert(t("Sticker options"), undefined, [
                          {
                            text: t("Close sticker"),
                            style: "destructive",
                            onPress: () => void remove(sticker.id),
                          },
                          {
                            text: t("Replace sticker"),
                            onPress: () => setReplacement(sticker),
                          },
                          { text: t("Cancel"), style: "cancel" },
                        ])
                    : undefined
                }
              />
            </View>
          ))}
        </View>
      ) : null}
      {isHost && manageVisible && enabled ? (
        <Modal testID="manage-live-stickers" transparent visible animationType="fade" onRequestClose={onManageClose}>
          <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.6)" }}>
            <View style={{ padding: 20, borderRadius: 16, backgroundColor: "#1A1A2E" }}>
              <Text style={{ color: "#FFF", fontSize: 20, marginBottom: 16 }}>{t("Change sticker")}</Text>
              {query.isLoading ? <Text style={{ color: "#FFF" }}>{t("Loading…")}</Text> : null}
              {query.isError ? <TouchableOpacity onPress={() => void query.refetch()} style={{ padding: 16 }}><Text style={{ color: "#FFF" }}>{t("Please try again.")}</Text></TouchableOpacity> : null}
              {query.isSuccess && (query.data?.stickers.length ?? 0) < 2 ? (["gift", "pack"] as const).map(kind => (
                <TouchableOpacity key={kind} testID={`manage-live-add-${kind}`} accessibilityRole="button" disabled={busy}
                  style={{ paddingVertical: 16 }} onPress={() => { onManageClose?.(); setAdding(kind); }}>
                  <Text style={{ color: "#FFF", fontSize: 16 }}>{t(kind === "gift" ? "Add gift sticker" : "Add pack sticker")}</Text>
                </TouchableOpacity>
              )) : null}
              {stickers.map(sticker => <TouchableOpacity key={sticker.id} testID={`manage-live-sticker-${sticker.id}`} accessibilityRole="button"
                disabled={busy} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 10 }}
                onPress={() => { onManageClose?.(); setReplacement(sticker); }}>
                <LiveStickerCard sticker={sticker} disabled showOwned={false} />
                <Text style={{ color: "#FFF", flex: 1 }}>{sticker.name} · {t("Replace sticker")}</Text>
              </TouchableOpacity>)}
              <TouchableOpacity onPress={onManageClose} style={{ padding: 16 }} accessibilityRole="button"><Text style={{ color: "#FFF", textAlign: "center" }}>{t("Cancel")}</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
      {(replacement || adding) && isHost && enabled ? (
        <LiveStickerPicker
          key={replacement?.id ?? `add-${adding}`}
          initialKind={replacement?.kind ?? adding!}
          replacing={!!replacement}
          excludedPackIds={(query.data?.stickers ?? [])
            .filter((s) => s.id !== replacement?.id && s.packId !== undefined)
            .map((s) => s.packId!)}
          disabled={busy}
          onClose={() => { if (!busyRef.current) { setReplacement(null); setAdding(null); } }}
          onSelect={(draft) => { if (replacement) void replace(draft); else void add(draft); }}
        />
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  stack: { position: "absolute", left: 12, gap: 6 },
});
