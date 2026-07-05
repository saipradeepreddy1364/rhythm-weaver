import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image } from 'react-native'
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { localStorage } from "../lib/storage";

interface User {
  id: string;
  email: string;
  username: string;
  isAnonymous?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string, username: string) => Promise<string | null>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Generate a stable random guest identity ──────────────────────────────────
function generateGuestId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getStableGuestUsername(userId?: string): string {
  const key = `rw_stable_guest_username_${userId || "generic"}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return cached;
  } catch { /* ignore */ }
  
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const name = `Guest_${randNum}`;
  try {
    localStorage.setItem(key, name);
  } catch { /* ignore */ }
  return name;
}

function getOrCreateLocalGuestUser(): User {
  const LOCAL_USER_KEY = "rw_local_guest_user_v2";
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && parsed.username) return parsed;
    }
  } catch { /* ignore */ }

  const randNum = Math.floor(1000 + Math.random() * 9000);
  const guestUser: User = {
    id: `guest_${generateGuestId().replace(/-/g, "").slice(0, 12)}`,
    email: `guest_${randNum}@medley.app`,
    username: `Guest_${randNum}`,
    isAnonymous: true
  };
  
  try {
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(guestUser));
  } catch { /* ignore */ }
  
  return guestUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      await localStorage.ensureInitialized();
      const fallbackUser = getOrCreateLocalGuestUser();
      setUser(fallbackUser);
    } catch (err) {
      console.warn("[AuthContext] Failed to resolve auth on boot:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string): Promise<string | null> => {
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const name = email.split("@")[0] || `User_${randNum}`;
    const loggedInUser: User = {
      id: `usr_${generateGuestId().replace(/-/g, "").slice(0, 12)}`,
      email,
      username: name.charAt(0).toUpperCase() + name.slice(1),
      isAnonymous: false
    };
    setUser(loggedInUser);
    localStorage.setItem("rw_local_guest_user_v2", JSON.stringify(loggedInUser));
    return null;
  };

  const register = async (
    email: string,
    password: string,
    username: string
  ): Promise<string | null> => {
    const registeredUser: User = {
      id: `usr_${generateGuestId().replace(/-/g, "").slice(0, 12)}`,
      email,
      username,
      isAnonymous: false
    };
    setUser(registeredUser);
    localStorage.setItem("rw_local_guest_user_v2", JSON.stringify(registeredUser));
    return null;
  };

  const logout = async () => {
    try {
      localStorage.removeItem("rw_guest_creds_v2");
      localStorage.removeItem("rw_local_guest_user_v2");
      if (user?.id) {
        localStorage.removeItem(`rw_stable_guest_username_${user.id}`);
      }
    } catch { /* ignore */ }

    const fallbackUser = getOrCreateLocalGuestUser();
    setUser(fallbackUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}