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
const USER_KEY    = "rw_user_data";

// ── Persistent storage helpers ────────────────────────────────────────────────
const saveSession = (token: string, user: User) => {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

const loadToken    = () => localStorage.getItem(SESSION_KEY);
const loadUser     = (): User | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const checkAuth = useCallback(async () => {
    const token     = loadToken();
    const savedUser = loadUser();

    if (!token || !savedUser) {
      setUser(null);
      setLoading(false);
      return;
    }

    // Restore immediately from localStorage so UI feels instant
    setUser(savedUser);
    setLoading(false);

    // Verify in background — only clear if server explicitly rejects
    try {
      const result = await api.verifyToken(token);
      const res = result as { valid?: boolean; user?: User } | boolean | null;

      const isValid = res && typeof res === "object" && res.valid === true;

      if (!isValid) {
        // Token rejected by server (deleted user, expired, etc.)
        clearAuth();
      } else if (typeof res === "object" && res.user) {
        // Refresh user data from server in case it changed
        setUser(res.user as User);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      }
    } catch {
      // Network error — keep existing session, user stays logged in
    }
  }, [clearAuth]);

  useEffect(() => {
    checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string): Promise<string | null> => {
    try {
      const response = await api.login(email, password);
      if (response.success && response.token && response.user) {
        saveSession(response.token, response.user);
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
          saveSession(response.token, response.user);
          setUser(response.user);
        } else {
          const loginErr = await login(email, password);
          if (loginErr) return null;
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
      await api.logout();
    } catch {
      // Ignore logout errors
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