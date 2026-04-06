import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { X, Music2, Eye, EyeOff, Loader2 } from "lucide-react";

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
      if (!username.trim()) { setError("Username is required."); return; }
      if (username.trim().length < 3) { setError("Username must be at least 3 characters."); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPw) { setError("Passwords do not match."); return; }
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1DB954,#1ed760)" }}>
              <Music2 className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold text-white text-lg">RhythmWeaver</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors rounded-lg p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex mx-6 mb-5 bg-white/5 rounded-lg p-1">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                tab === t
                  ? "bg-[#2a2a2a] text-white shadow-sm"
                  : "text-white/40 hover:text-white"
              }`}
            >
              {t === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="px-6 pb-6 space-y-3">
          {success && (
            <div className="text-xs text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {tab === "register" && (
            <div>
              <label className="text-xs font-medium text-white/40 mb-1 block">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_name"
                autoComplete="username"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-white/40 mb-1 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-white/40 mb-1 block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {tab === "register" && (
            <div>
              <label className="text-xs font-medium text-white/40 mb-1 block">
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
              />
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full mt-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-black font-semibold rounded-lg py-2.5 text-sm transition-all flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === "login" ? "Sign In" : "Create Account"}
          </button>

          <p className="text-center text-xs text-white/40 pt-1">
            {tab === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  onClick={() => switchTab("register")}
                  className="text-emerald-500 hover:underline font-medium"
                >
                  Sign up free
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => switchTab("login")}
                  className="text-emerald-500 hover:underline font-medium"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}