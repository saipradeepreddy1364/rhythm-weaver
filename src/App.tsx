import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";
import { LibraryProvider } from "@/context/LibraryContext";
import HomePage from "@/pages/HomePage";
import SearchPage from "@/pages/SearchPage";
import LibraryPage from "@/pages/LibraryPage";
import NotFound from "@/pages/NotFound";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { FullPlayer } from "@/components/FullPlayer";
import { AuthModal } from "@/components/AuthModal";
import { useAuth } from "@/context/AuthContext";

type Page = "home" | "search" | "library";

// ─── Silent audio keep-alive ──────────────────────────────────────────────────
// Mobile browsers (iOS/Android) suspend the audio session after a few songs if
// no other audio element is registered as "active". A near-silent looping audio
// keeps the session alive so the main player never gets interrupted mid-queue.
function useSilentAudioKeepAlive(isPlaying: boolean) {
  const silentRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Minimal valid 1-sample WAV (44 bytes) encoded as base64 — produces no audible sound
    const SILENT_WAV =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

    const audio = new Audio(SILENT_WAV);
    audio.loop   = true;
    audio.volume = 0.001; // virtually inaudible
    silentRef.current = audio;

    return () => {
      audio.pause();
      silentRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = silentRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => { /* autoplay policy — harmless, main audio still works */ });
    } else {
      audio.pause();
    }
  }, [isPlaying]);
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentSong, isPlaying } = usePlayer();
  const { user, checkAuth } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Keep audio session alive — prevents the "pauses after 5-6 songs" bug on mobile
  useSilentAudioKeepAlive(isPlaying);

  const currentPath = location.pathname;
  const currentPage: Page =
    currentPath === "/" ? "home" :
    currentPath === "/search" ? "search" :
    currentPath === "/library" ? "library" : "home";

  const handleNavigate = (page: Page) => {
    if (page === "home") navigate("/");
    else if (page === "search") navigate("/search");
    else if (page === "library") navigate("/library");
  };

  const handleRequireAuth = () => {
    if (!user) setShowAuthModal(true);
  };

  // Check auth once on mount — session persists via localStorage
  useEffect(() => {
    checkAuth();
    // Periodic silent check every 10 minutes (won't logout on network failure)
    const interval = setInterval(checkAuth, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-screen" style={{ background: "#121212" }}>
      <Routes>
        <Route path="/" element={<HomePage onRequireAuth={handleRequireAuth} />} />
        <Route path="/search" element={<SearchPage onRequireAuth={handleRequireAuth} />} />
        <Route path="/library" element={<LibraryPage onRequireAuth={handleRequireAuth} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Bottom nav — always visible */}
      <BottomNav page={currentPage} onNavigate={handleNavigate} />

      {/* Mini player — floats above bottom nav */}
      {currentSong && <MiniPlayer onRequireAuth={handleRequireAuth} />}

      {/* Full player — full screen overlay */}
      <FullPlayer onRequireAuth={handleRequireAuth} />

      {/* Auth modal */}
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlayerProvider>
          <LibraryProvider>
            <AppContent />
          </LibraryProvider>
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;