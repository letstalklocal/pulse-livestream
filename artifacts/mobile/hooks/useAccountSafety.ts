import { useQuery } from "@tanstack/react-query";
import { getUserSafety } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
export function useAccountSafety(uid: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["account-safety", user?.uid, uid],
    queryFn: () => getUserSafety(uid),
    enabled: !!user && Number.isInteger(uid) && uid > 0 && uid !== user.uid,
    refetchInterval: 5000,
  });
}
