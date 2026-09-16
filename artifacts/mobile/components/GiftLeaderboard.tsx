import React from "react";
import { useRouter } from "expo-router";
import { LiveViewersSheet } from "./LiveViewersSheet";

// Audience mode deliberately loads gift rankings only. Full viewer identities
// and moderation remain host-only, enforced by the existing server routes.
export function GiftLeaderboard({ channelId, visible, onClose }: {
  channelId: string; visible: boolean; onClose: () => void;
}) {
  const router = useRouter();
  return visible ? <LiveViewersSheet
    channelId={channelId}
    onClose={onClose}
    onProfile={(uid, name) => router.push({ pathname: "/profile/[hostUid]", params: { hostUid: String(uid), name } })}
  /> : null;
}
