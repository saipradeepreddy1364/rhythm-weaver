import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api } from "@/services/api";

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

const SESSION_KEY = "rw_session_token";

// ── Token helpers (sessionStorage only — never persisted to localStorage) ────
// sessionStorage clears automatically when the browser tab is closed,
// so stale tokens from deleted accounts can never accumulate.
const saveToken  = (token: string) => sessionStorage.setItem(SESSION_KEY, token);
const loadToken  = ()              => sessionStorage.getItem(SESSION_KEY);
const clearToken = ()              => sessionStorage.removeItem(SESSION_KEY);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Fully clear auth state (call on any invalid/expired token)
  const clearAuth = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const checkAuth = useCallback(async () => {
    const token = loadToken();

    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      // Always verify with server — no fast-path restore from storage
      const raw = await api.verifyToken(token);
      const result = raw as { valid?: boolean; user?: User } | boolean | null;

      const isValid = result && typeof result === "object" && result.valid === true;
      const verifiedUser = isValid && typeof result === "object" ? (result as { user?: User }).user : undefined;

      if (!isValid) {
        // Server explicitly rejected the token (expired, user deleted, etc.)
        clearAuth();
      } else if (verifiedUser) {
        setUser(verifiedUser);
      } else {
        clearAuth();
      }
    } catch {
      // Network failure — keep token but don't set user until next successful verify
      clearAuth();
    } finally {
      setLoading(false);
    }
  }, [clearAuth]);

  useEffect(() => {
    checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string): Promise<string | null> => {
    try {
      const response = await api.login(email, password);
      if (response.success && response.token && response.user) {
        saveToken(response.token);
        setUser(response.user);
        return null;
      }
      return response.message || "Login failed. Please check your credentials.";
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
      const response = await api.register(email, password, username);
      if (response.success) {
        if (response.token && response.user) {
          saveToken(response.token);
          setUser(response.user);
        } else {
          // Backend registered but didn't return token — auto login
          const loginErr = await login(email, password);
          if (loginErr) return null; // registration succeeded even if auto-login failed
        }
        return null;
      }
      return response.message || "Registration failed. Please try again.";
    } catch (err: any) {
      const msg: string = err?.message || "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exist")) {
        return "An account with this email already exists. Please sign in instead.";
      }
      return msg || "Registration failed. Please check your connection and try again.";
    }
  };

  const logout = async () => {
    try {
      const token = loadToken();
      if (token) await api.logout();
    } catch {
      // Ignore errors on logout
    } finally {
      clearAuth();
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