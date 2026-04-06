import { useState, useEffect } from "react";
import {
  Heart, Clock, ListMusic, Plus, Trash2, Edit3,
  Check, X, Play, Loader2, ChevronRight, LogOut, User,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayer } from "@/context/PlayerContext";
import { SongRow } from "@/components/SongRow";
import { AuthModal } from "@/components/AuthModal";
import type { Song } from "@/data/songs";

interface Playlist {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  cover_art?: string;
  song_count?: number;
}

interface LibraryPageProps {
  onRequireAuth: () => void;
}

type Tab = "liked" | "recent" | "playlists" | { type: "playlist"; id: string };

function filterRecent(songs: Song[]): Song[] {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THREE_DAYS_MS;
  const timestamps: Record<string, number> = JSON.parse(
    localStorage.getItem("rw_recent_ts") ?? "{}"
  );
  return songs.filter((s) => {
    const ts = timestamps[s.id];
    if (!ts) return true;
    return ts >= cutoff;
  });
}

export default function LibraryPage({ onRequireAuth }: LibraryPageProps) {
  const { user, logout } = useAuth();
  const {
    likedSongs,
    recentlyPlayed,
    playlists,
    createNewPlaylist,
    removePlaylist,
    updatePlaylistName,
    getPlaylist,
    loadLikedSongs,
    loadPlaylists,
  } = useLibrary();
  const { playSong } = usePlayer();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [tab, setTab] = useState<Tab>("liked");
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // Load data when user is logged in
  useEffect(() => {
    if (user) {
      loadLikedSongs();
      loadPlaylists();
    }
  }, [user, loadLikedSongs, loadPlaylists]);

  const recentFiltered = filterRecent(recentlyPlayed);

  const handleRequireAuth = () => {
    onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  if (!user) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[70vh] gap-5 px-8 text-center"
        style={{ background: "#121212" }}
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <ListMusic className="w-9 h-9" style={{ color: "rgba(255,255,255,0.2)" }} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Enjoy your Library</h2>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
            Sign in to save songs, create playlists, and more.
          </p>
        </div>
        <button
          onClick={handleRequireAuth}
          className="text-sm font-bold text-black px-8 py-3 rounded-full transition-all active:scale-95"
          style={{ background: "#1DB954" }}
        >
          Sign In
        </button>
        <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    );
  }

  const openPlaylist = async (playlist: Playlist) => {
    setTab({ type: "playlist", id: playlist.id });
    setLoadingPlaylist(true);
    const songs = await getPlaylist(playlist.id);
    setPlaylistSongs(songs);
    setLoadingPlaylist(false);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    await createNewPlaylist(newPlaylistName.trim());
    setNewPlaylistName("");
    setCreatingPlaylist(false);
  };

  const handleRename = async (id: string) => {
    if (editName.trim()) await updatePlaylistName(id, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  const currentPlaylist =
    typeof tab === "object" && tab.type === "playlist"
      ? playlists.find((p) => p.id === tab.id)
      : null;

  // Playlist detail view
  if (currentPlaylist) {
    return (
      <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>
        <div className="px-4 pt-12">
          <button
            onClick={() => { setTab("playlists"); setPlaylistSongs([]); }}
            className="flex items-center gap-1.5 text-sm mb-5 transition-colors"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <X className="w-4 h-4" /> Back
          </button>

          <div className="flex flex-col items-center mb-6">
            <div
              className="w-44 h-44 rounded-xl overflow-hidden flex items-center justify-center shadow-2xl mb-4"
              style={{ background: "linear-gradient(135deg,#1DB954,#1ed760)" }}
            >
              {currentPlaylist.cover_art ? (
                <img 
                  src={currentPlaylist.cover_art} 
                  alt={currentPlaylist.name} 
                  className="w-full h-full object-cover" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://via.placeholder.com/200x200?text=🎵";
                  }}
                />
              ) : (
                <ListMusic className="w-14 h-14 text-black/60" />
              )}
            </div>
            <h2 className="text-xl font-bold text-white text-center">{currentPlaylist.name}</h2>
            <p className="text-sm mt-1 text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
              {currentPlaylist.song_count ?? 0} songs
            </p>
            {playlistSongs.length > 0 && (
              <button
                onClick={() => playSong(playlistSongs[0], playlistSongs)}
                className="flex items-center gap-2 mt-4 px-8 py-3 rounded-full text-sm font-bold text-black transition-all active:scale-95"
                style={{ background: "#1DB954" }}
              >
                <Play className="w-4 h-4 fill-black" /> Play
              </button>
            )}
          </div>

          {loadingPlaylist ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#1DB954" }} />
            </div>
          ) : playlistSongs.length === 0 ? (
            <LibraryEmpty 
              icon={<ListMusic className="w-9 h-9" />} 
              title="This playlist is empty" 
              subtitle="Add songs from the home or search screen." 
            />
          ) : (
            <div className="space-y-0.5">
              {playlistSongs.map((song) => (
                <SongRow 
                  key={song.id} 
                  song={song} 
                  queue={playlistSongs} 
                  onRequireAuth={handleRequireAuth} 
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "liked", label: "Liked" },
    { key: "recent", label: "Recent" },
    { key: "playlists", label: "Playlists" },
  ];

  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>
      {/* Header with User Menu */}
      <div 
        className="sticky top-0 z-20 px-4 pt-12 pb-2" 
        style={{ background: "rgba(18,18,18,0.97)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-black transition-all active:scale-95"
              style={{ background: "#1DB954" }}
            >
              {user.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() ?? "U"}
            </button>
            <h1 className="text-xl font-bold text-white">Your Library</h1>
          </div>
          <button
            onClick={() => setCreatingPlaylist(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <Plus className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* User Menu Dropdown */}
        {showUserMenu && (
          <div 
            className="absolute left-4 right-4 top-24 mt-1 rounded-xl shadow-2xl overflow-hidden z-30" 
            style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <p className="text-sm font-semibold text-white">{user.username || user.email}</p>
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

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {TABS.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={label}
                onClick={() => setTab(key)}
                className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all active:scale-95"
                style={{
                  background: active ? "rgba(255,255,255,0.15)" : "transparent",
                  color: active ? "#fff" : "rgba(255,255,255,0.6)",
                  border: active ? "none" : "1px solid rgba(255,255,255,0.15)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4">
        {/* Create playlist inline input */}
        {creatingPlaylist && (
          <div 
            className="flex gap-2 mb-4 mt-3 rounded-xl px-3 py-3" 
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <input
              autoFocus
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePlaylist();
                if (e.key === "Escape") { 
                  setCreatingPlaylist(false); 
                  setNewPlaylistName(""); 
                }
              }}
              placeholder="Playlist name…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none min-w-0"
            />
            <button onClick={handleCreatePlaylist} style={{ color: "#1DB954" }}>
              <Check className="w-4 h-4" />
            </button>
            <button 
              onClick={() => { 
                setCreatingPlaylist(false); 
                setNewPlaylistName(""); 
              }} 
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Liked Songs Tab */}
        {tab === "liked" && (
          <>
            {likedSongs.length === 0 ? (
              <LibraryEmpty 
                icon={<Heart className="w-9 h-9" />} 
                title="No liked songs yet" 
                subtitle="Tap the heart on any song to save it here." 
              />
            ) : (
              <div className="space-y-0.5 mt-1">
                {likedSongs.map((song) => (
                  <SongRow 
                    key={song.id} 
                    song={song} 
                    queue={likedSongs} 
                    onRequireAuth={handleRequireAuth} 
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Recent Tab */}
        {tab === "recent" && (
          <>
            {recentFiltered.length === 0 ? (
              <LibraryEmpty 
                icon={<Clock className="w-9 h-9" />} 
                title="Nothing recent" 
                subtitle="Songs you play appear here for 3 days." 
              />
            ) : (
              <>
                <p className="text-xs mt-3 mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Last 3 days · {recentFiltered.length} songs
                </p>
                <div className="space-y-0.5">
                  {recentFiltered.map((song) => (
                    <SongRow 
                      key={song.id} 
                      song={song} 
                      queue={recentFiltered} 
                      onRequireAuth={handleRequireAuth} 
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Playlists Tab */}
        {tab === "playlists" && (
          <>
            {/* Liked Songs shortcut */}
            {likedSongs.length > 0 && (
              <button 
                onClick={() => playSong(likedSongs[0], likedSongs)} 
                className="w-full flex items-center gap-3 py-2 mb-1 active:scale-95 transition-transform"
              >
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg" 
                  style={{ background: "linear-gradient(135deg,#4c1d95,#7c3aed)" }}
                >
                  <Heart className="w-6 h-6 fill-white text-white" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-semibold text-sm text-white">Liked Songs</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Playlist · {likedSongs.length} songs
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
              </button>
            )}

            {playlists.length === 0 && !creatingPlaylist ? (
              <LibraryEmpty 
                icon={<ListMusic className="w-9 h-9" />} 
                title="Create your first playlist" 
                subtitle="Tap the + button above to get started." 
              />
            ) : (
              <div className="space-y-0.5 mt-1">
                {playlists.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-2">
                    <button 
                      onClick={() => openPlaylist(p)} 
                      className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center shadow-lg" 
                      style={{ background: "linear-gradient(135deg,#1DB954,#1ed760)" }}
                    >
                      {p.cover_art ? (
                        <img 
                          src={p.cover_art} 
                          alt={p.name} 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "https://via.placeholder.com/100x100?text=🎵";
                          }}
                        />
                      ) : (
                        <ListMusic className="w-5 h-5 text-black/60" />
                      )}
                    </button>

                    <button 
                      onClick={() => openPlaylist(p)} 
                      className="flex-1 text-left min-w-0"
                    >
                      {editingId === p.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(p.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-transparent border-b text-sm text-white w-full focus:outline-none"
                          style={{ borderColor: "#1DB954" }}
                        />
                      ) : (
                        <p className="font-semibold text-sm text-white truncate">{p.name}</p>
                      )}
                      <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                        Playlist · {p.song_count ?? 0} songs
                      </p>
                    </button>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setEditingId(p.id); 
                          setEditName(p.name); 
                        }} 
                        className="p-2 rounded-lg" 
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (confirm(`Delete "${p.name}"?`)) removePlaylist(p.id); 
                        }} 
                        className="p-2 rounded-lg" 
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Auth Modal */}
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

function LibraryEmpty({ 
  icon, 
  title, 
  subtitle 
}: { 
  icon: React.ReactNode; 
  title: string; 
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div style={{ color: "rgba(255,255,255,0.1)" }}>{icon}</div>
      <p className="font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>{title}</p>
      <p className="text-sm max-w-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
        {subtitle}
      </p>
    </div>
  );
}