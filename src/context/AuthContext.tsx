import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";

interface User {
  id: string;
  email: string;
  username: string;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (authUser: any) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (data) {
        setUser({
          id: authUser.id,
          email: authUser.email || "",
          username: data.username || authUser.user_metadata?.username || "User",
        });
      } else {
        setUser({
          id: authUser.id,
          email: authUser.email || "",
          username: authUser.user_metadata?.username || "User",
        });
      }
    } catch {
      setUser({
        id: authUser.id,
        email: authUser.email || "",
        username: authUser.user_metadata?.username || "User",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await fetchProfile(session.user);
      } else {
        setUser(null);
        setLoading(false);
      }
    } catch {
      setUser(null);
      setLoading(false);
    }
  }, [fetchProfile]);

  useEffect(() => {
    // Initial check
    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await fetchProfile(session.user);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
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
        options: {
          data: {
            username: username,
          },
        },
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
      setUser(null);
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