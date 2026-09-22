import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused, useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";
import {
  VIDEO_PROTOTYPE_ENABLED,
  VIDEO_PROTOTYPE_SAMPLE,
} from "@/utils/videoPrototype";
import { stopAllLivePreviews } from "@/components/LivePreviewThumbnail";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { videoRequest, type CreatorVideo } from "@/utils/creatorVideos";
import { Avatar } from "./Avatar";
import { VideoCardPreview } from "./VideoCardPreview";
import { getGetUserQueryKey, useGetUser } from "@workspace/api-client-react";

export interface VideoSectionHandle {
  refreshVisibility: () => void;
}
// Match Discovery's two-column StreamCard dimensions and image/identity treatment.
const CARD_WIDTH = (Dimensions.get("window").width - 48) / 2;
type ViewportRef = React.RefObject<FlatList<any> | null>;
export const DiscoveryVideosSection = React.forwardRef<
  VideoSectionHandle,
  { viewportRef: ViewportRef }
>(function DiscoveryVideosSection({ viewportRef }, ref) {
  const { getToken, userId } = useAuth();
  const focused = useIsFocused();
  const { t } = useAppLanguage();
  const colors = useColors();
  const cards = useRef(new Map<string, VideoSectionHandle>());
  const feed = useQuery({
    queryKey: ["creator-video-feed", userId],
    queryFn: ({ signal }) =>
      videoRequest<{ videos: CreatorVideo[] }>(
        "/feed",
        getToken,
        "GET",
        undefined,
        signal,
      ),
    enabled: !!userId && focused,
    refetchInterval: 8000,
    retry: false,
  });
  useImperativeHandle(
    ref,
    () => ({
      refreshVisibility: () =>
        cards.current.forEach((card) => card.refreshVisibility()),
    }),
    [],
  );
  const videos = feed.data?.videos ?? [];
  if (!videos.length && !VIDEO_PROTOTYPE_ENABLED) return null;
  return (
    <View
      testID="discovery-videos-section"
      style={{ paddingVertical: 16, gap: 10 }}
    >
      <Text
        style={{ color: colors.foreground, fontSize: 20, fontWeight: "700" }}
      >
        {t("Videos")}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        {videos.map((video) => (
          <VideoDiscoveryCard
            key={video.id}
            ref={(value) => {
              if (value) cards.current.set(video.id, value);
              else cards.current.delete(video.id);
            }}
            viewportRef={viewportRef}
            video={video}
          />
        ))}
        {VIDEO_PROTOTYPE_ENABLED && (
          <VideoDiscoveryCard
            ref={(value) => {
              if (value) cards.current.set("sample", value);
              else cards.current.delete("sample");
            }}
            viewportRef={viewportRef}
          />
        )}
      </View>
    </View>
  );
});
const VideoDiscoveryCard = React.forwardRef<
  VideoSectionHandle,
  { viewportRef: ViewportRef; video?: CreatorVideo }
>(function VideoDiscoveryCard({ viewportRef, video }, ref) {
  const card = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [opening, setOpening] = useState(false);
  const focused = useIsFocused();
  const measurement = useRef(0);
  const refreshVisibility = useCallback(() => {
    const revision = ++measurement.current;
    const viewport = viewportRef.current?.getNativeScrollRef() as
      | View
      | null
      | undefined;
    viewport?.measureInWindow(
      (_x: number, top: number, _w: number, height: number) => {
        card.current?.measureInWindow((_cx, y, _cw, cardHeight) => {
          if (measurement.current !== revision) return;
          const overlap = Math.max(
            0,
            Math.min(y + cardHeight, top + height) - Math.max(y, top),
          );
          setVisible(cardHeight > 0 && overlap / cardHeight >= 0.4);
        });
      },
    );
  }, [viewportRef]);
  useImperativeHandle(ref, () => ({ refreshVisibility }), [refreshVisibility]);
  useEffect(() => {
    if (focused) {
      setOpening(false);
      refreshVisibility();
    }
    return () => {
      measurement.current++;
    };
  }, [focused, refreshVisibility]);
  const { t } = useAppLanguage();
  const colors = useColors();
  const router = useRouter();
  const ownerUid = video?.ownerUid ?? 0;
  const ownerProfile = useGetUser(ownerUid, {
    query: {
      queryKey: getGetUserQueryKey(ownerUid),
      enabled: ownerUid > 0,
      staleTime: 60_000,
      retry: false,
    },
  });
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={video?.ownerName ?? t("Video prototype")}
      onPress={() => {
        setOpening(true);
        stopAllLivePreviews();
        router.push((video ? `/video/${video.id}` : "/video-prototype") as any);
      }}
      activeOpacity={0.85}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View
        ref={card}
        collapsable={false}
        onLayout={refreshVisibility}
        style={{ width: "100%", aspectRatio: 9 / 16 }}
      >
        <Image
          source={
            video?.thumbnailUrl
              ? { uri: video.thumbnailUrl }
              : require("@/assets/video-prototype/portrait-poster.jpg")
          }
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <VideoCardPreview
          url={video?.playbackUrl ?? VIDEO_PROTOTYPE_SAMPLE}
          cacheKey={video ? `creator-video:${video.id}` : undefined}
          isVisible={visible && focused && !opening}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)"]}
          style={styles.fade}
        />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>VIDEO</Text>
        </View>
        <View style={styles.identity}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("View {v0}'s profile", { v0: ownerProfile.data?.user.name?.trim() ?? video?.ownerName ?? t("Video prototype") })}
            disabled={ownerUid <= 0}
            onPress={() => router.push({
              pathname: "/profile/[hostUid]",
              params: {
                hostUid: String(ownerUid),
                name: ownerProfile.data?.user.name?.trim() ?? video?.ownerName ?? "",
                avatarUri: ownerProfile.data?.user.avatarImageUrl ?? "",
              },
            })}
            activeOpacity={0.75}
          >
            <Avatar
              uid={ownerUid}
              name={ownerProfile.data?.user.name?.trim() ?? video?.ownerName ?? t("Video prototype")}
              avatarUri={ownerProfile.data?.user.avatarImageUrl ?? undefined}
              size={26}
              borderWidth={1}
            />
          </TouchableOpacity>
          <Text style={styles.name} numberOfLines={1}>
            {video?.ownerName ?? t("Video prototype")}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});
const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 12,
  },
  fade: { position: "absolute", bottom: 0, left: 0, right: 0, height: "45%" },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "#00D4D4",
  },
  badgeText: {
    color: "#003A3A",
    fontWeight: "700",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  identity: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FFF",
    backgroundColor: "#753AC0",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    flex: 1,
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});
