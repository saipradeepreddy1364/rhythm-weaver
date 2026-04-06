import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Song } from "@/data/songs";
import type { Playlist } from "@/supabase/db";
import {
  getLikedSongs,
  getLikedSongIds,
  likeSong,
  unlikeSong,
  getRecentlyPlayed,
  recordRecentlyPlayed,
  getUserPlaylists,
  getPlaylistSongs,
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
} from "@/supabase/db";
import { useAuth } from "./AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LibraryContextType {
  // Liked songs
  likedSongs: Song[];
  likedIds: Set<string>;
  toggleLike: (song: Song) => Promise<void>;
  isLiked: (songId: string) => boolean;

  // Recently played
  recentlyPlayed: Song[];
  addToRecentlyPlayed: (song: Song) => Promise<void>;

  // Playlists
  playlists: Playlist[];
  createNewPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  removePlaylist: (playlistId: string) => Promise<void>;
  updatePlaylistName: (playlistId: string, name: string) => Promise<void>;
  addToPlaylist: (playlistId: string, song: Song) => Promise<void>;
  removeFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  getPlaylist: (playlistId: string) => Promise<Song[]>;

  loading: boolean;
  refresh: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const LibraryContext = createContext<LibraryContextType | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [likedSongs, setLikedSongs]           = useState<Song[]>([]);
  const [likedIds, setLikedIds]               = useState<Set<string>>(new Set());
  const [recentlyPlayed, setRecentlyPlayed]   = useState<Song[]>([]);
  const [playlists, setPlaylists]             = useState<Playlist[]>([]);
  const [loading, setLoading]                 = useState(false);

  // ── Load all library data when user logs in ────────────────────
  const loadAll = useCallback(async () => {
    if (!user) {
      setLikedSongs([]);
      setLikedIds(new Set());
      setRecentlyPlayed([]);
      setPlaylists([]);
      return;
    }

    setLoading(true);
    try {
      const [liked, ids, recent, lists] = await Promise.all([
        getLikedSongs(),
        getLikedSongIds(),
        getRecentlyPlayed(),
        getUserPlaylists(),
      ]);
      setLikedSongs(liked);
      setLikedIds(ids);
      setRecentlyPlayed(recent);
      setPlaylists(lists);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Liked Songs ────────────────────────────────────────────────
  const toggleLike = useCallback(
    async (song: Song) => {
      if (!user) return;
      const alreadyLiked = likedIds.has(song.id);

      // Optimistic update
      if (alreadyLiked) {
        setLikedIds((prev) => { const s = new Set(prev); s.delete(song.id); return s; });
        setLikedSongs((prev) => prev.filter((s) => s.id !== song.id));
        await unlikeSong(song.id);
      } else {
        setLikedIds((prev) => new Set(prev).add(song.id));
        setLikedSongs((prev) => [song, ...prev]);
        await likeSong(song);
      }
    },
    [user, likedIds]
  );

  const isLiked = useCallback(
    (songId: string) => likedIds.has(songId),
    [likedIds]
  );

  // ── Recently Played ────────────────────────────────────────────
  const addToRecentlyPlayed = useCallback(
    async (song: Song) => {
      if (!user) return;
      // Optimistic: move to top
      setRecentlyPlayed((prev) => [
        song,
        ...prev.filter((s) => s.id !== song.id),
      ].slice(0, 50));
      await recordRecentlyPlayed(song);
    },
    [user]
  );

  // ── Playlists ──────────────────────────────────────────────────
  const createNewPlaylist = useCallback(
    async (name: string, description?: string): Promise<Playlist | null> => {
      if (!user) return null;
      const { data, error } = await createPlaylist(name, description);
      if (error) { console.error(error.message); return null; }
      if (data) setPlaylists((prev) => [data, ...prev]);
      return data;
    },
    [user]
  );

  const removePlaylist = useCallback(async (playlistId: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    await deletePlaylist(playlistId);
  }, []);

  const updatePlaylistName = useCallback(
    async (playlistId: string, name: string) => {
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, name } : p))
      );
      await renamePlaylist(playlistId, name);
    },
    []
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, song: Song) => {
      await addSongToPlaylist(playlistId, song);
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? { ...p, song_count: (p.song_count ?? 0) + 1 }
            : p
        )
      );
    },
    []
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      await removeSongFromPlaylist(playlistId, songId);
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? { ...p, song_count: Math.max(0, (p.song_count ?? 1) - 1) }
            : p
        )
      );
    },
    []
  );

  const getPlaylist = useCallback(
    async (playlistId: string): Promise<Song[]> => {
      return getPlaylistSongs(playlistId);
    },
    []
  );

  return (
    <LibraryContext.Provider
      value={{
        likedSongs,
        likedIds,
        toggleLike,
        isLiked,
        recentlyPlayed,
        addToRecentlyPlayed,
        playlists,
        createNewPlaylist,
        removePlaylist,
        updatePlaylistName,
        addToPlaylist,
        removeFromPlaylist,
        getPlaylist,
        loading,
        refresh: loadAll,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextType {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used inside <LibraryProvider>");
  return ctx;
}