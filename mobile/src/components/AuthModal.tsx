import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import React, { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: "login" | "register";
}

export function AuthModal({ open, onClose, defaultTab = "login" }: AuthModalProps) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">(defaultTab);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  if (!open) return null;

  const reset = () => {
    setError("");
    setSuccess("");
    setEmail("");
    setPassword("");
    setUsername("");
    setConfirmPw("");
  };

  const switchTab = (t: "login" | "register") => {
    setTab(t);
    reset();
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    if (tab === "register") {
      if (!username.trim()) {
        setError("Username is required.");
        return;
      }
      if (username.trim().length < 3) {
        setError("Username must be at least 3 characters.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPw) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      let errMsg: string | null = null;
      if (tab === "login") {
        errMsg = await login(email.trim(), password);
      } else {
        errMsg = await register(email.trim(), password, username.trim());
      }

      if (errMsg) {
        setError(errMsg);
      } else {
        if (tab === "register") {
          setSuccess("Account created! Check your email to confirm, then log in.");
          switchTab("login");
        } else {
          onClose();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={open}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.modalContent}>
            {/* Close Button Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={20} color="rgba(255, 255, 255, 0.6)" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
              {/* Tab Selector */}
              <View style={styles.tabBar}>
                <TouchableOpacity
                  onPress={() => switchTab("login")}
                  style={[styles.tabBtn, tab === "login" && styles.activeTabBtn]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabBtnText, tab === "login" && styles.activeTabBtnText]}>
                    Sign In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => switchTab("register")}
                  style={[styles.tabBtn, tab === "register" && styles.activeTabBtn]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabBtnText, tab === "register" && styles.activeTabBtnText]}>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Status Banners */}
              {success ? (
                <View style={styles.successBanner}>
                  <Text style={styles.successBannerText}>{success}</Text>
                </View>
              ) : null}

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              ) : null}

              {/* Username field */}
              {tab === "register" && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Username</Text>
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    placeholder="your_name"
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    autoCapitalize="none"
                    style={styles.inputField}
                  />
                </View>
              )}

              {/* Email field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.inputField}
                />
              </View>

              {/* Password field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    style={[styles.inputField, { flex: 1, borderWidth: 0 }]}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={showPassword ? "eye-off" : "eye"}
                      size={18}
                      color="rgba(255,255,255,0.4)"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password field */}
              {tab === "register" && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <TextInput
                    value={confirmPw}
                    onChangeText={setConfirmPw}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    style={styles.inputField}
                  />
                </View>
              )}

              {/* Action Button */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                style={[styles.submitBtn, loading && styles.disabledSubmitBtn]}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {tab === "login" ? "Sign In" : "Create Account"}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Switch link */}
              <View style={styles.switchContainer}>
                {tab === "login" ? (
                  <Text style={styles.switchText}>
                    Don't have an account?{" "}
                    <Text
                      onPress={() => switchTab("register")}
                      style={styles.switchHighlight}
                    >
                      Sign up free
                    </Text>
                  </Text>
                ) : (
                  <Text style={styles.switchText}>
                    Already have an account?{" "}
                    <Text
                      onPress={() => switchTab("login")}
                      style={styles.switchHighlight}
                    >
                      Sign in
                    </Text>
                  </Text>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  keyboardView: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  closeBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 3,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  activeTabBtn: {
    backgroundColor: "#2a2a2a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
  },
  activeTabBtnText: {
    color: "#fff",
  },
  successBanner: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  successBannerText: {
    fontSize: 12,
    color: "#10b981",
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    fontSize: 12,
    color: "#ef4444",
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.4)",
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: "#fff",
  },
  passwordInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingRight: 10,
  },
  eyeBtn: {
    padding: 8,
  },
  submitBtn: {
    backgroundColor: "#1DB954",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  disabledSubmitBtn: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#000",
  },
  switchContainer: {
    alignItems: "center",
    marginTop: 16,
  },
  switchText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  switchHighlight: {
    color: "#1DB954",
    fontWeight: "600",
  },
});