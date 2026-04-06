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
const USER_KEY = "rw_user_data";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem(SESSION_KEY);
      const savedUser = localStorage.getItem(USER_KEY);

      if (!token || !savedUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Restore user from storage immediately (fast path)
      setUser(JSON.parse(savedUser));
      setLoading(false);

      // Verify token in background — only clear session if server says INVALID
      try {
        const isValid = await api.verifyToken(token);
        if (isValid === false) {
          // Explicit server rejection
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(USER_KEY);
          setUser(null);
        }
        // If network error / timeout → keep user logged in (isValid throws)
      } catch {
        // Network failure — keep existing session intact
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string): Promise<string | null> => {
    try {
      const response = await api.login(email, password);
      if (response.success && response.token && response.user) {
        localStorage.setItem(SESSION_KEY, response.token);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
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
        return null;
      }
      return response.message || "Registration failed.";
    } catch (err: any) {
      return err.message || "Registration failed. Please try again.";
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore errors on logout
    } finally {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(USER_KEY);
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