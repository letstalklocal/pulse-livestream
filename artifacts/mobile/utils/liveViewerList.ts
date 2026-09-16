import type { GetStreamModeration200UsersItem, LeaderboardEntry } from "@workspace/api-client-react";

export type LiveViewerEntry = GetStreamModeration200UsersItem & { coins: number; rank?: number };

// Preserve gift contributors after they leave, without presenting them as watching.
export function mergeLiveViewers(viewers: GetStreamModeration200UsersItem[], gifters: LeaderboardEntry[]): LiveViewerEntry[] {
  const people = new Map<number, LiveViewerEntry>(viewers.map(viewer => [viewer.uid, { ...viewer, coins: 0 }]));
  for (const gift of gifters) {
    const viewer = people.get(gift.uid);
    people.set(gift.uid, {
      uid: gift.uid, name: gift.name, present: false, muted: false, removed: false, blocked: false,
      ...viewer, coins: gift.coins, rank: gift.rank,
    });
  }
  return [...people.values()].sort((a, b) => b.coins - a.coins || a.name.localeCompare(b.name) || a.uid - b.uid);
}
