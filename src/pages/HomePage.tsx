import { useEffect, useState } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Music2, User, LogOut } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";

const BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

const PLAYLISTS = {
  trendingHindi: "1134543272",
  trendingTelugu: "1134543280",
  trendingTamil: "1134543278",
  bollywood2025: "1134543279",
  romantic: "91369254",
  party: "1134543281",
  retro: "1134543277",
  punjabi: "1134543282",
};

function mapPlaylistSongs(res: any): Song[] {
  const songs = extractResults(res);
  return songs.map(mapApiSong).filter((s: Song) => s.audioUrl);
}

function mapSearchSongs(res: any): Song[] {
  const songs = extractResults(res);
  return songs.map(mapApiSong).filter((s: Song) => s.audioUrl);
}

async function wakeServer(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/search/songs?query=hindi&page=1&limit=1`);
  } catch {
    // ignore — just waking the free Render instance
  }
}

interface HomePageProps {
  onRequireAuth?: () => void;
}

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { user, logout } = useAuth();
  const { recentlyPlayed } = usePlayer();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  
  const [trendingHindi, setTrendingHindi] = useState<Song[]>([]);
  const [trendingTelugu, setTrendingTelugu] = useState<Song[]>([]);
  const [trendingTamil, setTrendingTamil] = useState<Song[]>([]);
  const [bollywood, setBollywood] = useState<Song[]>([]);
  const [romantic, setRomantic] = useState<Song[]>([]);
  const [party, setParty] = useState<Song[]>([]);
  const [retro, setRetro] = useState<Song[]>([]);
  const [punjabi, setPunjabi] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [waking, setWaking] = useState(true);

  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  useEffect(() => {
    const load = async () => {
      setWaking(true);
      await wakeServer();
      setWaking(false);

      try {
        const [hindi, telugu, tamil, bolly, rom, par, ret, pun] = await Promise.all([
          api.getPlaylist(PLAYLISTS.trendingHindi),
          api.getPlaylist(PLAYLISTS.trendingTelugu),
          api.getPlaylist(PLAYLISTS.trendingTamil),
          api.getPlaylist(PLAYLISTS.bollywood2025),
          api.getPlaylist(PLAYLISTS.romantic),
          api.getPlaylist(PLAYLISTS.party),
          api.getPlaylist(PLAYLISTS.retro),
          api.getPlaylist(PLAYLISTS.punjabi),
        ]);

        const h = mapPlaylistSongs(hindi);
        const t = mapPlaylistSongs(telugu);
        const tm = mapPlaylistSongs(tamil);
        const b = mapPlaylistSongs(bolly);
        const r = mapPlaylistSongs(rom);
        const p = mapPlaylistSongs(par);
        const re = mapPlaylistSongs(ret);
        const pu = mapPlaylistSongs(pun);

        const fallbacks: Promise<void>[] = [];

        if (h.length === 0) fallbacks.push(api.searchSongs("top hindi hits 2025", 1, 20).then((res) => setTrendingHindi(mapSearchSongs(res))));
        else setTrendingHindi(h);

        if (t.length === 0) fallbacks.push(api.searchSongs("top telugu hits 2025", 1, 20).then((res) => setTrendingTelugu(mapSearchSongs(res))));
        else setTrendingTelugu(t);

        if (tm.length === 0) fallbacks.push(api.searchSongs("top tamil hits 2025", 1, 20).then((res) => setTrendingTamil(mapSearchSongs(res))));
        else setTrendingTamil(tm);

        if (b.length === 0) fallbacks.push(api.searchSongs("latest bollywood 2025", 1, 20).then((res) => setBollywood(mapSearchSongs(res))));
        else setBollywood(b);

        if (r.length === 0) fallbacks.push(api.searchSongs("hindi romantic songs", 1, 20).then((res) => setRomantic(mapSearchSongs(res))));
        else setRomantic(r);

        if (p.length === 0) fallbacks.push(api.searchSongs("party hits hindi", 1, 20).then((res) => setParty(mapSearchSongs(res))));
        else setParty(p);

        if (re.length === 0) fallbacks.push(api.searchSongs("old hindi classic songs", 1, 20).then((res) => setRetro(mapSearchSongs(res))));
        else setRetro(re);

        if (pu.length === 0) fallbacks.push(api.searchSongs("top punjabi songs 2025", 1, 20).then((res) => setPunjabi(mapSearchSongs(res))));
        else setPunjabi(pu);

        await Promise.all(fallbacks);
      } catch (err) {
        console.error("Failed to load playlists, using search fallback:", err);
        try {
          const [h, t, tm, b] = await Promise.all([
            api.searchSongs("top hindi hits 2025", 1, 20),
            api.searchSongs("top telugu hits 2025", 1, 20),
            api.searchSongs("top tamil hits 2025", 1, 20),
            api.searchSongs("latest bollywood 2025", 1, 20),
          ]);
          setTrendingHindi(mapSearchSongs(h));
          setTrendingTelugu(mapSearchSongs(t));
          setTrendingTamil(mapSearchSongs(tm));
          setBollywood(mapSearchSongs(b));
        } catch { /* nothing we can do */ }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (waking || loading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-3"
        style={{ background: "#121212" }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1DB954" }} />
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          {waking ? "Starting music server..." : "Loading songs..."}
        </p>
        {waking && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Free server wakes up in ~15 seconds
          </p>
        )}
      </div>
    );
  }

  const quickPickSongs = [...trendingHindi, ...trendingTelugu, ...trendingTamil].slice(0, 6);

  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>
      {/* Header with User Profile Button */}
      <div className="sticky top-0 z-20 px-4 pt-12 pb-3 flex items-center justify-between" style={{ background: "rgba(18,18,18,0.97)", backdropFilter: "blur(20px)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1DB954, #1ed760)" }}>
            <Music2 className="w-4 h-4 text-black" />
          </div>
          <h1 className="text-xl font-bold text-white">RhythmWeaver</h1>
        </div>
        
        {/* User Profile Button */}
        <div className="relative">
          <button
            onClick={() => user ? setShowUserMenu(!showUserMenu) : setShowAuthModal(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ background: user ? "#1DB954" : "rgba(255,255,255,0.1)" }}
          >
            {user ? (
              <span className="text-sm font-bold text-black">
                {user.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}
              </span>
            ) : (
              <User className="w-4 h-4 text-white" />
            )}
          </button>
          
          {/* User Menu Dropdown */}
          {showUserMenu && user && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl overflow-hidden" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="text-sm font-semibold text-white">{user.username}</p>
                <p className="text-xs text-white/40 mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-2">
        <h1 className="text-2xl font-bold text-white mb-0.5">Good Evening</h1>
        <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>
          What do you want to listen to?
        </p>

        {/* Quick picks grid — 2 cols, full width */}
        {quickPickSongs.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-7 w-full">
            {quickPickSongs.map((song) => (
              <QuickPick key={song.id} song={song} queue={quickPickSongs} />
            ))}
          </div>
        )}
      </div>

      {recentlyPlayed.length > 0 && (
        <Section title="Recently Played">
          {recentlyPlayed.slice(0, 10).map((song) => (
            <SongRow key={song.id} song={song} queue={recentlyPlayed} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      {trendingHindi.length > 0 && (
        <Section title="Trending Hindi">
          {trendingHindi.slice(0, 15).map((song) => (
            <SongRow key={song.id} song={song} queue={trendingHindi} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      {trendingTelugu.length > 0 && (
        <Section title="Trending Telugu">
          {trendingTelugu.slice(0, 15).map((song) => (
            <SongRow key={song.id} song={song} queue={trendingTelugu} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      {trendingTamil.length > 0 && (
        <Section title="Trending Tamil">
          {trendingTamil.slice(0, 15).map((song) => (
            <SongRow key={song.id} song={song} queue={trendingTamil} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      {bollywood.length > 0 && (
        <Section title="Latest Bollywood">
          {bollywood.slice(0, 15).map((song) => (
            <SongRow key={song.id} song={song} queue={bollywood} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      {punjabi.length > 0 && (
        <Section title="Top Punjabi">
          {punjabi.slice(0, 15).map((song) => (
            <SongRow key={song.id} song={song} queue={punjabi} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      {romantic.length > 0 && (
        <Section title="Romantic Vibes">
          {romantic.slice(0, 15).map((song) => (
            <SongRow key={song.id} song={song} queue={romantic} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      {party.length > 0 && (
        <Section title="Party Hits">
          {party.slice(0, 15).map((song) => (
            <SongRow key={song.id} song={song} queue={party} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      {retro.length > 0 && (
        <Section title="Old is Gold">
          {retro.slice(0, 15).map((song) => (
            <SongRow key={song.id} song={song} queue={retro} onRequireAuth={handleRequireAuth} />
          ))}
        </Section>
      )}

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-white mb-2 px-4">{title}</h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
        {children}
      </div>
    </div>
  );
}

function QuickPick({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong } = usePlayer();
  return (
    <button
      onClick={() => playSong(song, queue)}
      className="flex items-center gap-2 rounded-lg overflow-hidden transition-all active:scale-95 text-left w-full"
      style={{ background: "rgba(255,255,255,0.08)", minWidth: 0 }}
    >
      {song.albumArt ? (
        <img
          src={song.albumArt}
          alt={song.title}
          className="w-12 h-12 object-cover flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "https://via.placeholder.com/100x100?text=🎵";
          }}
        />
      ) : (
        <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#f43f5e,#7c3aed)" }}>
          <span className="text-white text-lg">🎵</span>
        </div>
      )}
      <span className="text-xs font-semibold truncate pr-2" style={{ color: "rgba(255,255,255,0.9)" }}>
        {song.title}
      </span>
    </button>
  );
}