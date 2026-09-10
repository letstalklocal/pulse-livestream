type BalanceResult = { data?: { balance?: number }; dataUpdatedAt: number };

// Account status can supply the balance even before the local Pulse profile syncs.
// Prefer the freshest successful result; never turn a loading/error state into zero.
export function accountBalance(
  wallet: BalanceResult,
  account: BalanceResult,
): number | undefined {
  return [wallet, account]
    .filter(
      (result) =>
        typeof result.data?.balance === "number" &&
        Number.isFinite(result.data.balance),
    )
    .sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt)[0]?.data?.balance;
}
