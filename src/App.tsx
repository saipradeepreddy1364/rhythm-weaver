import { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LibraryProvider } from "@/context/LibraryContext";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";
import { AuthModal } from "@/components/AuthModal";
import { MiniPlayer } from "@/components/MiniPlayer";
import { BottomNav } from "@/components/BottomNav";
import { FullPlayer } from "@/components/FullPlayer";
import HomePage from "@/pages/HomePage";
import LibraryPage from "@/pages/LibraryPage";
import SearchPage from "@/pages/SearchPage";
import { User, LogOut, Loader2, Music2 } from "lucide-react";

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <LibraryProvider>
          <AppShell />
        </LibraryProvider>
      </PlayerProvider>
    </AuthProvider>
  );
}

type Page = "home" | "search" | "library";

function AppShell() {
  const { user, profile, logout, loading: authLoading } = useAuth();
  const { currentSong, showPlayer } = usePlayer();

  const [page, setPage]         = useState<Page>("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab]   = useState<"login" | "register">("login");
  const [profileOpen, setProfileOpen] = useState(false);

  const openAuth = (tab: "login" | "register" = "login") => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  const handleNavigate = (p: Page) => {
    if (p === "library" && !user) {
      openAuth("login");
      return;
    }
    setPage(p);
  };

  if (authLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-3"
        style={{ background: "#0a0a0a" }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
        >
          <Music2 className="w-6 h-6 text-white" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
      </div>
    );
  }

  // bottom padding: 56px nav + (miniplayer ~68px when visible) + 8px gap
  const bottomPad = currentSong ? "pb-36" : "pb-16";

  return (
    <div
      className="min-h-screen text-foreground flex flex-col"
      style={{ background: "#0a0a0a", maxWidth: "480px", margin: "0 auto" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 h-14 flex items-center justify-between px-4"
        style={{
          background: "rgba(10,10,10,0.95)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
          >
            <Music2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">
            RhythmWeaver
          </span>
        </div>

        {user ? (
          <div className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              <span className="text-xs font-medium text-white/80 max-w-[80px] truncate">
                {profile?.username ?? user.email?.split("@")[0]}
              </span>
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
              >
                <User className="w-2.5 h-2.5 text-white" />
              </div>
            </button>

            {profileOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-44 rounded-2xl shadow-2xl z-50 overflow-hidden"
                style={{
                  background: "rgba(20,20,20,0.98)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-xs font-semibold text-white truncate">
                    {profile?.username ?? "User"}
                  </p>
                  <p className="text-[11px] text-white/40 truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => { logout(); setProfileOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAuth("login")}
              className="text-xs font-medium text-white/50 hover:text-white px-3 py-1.5 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => openAuth("register")}
              className="text-xs font-semibold text-white px-3 py-1.5 rounded-full transition-colors"
              style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
            >
              Sign Up
            </button>
          </div>
        )}
      </header>

      {/* ── Page Content ─────────────────────────────────────────── */}
      <main className={`flex-1 ${bottomPad}`}>
        {page === "home"    && <HomePage    onRequireAuth={() => openAuth("login")} />}
        {page === "search"  && <SearchPage  onRequireAuth={() => openAuth("login")} />}
        {page === "library" && <LibraryPage onRequireAuth={() => openAuth("login")} />}
      </main>

      {/* ── Mini Player (above bottom nav) ───────────────────────── */}
      <MiniPlayer onRequireAuth={() => openAuth("login")} />

      {/* ── Full screen player ───────────────────────────────────── */}
      <FullPlayer onRequireAuth={() => openAuth("login")} />

      {/* ── Bottom Nav ───────────────────────────────────────────── */}
      <BottomNav page={page} onNavigate={handleNavigate} />

      {/* ── Auth Modal ───────────────────────────────────────────── */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab={authTab}
      />
    </div>
  );
}