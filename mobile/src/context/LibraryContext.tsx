import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image } from 'react-native'
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { supabase as baseSupabase } from "../lib/supabase/client";
const supabase = baseSupabase as any;
import type { Song } from "../data/songs";
import { useAuth } from "./AuthContext";
import { localStorage } from "../lib/storage";
import * as FileSystem from "expo-file-system";

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
  downloadedSongs: Song[];
  downloadingIds: string[];
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
  downloadSong: (song: Song) => Promise<void>;
  deleteDownloadedSong: (songId: string) => Promise<void>;
  isDownloaded: (songId: string) => boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function dbRowToSong(row: any): Song {
  // If the database uses JSONB column schema, extract from song_data
  if (row.song_data) {
    const song = typeof row.song_data === "string" ? JSON.parse(row.song_data) : row.song_data;
    return {
      ...song,
      id: row.song_id || song.id || row.id,
    };
  }
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
  const [downloadedSongs, setDownloadedSongs] = useState<Song[]>([]);
  const [downloadingIds, setDownloadingIds]   = useState<string[]>([]);

  // Load downloads from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rw_downloads");
      if (raw) {
        setDownloadedSongs(JSON.parse(raw));
      }
    } catch (err) {
      console.warn("Failed to load downloaded songs:", err);
    }
  }, []);

  const isDownloaded = useCallback(
    (songId: string) => downloadedSongs.some((s) => s.id === songId),
    [downloadedSongs]
  );

  const downloadSong = useCallback(
    async (song: Song) => {
      if (downloadedSongs.some((s) => s.id === song.id)) return;
      setDownloadingIds((prev) => [...prev, song.id]);

      try {
        const audioUrl = song.audioUrl || `https://musicbackend-xg4u.onrender.com/api/songs/${song.id}/stream`;
        const audioLocalUri = FileSystem.documentDirectory + song.id + ".mp3";

        // Download audio file
        const audioResult = await FileSystem.downloadAsync(audioUrl, audioLocalUri);

        // Download album art if present
        let artLocalUri = "";
        if (song.albumArt) {
          try {
            const artResult = await FileSystem.downloadAsync(
              song.albumArt,
              FileSystem.documentDirectory + song.id + "_art.jpg"
            );
            artLocalUri = artResult.uri;
          } catch {
            // Fallback to online image
          }
        }

        const downloadedSong: Song = {
          ...song,
          audioUrl: audioResult.uri,
          albumArt: artLocalUri || song.albumArt,
        };

        setDownloadedSongs((prev) => {
          const next = [...prev, downloadedSong];
          localStorage.setItem("rw_downloads", JSON.stringify(next));
          return next;
        });
      } catch (err) {
        console.error("Failed to download song:", err);
      } finally {
        setDownloadingIds((prev) => prev.filter((id) => id !== song.id));
      }
    },
    [downloadedSongs]
  );

  const deleteDownloadedSong = useCallback(async (songId: string) => {
    try {
      const audioLocalUri = FileSystem.documentDirectory + songId + ".mp3";
      const artLocalUri = FileSystem.documentDirectory + songId + "_art.jpg";

      await FileSystem.deleteAsync(audioLocalUri, { idempotent: true });
      await FileSystem.deleteAsync(artLocalUri, { idempotent: true });

      setDownloadedSongs((prev) => {
        const next = prev.filter((s) => s.id !== songId);
        localStorage.setItem("rw_downloads", JSON.stringify(next));
        return next;
      });
    } catch (err) {
      console.error("Failed to delete downloaded song:", err);
    }
  }, []);

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
      // Load local guest data from localStorage
      try {
        const localLiked = localStorage.getItem("rw_guest_liked");
        setLikedSongs(localLiked ? JSON.parse(localLiked) : []);

        const localRecent = localStorage.getItem("rw_guest_recent");
        setRecentlyPlayed(localRecent ? JSON.parse(localRecent) : []);

        const localPlaylists = localStorage.getItem("rw_guest_playlists");
        setStoredPlaylists(localPlaylists ? JSON.parse(localPlaylists) : []);
      } catch (err) {
        console.warn("Failed to load local guest library data:", err);
        setLikedSongs([]);
        setRecentlyPlayed([]);
        setStoredPlaylists([]);
      }
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
      const next = [song, ...filtered].slice(0, 50);
      if (!user) {
        try {
          localStorage.setItem("rw_guest_recent", JSON.stringify(next));
        } catch (err) {
          console.warn("Failed to save guest recent songs:", err);
        }
      }
      return next;
    });

    if (!user) return;

    try {
      const audioUrl = song.audioUrl || `https://musicbackend-xg4u.onrender.com/api/songs/${song.id}/stream`;
      const { error } = await supabase.from("recently_played").upsert({
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

      if (error) {
        // Fallback to JSONB schema upsert
        await supabase.from("recently_played").upsert({
          user_id: user.id,
          song_id: song.id,
          song_data: song,
          played_at: new Date().toISOString(),
        }, { onConflict: "user_id,song_id" });
      }
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
      const liked = likedSongs.some((s) => s.id === song.id);
      if (!user) {
        let nextLiked: Song[];
        if (liked) {
          nextLiked = likedSongs.filter((s) => s.id !== song.id);
        } else {
          nextLiked = [song, ...likedSongs];
        }
        setLikedSongs(nextLiked);
        try {
          localStorage.setItem("rw_guest_liked", JSON.stringify(nextLiked));
        } catch (err) {
          console.warn("Failed to save guest liked songs:", err);
        }
        return;
      }
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
          const { error } = await supabase.from("liked_songs").insert({
            user_id: user.id,
            song_id: song.id,
            song_title: song.title,
            song_artist: song.artist,
            song_album: song.album || song.movie || "",
            song_album_art: song.albumArt || "",
            song_audio_url: audioUrl,
            song_duration: song.duration || 0,
          });

          if (error) {
            // Fallback to JSONB schema insert
            await supabase.from("liked_songs").insert({
              user_id: user.id,
              song_id: song.id,
              song_data: song,
            });
          }
        }
      } catch (err) {
        console.error("Failed to toggle like song:", err);
      }
    },
    [likedSongs, user]
  );

  // ── Playlist CRUD (Supabase database backed & Guest Local storage fallback) ──

  const createNewPlaylist = useCallback(
    async (name: string): Promise<Playlist | null> => {
      if (!user) {
        const newP: StoredPlaylist = {
          id: "guest_" + Date.now(),
          name,
          created_at: new Date().toISOString(),
          cover_art: undefined,
          song_count: 0,
          songs: [],
        };
        setStoredPlaylists((prev) => {
          const next = [newP, ...prev];
          try {
            localStorage.setItem("rw_guest_playlists", JSON.stringify(next));
          } catch (err) {
            console.warn("Failed to save guest playlists:", err);
          }
          return next;
        });
        return newP;
      }
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
      if (!user) {
        setStoredPlaylists((prev) => {
          const next = prev.filter((p) => p.id !== playlistId);
          try {
            localStorage.setItem("rw_guest_playlists", JSON.stringify(next));
          } catch {}
          return next;
        });
        return;
      }
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
      if (!user) {
        setStoredPlaylists((prev) => {
          const next = prev.map((p) => (p.id === playlistId ? { ...p, name: newName } : p));
          try {
            localStorage.setItem("rw_guest_playlists", JSON.stringify(next));
          } catch {}
          return next;
        });
        return;
      }
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
      if (!user) {
        setStoredPlaylists((prev) => {
          const next = prev.map((p) => {
            if (p.id !== playlistId) return p;
            if (p.songs.some((s) => s.id === song.id)) return p;
            return {
              ...p,
              song_count: (p.song_count ?? 0) + 1,
              songs: [...p.songs, song],
            };
          });
          try {
            localStorage.setItem("rw_guest_playlists", JSON.stringify(next));
          } catch {}
          return next;
        });
        return;
      }
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
        const { error } = await supabase.from("playlist_songs").insert({
          playlist_id: playlistId,
          song_id: song.id,
          song_title: song.title,
          song_artist: song.artist,
          song_album: song.album || song.movie || "",
          song_album_art: song.albumArt || "",
          song_audio_url: audioUrl,
          song_duration: song.duration || 0,
          user_id: user.id,
        });

        if (error) {
          // Fallback to JSONB schema insert
          await supabase.from("playlist_songs").insert({
            playlist_id: playlistId,
            user_id: user.id,
            song_id: song.id,
            song_data: song,
          });
        }
      } catch (err) {
        console.error("Failed to add song to playlist:", err);
      }
    },
    [user]
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      if (!user) {
        setStoredPlaylists((prev) => {
          const next = prev.map((p) => {
            if (p.id !== playlistId) return p;
            return {
              ...p,
              song_count: Math.max(0, (p.song_count ?? 1) - 1),
              songs: p.songs.filter((s) => s.id !== songId),
            };
          });
          try {
            localStorage.setItem("rw_guest_playlists", JSON.stringify(next));
          } catch {}
          return next;
        });
        return;
      }
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
      if (playlistId.startsWith("guest_")) {
        const p = storedPlaylists.find((p) => p.id === playlistId);
        return p ? p.songs : [];
      }
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
    [storedPlaylists]
  );

  return (
    <LibraryContext.Provider
      value={{
        likedSongs,
        recentlyPlayed,
        playlists,
        downloadedSongs,
        downloadingIds,
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
        downloadSong,
        deleteDownloadedSong,
        isDownloaded,
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