import React from "react";
import { View } from "react-native";
import { getGetUserQueryKey, useGetUser } from "@workspace/api-client-react";
import { Avatar } from "./Avatar";

export function LiveChatAvatar({ senderUid, senderName }: { senderUid?: number; senderName: string }) {
  const uid = Number.isSafeInteger(senderUid) && senderUid! > 0 ? senderUid! : 0;
  // Share the existing profile cache: repeated messages from one sender reuse
  // the same request and avatar URL. Demo/legacy messages have initials only.
  const profile = useGetUser(uid, {
    query: { queryKey: getGetUserQueryKey(uid), enabled: uid > 0, staleTime: 60_000, retry: false },
  });
  return <View style={{ alignSelf: "center" }} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Avatar uid={senderUid !== undefined && senderUid < 0 ? senderUid : uid} name={senderName} avatarUri={profile.data?.user.avatarImageUrl ?? undefined} size={26} borderWidth={1} borderColor="rgba(255,255,255,0.5)" />
  </View>;
}
