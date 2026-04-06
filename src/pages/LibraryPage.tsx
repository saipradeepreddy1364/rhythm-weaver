import { useState } from "react";
import { Heart, Clock, ListMusic, Plus, Trash2, Edit3, Check, X, Play, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayer } from "@/context/PlayerContext";
import { SongRow } from "@/components/SongRow";
import type { Song } from "@/data/songs";
import type { Playlist } from "@/supabase/db";

interface LibraryPageProps {
  onRequireAuth: () => void;
}

type Tab = "liked" | "recent" | "playlists" | { type: "playlist"; id: string };

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

  const [tab, setTab] = useState<Tab>("liked");
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <ListMusic className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Your Library</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to save songs, create playlists, and more.
          </p>
        </div>
        <button
          onClick={onRequireAuth}
          className="bg-primary text-primary-foreground font-semibold px-6 py-2.5 rounded-full text-sm hover:bg-primary/90 transition-colors"
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

  // ── Tabs ────────────────────────────────────────────────────────
  const topTabs = [
    { key: "liked" as const,     label: "Liked",    icon: Heart,      count: likedSongs.length },
    { key: "recent" as const,    label: "Recent",   icon: Clock,      count: recentlyPlayed.length },
    { key: "playlists" as const, label: "Playlists",icon: ListMusic,  count: playlists.length },
  ];

  return (
    <div className="pb-36 px-4 sm:px-6 pt-6 animate-fade-in">

      {/* Back button when inside a playlist */}
      {currentPlaylist && (
        <button
          onClick={() => { setTab("playlists"); setPlaylistSongs([]); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <X className="w-4 h-4" /> Back to Playlists
        </button>
      )}

      {!currentPlaylist && (
        <>
          <h1 className="text-2xl font-bold text-foreground mb-4">Your Library</h1>

          {/* Tab bar */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {topTabs.map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  tab === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    tab === key ? "bg-white/20" : "bg-border"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Liked Songs ─────────────────────────────────────────── */}
      {tab === "liked" && (
        <>
          {likedSongs.length === 0 ? (
            <EmptyState
              icon={<Heart className="w-8 h-8" />}
              title="No liked songs yet"
              subtitle="Tap the heart on any song to save it here."
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">{likedSongs.length} songs</p>
                <button
                  onClick={() => playSong(likedSongs[0], likedSongs)}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" /> Play All
                </button>
              </div>
              <div className="space-y-0.5">
                {likedSongs.map((song) => (
                  <SongRow key={song.id} song={song} queue={likedSongs} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Recently Played ─────────────────────────────────────── */}
      {tab === "recent" && (
        <>
          {recentlyPlayed.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-8 h-8" />}
              title="Nothing played yet"
              subtitle="Songs you play will appear here."
            />
          ) : (
            <div className="space-y-0.5">
              {recentlyPlayed.map((song) => (
                <SongRow key={song.id} song={song} queue={recentlyPlayed} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Playlists list ──────────────────────────────────────── */}
      {tab === "playlists" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{playlists.length} playlists</p>
            <button
              onClick={() => setCreatingPlaylist(true)}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" /> New Playlist
            </button>
          </div>

          {/* Create new playlist inline */}
          {creatingPlaylist && (
            <div className="flex gap-2 mb-4 bg-muted border border-border rounded-xl px-3 py-3">
              <input
                autoFocus
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreatePlaylist();
                  if (e.key === "Escape") { setCreatingPlaylist(false); setNewPlaylistName(""); }
                }}
                placeholder="Playlist name..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button onClick={handleCreatePlaylist} className="text-primary">
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setCreatingPlaylist(false); setNewPlaylistName(""); }}
                className="text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {playlists.length === 0 && !creatingPlaylist ? (
            <EmptyState
              icon={<ListMusic className="w-8 h-8" />}
              title="No playlists yet"
              subtitle='Tap "New Playlist" to create your first one.'
            />
          ) : (
            <div className="space-y-2">
              {playlists.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 bg-card/60 hover:bg-accent rounded-xl p-3 transition-colors group"
                >
                  {/* Cover */}
                  <button
                    onClick={() => openPlaylist(p)}
                    className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0"
                  >
                    {p.cover_art ? (
                      <img src={p.cover_art} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <ListMusic className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>

                  {/* Name & count */}
                  <button onClick={() => openPlaylist(p)} className="flex-1 text-left min-w-0">
                    {editingId === p.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(p.id);
                          if (e.key === "Escape") { setEditingId(null); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-muted border border-border rounded px-2 py-0.5 text-sm text-foreground w-full focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    ) : (
                      <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.song_count ?? 0} songs
                    </p>
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(p.id);
                        setEditName(p.name);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${p.name}"?`)) removePlaylist(p.id);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-muted transition-colors"
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

      {/* ── Inside a playlist ───────────────────────────────────── */}
      {currentPlaylist && (
        <>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {currentPlaylist.cover_art ? (
                <img src={currentPlaylist.cover_art} alt={currentPlaylist.name} className="w-full h-full object-cover" />
              ) : (
                <ListMusic className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{currentPlaylist.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {currentPlaylist.song_count ?? 0} songs
              </p>
              {playlistSongs.length > 0 && (
                <button
                  onClick={() => playSong(playlistSongs[0], playlistSongs)}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors mt-2"
                >
                  <Play className="w-3 h-3 fill-current" /> Play All
                </button>
              )}
            </div>
          </div>

          {loadingPlaylist ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : playlistSongs.length === 0 ? (
            <EmptyState
              icon={<ListMusic className="w-8 h-8" />}
              title="This playlist is empty"
              subtitle="Add songs from the home screen."
            />
          ) : (
            <div className="space-y-0.5">
              {playlistSongs.map((song) => (
                <SongRow key={song.id} song={song} queue={playlistSongs} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
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
      <div className="text-muted-foreground/30">{icon}</div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground max-w-xs">{subtitle}</p>
    </div>
  );
}