import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image } from 'react-native'
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
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

async function ensureAnonymousSession() {
  // If already have a valid session, keep it
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;

  // Try Supabase anonymous sign-in (supported in Supabase v2.x with anon enabled)
  try {
    const { data, error } = await (supabase.auth as any).signInAnonymously();
    if (!error && data?.user) return data.user;
  } catch {
    // anonymous auth not enabled — fall back to random email/pass account
  }

  // Fallback: create/reuse a random stable guest account stored locally
  const GUEST_KEY = "rw_guest_creds_v2";
  let creds: { email: string; password: string; username?: string } | null = null;
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) creds = JSON.parse(raw);
  } catch { /* ignore */ }

  if (!creds) {
    const uid = generateGuestId().replace(/-/g, "").slice(0, 16);
    const fallbackUsername = getStableGuestUsername(uid);
    creds = {
      email: `guest_${uid}@medley.app`,
      password: generateGuestId(),
      username: fallbackUsername
    };
    localStorage.setItem(GUEST_KEY, JSON.stringify(creds));
  }

  // Try signing in first (account may already exist)
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password
  });
  if (!signInErr && signInData?.user) return signInData.user;

  // Account doesn't exist yet — register it
  const finalUsername = creds.username || getStableGuestUsername();
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: creds.email,
    password: creds.password,
    options: { data: { username: finalUsername } },
  });
  if (!signUpErr && signUpData?.user) return signUpData.user;

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      return getOrCreateLocalGuestUser();
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const fetchProfile = useCallback(async (authUser: any) => {
    const fallbackUsername = getStableGuestUsername(authUser.id);
    try {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      const rawUsername = data?.username || authUser.user_metadata?.username || "Guest";
      const finalUsername = (rawUsername === "Guest" || !rawUsername)
        ? fallbackUsername
        : rawUsername;

      setUser({
        id: authUser.id,
        email: authUser.email || "",
        username: finalUsername,
        isAnonymous: authUser.is_anonymous ?? !authUser.email,
      });
    } catch {
      const rawUsername = authUser.user_metadata?.username || "Guest";
      const finalUsername = (rawUsername === "Guest" || !rawUsername)
        ? fallbackUsername
        : rawUsername;

      setUser({
        id: authUser.id,
        email: authUser.email || "",
        username: finalUsername,
        isAnonymous: authUser.is_anonymous ?? !authUser.email,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      // Always ensure we have a session — create anonymous one if needed
      const authUser = await ensureAnonymousSession();
      if (authUser) {
        await fetchProfile(authUser);
      } else {
        const fallbackUser = getOrCreateLocalGuestUser();
        setUser(fallbackUser);
        setLoading(false);
      }
    } catch {
      const fallbackUser = getOrCreateLocalGuestUser();
      setUser(fallbackUser);
      setLoading(false);
    }
  }, [fetchProfile]);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
      if (session?.user) {
        await fetchProfile(session.user);
      } else {
        // Session lost — re-create anonymous session silently
        const authUser = await ensureAnonymousSession();
        if (authUser) {
          await fetchProfile(authUser);
        } else {
          const fallbackUser = getOrCreateLocalGuestUser();
          setUser(fallbackUser);
          setLoading(false);
        }
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [checkAuth, fetchProfile]);

  const login = async (email: string, password: string): Promise<string | null> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      return null;
    } catch (err: any) {
      return err.message || "Login failed. Please try again.";
    }
  };

  const register = async (
    email: string,
    password: string,
    username: string
  ): Promise<string | null> => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) return error.message;
      return null;
    } catch (err: any) {
      return err.message || "Registration failed. Please check your connection and try again.";
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signOut errors
    } finally {
      // Clear guest details so a brand new random guest is generated
      try {
        localStorage.removeItem("rw_guest_creds_v2");
        localStorage.removeItem("rw_local_guest_user_v2");
        if (user?.id) {
          localStorage.removeItem(`rw_stable_guest_username_${user.id}`);
        }
      } catch { /* ignore */ }

      const authUser = await ensureAnonymousSession();
      if (authUser) {
        await fetchProfile(authUser);
      } else {
        const fallbackUser = getOrCreateLocalGuestUser();
        setUser(fallbackUser);
      }
    }
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