import { useState, useEffect } from "react";
import { Heart, Clock, ListMusic, Plus, Trash2, Edit3, Check, X, Play, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayer } from "@/context/PlayerContext";
import { SongRow } from "@/components/SongRow";
import type { Song } from "@/data/songs";

// Playlist interface defined locally to avoid module resolution issues
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

// Filter recently played to only show songs played in the last 3 days
function filterRecent(songs: Song[]): Song[] {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THREE_DAYS_MS;
  // songs don't have a playedAt field from PlayerContext, so we keep all
  // but the Supabase recordRecentlyPlayed should store played_at;
  // here we filter using localStorage timestamps as a fallback
  const timestamps: Record<string, number> = JSON.parse(
    localStorage.getItem("rw_recent_ts") ?? "{}"
  );
  return songs.filter((s) => {
    const ts = timestamps[s.id];
    if (!ts) return true; // no timestamp recorded yet → keep
    return ts >= cutoff;
  });
}

export default function LibraryPage({ onRequireAuth }: LibraryPageProps) {
  const { user } = useAuth();
  const {
    likedSongs,
    recentlyPlayed,
    playlists,
    createNewPlaylist,
    removePlaylist,
    updatePlaylistName,
    getPlaylist,
  } = useLibrary();
  const { playSong } = usePlayer();

  const [tab, setTab]                     = useState<Tab>("liked");
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editName, setEditName]           = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName]   = useState("");

  const recentFiltered = filterRecent(recentlyPlayed);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 px-8 text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <ListMusic className="w-9 h-9 text-white/20" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Your Library</h2>
          <p className="text-sm text-white/40 mt-1.5 leading-relaxed">
            Sign in to save songs, create playlists, and more.
          </p>
        </div>
        <button
          onClick={onRequireAuth}
          className="text-sm font-semibold text-white px-8 py-3 rounded-full transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
        >
          Sign In
        </button>
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

  const topTabs = [
    { key: "liked" as const,     label: "Liked",     icon: Heart     },
    { key: "recent" as const,    label: "Recent",    icon: Clock     },
    { key: "playlists" as const, label: "Playlists", icon: ListMusic },
  ];

  return (
    <div className="px-4 pt-5 animate-fade-in">

      {/* Back button inside a playlist */}
      {currentPlaylist ? (
        <button
          onClick={() => { setTab("playlists"); setPlaylistSongs([]); }}
          className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white mb-5 transition-colors"
        >
          <X className="w-4 h-4" /> Back
        </button>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-white mb-5">Your Library</h1>

          {/* Tab bar — NO counts */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {topTabs.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-95"
                  style={{
                    background: active
                      ? "linear-gradient(135deg,#f97316,#ec4899)"
                      : "rgba(255,255,255,0.07)",
                    color: active ? "#fff" : "rgba(255,255,255,0.5)",
                    border: active ? "none" : "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Liked Songs ──────────────────────────────────────────── */}
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/30">{likedSongs.length} songs</p>
                <PlayAllBtn onClick={() => playSong(likedSongs[0], likedSongs)} />
              </div>
              <div className="space-y-0.5">
                {likedSongs.map((song) => (
                  <SongRow key={song.id} song={song} queue={likedSongs} onRequireAuth={onRequireAuth} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Recently Played ──────────────────────────────────────── */}
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
              <p className="text-xs text-white/30 mb-3">Last 3 days</p>
              <div className="space-y-0.5">
                {recentFiltered.map((song) => (
                  <SongRow key={song.id} song={song} queue={recentFiltered} onRequireAuth={onRequireAuth} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Playlists ─────────────────────────────────────────────── */}
      {tab === "playlists" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <span />
            <button
              onClick={() => setCreatingPlaylist(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-full transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
            >
              <Plus className="w-3 h-3" /> New Playlist
            </button>
          </div>

          {creatingPlaylist && (
            <div
              className="flex gap-2 mb-4 rounded-2xl px-3 py-3"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <input
                autoFocus
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreatePlaylist();
                  if (e.key === "Escape") { setCreatingPlaylist(false); setNewPlaylistName(""); }
                }}
                placeholder="Playlist name…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
              />
              <button onClick={handleCreatePlaylist} className="text-orange-400">
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setCreatingPlaylist(false); setNewPlaylistName(""); }}
                className="text-white/30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {playlists.length === 0 && !creatingPlaylist ? (
            <LibraryEmpty
              icon={<ListMusic className="w-9 h-9" />}
              title="No playlists yet"
              subtitle='Tap "New Playlist" to create your first one.'
            />
          ) : (
            <div className="space-y-2">
              {playlists.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl p-3 transition-all group"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <button
                    onClick={() => openPlaylist(p)}
                    className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
                  >
                    {p.cover_art ? (
                      <img src={p.cover_art} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <ListMusic className="w-5 h-5 text-white" />
                    )}
                  </button>

                  <button onClick={() => openPlaylist(p)} className="flex-1 text-left min-w-0">
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
                        className="bg-transparent border-b border-orange-500/50 text-sm text-white w-full focus:outline-none"
                      />
                    ) : (
                      <p className="font-semibold text-sm text-white truncate">{p.name}</p>
                    )}
                    <p className="text-xs text-white/30 mt-0.5">{p.song_count ?? 0} songs</p>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(p.id);
                        setEditName(p.name);
                      }}
                      className="p-2 text-white/25 hover:text-white/60 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${p.name}"?`)) removePlaylist(p.id);
                      }}
                      className="p-2 text-white/25 hover:text-red-400 rounded-lg transition-colors"
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

      {/* ── Inside a playlist ─────────────────────────────────────── */}
      {currentPlaylist && (
        <>
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center shadow-xl flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
            >
              {currentPlaylist.cover_art ? (
                <img src={currentPlaylist.cover_art} alt={currentPlaylist.name} className="w-full h-full object-cover" />
              ) : (
                <ListMusic className="w-8 h-8 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{currentPlaylist.name}</h2>
              <p className="text-sm text-white/30 mt-0.5">{currentPlaylist.song_count ?? 0} songs</p>
              {playlistSongs.length > 0 && (
                <PlayAllBtn
                  onClick={() => playSong(playlistSongs[0], playlistSongs)}
                  className="mt-2"
                />
              )}
            </div>
          </div>

          {loadingPlaylist ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
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
                <SongRow key={song.id} song={song} queue={playlistSongs} onRequireAuth={onRequireAuth} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Bottom spacer */}
      <div className="h-6" />
    </div>
  );
}

function PlayAllBtn({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-all active:scale-95 ${className}`}
      style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
    >
      <Play className="w-3 h-3 fill-white" /> Play All
    </button>
  );
}

function LibraryEmpty({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="text-white/10">{icon}</div>
      <p className="font-semibold text-white/60">{title}</p>
      <p className="text-sm text-white/30 max-w-xs leading-relaxed">{subtitle}</p>
    </div>
  );
}