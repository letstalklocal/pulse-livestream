import type { SignupDeclaration } from "@/lib/signup-eligibility";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth as useClerkAuth, useUser } from "@clerk/expo";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface User {
  uid: number;
  clerkId?: string;
  name: string;
  bio: string;
  countryCode?: string | null;
  country?: string | null;
  avatarUri?: string;
  avatarImagePath?: string | null;
  avatarImageUrl?: string | null;
  profileBackgroundImagePath?: string | null;
  profileBackgroundImageUrl?: string | null;
  streamBackgroundImagePath?: string | null;
  streamBackgroundImageUrl?: string | null;
  followersCount: number;
  followingCount: number;
}

interface AuthContextValue {
  user: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  onboardingRequired: boolean;
  syncError: string | null;
  completeSignup: (declaration?: SignupDeclaration) => Promise<boolean>;
  updateUser: (fields: Partial<Omit<User, "uid" | "clerkId">>) => void;
}

const STORAGE_KEY = "@pulse_user_v2";

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
  isSignedIn: false,
  onboardingRequired: false,
  syncError: null,
  completeSignup: async () => false,
  updateUser: () => {},
});

async function clerkSync(clerkId: string, name: string, getToken: () => Promise<string | null>, onboarding: unknown): Promise<{ user?: User; onboardingRequired?: boolean; error?: string }> {
  try {
    const token = await getToken();
    if (!token) return { error: "Your account could not be saved. Please try again." };
    const domain = process.env["EXPO_PUBLIC_DOMAIN"];
    const base = domain ? `https://${domain}` : "";
    const res = await fetch(`${base}/api/users/clerk-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clerkId, name, onboarding }),
    });
    const data = await res.json();
    if (res.status === 422 && data.code === "ONBOARDING_REQUIRED") return { onboardingRequired: true, error: data.error };
    if (!res.ok || !data.user || data.user.clerkId !== clerkId) return { error: "Your account could not be saved. Please try again." };
    return { user: data.user };
  } catch {
    return { error: "Your account could not be saved. Please try again." };
  }
}

async function syncProfile(
  getToken: () => Promise<string | null>,
  uid: number,
  name: string,
  bio: string,
  avatarImagePath?: string | null,
  profileBackgroundImagePath?: string | null,
  streamBackgroundImagePath?: string | null,
) {
  try {
    const token = await getToken();
    if (!token) return;
    const domain = process.env["EXPO_PUBLIC_DOMAIN"];
    const base = domain ? `https://${domain}` : "";
    await fetch(`${base}/api/users/${uid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name,
        bio,
        ...(avatarImagePath !== undefined ? { avatarImagePath } : {}),
        ...(profileBackgroundImagePath !== undefined
          ? { profileBackgroundImagePath }
          : {}),
        ...(streamBackgroundImagePath !== undefined
          ? { streamBackgroundImagePath }
          : {}),
      }),
    });
  } catch {
    // best effort
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded: clerkLoaded, getToken: clerkGetToken } = useClerkAuth();
  // Clerk Expo returns a new getToken wrapper on every render. Keep our callback
  // stable so state updates cannot restart sync effects, while using the latest token getter.
  const tokenGetterRef = useRef(clerkGetToken);
  tokenGetterRef.current = clerkGetToken;
  const getToken = useCallback(() => tokenGetterRef.current(), []);
  const queryClient = useQueryClient();
  const { user: clerkUser } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const [localLoaded, setLocalLoaded] = useState(false);

  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const accountRef = useRef(clerkUser);
  accountRef.current = isSignedIn ? clerkUser : null;
  const syncSequence = useRef(0);

  const completeSignup = useCallback(async (declaration?: SignupDeclaration) => {
    const account = accountRef.current;
    if (!account) return false;
    const sequence = ++syncSequence.current;
    const name = account.fullName || account.username || account.primaryEmailAddress?.emailAddress?.split("@")[0] || "Pulse User";
    const result = await clerkSync(account.id, name, getToken, declaration ?? account.unsafeMetadata?.pulseOnboarding);
    if (accountRef.current?.id !== account.id || sequence !== syncSequence.current) return false;
    if (result.user) {
      const synced = { ...result.user, avatarUri: result.user.avatarImageUrl ?? account.imageUrl ?? undefined };
      setUser(synced);
      setOnboardingRequired(false);
      setSyncError(null);
      setLocalLoaded(true);
      try { await AsyncStorage.setItem(`${STORAGE_KEY}:${account.id}`, JSON.stringify(synced)); } catch { /* Server acceptance remains authoritative. */ }
      return true;
    }
    if (result.onboardingRequired) {
      setUser(null);
      setOnboardingRequired(true);
      // Do not keep a stale local profile after the server rejects account creation.
      try { await AsyncStorage.removeItem(`${STORAGE_KEY}:${account.id}`); } catch { /* Not an authorization source. */ }
    }
    if (accountRef.current?.id !== account.id || sequence !== syncSequence.current) return false;
    setSyncError(result.error ?? "Your account could not be saved. Please try again.");
    setLocalLoaded(true);
    return false;
  }, [getToken]);

  // Draft declarations travel through Clerk's signup metadata so email verification
  // and restarting signup do not lose them. The API validates them before creating a Pulse account.
  useEffect(() => {
    if (!clerkLoaded) return;
    ++syncSequence.current;
    setOnboardingRequired(false);
    setSyncError(null);
    if (!isSignedIn || !clerkUser) {
      setUser(null);
      setLocalLoaded(true);
      return;
    }
    let active = true;
    const clerkId = clerkUser.id;
    setUser(previous => previous?.clerkId === clerkId ? previous : null);
    setLocalLoaded(false);
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${STORAGE_KEY}:${clerkId}`);
        if (raw && active) {
          const cached = JSON.parse(raw) as User;
          if (cached.clerkId === clerkId && Number.isInteger(cached.uid)) { setUser(cached); setLocalLoaded(true); }
        }
      } catch { /* An unavailable cache must not prevent server sync. */ }
      if (active) await completeSignup();
    })();
    return () => { active = false; ++syncSequence.current; };
  }, [clerkLoaded, isSignedIn, clerkUser?.id, completeSignup]);

  useEffect(() => {
    if (!isSignedIn || !user?.uid) return;
    let active = true;
    let busy = false;
    const uid = user.uid;
    const refreshCountry = async () => {
      if (busy) return;
      busy = true;
      try {
        const token = await getToken();
        if (!token || !active) return;
        const base = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
        const response = await fetch(`${base}/api/location/country`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok || !active) return;
        const country = await response.json() as { countryCode: string | null; country: string | null };
        if (!active) return;
        setUser(previous => previous?.uid === uid ? { ...previous, ...country } : previous);
        void queryClient.invalidateQueries({ queryKey: [`/api/users/${uid}`] });
      } catch { /* Country is optional; app access is unaffected. */ }
      finally { busy = false; }
    };
    void refreshCountry();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refreshCountry(); });
    return () => { active = false; subscription.remove(); };
  }, [isSignedIn, user?.uid, getToken, queryClient]);

  const updateUser = useCallback(
    (fields: Partial<Omit<User, "uid" | "clerkId">>) => {
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...fields };
        const storageKey = `${STORAGE_KEY}:${prev.clerkId ?? prev.uid}`;
        AsyncStorage.setItem(storageKey, JSON.stringify(updated));
        // Sync name/bio to server
        if (
          fields.name !== undefined ||
          fields.bio !== undefined ||
          fields.avatarImagePath !== undefined ||
          fields.profileBackgroundImagePath !== undefined ||
          fields.streamBackgroundImagePath !== undefined
        ) {
          void syncProfile(
            getToken,
            prev.uid,
            updated.name,
            updated.bio,
            fields.avatarImagePath,
            fields.profileBackgroundImagePath,
            fields.streamBackgroundImagePath,
          );
        }
        return updated;
      });
    },
    [getToken],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoaded: clerkLoaded && localLoaded,
        isSignedIn: !!isSignedIn && !!user,
        onboardingRequired, syncError, completeSignup,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
