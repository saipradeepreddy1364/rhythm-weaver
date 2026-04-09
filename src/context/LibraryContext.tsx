import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { api } from "@/services/api";
import type { Song } from "@/data/songs";
import { useAuth } from "./AuthContext";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Playlist {
  id: string;
  name: string;
  cover_art?: string;
  song_count?: number;
  created_at: string;
}

interface StoredPlaylist extends Playlist {
  songs: Song[];
}

interface LibraryContextType {
  likedSongs: Song[];
  recentlyPlayed: Song[];
  playlists: Playlist[];
  toggleLike: (song: Song) => Promise<void>;
  isLiked: (songId: string) => boolean;
  addToRecentlyPlayed: (song: Song) => void;
  createNewPlaylist: (name: string) => Promise<Playlist | null>;
  removePlaylist: (playlistId: string) => Promise<void>;
  updatePlaylistName: (playlistId: string, newName: string) => Promise<void>;
  addToPlaylist: (playlistId: string, song: Song) => Promise<void>;
  removeFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  getPlaylist: (playlistId: string) => Promise<Song[]>;
  loadLikedSongs: () => void;
  loadPlaylists: () => void;
}

// ─── Storage keys ──────────────────────────────────────────────────────────────

const LIKED_KEY           = "rw_liked_songs_v2";
const PLAYLISTS_KEY       = "rw_playlists_v2";
const RECENTLY_PLAYED_KEY = "rw_recently_played";
const RECENTLY_PLAYED_TS_KEY = "rw_recent_ts";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function loadLikedFromStorage(): Song[] {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLikedToStorage(songs: Song[]) {
  localStorage.setItem(LIKED_KEY, JSON.stringify(songs));
}

function loadPlaylistsFromStorage(): StoredPlaylist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePlaylistsToStorage(playlists: StoredPlaylist[]) {
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

function generateId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Map backend liked song DTO → Song shape ───────────────────────────────────
function backendDtoToSong(dto: any): Song {
  return {
    id:       dto.songId,
    title:    dto.songTitle || dto.songId,
    artist:   dto.artist    || "",
    albumArt: dto.songImage || dto.albumArt || "",
    audioUrl: dto.audioUrl  || "",
    duration: dto.duration  || 0,
    album:    dto.album     || "",
    movie:    dto.movie     || "",
  } as Song;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [likedSongs, setLikedSongs]         = useState<Song[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [storedPlaylists, setStoredPlaylists] = useState<StoredPlaylist[]>([]);

  // ── Boot: load from localStorage ────────────────────────────────────────────

  useEffect(() => {
    setLikedSongs(loadLikedFromStorage());
    setStoredPlaylists(loadPlaylistsFromStorage());

    const rpRaw = localStorage.getItem(RECENTLY_PLAYED_KEY);
    if (rpRaw) {
      try { setRecentlyPlayed(JSON.parse(rpRaw)); } catch { /* ignore */ }
    }
  }, []);

  // ── When user logs in: fetch liked songs from backend and merge ──────────────

  useEffect(() => {
    if (!user) return;

    api.getLikedSongs().then((res) => {
      // Backend returns { success, data: [ { songId, songTitle, songImage, ... } ] }
      const raw: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : [];

      if (raw.length === 0) return;

      const serverSongs: Song[] = raw.map(backendDtoToSong);

      setLikedSongs((local) => {
        // Merge: server is the source of truth for IDs, but local may have
        // richer song objects (full audioUrl, artist etc.) — prefer local if present
        const localMap = new Map(local.map((s) => [s.id, s]));
        const merged = serverSongs.map((s) => localMap.get(s.id) ?? s);

        // Also keep any local songs not yet synced to server
        local.forEach((s) => {
          if (!merged.find((m) => m.id === s.id)) merged.push(s);
        });

        saveLikedToStorage(merged);
        return merged;
      });
    }).catch(() => { /* network error — keep local */ });
  }, [user?.id]); // re-run when user changes (login/logout)

  // ── Keep storage in sync whenever state changes ──────────────────────────────

  useEffect(() => {
    saveLikedToStorage(likedSongs);
  }, [likedSongs]);

  useEffect(() => {
    savePlaylistsToStorage(storedPlaylists);
  }, [storedPlaylists]);

  // ── Public reload helpers (used by LibraryPage) ──────────────────────────────

  const loadLikedSongs = useCallback(() => {
    if (user) {
      // Re-fetch from backend when user is logged in
      api.getLikedSongs().then((res) => {
        const raw: any[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : [];
        if (raw.length > 0) {
          const songs = raw.map(backendDtoToSong);
          setLikedSongs(songs);
          saveLikedToStorage(songs);
        }
      }).catch(() => {
        setLikedSongs(loadLikedFromStorage());
      });
    } else {
      setLikedSongs(loadLikedFromStorage());
    }
  }, [user]);

  const loadPlaylists = useCallback(() => {
    setStoredPlaylists(loadPlaylistsFromStorage());
  }, []);

  // ── Derived playlists (without song arrays) for context consumers ─────────────

  const playlists: Playlist[] = storedPlaylists.map(({ songs, ...rest }) => ({
    ...rest,
    song_count: songs.length,
  }));

  // ── Recently played ──────────────────────────────────────────────────────────

  const addToRecentlyPlayed = useCallback((song: Song) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const updated = [song, ...filtered].slice(0, 50);
      localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
      const ts: Record<string, number> = JSON.parse(
        localStorage.getItem(RECENTLY_PLAYED_TS_KEY) || "{}"
      );
      ts[song.id] = Date.now();
      localStorage.setItem(RECENTLY_PLAYED_TS_KEY, JSON.stringify(ts));
      return updated;
    });
  }, []);

  // ── Like / Unlike ────────────────────────────────────────────────────────────

  const isLiked = useCallback(
    (songId: string) => likedSongs.some((s) => s.id === songId),
    [likedSongs]
  );

  const toggleLike = useCallback(
    async (song: Song) => {
      const liked = likedSongs.some((s) => s.id === song.id);
      if (liked) {
        setLikedSongs((prev) => prev.filter((s) => s.id !== song.id));
        if (user) {
          api.unlikeSong(song.id).catch(console.error);
        }
      } else {
        setLikedSongs((prev) => [song, ...prev]);
        if (user) {
          // Pass title + image so backend can store full song info
          api.likeSong(song.id, song.title, song.albumArt).catch(console.error);
        }
      }
    },
    [likedSongs, user]
  );

  // ── Playlist CRUD ────────────────────────────────────────────────────────────

  const createNewPlaylist = useCallback(
    async (name: string): Promise<Playlist | null> => {
      const newPlaylist: StoredPlaylist = {
        id: generateId(),
        name,
        created_at: new Date().toISOString(),
        songs: [],
      };
      setStoredPlaylists((prev) => [...prev, newPlaylist]);

      if (user) {
        api.createPlaylist(name).catch(console.error);
      }

      return { id: newPlaylist.id, name, created_at: newPlaylist.created_at, song_count: 0 };
    },
    [user]
  );

  const removePlaylist = useCallback(
    async (playlistId: string) => {
      setStoredPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
      if (user) {
        api.deletePlaylist(playlistId).catch(console.error);
      }
    },
    [user]
  );

  const updatePlaylistName = useCallback(
    async (playlistId: string, newName: string) => {
      setStoredPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, name: newName } : p))
      );
      if (user) {
        api.updatePlaylist(playlistId, newName).catch(console.error);
      }
    },
    [user]
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, song: Song) => {
      setStoredPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== playlistId) return p;
          if (p.songs.some((s) => s.id === song.id)) return p;
          return { ...p, songs: [...p.songs, song] };
        })
      );
      if (user) {
        api.addToPlaylist(playlistId, song.id).catch(console.error);
      }
    },
    [user]
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      setStoredPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId ? { ...p, songs: p.songs.filter((s) => s.id !== songId) } : p
        )
      );
      if (user) {
        api.removeFromPlaylist(playlistId, songId).catch(console.error);
      }
    },
    [user]
  );

  const getPlaylist = useCallback(
    async (playlistId: string): Promise<Song[]> => {
      const playlist = storedPlaylists.find((p) => p.id === playlistId);
      return playlist ? playlist.songs : [];
    },
    [storedPlaylists]
  );

  return (
    <LibraryContext.Provider
      value={{
        likedSongs,
        recentlyPlayed,
        playlists,
        toggleLike,
        isLiked,
        addToRecentlyPlayed,
        createNewPlaylist,
        removePlaylist,
        updatePlaylistName,
        addToPlaylist,
        removeFromPlaylist,
        getPlaylist,
        loadLikedSongs,
        loadPlaylists,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used within LibraryProvider");
  return context;
}