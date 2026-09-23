import { useAuth } from "@clerk/expo";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { notificationBase } from "./useNotificationPreferences";
export interface HistoryNotification {
  id: number;
  category: string;
  title: string;
  body: string;
  route: string;
  createdAt: number;
  read: boolean;
}
interface HistoryPage {
  notifications: HistoryNotification[];
  unreadCount: number;
  nextCursor: number | null;
}
export function useNotificationHistory() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const key = ["notification-history", userId];
  const request = async (suffix = "", method = "GET"): Promise<HistoryPage> => {
    const token = await getToken();
    if (!token) throw new Error("Sign in to manage notifications.");
    const response = await fetch(
      `${notificationBase}/api/notifications/history${suffix}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok)
      throw new Error("Something went wrong. Please try again.");
    return response.json();
  };
  const query = useInfiniteQuery({
    queryKey: key,
    enabled: !!userId,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      request(pageParam === null ? "" : `?before=${pageParam}`),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
  const change = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id?: number;
      action: "read" | "delete" | "clear";
    }) =>
      request(
        action === "clear" ? "" : `/${id}${action === "read" ? "/read" : ""}`,
        action === "read" ? "PATCH" : "DELETE",
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return {
    ...query,
    change,
    userId,
    notifications: query.data?.pages.flatMap((p) => p.notifications) ?? [],
    unreadCount: query.data?.pages[0]?.unreadCount ?? 0,
  };
}
