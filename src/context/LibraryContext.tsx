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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Map backend liked song DTO → Song shape ───────────────────────────────────
function backendDtoToSong(dto: any): Song {
  const audioUrl =
    extractAudioUrl(dto) ||
    dto.audioUrl ||
    dto.url ||
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

  // All state is purely in-memory — no localStorage anywhere in this file.
  const [likedSongs, setLikedSongs]           = useState<Song[]>([]);
  const [recentlyPlayed, setRecentlyPlayed]   = useState<Song[]>([]);
  const [storedPlaylists, setStoredPlaylists] = useState<StoredPlaylist[]>([]);

  // ── When user logs in/out: fetch liked songs from backend ────────────────────

  useEffect(() => {
    if (!user) {
      setLikedSongs([]);
      return;
    }
    api.getLikedSongs().then((res) => {
      const raw: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : [];
      if (raw.length === 0) return;
      setLikedSongs(raw.map(backendDtoToSong).filter((s) => !!s.id));
    }).catch(() => { /* network error — keep in-memory state */ });
  }, [user?.id]);

  // ── When user logs out: clear playlists ──────────────────────────────────────

  useEffect(() => {
    if (!user) setStoredPlaylists([]);
  }, [user?.id]);

  // ── Public reload helpers ─────────────────────────────────────────────────────

  const loadLikedSongs = useCallback(() => {
    if (!user) {
      setLikedSongs([]);
      return;
    }
    api.getLikedSongs().then((res) => {
      const raw: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : [];
      if (raw.length > 0) {
        setLikedSongs(raw.map(backendDtoToSong).filter((s) => !!s.id));
      }
    }).catch(() => { /* keep current in-memory list */ });
  }, [user]);

  const loadPlaylists = useCallback(() => {
    // Playlists are session-only in-memory state.
    // Wire to a backend API call here if/when that endpoint exists.
  }, []);

  // ── Derived playlists ─────────────────────────────────────────────────────────

  const playlists: Playlist[] = storedPlaylists.map(({ songs, ...rest }) => ({
    ...rest,
    song_count: songs.length,
  }));

  // ── Recently played — pure in-memory ring buffer (max 50) ────────────────────
  // audioUrl is intentionally NOT kept: JioSaavn URLs expire and would cause
  // silent skips when the song is used as part of a queue later in the session.

  const addToRecentlyPlayed = useCallback((song: Song) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const { audioUrl: _dropped, ...songMeta } = song as any;
      return [songMeta as Song, ...filtered].slice(0, 50);
    });
  }, []);

  // ── Like / Unlike ─────────────────────────────────────────────────────────────

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

  // ── Playlist CRUD (session-only, synced to backend where API exists) ──────────

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
          p.id === playlistId
            ? { ...p, songs: p.songs.filter((s) => s.id !== songId) }
            : p
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