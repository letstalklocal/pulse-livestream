import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
export const notificationDefaults = {
  enabled: true,
  previews: true,
  messages: true,
  live: true,
  privateInvitations: true,
  gifts: true,
  followers: true,
  posts: true,
};
export type NotificationPreferences = typeof notificationDefaults;
export type NotificationCategory = Exclude<
  keyof NotificationPreferences,
  "enabled" | "previews"
>;
export const notificationBase = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";
export function useNotificationPreferences() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const key = ["notification-preferences", userId];
  const request = async (
    patch?: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> => {
    const token = await getToken();
    if (!token) throw new Error("Sign in to manage notifications.");
    const response = await fetch(
      `${notificationBase}/api/notification-preferences`,
      {
        method: patch ? "PATCH" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(patch ? { body: JSON.stringify(patch) } : {}),
      },
    );
    if (!response.ok)
      throw new Error(
        patch
          ? "Couldn't save your settings. Please try again."
          : "Couldn't load notifications. Please try again.",
      );
    return response.json();
  };
  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: () => request(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const save = useMutation({
    mutationFn: request,
    onSuccess: async (data) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData(key, data);
    },
  });
  return {
    ...query,
    save,
    preferences: query.data ?? notificationDefaults,
    userId,
  };
}
