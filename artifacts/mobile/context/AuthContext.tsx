import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth as useClerkAuth, useUser } from "@clerk/expo";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface User {
  uid: number;
  clerkId?: string;
  name: string;
  bio: string;
  avatarUri?: string;
  followersCount: number;
  followingCount: number;
}

interface AuthContextValue {
  user: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  updateUser: (fields: Partial<Omit<User, "uid" | "clerkId">>) => void;
}

const STORAGE_KEY = "@pulse_user_v2";

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
  isSignedIn: false,
  updateUser: () => {},
});

async function clerkSync(clerkId: string, name: string): Promise<User | null> {
  try {
    const domain = process.env["EXPO_PUBLIC_DOMAIN"];
    const base = domain ? `https://${domain}` : "";
    const res = await fetch(`${base}/api/users/clerk-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerkId, name }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: User };
    return data.user;
  } catch {
    return null;
  }
}

async function syncBio(uid: number, name: string, bio: string) {
  try {
    const domain = process.env["EXPO_PUBLIC_DOMAIN"];
    const base = domain ? `https://${domain}` : "";
    await fetch(`${base}/api/users/${uid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, bio }),
    });
  } catch {
    // best effort
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded: clerkLoaded } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const [localLoaded, setLocalLoaded] = useState(false);

  // When Clerk user signs in, sync with server to get/create DB record
  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn || !clerkUser) {
      setUser(null);
      setLocalLoaded(true);
      return;
    }

    const clerkId = clerkUser.id;
    const clerkName =
      clerkUser.fullName ||
      clerkUser.username ||
      clerkUser.primaryEmailAddress?.emailAddress?.split("@")[0] ||
      "Pulse User";

    // Check AsyncStorage cache first (keyed by clerkId)
    const storageKey = `${STORAGE_KEY}:${clerkId}`;
    AsyncStorage.getItem(storageKey).then(async (raw) => {
      if (raw) {
        try {
          const cached = JSON.parse(raw) as User;
          setUser(cached);
          setLocalLoaded(true);
        } catch {
          // ignore
        }
      }

      // Always sync with server (updates name if changed)
      const synced = await clerkSync(clerkId, clerkName);
      if (synced) {
        const merged: User = {
          ...(raw ? (JSON.parse(raw) as User) : {}),
          ...synced,
          avatarUri: clerkUser.imageUrl ?? undefined,
        };
        setUser(merged);
        setLocalLoaded(true);
        await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
      } else {
        setLocalLoaded(true);
      }
    });
  }, [clerkLoaded, isSignedIn, clerkUser?.id]);

  const updateUser = useCallback(
    (fields: Partial<Omit<User, "uid" | "clerkId">>) => {
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...fields };
        const storageKey = `${STORAGE_KEY}:${prev.clerkId ?? prev.uid}`;
        AsyncStorage.setItem(storageKey, JSON.stringify(updated));
        // Sync name/bio to server
        if (fields.name !== undefined || fields.bio !== undefined) {
          void syncBio(prev.uid, updated.name, updated.bio);
        }
        return updated;
      });
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoaded: clerkLoaded && localLoaded,
        isSignedIn: !!isSignedIn && !!user,
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
