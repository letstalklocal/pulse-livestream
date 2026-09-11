import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";

export type MomentGift = {
  giftId: string;
  amount: number;
  recipientUid: number;
  senderUid?: number;
  senderName?: string;
  giftName?: string;
};
export type LocalMoment = MomentGift & {
  createdAt: string;
  status: "recording" | "uploading" | "ready" | "failed";
  uri?: string;
  durationMs?: number;
  captureMode?: "live-gift-v1" | null;
  error?: string;
  id?: number;
};
const base = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";
const key = (uid: number) => `pulse:moments:${uid}`;
let writes: Promise<unknown> = Promise.resolve();
export async function localMoments(uid: number): Promise<LocalMoment[]> {
  await writes.catch(() => {});
  try {
    return JSON.parse((await AsyncStorage.getItem(key(uid))) ?? "[]");
  } catch {
    return [];
  }
}
export function saveLocalMoment(moment: LocalMoment) {
  writes = writes
    .catch(() => {})
    .then(async () => {
      const rows: LocalMoment[] = JSON.parse(
        (await AsyncStorage.getItem(key(moment.recipientUid))) ?? "[]",
      );
      await AsyncStorage.setItem(
        key(moment.recipientUid),
        JSON.stringify([
          moment,
          ...rows.filter((row) => row.giftId !== moment.giftId),
        ]),
      );
    });
  return writes;
}
export async function removeLocalMoment(uid: number, giftId: string) {
  writes = writes
    .catch(() => {})
    .then(async () => {
      const rows: LocalMoment[] = JSON.parse(
        (await AsyncStorage.getItem(key(uid))) ?? "[]",
      );
      const row = rows.find((item) => item.giftId === giftId);
      if (row?.uri) {
        try {
          const file = new File(row.uri);
          if (file.exists) file.delete();
        } catch {}
      }
      await AsyncStorage.setItem(
        key(uid),
        JSON.stringify(rows.filter((item) => item.giftId !== giftId)),
      );
    });
  return writes;
}
export async function momentsRequest(
  path: string,
  getToken: () => Promise<string | null>,
  method = "GET",
  body?: object,
) {
  const token = await getToken();
  if (!token) throw new Error("Sign in to use Moments.");
  const response = await fetch(`${base}/api/moments${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.error ?? `Moments request failed (${response.status})`,
    );
  }
  return response.json();
}
const uploads = new Set<string>();
export async function uploadMoment(
  moment: LocalMoment,
  getToken: () => Promise<string | null>,
) {
  if (uploads.has(moment.giftId)) return;
  uploads.add(moment.giftId);
  try {
    if (!moment.uri || !moment.durationMs)
      throw new Error(
        "No recording was saved. Try another qualifying gift while live.",
      );
    const file = new File(moment.uri);
    if (!file.exists || !file.size)
      throw new Error("The recording file is missing.");
    moment = { ...moment, status: "uploading", error: undefined };
    await saveLocalMoment(moment);
    const ticket = await momentsRequest("/uploads", getToken, "POST", {
      giftId: moment.giftId,
    });
    moment = { ...moment, id: ticket.id };
    await saveLocalMoment(moment);
    if (!ticket.ready) {
      const response = await expoFetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: file,
      });
      if (!response.ok)
        throw new Error(
          "Upload failed. Your clip is saved on this phone; retry in Moments.",
        );
      await momentsRequest(`/${ticket.id}/complete`, getToken, "POST", {
        durationMs: moment.durationMs,
        captureMode: moment.captureMode,
      });
    }
    await saveLocalMoment({ ...moment, status: "ready", error: undefined });
  } catch (error) {
    await saveLocalMoment({
      ...moment,
      status: "failed",
      error: error instanceof Error ? error.message : "Could not save Moment",
    });
  } finally {
    uploads.delete(moment.giftId);
  }
}
