import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { api, extractAudioUrl } from "@/services/api";
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

// ─── Storage keys (recently played only — liked songs live on server) ──────────

const PLAYLISTS_KEY          = "rw_playlists_v2";
const RECENTLY_PLAYED_KEY    = "rw_recently_played";
const RECENTLY_PLAYED_TS_KEY = "rw_recent_ts";

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
  const audioUrl =
    extractAudioUrl(dto) ||
    dto.audioUrl  ||
    dto.url       ||
    "";

  return {
    id:       dto.songId    || dto.id    || "",
    title:    dto.songTitle || dto.name  || dto.title || dto.songId || "",
    artist:   dto.artist    || dto.primaryArtists || dto.singers || "",
    albumArt: dto.songImage || dto.albumArt || dto.image ||
              (Array.isArray(dto.image) ? dto.image[dto.image.length - 1]?.url : "") || "",
    audioUrl,
    duration: typeof dto.duration === "number" ? dto.duration : (parseInt(dto.duration) || 0),
    album:    dto.album    || "",
    movie:    dto.movie    || "",
    language: dto.language || "",
  } as Song;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [likedSongs, setLikedSongs]           = useState<Song[]>([]);
  const [recentlyPlayed, setRecentlyPlayed]   = useState<Song[]>([]);
  const [storedPlaylists, setStoredPlaylists] = useState<StoredPlaylist[]>([]);

  // ── Boot: load playlists + recently played from localStorage ────────────────
  // Liked songs are NOT loaded from localStorage — they come from the server only.

  useEffect(() => {
    setStoredPlaylists(loadPlaylistsFromStorage());

    const rpRaw = localStorage.getItem(RECENTLY_PLAYED_KEY);
    if (rpRaw) {
      try { setRecentlyPlayed(JSON.parse(rpRaw)); } catch { /* ignore */ }
    }
  }, []);

  // ── When user logs in: fetch liked songs from backend with retry ─────────────
  //
  // Liked songs are server-only. No localStorage read/write for them.
  // Retry handles Render free tier cold-start (backend returns 502 for ~15-30s
  // after inactivity). Delays: 0s → 10s → 20s → 35s.

  useEffect(() => {
    if (!user) {
      setLikedSongs([]);
      return;
    }
    let cancelled = false;

    const RETRY_DELAYS_MS = [0, 10_000, 20_000, 35_000];

    const attemptFetch = async (attempt: number) => {
      if (cancelled) return;
      try {
        const res = await api.getLikedSongs();
        if (cancelled) return;

        const raw: any[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : [];

        const serverSongs: Song[] = raw.map(backendDtoToSong).filter((s) => !!s.id);
        setLikedSongs(serverSongs);
      } catch {
        if (cancelled) return;
        const nextAttempt = attempt + 1;
        if (nextAttempt < RETRY_DELAYS_MS.length) {
          setTimeout(() => attemptFetch(nextAttempt), RETRY_DELAYS_MS[nextAttempt]);
        }
        // All retries exhausted — liked songs stay empty until next login/reload.
      }
    };

    attemptFetch(0);
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Keep playlists in localStorage ──────────────────────────────────────────

  useEffect(() => { savePlaylistsToStorage(storedPlaylists); }, [storedPlaylists]);

  // ── Public reload helpers ────────────────────────────────────────────────────

  const loadLikedSongs = useCallback(() => {
    if (!user) { setLikedSongs([]); return; }
    api.getLikedSongs().then((res) => {
      const raw: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : [];
      const serverSongs = raw.map(backendDtoToSong).filter((s) => !!s.id);
      setLikedSongs(serverSongs);
    }).catch(() => { /* keep current in-memory list */ });
  }, [user]);

  const loadPlaylists = useCallback(() => {
    setStoredPlaylists(loadPlaylistsFromStorage());
  }, []);

  // ── Derived playlists ────────────────────────────────────────────────────────

  const playlists: Playlist[] = storedPlaylists.map(({ songs, ...rest }) => ({
    ...rest,
    song_count: songs.length,
  }));

  // ── Recently played ──────────────────────────────────────────────────────────
  // Always prepend the song — even if it was played before — so repeated plays
  // are reflected in history. The deduplication (filtered list shown in UI) is
  // the responsibility of whichever component renders the list, not this store.

  const addToRecentlyPlayed = useCallback((song: Song) => {
    setRecentlyPlayed((prev) => {
      // Prepend unconditionally so every play registers, but cap list at 50
      const updated = [song, ...prev].slice(0, 50);
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
        if (user) api.unlikeSong(song.id).catch(console.error);
      } else {
        setLikedSongs((prev) => [song, ...prev]);
        if (user) api.likeSong(song.id, song.title, song.albumArt).catch(console.error);
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
      if (user) api.createPlaylist(name).catch(console.error);
      return { id: newPlaylist.id, name, created_at: newPlaylist.created_at, song_count: 0 };
    },
    [user]
  );

  const removePlaylist = useCallback(
    async (playlistId: string) => {
      setStoredPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
      if (user) api.deletePlaylist(playlistId).catch(console.error);
    },
    [user]
  );

  const updatePlaylistName = useCallback(
    async (playlistId: string, newName: string) => {
      setStoredPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, name: newName } : p))
      );
      if (user) api.updatePlaylist(playlistId, newName).catch(console.error);
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
      if (user) api.addToPlaylist(playlistId, song.id).catch(console.error);
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
      if (user) api.removeFromPlaylist(playlistId, songId).catch(console.error);
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