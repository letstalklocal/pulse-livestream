import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetCoinBalanceQueryKey,
  getGetStreamQueryKey,
} from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";

export type PremiumGiftRequest = {
  id: string;
  gift: { id: string; name: string; emoji: string; coinCost: number };
  deadline: string;
  durationSeconds: 30 | 60;
  required: boolean;
  paid: boolean;
  viewers?: number;
  paidViewers?: number;
};
type Status = {
  request: PremiumGiftRequest | null;
  removed: boolean;
  serverNow: string;
  receivedAt: number;
};
export const premiumGiftRequestKey = (channelId: string) =>
  ["premium-gift-request", channelId] as const;
export async function premiumGiftRequestApi<T>(
  channelId: string,
  getToken: () => Promise<string | null>,
  method = "GET",
  body?: object,
  suffix = "",
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Sign in to continue");
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const response = await fetch(
    `${domain ? `https://${domain}` : ""}/api/streams/${encodeURIComponent(channelId)}/gift-request${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Could not complete the gift request");
  return data as T;
}

export function usePremiumGiftRequest(
  channelId: string,
  enabled: boolean,
  uid?: number,
) {
  const { getToken } = useAuth();
  const client = useQueryClient();
  const key = [...premiumGiftRequestKey(channelId), uid];
  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!channelId && !!uid,
    queryFn: async () => ({
      ...(await premiumGiftRequestApi<Omit<Status, "receivedAt">>(
        channelId,
        getToken,
      )),
      receivedAt: Date.now(),
    }),
    refetchInterval: (state) => {
      if (!enabled) return false;
      const status = state.state.data;
      return status?.request &&
        new Date(status.request.deadline).getTime() >
          new Date(status.serverNow).getTime()
        ? 2000
        : 5000;
    },
    retry: false,
  });
  const request = query.data?.request ?? null;
  const ticking =
    !!request &&
    !request.paid &&
    new Date(request.deadline).getTime() >
      new Date(query.data?.serverNow ?? 0).getTime();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = ticking
      ? setInterval(() => setNow(Date.now()), 250)
      : undefined;
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setNow(Date.now());
        void client.invalidateQueries({
          queryKey: premiumGiftRequestKey(channelId),
        });
        void client.invalidateQueries({
          queryKey: getGetStreamQueryKey(channelId),
        });
      }
    });
    return () => {
      clearInterval(timer);
      foreground.remove();
    };
  }, [enabled, channelId, client, ticking]);
  const serverNow = query.data
    ? new Date(query.data.serverNow).getTime() +
      Math.max(0, now - query.data.receivedAt)
    : now;
  const remaining = request
    ? Math.max(
        0,
        Math.ceil((new Date(request.deadline).getTime() - serverNow) / 1000),
      )
    : 0;
  const paymentKey = useRef({ id: "", key: "" });
  const busy = useRef(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
  }, [channelId, request?.id]);
  const pay = async () => {
    if (!request?.required || !remaining || busy.current) return;
    if (paymentKey.current.id !== request.id)
      paymentKey.current = { id: request.id, key: Crypto.randomUUID() };
    busy.current = true;
    setPaying(true);
    setError(null);
    try {
      const payment = await premiumGiftRequestApi<{ balance: number }>(
        channelId,
        getToken,
        "POST",
        { requestId: request.id, idempotencyKey: paymentKey.current.key },
        "/pay",
      );
      // Cancel older status reads so they cannot restore an unpaid state after success.
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Status>(key, (previous) =>
        previous?.request?.id === request.id
          ? {
              ...previous,
              removed: false,
              request: { ...previous.request, paid: true, required: false },
            }
          : previous,
      );
      if (uid)
        client.setQueryData(getGetCoinBalanceQueryKey({ uid }), {
          balance: payment.balance,
        });
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({
        queryKey: getGetStreamQueryKey(channelId),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gift not sent. Please try again.",
      );
      void client.invalidateQueries({ queryKey: key });
    } finally {
      busy.current = false;
      setPaying(false);
    }
  };
  return {
    request,
    remaining,
    paying,
    error,
    pay,
    removed: !!query.data?.removed,
    expired: !!request?.required && remaining === 0 && !paying,
  };
}
