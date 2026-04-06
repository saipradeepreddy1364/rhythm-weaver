import { useState, useEffect } from "react";
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

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentSong } = usePlayer();
  const { user, checkAuth } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

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