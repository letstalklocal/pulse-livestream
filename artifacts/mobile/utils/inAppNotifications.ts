import type {
  NotificationCategory,
  NotificationPreferences,
} from "../hooks/useNotificationPreferences";
export type InAppNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  route: string;
  createdAt: number;
};
export function canShowNotification(
  event: InAppNotification,
  preferences: NotificationPreferences,
  pathname: string,
) {
  if (!preferences.enabled || !preferences[event.category]) return false;
  if (
    ![
      "messages",
      "live",
      "privateInvitations",
      "gifts",
      "followers",
      "posts",
    ].includes(event.category)
  )
    return false;
  const path = pathname.replace(/\/\([^/]+\)/g, "").replace(/\/+$/, "");
  const inMessages =
    path === "/chat" || path === "/new-chat" || path.startsWith("/dm/");
  const fromDm = ["messages", "privateInvitations", "gifts"].includes(
    event.category,
  );
  if (fromDm && inMessages) return false;
  return path !== event.route;
}
export function notificationBody(event: InAppNotification, previews: boolean) {
  return !previews &&
    (event.category === "messages" || event.category === "posts")
    ? "Open Pulse to view it."
    : event.body;
}

export function collectNotifications(
  events: InAppNotification[],
  seen: Set<string>,
  startedAt: number,
  preferences: NotificationPreferences,
  pathname: string,
) {
  const fresh: InAppNotification[] = [];
  for (const event of [...events].reverse()) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    if (
      event.createdAt >= startedAt &&
      canShowNotification(event, preferences, pathname)
    )
      fresh.push(event);
  }
  if (seen.size > 1000)
    for (const id of [...seen].slice(0, seen.size - 500)) seen.delete(id);
  return fresh;
}
