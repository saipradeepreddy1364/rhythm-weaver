import { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LibraryProvider } from "@/context/LibraryContext";
import { PlayerProvider } from "@/context/PlayerContext";
import { AuthModal } from "@/components/AuthModal";
import HomePage from "@/pages/HomePage";
import LibraryPage from "@/pages/LibraryPage";
import { Home, Library, Search, User, LogOut, Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Root — wraps everything with providers
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        {/* LibraryProvider needs AuthProvider above it */}
        <LibraryWrapper />
      </PlayerProvider>
    </AuthProvider>
  );
}

function LibraryWrapper() {
  return (
    <LibraryProvider>
      <AppShell />
    </LibraryProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App Shell — navigation, auth modal, page routing
// ─────────────────────────────────────────────────────────────────────────────

type Page = "home" | "search" | "library";

function AppShell() {
  const { user, profile, logout, loading: authLoading } = useAuth();
  const [page, setPage]               = useState<Page>("home");
  const [authOpen, setAuthOpen]       = useState(false);
  const [authTab, setAuthTab]         = useState<"login" | "register">("login");
  const [profileOpen, setProfileOpen] = useState(false);

  const openAuth = (tab: "login" | "register" = "login") => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Top bar ───────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className="font-bold text-base tracking-tight text-foreground">
          🎵 RhythmWeaver
        </span>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 bg-muted hover:bg-accent rounded-full pl-3 pr-2 py-1.5 transition-colors"
              >
                <span className="text-xs font-medium text-foreground max-w-[80px] truncate">
                  {profile?.username ?? user.email?.split("@")[0]}
                </span>
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="w-3 h-3 text-primary-foreground" />
                </div>
              </button>

              {/* Profile dropdown */}
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {profile?.username ?? "User"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => { logout(); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-accent transition-colors"
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
                className="text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuth("register")}
                className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-full hover:bg-primary/90 transition-colors"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────── */}
      <main className="max-w-2xl mx-auto">
        {page === "home"    && <HomePage    onRequireAuth={() => openAuth("login")} />}
        {page === "library" && <LibraryPage onRequireAuth={() => openAuth("login")} />}
        {page === "search"  && (
          <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
            Search page — plug in your SearchPage component here
          </div>
        )}
      </main>

      {/* ── Bottom nav ───────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/90 backdrop-blur-md border-t border-border flex">
        {(
          [
            { key: "home",    label: "Home",    Icon: Home    },
            { key: "search",  label: "Search",  Icon: Search  },
            { key: "library", label: "Library", Icon: Library },
          ] as { key: Page; label: string; Icon: typeof Home }[]
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => {
              if (key === "library" && !user) { openAuth("login"); return; }
              setPage(key);
            }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium transition-colors ${
              page === key ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </nav>

      {/* ── Auth Modal ───────────────────────────────────── */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab={authTab}
      />
    </div>
  );
}