import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { supabase } from "@/lib/supabase/client";
import type { Song } from "@/data/songs";
import { useAuth } from "./AuthContext";

// ─── Types ────────────────=====================================================

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

function dbRowToSong(row: any): Song {
  return {
    id:       row.song_id || row.id,
    title:    row.song_title || row.title || "",
    artist:   row.song_artist || row.artist || "",
    albumArt: row.song_album_art || row.albumArt || "",
    audioUrl: row.song_audio_url || row.audioUrl || `https://musicbackend-xg4u.onrender.com/api/songs/${row.song_id || row.id}/stream`,
    duration: row.song_duration || row.duration || 0,
    album:    row.song_album || row.album || "",
    movie:    row.song_album || row.movie || "",
  };
}

// ─── Context ───────────────────────────────────────────────────────────────────

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [likedSongs, setLikedSongs]           = useState<Song[]>([]);
  const [recentlyPlayed, setRecentlyPlayed]   = useState<Song[]>([]);
  const [storedPlaylists, setStoredPlaylists] = useState<StoredPlaylist[]>([]);

  // ── Load liked songs from Supabase ───────────────────────────────────────────

  const loadLikedSongs = useCallback(async () => {
    if (!user) {
      setLikedSongs([]);
      return;
    }
    try {
      const { data } = await supabase
        .from("liked_songs")
        .select("*")
        .eq("user_id", user.id)
        .order("liked_at", { ascending: false });

      if (data) {
        setLikedSongs(data.map(dbRowToSong));
      }
    } catch (err) {
      console.error("Failed to load liked songs:", err);
    }
  }, [user]);

  // ── Load recently played from Supabase ───────────────────────────────────────

  const loadRecentlyPlayed = useCallback(async () => {
    if (!user) {
      setRecentlyPlayed([]);
      return;
    }
    try {
      const { data } = await supabase
        .from("recently_played")
        .select("*")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(50);

      if (data) {
        setRecentlyPlayed(data.map(dbRowToSong));
      }
    } catch (err) {
      console.error("Failed to load recently played:", err);
    }
  }, [user]);

  // ── Load playlists from Supabase ─────────────────────────────────────────────

  const loadPlaylists = useCallback(async () => {
    if (!user) {
      setStoredPlaylists([]);
      return;
    }
    try {
      const { data } = await supabase
        .from("playlists")
        .select(`
          *,
          playlist_songs(count)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (data) {
        setStoredPlaylists(data.map((p: any) => ({
          id: p.id,
          name: p.name,
          cover_art: p.cover_art || undefined,
          song_count: p.playlist_songs?.[0]?.count || 0,
          created_at: p.created_at,
          songs: []
        })));
      }
    } catch (err) {
      console.error("Failed to load playlists:", err);
    }
  }, [user]);

  // Trigger loads when user changes
  useEffect(() => {
    if (user) {
      loadLikedSongs();
      loadRecentlyPlayed();
      loadPlaylists();
    } else {
      setLikedSongs([]);
      setRecentlyPlayed([]);
      setStoredPlaylists([]);
    }
  }, [user, loadLikedSongs, loadRecentlyPlayed, loadPlaylists]);

  // ── Derived playlists ─────────────────────────────────────────────────────────

  const playlists: Playlist[] = storedPlaylists.map(({ songs, ...rest }) => ({
    ...rest,
    song_count: rest.song_count ?? songs.length,
  }));

  // ── Recently played — persisted to Supabase and in-memory ────────────────────

  const addToRecentlyPlayed = useCallback(async (song: Song) => {
    // Update local state instantly
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      return [song, ...filtered].slice(0, 50);
    });

    if (!user) return;

    try {
      const audioUrl = song.audioUrl || `https://musicbackend-xg4u.onrender.com/api/songs/${song.id}/stream`;
      await supabase.from("recently_played").upsert({
        user_id: user.id,
        song_id: song.id,
        song_title: song.title,
        song_artist: song.artist,
        song_album: song.album || song.movie || "",
        song_album_art: song.albumArt || "",
        song_audio_url: audioUrl,
        song_duration: song.duration || 0,
        played_at: new Date().toISOString(),
      }, { onConflict: "user_id,song_id" });
    } catch (err) {
      console.error("Failed to save recently played track:", err);
    }
  }, [user]);

  // ── Like / Unlike ─────────────────────────────────────────────────────────────

  const isLiked = useCallback(
    (songId: string) => likedSongs.some((s) => s.id === songId),
    [likedSongs]
  );

  const toggleLike = useCallback(
    async (song: Song) => {
      if (!user) return;
      const liked = likedSongs.some((s) => s.id === song.id);
      try {
        if (liked) {
          setLikedSongs((prev) => prev.filter((s) => s.id !== song.id));
          await supabase
            .from("liked_songs")
            .delete()
            .eq("user_id", user.id)
            .eq("song_id", song.id);
        } else {
          setLikedSongs((prev) => [song, ...prev]);
          const audioUrl = song.audioUrl || `https://musicbackend-xg4u.onrender.com/api/songs/${song.id}/stream`;
          await supabase.from("liked_songs").insert({
            user_id: user.id,
            song_id: song.id,
            song_title: song.title,
            song_artist: song.artist,
            song_album: song.album || song.movie || "",
            song_album_art: song.albumArt || "",
            song_audio_url: audioUrl,
            song_duration: song.duration || 0,
          });
        }
      } catch (err) {
        console.error("Failed to toggle like song:", err);
      }
    },
    [likedSongs, user]
  );

  // ── Playlist CRUD (Supabase database backed) ─────────────────────────────────

  const createNewPlaylist = useCallback(
    async (name: string): Promise<Playlist | null> => {
      if (!user) return null;
      try {
        const { data, error } = await supabase
          .from("playlists")
          .insert({
            user_id: user.id,
            name,
          })
          .select()
          .single();

        if (data) {
          const created: StoredPlaylist = {
            id: data.id,
            name: data.name,
            created_at: data.created_at,
            cover_art: data.cover_art || undefined,
            song_count: 0,
            songs: [],
          };
          setStoredPlaylists((prev) => [created, ...prev]);
          return created;
        }
      } catch (err) {
        console.error("Failed to create playlist:", err);
      }
      return null;
    },
    [user]
  );

  const removePlaylist = useCallback(
    async (playlistId: string) => {
      if (!user) return;
      try {
        setStoredPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
        await supabase.from("playlists").delete().eq("id", playlistId);
      } catch (err) {
        console.error("Failed to delete playlist:", err);
      }
    },
    [user]
  );

  const updatePlaylistName = useCallback(
    async (playlistId: string, newName: string) => {
      if (!user) return;
      try {
        setStoredPlaylists((prev) =>
          prev.map((p) => (p.id === playlistId ? { ...p, name: newName } : p))
        );
        await supabase.from("playlists").update({ name: newName }).eq("id", playlistId);
      } catch (err) {
        console.error("Failed to update playlist name:", err);
      }
    },
    [user]
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, song: Song) => {
      if (!user) return;
      try {
        // Update local state song count
        setStoredPlaylists((prev) =>
          prev.map((p) => {
            if (p.id !== playlistId) return p;
            if (p.songs.some((s) => s.id === song.id)) return p;
            return {
              ...p,
              song_count: (p.song_count ?? 0) + 1,
              songs: [...p.songs, song],
            };
          })
        );

        const audioUrl = song.audioUrl || `https://musicbackend-xg4u.onrender.com/api/songs/${song.id}/stream`;
        await supabase.from("playlist_songs").insert({
          playlist_id: playlistId,
          song_id: song.id,
          song_title: song.title,
          song_artist: song.artist,
          song_album: song.album || song.movie || "",
          song_album_art: song.albumArt || "",
          song_audio_url: audioUrl,
          song_duration: song.duration || 0,
        });
      } catch (err) {
        console.error("Failed to add song to playlist:", err);
      }
    },
    [user]
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      if (!user) return;
      try {
        setStoredPlaylists((prev) =>
          prev.map((p) => {
            if (p.id !== playlistId) return p;
            return {
              ...p,
              song_count: Math.max(0, (p.song_count ?? 1) - 1),
              songs: p.songs.filter((s) => s.id !== songId),
            };
          })
        );

        await supabase
          .from("playlist_songs")
          .delete()
          .eq("playlist_id", playlistId)
          .eq("song_id", songId);
      } catch (err) {
        console.error("Failed to remove song from playlist:", err);
      }
    },
    [user]
  );

  const getPlaylist = useCallback(
    async (playlistId: string): Promise<Song[]> => {
      try {
        const { data } = await supabase
          .from("playlist_songs")
          .select("*")
          .eq("playlist_id", playlistId)
          .order("added_at", { ascending: true });

        if (data) {
          const songs = data.map(dbRowToSong);
          // Update cache in storedPlaylists
          setStoredPlaylists((prev) =>
            prev.map((p) => (p.id === playlistId ? { ...p, songs, song_count: songs.length } : p))
          );
          return songs;
        }
      } catch (err) {
        console.error("Failed to load playlist songs:", err);
      }
      return [];
    },
    []
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