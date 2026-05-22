import AsyncStorage from "@react-native-async-storage/async-storage";
import { upsertUser } from "@workspace/api-client-react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface User {
  uid: number;
  name: string;
  bio: string;
  avatarUri?: string;
  followersCount: number;
  followingCount: number;
}

interface AuthContextValue {
  user: User;
  updateUser: (fields: Partial<Omit<User, "uid">>) => void;
}

const STORAGE_KEY = "@pulse_user";

function generateUid(): number {
  return Math.floor(Math.random() * 90000) + 10000;
}

function generateName(): string {
  const adjectives = ["Neon", "Cosmic", "Electric", "Shadow", "Nova", "Stellar", "Vibe"];
  const nouns = ["Streamer", "Creator", "Vibes", "Wave", "Pulse", "Flow", "Star"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 999);
  return `${adj}${noun}${num}`;
}

const defaultUser: User = {
  uid: generateUid(),
  name: generateName(),
  bio: "Streaming live on Pulse",
  followersCount: 0,
  followingCount: 0,
};

const AuthContext = createContext<AuthContextValue>({
  user: defaultUser,
  updateUser: () => {},
});

async function syncUserToServer(user: User) {
  try {
    await upsertUser(user.uid, { name: user.name, bio: user.bio });
  } catch {
    // best effort — offline or server down
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(defaultUser);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as User;
          setUser(saved);
          void syncUserToServer(saved);
        } catch {
          // ignore
        }
      } else {
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUser));
        void syncUserToServer(defaultUser);
      }
    });
  }, []);

  const updateUser = useCallback((fields: Partial<Omit<User, "uid">>) => {
    setUser((prev) => {
      const updated = { ...prev, ...fields };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      // Sync name/bio to server (skip avatarUri — kept local only)
      if (fields.name !== undefined || fields.bio !== undefined) {
        void syncUserToServer(updated);
      }
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
