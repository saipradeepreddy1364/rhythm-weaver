import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, AppState } from 'react-native'
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import type { Song } from "../data/songs";
import { useAuth } from "./AuthContext";
import { localStorage } from "../lib/storage";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  loadLikedAlbums: () => Promise<void>;
  downloadSong: (song: Song) => Promise<void>;
  deleteDownloadedSong: (songId: string) => Promise<void>;
  isDownloaded: (songId: string) => boolean;
  likedAlbums: AlbumData[];
  toggleLikeAlbum: (album: AlbumData) => Promise<void>;
  isAlbumLiked: (album: AlbumData) => boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function normalizeSongTitle(title: string, movie?: string, album?: string): string {
  let s = (title || "").toLowerCase().trim();

  const cleanAndReplace = (name?: string) => {
    if (!name) return;
    const n = name.toLowerCase().trim();
    if (n.length > 2) {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`\\s*[-|–|—|:]?\\s*\\b${escaped}\\b`, "gi"), "");
    }
  };
  
  cleanAndReplace(movie);
  cleanAndReplace(album);

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

// ─── Context ───────────────────────────────────────────────────────────────────

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [likedSongs, setLikedSongs]           = useState<Song[]>([]);
  const [recentlyPlayed, setRecentlyPlayed]   = useState<Song[]>([]);
  const [storedPlaylists, setStoredPlaylists] = useState<StoredPlaylist[]>([]);
  const [downloadedSongs, setDownloadedSongs] = useState<Song[]>([]);
  const [downloadingIds, setDownloadingIds]   = useState<string[]>([]);
  const [likedAlbums, setLikedAlbums]         = useState<AlbumData[]>([]);

  // Load downloads from localStorage after initialization
  useEffect(() => {
    const loadDownloads = async () => {
      try {
        await localStorage.ensureInitialized();
        const raw = localStorage.getItem("rw_downloads");
        if (raw) {
          const songs: Song[] = JSON.parse(raw);
          const mapped = songs.map((s) => {
            let audioUrl = s.audioUrl;
            if (audioUrl && !audioUrl.startsWith("http") && !audioUrl.startsWith("file://")) {
              audioUrl = (FileSystem.documentDirectory || "") + audioUrl;
            }
            let albumArt = s.albumArt;
            if (albumArt && !albumArt.startsWith("http") && !albumArt.startsWith("file://")) {
              albumArt = (FileSystem.documentDirectory || "") + albumArt;
            }
            return {
              ...s,
              audioUrl,
              albumArt,
            };
          });
          setDownloadedSongs(mapped);
        }
      } catch (err) {
        console.warn("Failed to load downloaded songs:", err);
      }
    };
    loadDownloads();
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
        const audioUrl = song.audioUrl || `https://musicbackend-7a1o.onrender.com/api/songs/${song.id}/stream`;
        const audioLocalUri = FileSystem.documentDirectory + song.id + ".mp3";

        // Download audio file
        const audioResult = await FileSystem.downloadAsync(audioUrl, audioLocalUri);
        if (audioResult.status !== 200) {
          try {
            await FileSystem.deleteAsync(audioLocalUri, { idempotent: true });
          } catch {}
          throw new Error(`Failed to download audio. HTTP Status: ${audioResult.status}`);
        }

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
          audioUrl: `${song.id}.mp3`,
          albumArt: artLocalUri ? `${song.id}_art.jpg` : song.albumArt,
        };

        setDownloadedSongs((prev) => {
          const inMemorySong = {
            ...downloadedSong,
            audioUrl: (FileSystem.documentDirectory || "") + downloadedSong.audioUrl,
            albumArt: downloadedSong.albumArt.endsWith("_art.jpg")
              ? (FileSystem.documentDirectory || "") + downloadedSong.albumArt
              : downloadedSong.albumArt,
          };
          const next = [...prev, inMemorySong];
          
          const stripped = next.map((s) => {
            let aUrl = s.audioUrl || "";
            if (FileSystem.documentDirectory && aUrl.startsWith(FileSystem.documentDirectory)) {
              aUrl = aUrl.replace(FileSystem.documentDirectory, "");
            }
            let aArt = s.albumArt || "";
            if (FileSystem.documentDirectory && aArt.startsWith(FileSystem.documentDirectory)) {
              aArt = aArt.replace(FileSystem.documentDirectory, "");
            }
            return {
              ...s,
              audioUrl: aUrl,
              albumArt: aArt,
            };
          });
          localStorage.setItem("rw_downloads", JSON.stringify(stripped));
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
      const audioLocalUri = (FileSystem.documentDirectory || "") + songId + ".mp3";
      const artLocalUri = (FileSystem.documentDirectory || "") + songId + "_art.jpg";

      await FileSystem.deleteAsync(audioLocalUri, { idempotent: true });
      await FileSystem.deleteAsync(artLocalUri, { idempotent: true });

      setDownloadedSongs((prev) => {
        const next = prev.filter((s) => s.id !== songId);
        const stripped = next.map((s) => {
          let aUrl = s.audioUrl || "";
          if (FileSystem.documentDirectory && aUrl.startsWith(FileSystem.documentDirectory)) {
            aUrl = aUrl.replace(FileSystem.documentDirectory, "");
          }
          let aArt = s.albumArt || "";
          if (FileSystem.documentDirectory && aArt.startsWith(FileSystem.documentDirectory)) {
            aArt = aArt.replace(FileSystem.documentDirectory, "");
          }
          return {
            ...s,
            audioUrl: aUrl,
            albumArt: aArt,
          };
        });
        localStorage.setItem("rw_downloads", JSON.stringify(stripped));
        return next;
      });
    } catch (err) {
      console.error("Failed to delete downloaded song:", err);
    }
  }, []);

  // ── Load liked albums ────────────────────────────────────────────────────────

  const loadLikedAlbums = useCallback(async () => {
    try {
      await localStorage.ensureInitialized();
      const rawAlbums = localStorage.getItem("rw_liked_albums") || localStorage.getItem("rw_guest_liked_albums");
      if (rawAlbums) {
        setLikedAlbums(JSON.parse(rawAlbums));
      } else {
        setLikedAlbums([]);
      }
    } catch (err) {
      console.warn("Failed to load liked albums:", err);
      setLikedAlbums([]);
    }
  }, []);

  // ── Load liked songs ─────────────────────────────────────────────────────────

  const loadLikedSongs = useCallback(async () => {
    try {
      await localStorage.ensureInitialized();
      const raw = localStorage.getItem("rw_liked_songs")
        || localStorage.getItem("rw_guest_liked");
      if (raw) {
        setLikedSongs(JSON.parse(raw));
        return;
      }
    } catch { /* ignore */ }
    setLikedSongs([]);
  }, []);

  // ── Load recently played ─────────────────────────────────────────────────────

  const loadRecentlyPlayed = useCallback(async () => {
    try {
      await localStorage.ensureInitialized();
      const raw = localStorage.getItem("rw_recently_played");
      if (raw) {
        setRecentlyPlayed(JSON.parse(raw));
        return;
      }
    } catch { /* ignore */ }
    setRecentlyPlayed([]);
  }, []);

  // ── Load playlists ───────────────────────────────────────────────────────────

  const loadPlaylists = useCallback(async () => {
    try {
      await localStorage.ensureInitialized();
      const raw = localStorage.getItem("rw_playlists");
      if (raw) {
        setStoredPlaylists(JSON.parse(raw));
        return;
      }
    } catch { /* ignore */ }
    setStoredPlaylists([]);
  }, []);

  // Trigger loads on mount or initially
  useEffect(() => {
    loadLikedSongs();
    loadRecentlyPlayed();
    loadPlaylists();
    loadLikedAlbums();
  }, [loadLikedSongs, loadRecentlyPlayed, loadPlaylists, loadLikedAlbums]);

  // Re-read liked songs from AsyncStorage when app comes back to foreground
  // This ensures data saved in a previous session is always current
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadLikedSongs();
        loadLikedAlbums();
        loadPlaylists();
      }
    });
    return () => sub.remove();
  }, [loadLikedSongs, loadLikedAlbums, loadPlaylists]);

  // ── Derived playlists ─────────────────────────────────────────────────────────

  const playlists: Playlist[] = storedPlaylists.map(({ songs, ...rest }) => ({
    ...rest,
    song_count: rest.song_count ?? songs.length,
  }));

  // ── Recently played — persisted to in-memory & local storage ────────────────

  const addToRecentlyPlayed = useCallback(async (song: Song) => {
    let newRecent: Song[] = [];
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      newRecent = [song, ...filtered].slice(0, 50);
      return newRecent;
    });

    try {
      localStorage.setItem("rw_recently_played", JSON.stringify(newRecent));
    } catch { /* ignore */ }
  }, []);

  // ── Like / Unlike ─────────────────────────────────────────────────────────────

  const isLiked = useCallback(
    (song: Song) => {
      if (!song) return false;
      const queryNorm = normalizeSongTitle(song.title, song.movie || song.album);
      return likedSongs.some((s) => {
        if (s.id === song.id) return true;
        const sNorm = normalizeSongTitle(s.title, s.movie || s.album);
        return sNorm && queryNorm && sNorm === queryNorm;
      });
    },
    [likedSongs]
  );

  const toggleLike = useCallback(
    async (song: Song) => {
      if (!song) return;
      await localStorage.ensureInitialized();
      
      const queryNorm = normalizeSongTitle(song.title, song.movie || song.album);
      
      setLikedSongs((prev) => {
        const matched = prev.filter((s) => {
          if (s.id === song.id) return true;
          const sNorm = normalizeSongTitle(s.title, s.movie || s.album);
          return sNorm && queryNorm && sNorm === queryNorm;
        });
        
        const liked = matched.length > 0;
        const nextLiked = liked
          ? prev.filter((s) => {
              if (s.id === song.id) return false;
              const sNorm = normalizeSongTitle(s.title, s.movie || s.album);
              return !(sNorm && queryNorm && sNorm === queryNorm);
            })
          : [song, ...prev];
        
        setTimeout(() => {
          try {
            localStorage.setItem("rw_liked_songs", JSON.stringify(nextLiked));
          } catch {}
        }, 0);
        return nextLiked;
      });
    },
    []
  );

  // ── Playlist CRUD (100% localStorage-backed) ─────────────────────────────────

  const createNewPlaylist = useCallback(
    async (name: string): Promise<Playlist | null> => {
      const newId = `local_${Math.random().toString(36).substring(2, 10)}`;
      const created: StoredPlaylist = {
        id: newId,
        name,
        created_at: new Date().toISOString(),
        cover_art: undefined,
        song_count: 0,
        songs: [],
      };
      setStoredPlaylists((prev) => {
        const list = [created, ...prev];
        setTimeout(() => {
          try {
            localStorage.setItem("rw_playlists", JSON.stringify(list));
          } catch {}
        }, 0);
        return list;
      });
      return created;
    },
    []
  );

  const removePlaylist = useCallback(
    async (playlistId: string) => {
      setStoredPlaylists((prev) => {
        const list = prev.filter((p) => p.id !== playlistId);
        setTimeout(() => {
          try {
            localStorage.setItem("rw_playlists", JSON.stringify(list));
          } catch {}
        }, 0);
        return list;
      });
    },
    []
  );

  const updatePlaylistName = useCallback(
    async (playlistId: string, newName: string) => {
      setStoredPlaylists((prev) => {
        const list = prev.map((p) => (p.id === playlistId ? { ...p, name: newName } : p));
        setTimeout(() => {
          try {
            localStorage.setItem("rw_playlists", JSON.stringify(list));
          } catch {}
        }, 0);
        return list;
      });
    },
    []
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, song: Song) => {
      setStoredPlaylists((prev) => {
        const list = prev.map((p) => {
          if (p.id !== playlistId) return p;
          if (p.songs.some((s) => s.id === song.id)) return p;
          return {
            ...p,
            song_count: (p.song_count ?? 0) + 1,
            songs: [...p.songs, song],
          };
        });
        setTimeout(() => {
          try {
            localStorage.setItem("rw_playlists", JSON.stringify(list));
          } catch {}
        }, 0);
        return list;
      });
    },
    []
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      setStoredPlaylists((prev) => {
        const list = prev.map((p) => {
          if (p.id !== playlistId) return p;
          return {
            ...p,
            song_count: Math.max(0, (p.song_count ?? 1) - 1),
            songs: p.songs.filter((s) => s.id !== songId),
          };
        });
        setTimeout(() => {
          try {
            localStorage.setItem("rw_playlists", JSON.stringify(list));
          } catch {}
        }, 0);
        return list;
      });
    },
    []
  );

  const getPlaylist = useCallback(
    async (playlistId: string): Promise<Song[]> => {
      const match = storedPlaylists.find(p => p.id === playlistId);
      return match?.songs || [];
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
      await localStorage.ensureInitialized();

      setLikedAlbums((prev) => {
        const isLiked = prev.some(
          (a) => a.title.toLowerCase().trim() === album.title.toLowerCase().trim()
        );
        const nextLiked = isLiked
          ? prev.filter((a) => a.title.toLowerCase().trim() !== album.title.toLowerCase().trim())
          : [album, ...prev];
        
        setTimeout(() => {
          try {
            localStorage.setItem("rw_liked_albums", JSON.stringify(nextLiked));
          } catch (err) {
            console.warn("Failed to save liked albums:", err);
          }
        }, 0);
        return nextLiked;
      });
    },
    []
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
        loadLikedAlbums,
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