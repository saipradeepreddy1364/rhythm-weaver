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

export interface AlbumData {
  title: string;
  coverArt: string;
  songs: Song[];
  type: string;
  query?: string;
  fullyLoaded?: boolean;
}

interface LibraryContextType {
  likedSongs: Song[];
  recentlyPlayed: Song[];
  playlists: Playlist[];
  downloadedSongs: Song[];
  downloadingIds: string[];
  toggleLike: (song: Song) => Promise<void>;
  isLiked: (song: Song) => boolean;
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
  likedAlbums: AlbumData[];
  toggleLikeAlbum: (album: AlbumData) => Promise<void>;
  isAlbumLiked: (album: AlbumData) => boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeSongTitle(title: string): string {
  let s = (title || "").toLowerCase().trim();
  while (true) {
    const prev = s;
    s = s
      .replace(/\s*\((from|original|soundtrack|ost|single|recreated|reprise|remix|version|extended|cover|acoustic|live|unplugged|instrumental|remastered|lofi|slowed|reverb|edit|theme|feat|ft|featuring|mix|lyrical|video)[^)]*\)/gi, "")
      .replace(/\s*\[(from|original|soundtrack|ost|single|recreated|reprise|remix|version|extended|cover|acoustic|live|unplugged|instrumental|remastered|lofi|slowed|reverb|edit|theme|feat|ft|featuring|mix|lyrical|video)[^\]]*\]/gi, "")
      .trim();
    if (s === prev) break;
  }
  s = s.replace(/\s*-\s*(single|recreated|reprise|remix|version|extended|cover|acoustic|live|unplugged|instrumental|remastered|lofi|slowed|reverb|edit|theme|mix|lyrical|video)\b.*/gi, "");
  s = s.replace(/\s*(feat\.?|ft\.?|featuring)\s+.*/gi, "");
  s = s.replace(/\s*\([^)]*\)$/gi, "");
  s = s.replace(/\s*\[[^\]]*\]$/gi, "");
  s = s.replace(/[^a-z0-9\s]/gi, "").replace(/\s+/g, " ").trim();
  return s;
}

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
  const { user, loading } = useAuth();

  const [likedAlbums, setLikedAlbums]         = useState<AlbumData[]>([]);
  const [likedSongs, setLikedSongs]           = useState<Song[]>([]);
  const [recentlyPlayed, setRecentlyPlayed]   = useState<Song[]>([]);
  const [storedPlaylists, setStoredPlaylists] = useState<StoredPlaylist[]>([]);
  const [downloadedSongs, setDownloadedSongs] = useState<Song[]>([]);
  const [downloadingIds, setDownloadingIds]   = useState<string[]>([]);

  // Load downloads from localStorage on mount
  useEffect(() => {
    let active = true;
    localStorage.ensureInitialized().then(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem("rw_downloads");
        if (raw) {
          setDownloadedSongs(JSON.parse(raw));
        }
      } catch (err) {
        console.warn("Failed to load downloaded songs:", err);
      }
    });
    return () => {
      active = false;
    };
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
        let audioUrl = song.audioUrl;
        if (!audioUrl || audioUrl.includes("saavncdn.com") || audioUrl.includes("oasth.me")) {
          audioUrl = `https://musicbackend-xg4u.onrender.com/api/songs/${song.id}/stream`;
        }
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

  // ── Load liked albums ────────────────────────────────────────────────────────

  const loadLikedAlbums = useCallback(async () => {
    if (!user) {
      try {
        const rawAlbums = localStorage.getItem("rw_guest_liked_albums") || localStorage.getItem("rw_liked_albums");
        if (rawAlbums) {
          setLikedAlbums(JSON.parse(rawAlbums));
        } else {
          setLikedAlbums([]);
        }
      } catch (err) {
        console.warn("Failed to load guest liked albums:", err);
      }
      return;
    }

    try {
      console.log("[Library] Loading liked albums from database...");
      const { data, error } = await supabase
        .from("liked_albums")
        .select("*")
        .eq("user_id", user.id)
        .order("liked_at", { ascending: false });

      if (error) {
        console.warn("[Library] Database load failed, falling back to local storage:", error.message);
        const userRaw = localStorage.getItem(`rw_user_liked_albums_${user.id}`);
        if (userRaw) {
          setLikedAlbums(JSON.parse(userRaw));
        } else {
          const genericRaw = localStorage.getItem("rw_liked_albums");
          if (genericRaw) {
            setLikedAlbums(JSON.parse(genericRaw));
          } else {
            setLikedAlbums([]);
          }
        }
      } else if (data) {
        const albums: AlbumData[] = data.map((row: any) => {
          let songs: Song[] = [];
          if (row.songs_data) {
            songs = typeof row.songs_data === "string" ? JSON.parse(row.songs_data) : row.songs_data;
          }
          return {
            title: row.album_title,
            coverArt: row.cover_art || "",
            songs: songs,
            type: row.album_type || "album",
            fullyLoaded: true
          };
        });
        setLikedAlbums(albums);
      }
    } catch (err) {
      console.warn("Failed to load liked albums from database:", err);
    }
  }, [user]);

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

  // Trigger loads when user changes or when authentication check completes
  useEffect(() => {
    if (loading) return; // Wait until authentication check is complete to avoid race conditions

    let active = true;
    localStorage.ensureInitialized().then(() => {
      if (!active) return;
      loadLikedAlbums();
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
    });
    return () => {
      active = false;
    };
  }, [user, loading, loadLikedSongs, loadRecentlyPlayed, loadPlaylists, loadLikedAlbums]);

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
    (song: Song) => {
      if (!song) return false;
      const queryNorm = normalizeSongTitle(song.title);
      return likedSongs.some((s) => {
        if (s.id === song.id) return true;
        const sNorm = normalizeSongTitle(s.title);
        return sNorm && queryNorm && sNorm === queryNorm;
      });
    },
    [likedSongs]
  );

  const toggleLike = useCallback(
    async (song: Song) => {
      if (!song) return;
      const queryNorm = normalizeSongTitle(song.title);
      const matched = likedSongs.filter((s) => {
        if (s.id === song.id) return true;
        const sNorm = normalizeSongTitle(s.title);
        return sNorm && queryNorm && sNorm === queryNorm;
      });
      const liked = matched.length > 0;
      if (!user) {
        let nextLiked: Song[];
        if (liked) {
          nextLiked = likedSongs.filter((s) => {
            if (s.id === song.id) return false;
            const sNorm = normalizeSongTitle(s.title);
            return !(sNorm && queryNorm && sNorm === queryNorm);
          });
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
          setLikedSongs((prev) => prev.filter((s) => {
            if (s.id === song.id) return false;
            const sNorm = normalizeSongTitle(s.title);
            return !(sNorm && queryNorm && sNorm === queryNorm);
          }));
          for (const ms of matched) {
            await supabase
              .from("liked_songs")
              .delete()
              .eq("user_id", user.id)
              .eq("song_id", ms.id);
          }
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



  const isAlbumLiked = useCallback(
    (album: AlbumData) => {
      if (!album) return false;
      return likedAlbums.some(
        (a) => a.title.toLowerCase().trim() === album.title.toLowerCase().trim()
      );
    },
    [likedAlbums]
  );

  const toggleLikeAlbum = useCallback(
    async (album: AlbumData) => {
      if (!album) return;

      let nextLiked: AlbumData[];
      const isLiked = likedAlbums.some(
        (a) => a.title.toLowerCase().trim() === album.title.toLowerCase().trim()
      );

      if (isLiked) {
        nextLiked = likedAlbums.filter(
          (a) => a.title.toLowerCase().trim() !== album.title.toLowerCase().trim()
        );
      } else {
        nextLiked = [album, ...likedAlbums];
      }

      setLikedAlbums(nextLiked);

      if (!user) {
        try {
          localStorage.setItem("rw_guest_liked_albums", JSON.stringify(nextLiked));
        } catch (err) {
          console.warn("Failed to save guest liked albums:", err);
        }
        return;
      }

      try {
        localStorage.setItem(`rw_user_liked_albums_${user.id}`, JSON.stringify(nextLiked));
      } catch (err) {
        console.warn("Failed to save user liked albums locally:", err);
      }

      try {
        if (isLiked) {
          const { error } = await supabase
            .from("liked_albums")
            .delete()
            .eq("user_id", user.id)
            .eq("album_title", album.title);
          
          if (error) {
            console.warn("[Library] DB delete failed (expected if table not created yet):", error.message);
          }
        } else {
          const { error } = await supabase.from("liked_albums").insert({
            user_id: user.id,
            album_title: album.title,
            cover_art: album.coverArt || "",
            album_type: album.type || "album",
            songs_data: album.songs || [],
          });

          if (error) {
            console.warn("[Library] DB insert failed (expected if table not created yet):", error.message);
          }
        }
      } catch (err) {
        console.warn("Failed to sync liked album change with database:", err);
      }
    },
    [likedAlbums, user]
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
        likedAlbums,
        toggleLikeAlbum,
        isAlbumLiked,
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