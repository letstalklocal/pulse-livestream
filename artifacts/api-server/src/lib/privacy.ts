import { and, count, eq, or } from "drizzle-orm";
import { db, followsTable, privacyPreferencesTable } from "@workspace/db";
import { contactBlocked } from "./userSafety";
type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export const privacyDefaults = { hideLocation: false, partyInvites: "everyone" as "everyone" | "friends", postsVisibility: "everyone" as "everyone" | "friends" };
export async function privacyPreferences(uid: number, reader: Reader = db) {
  const [row] = await reader.select().from(privacyPreferencesTable).where(eq(privacyPreferencesTable.userId, uid));
  return row ? { hideLocation: row.hideLocation, partyInvites: row.partyInvites, postsVisibility: row.postsVisibility } : { ...privacyDefaults };
}
export async function areFriends(a: number, b: number, reader: Reader = db) {
  if (a === b) return true;
  const [row] = await reader.select({ total: count() }).from(followsTable).where(or(
    and(eq(followsTable.followerId,a),eq(followsTable.followedId,b)),
    and(eq(followsTable.followerId,b),eq(followsTable.followedId,a)),
  ));
  return row?.total === 2;
}
export async function canViewPosts(owner: number, viewer?: number | null) {
  if (owner === viewer) return true;
  if (viewer && await contactBlocked(owner,viewer)) return false;
  const preferences = await privacyPreferences(owner);
  return preferences.postsVisibility === "everyone" || (!!viewer && await areFriends(owner,viewer));
}
export async function canInviteParty(recipient: number, sender: number, reader: Reader = db) {
  if (await contactBlocked(recipient,sender)) return false;
  return (await privacyPreferences(recipient,reader)).partyInvites === "everyone" || await areFriends(recipient,sender,reader);
}

export function redactProfileLocation<T extends object>(profile: T, hide: boolean): T {
  if (!hide) return profile;
  const result = { ...profile } as Record<string, unknown>;
  for (const field of ["location", "city", "country", "countryCode", "region", "latitude", "longitude", "coordinates"]) delete result[field];
  return result as T;
}
