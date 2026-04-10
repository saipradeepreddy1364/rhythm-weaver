import { useState, useEffect } from "react";
import {
  Heart,
  Clock,
  ListMusic,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Play,
  Loader2,
  ChevronRight,
  LogOut,
  User,
  Music2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayer } from "@/context/PlayerContext";
import { SongRow } from "@/components/SongRow";
import { AuthModal } from "@/components/AuthModal";
import { MiniPlayer } from "@/components/MiniPlayer";
import type { Song } from "@/data/songs";

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

  // Refresh library data when user is present
  useEffect(() => {
    if (user) {
      loadLikedSongs();
      loadPlaylists();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentFiltered = filterRecent(recentlyPlayed);

  const handleRequireAuth = () => {
    onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  // ── Not logged in ────────────────────────────────────────────────────────────

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
          <p
            className="text-sm mt-2 leading-relaxed"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
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
        {/* MiniPlayer even on logged-out state */}
        <MiniPlayer onRequireAuth={handleRequireAuth} />
      </div>
    );
  }

  // ── Playlist detail view ─────────────────────────────────────────────────────

  const currentPlaylist =
    typeof tab === "object" && tab.type === "playlist"
      ? playlists.find((p) => p.id === tab.id)
      : null;

  const openPlaylist = async (id: string) => {
    setTab({ type: "playlist", id });
    setLoadingPlaylist(true);
    const songs = await getPlaylist(id);
    setPlaylistSongs(songs);
    setLoadingPlaylist(false);
  };

  if (currentPlaylist) {
    return (
      <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>
        {/* Header */}
        <div
          className="sticky top-0 z-20 px-4 pt-12 pb-3 flex items-center gap-3"
          style={{ background: "rgba(18,18,18,0.97)", backdropFilter: "blur(20px)" }}
        >
          <button
            onClick={() => {
              setTab("playlists");
              setPlaylistSongs([]);
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white truncate">{currentPlaylist.name}</h1>
        </div>

        <div className="px-4 pt-4">
          {/* Playlist cover */}
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-44 h-44 rounded-2xl overflow-hidden flex items-center justify-center shadow-2xl mb-4"
              style={{ background: "linear-gradient(135deg,#1DB954,#1ed760)" }}
            >
              {currentPlaylist.cover_art ? (
                <img
                  src={currentPlaylist.cover_art}
                  alt={currentPlaylist.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://via.placeholder.com/200x200?text=🎵";
                  }}
                />
              ) : (
                <ListMusic className="w-14 h-14 text-black/60" />
              )}
            </div>
            <h2 className="text-xl font-bold text-white text-center">{currentPlaylist.name}</h2>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              {currentPlaylist.song_count ?? 0} songs
            </p>
            {playlistSongs.length > 0 && (
              <button
                onClick={() => playSong(playlistSongs[0], playlistSongs, true)}
                className="flex items-center gap-2 mt-4 px-8 py-3 rounded-full text-sm font-bold text-black transition-all active:scale-95"
                style={{ background: "#1DB954" }}
              >
                <Play className="w-4 h-4 fill-black" /> Play All
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
                  fromLibrary
                />
              ))}
            </div>
          )}
        </div>

        {/* MiniPlayer in playlist view */}
        <MiniPlayer onRequireAuth={handleRequireAuth} />
      </div>
    );
  }

  // ── Main library view ────────────────────────────────────────────────────────

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

  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>
      {/* ── Header ── */}
      <div
        className="sticky top-0 z-20 px-4 pt-12 pb-3 flex items-center justify-between"
        style={{ background: "rgba(18,18,18,0.97)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1DB954, #1ed760)" }}
          >
            <Music2 className="w-4 h-4 text-black" />
          </div>
          <h1 className="text-xl font-bold text-white">Your Library</h1>
        </div>

        {/* User + new playlist button */}
        <div className="flex items-center gap-2">
          {tab === "playlists" && (
            <button
              onClick={() => setCreatingPlaylist((v) => !v)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "#1DB954" }}
            >
              <span className="text-sm font-bold text-black">
                {(user.username?.charAt(0) || user.email?.charAt(0) || "U").toUpperCase()}
              </span>
            </button>
            {showUserMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
                style={{
                  background: "#1a1a1a",
                  border: "1px solid rgba(255,255,255,0.08)",
                  zIndex: 100,
                }}
              >
                <div
                  className="px-4 py-3"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                >
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
      </div>

      <div className="px-4 pt-3" style={{ paddingBottom: "1rem" }}>
        {/* ── Tab pills ── */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {(
            [
              { key: "liked", label: "Liked Songs" },
              { key: "recent", label: "Recent" },
              { key: "playlists", label: "Playlists" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background:
                  tab === key ? "#1DB954" : "rgba(255,255,255,0.08)",
                color: tab === key ? "#000" : "rgba(255,255,255,0.6)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── New playlist input ── */}
        {creatingPlaylist && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <ListMusic className="w-4 h-4 flex-shrink-0" style={{ color: "#1DB954" }} />
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

        {/* ── Liked Songs Tab ── */}
        {tab === "liked" && (
          <>
            {likedSongs.length === 0 ? (
              <LibraryEmpty
                icon={<Heart className="w-9 h-9" />}
                title="No liked songs yet"
                subtitle="Tap the heart on any song to save it here."
              />
            ) : (
              <>
                {/* Play All button */}
                <div className="flex items-center justify-between mb-3 mt-1">
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {likedSongs.length} songs
                  </p>
                  <button
                    onClick={() => playSong(likedSongs[0], likedSongs, true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-black transition-all active:scale-95"
                    style={{ background: "#1DB954" }}
                  >
                    <Play className="w-3 h-3 fill-black" /> Play All
                  </button>
                </div>
                <div className="space-y-0.5 mt-1">
                  {likedSongs.map((song) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      queue={likedSongs}
                      onRequireAuth={handleRequireAuth}
                      fromLibrary
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Recent Tab ── */}
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
                <div className="flex items-center justify-between mb-3 mt-1">
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Last 3 days · {recentFiltered.length} songs
                  </p>
                  <button
                    onClick={() => playSong(recentFiltered[0], recentFiltered, true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-black transition-all active:scale-95"
                    style={{ background: "#1DB954" }}
                  >
                    <Play className="w-3 h-3 fill-black" /> Play All
                  </button>
                </div>
                <div className="space-y-0.5">
                  {recentFiltered.map((song) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      queue={recentFiltered}
                      onRequireAuth={handleRequireAuth}
                      fromLibrary
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Playlists Tab ── */}
        {tab === "playlists" && (
          <>
            {/* Liked Songs shortcut */}
            {likedSongs.length > 0 && (
              <button
                onClick={() => playSong(likedSongs[0], likedSongs, true)}
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
                <ChevronRight
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                />
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
                      onClick={() => openPlaylist(p.id)}
                      className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center shadow-lg"
                      style={{ background: "linear-gradient(135deg,#1DB954,#1ed760)" }}
                    >
                      {p.cover_art ? (
                        <img
                          src={p.cover_art}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://via.placeholder.com/100x100?text=🎵";
                          }}
                        />
                      ) : (
                        <ListMusic className="w-5 h-5 text-black/60" />
                      )}
                    </button>

                    <button
                      onClick={() => openPlaylist(p.id)}
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
                      <p
                        className="text-xs mt-0.5 truncate"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
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

      {/* MiniPlayer always visible at bottom */}
      <MiniPlayer onRequireAuth={handleRequireAuth} />
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

function LibraryEmpty({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div style={{ color: "rgba(255,255,255,0.1)" }}>{icon}</div>
      <p className="font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
        {title}
      </p>
      <p
        className="text-sm max-w-xs leading-relaxed"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {subtitle}
      </p>
    </div>
  );
}