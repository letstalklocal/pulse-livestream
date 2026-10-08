import { useAuth } from "@clerk/expo";
import { useAuth as usePulseAuth } from "@/context/AuthContext";
import { getGetCoinBalanceQueryKey } from "@workspace/api-client-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { PayoutCatalog } from "@workspace/api-client-react";
import {
  parsePendingWithdrawal,
  sameWithdrawal,
  type PendingWithdrawal,
} from "@/utils/withdrawals";
export type {
  WithdrawalRecipientInput as PayoutRecipient,
  WithdrawalQuote,
  CreatorWithdrawal,
  WithdrawalOverview,
} from "@workspace/api-client-react";
import type {
  WithdrawalRecipientInput as PayoutRecipient,
  WithdrawalRecipient,
  WithdrawalDetail,
  CreatorWithdrawal,
  WithdrawalOverview,
} from "@workspace/api-client-react";
class WithdrawalRequestError extends Error {
  constructor(public status: number) {
    super("Could not update withdrawal. Refresh and try again.");
  }
}
const base = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";
export function useWithdrawals(id?: string) {
  const { userId, getToken } = useAuth();
  const { user } = usePulseAuth();
  const uid = user && user.clerkId === userId ? user.uid : undefined;
  const account = useRef(userId);
  account.current = userId;
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingWithdrawal | null>(null);
  const [pendingReady, setPendingReady] = useState(false);
  const submitting = useRef<object | null>(null);
  useEffect(() => {
    setPending(null);
    setPendingReady(false);
    submitting.current = null;
    const owner = userId;
    if (!owner) {
      setPendingReady(true);
      return;
    }
    let active = true;
    void AsyncStorage.getItem(`pulse-withdrawal-pending:${owner}`)
      .then((raw) => {
        if (active && account.current === owner) {
          setPending(parsePendingWithdrawal(raw, owner));
          setPendingReady(true);
        }
      })
      .catch(() => {
        if (active && account.current === owner) setPendingReady(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  const request = useCallback(
    async <T>(
      path: string,
      method = "GET",
      body?: unknown,
      signal?: AbortSignal,
      text = false,
    ): Promise<T> => {
      const owner = userId;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new Error("Could not update withdrawal. Refresh and try again."),
          );
        }, 20000);
      });
      try {
        return await Promise.race([
          deadline,
          (async () => {
            const token = await getToken();
            if (
              !owner ||
              !token ||
              account.current !== owner ||
              controller.signal.aborted
            )
              throw new Error("Sign in to withdraw your earnings.");
            const response = await fetch(`${base}/api${path}`, {
              method,
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: body === undefined ? undefined : JSON.stringify(body),
            });
            if (account.current !== owner || controller.signal.aborted)
              throw new Error("Sign in to withdraw your earnings.");
            if (!response.ok) throw new WithdrawalRequestError(response.status);
            const result = text ? await response.text() : await response.json();
            if (account.current !== owner || controller.signal.aborted)
              throw new Error("Sign in to withdraw your earnings.");
            return result as T;
          })(),
        ]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
      }
    },
    [userId, getToken],
  );
  const overview = useQuery({
    queryKey: ["withdrawals", userId],
    enabled: !!userId,
    queryFn: ({ signal }) =>
      request<WithdrawalOverview>(
        "/withdrawals/overview",
        "GET",
        undefined,
        signal,
      ),
    retry: 1,
  });
  const catalog = useQuery({
    queryKey: ["withdrawal-catalog", userId],
    enabled: !!userId,
    queryFn: ({ signal }) =>
      request<PayoutCatalog>("/payout-catalog", "GET", undefined, signal),
    retry: 1,
  });
  const detail = useQuery({
    queryKey: ["withdrawal", userId, id],
    enabled: !!userId && !!id,
    queryFn: ({ signal }) =>
      request<WithdrawalDetail>(
        `/withdrawals/${encodeURIComponent(id!)}`,
        "GET",
        undefined,
        signal,
      ),
    retry: 1,
    refetchInterval: id ? 30000 : false,
  });
  const refreshWallet = useCallback(async () => {
    if (uid && account.current === userId)
      await queryClient.invalidateQueries({
        queryKey: getGetCoinBalanceQueryKey({ uid }),
      });
  }, [uid, userId, queryClient]);
  useEffect(() => {
    if (detail.data?.status && userId) {
      void refreshWallet();
      void queryClient.invalidateQueries({ queryKey: ["withdrawals", userId] });
    }
  }, [detail.data?.status, userId, refreshWallet, queryClient]);
  const refresh = useCallback(async () => {
    await Promise.all([
      overview.refetch(),
      catalog.refetch(),
      ...(id ? [detail.refetch()] : []),
      refreshWallet(),
    ]);
  }, [overview.refetch, catalog.refetch, detail.refetch, id, refreshWallet]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && userId) void refresh();
    });
    return () => sub.remove();
  }, [refresh, userId]);
  const saveRecipient = (recipient: PayoutRecipient) =>
    request<WithdrawalRecipient>("/withdrawals/recipient", "PUT", recipient);
  const submit = async (methodId: string, withdrawalCents: number) => {
    if (submitting.current) throw new Error("Please wait…");
    const lease = {};
    submitting.current = lease;
    try {
      const owner = userId;
      if (!owner) throw new Error("Sign in to withdraw your earnings.");
      const key = `pulse-withdrawal-pending:${owner}`;
      const raw = await AsyncStorage.getItem(key);
      let pending: PendingWithdrawal | null = parsePendingWithdrawal(
        raw,
        owner,
      );
      if (account.current !== owner)
        throw new Error("Sign in to withdraw your earnings.");
      if (pending && !sameWithdrawal(pending, owner, methodId, withdrawalCents))
        throw new Error(
          "Retry your pending withdrawal before changing the method or amount.",
        );
      if (!pending) {
        pending = {
          accountId: owner,
          methodId,
          withdrawalCents,
          idempotencyKey: Crypto.randomUUID(),
        };
        await AsyncStorage.setItem(key, JSON.stringify(pending));
        if (account.current === owner) setPending(pending);
      }
      if (account.current !== owner)
        throw new Error("Sign in to withdraw your earnings.");
      // An uncertain response deliberately retains this key across navigation/relaunch.
      let result: CreatorWithdrawal;
      try {
        result = await request<CreatorWithdrawal>("/withdrawals", "POST", {
          methodId,
          withdrawalCents,
          idempotencyKey: pending.idempotencyKey,
        });
      } catch (error) {
        if (
          error instanceof WithdrawalRequestError &&
          error.status >= 400 &&
          error.status < 500 &&
          ![408, 429].includes(error.status)
        ) {
          await AsyncStorage.removeItem(key);
          if (account.current === owner) setPending(null);
        }
        throw error;
      }
      await AsyncStorage.removeItem(key);
      if (account.current === owner) setPending(null);
      await queryClient.invalidateQueries({ queryKey: ["withdrawals", owner] });
      await refreshWallet();
      return result;
    } finally {
      if (submitting.current === lease) submitting.current = null;
    }
  };
  const cancel = async () => {
    const result = await request<CreatorWithdrawal>(
      `/withdrawals/${encodeURIComponent(id!)}/cancel`,
      "POST",
    );
    await refresh();
    return result;
  };
  const correctRecipient = async (data: { phone?: string; email?: string }) => {
    const result = await request<WithdrawalDetail>(
      `/withdrawals/${encodeURIComponent(id!)}/recipient-correction`,
      "POST",
      data,
    );
    await refresh();
    return result;
  };
  const statement = () =>
    request<string>(
      `/withdrawals/${encodeURIComponent(id!)}/statement`,
      "GET",
      undefined,
      undefined,
      true,
    );
  return {
    userId,
    overview,
    catalog,
    detail,
    refresh,
    saveRecipient,
    submit,
    statement,
    correctRecipient,
    cancel,
    pending,
    pendingReady,
  };
}
