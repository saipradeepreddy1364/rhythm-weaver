import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, AppState, DeviceEventEmitter } from 'react-native'
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import type { Song } from "../data/songs";
import { useAuth } from "./AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { localStorage } from "../lib/storage";
import * as FileSystem from "expo-file-system";

// ─── Types ────────────────=====================================================

export interface Playlist {
  id: string;
  name: string;
  cover_art?: string;
  song_count?: number;
  created_at: string;
  songs?: Song[];
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
  removeFromPlaylist: (playlistId: string, song: string | Song) => Promise<void>;
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
  likedVideos: any[];
  toggleLikeVideo: (video: any) => Promise<void>;
  isVideoLiked: (video: any) => boolean;
  loadLikedVideos: () => Promise<void>;
}

// ─── Dual-Layer File System Backup Helper ────────────────────────────────────
const BACKUP_FILE_PATH = (FileSystem.documentDirectory || "") + "rw_library_backup.json";

async function saveLibraryToFileBackup(patch: {
  likedSongs?: Song[];
  likedAlbums?: AlbumData[];
  likedVideos?: any[];
  playlists?: StoredPlaylist[];
  recentlyPlayed?: Song[];
}) {
  try {
    let currentData: any = {};
    const fileInfo = await FileSystem.getInfoAsync(BACKUP_FILE_PATH);
    if (fileInfo.exists) {
      const raw = await FileSystem.readAsStringAsync(BACKUP_FILE_PATH);
      if (raw) {
        try { currentData = JSON.parse(raw); } catch {}
      }
    }
    const updatedData = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ...currentData,
      ...patch,
    };
    await FileSystem.writeAsStringAsync(BACKUP_FILE_PATH, JSON.stringify(updatedData));
  } catch (err) {
    console.warn("Failed to write library backup file:", err);
  }
}

async function readLibraryFromFileBackup(): Promise<any | null> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(BACKUP_FILE_PATH);
    if (fileInfo.exists) {
      const raw = await FileSystem.readAsStringAsync(BACKUP_FILE_PATH);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.warn("Failed to read library backup file:", err);
  }
  return null;
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

export function deduplicateSongs(songs: Song[]): Song[] {
  if (!Array.isArray(songs)) return [];
  const seenIds = new Set<string>();
  const seenTitleArtist = new Set<string>();
  return songs.filter((s) => {
    if (!s || !s.title) return false;
    const idKey = s.id ? String(s.id).trim() : "";
    if (idKey && seenIds.has(idKey)) return false;

    const exactTitleArtist = `${s.title.toLowerCase().trim()}___${(s.artist || '').toLowerCase().trim()}`;
    if (seenTitleArtist.has(exactTitleArtist)) return false;

    if (idKey) seenIds.add(idKey);
    seenTitleArtist.add(exactTitleArtist);
    return true;
  });
}

// ─── Context ───────────────────────────────────────────────────────────────────

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [likedSongs, setLikedSongs]           = useState<Song[]>([]);
  const likedSongsRef = useRef<Song[]>([]);
  likedSongsRef.current = likedSongs;
  const likedSongsSeq = useRef(0); // bumps on every write; loads check this before applying
  const [recentlyPlayed, setRecentlyPlayed]   = useState<Song[]>([]);
  const [storedPlaylists, setStoredPlaylists] = useState<StoredPlaylist[]>([]);
  const [downloadedSongs, setDownloadedSongs] = useState<Song[]>([]);
  const [downloadingIds, setDownloadingIds]   = useState<string[]>([]);
  const [likedAlbums, setLikedAlbums]         = useState<AlbumData[]>([]);
  const likedAlbumsRef = useRef<AlbumData[]>([]);
  likedAlbumsRef.current = likedAlbums;

  const [likedVideos, setLikedVideos]         = useState<any[]>([]);
  const likedVideosRef = useRef<any[]>([]);
  likedVideosRef.current = likedVideos;
  const likedVideosSeq = useRef(0);


  // ── Single sequential liked-songs initializer ─────────────────────────────
  // Migration runs FIRST, then load — no race condition possible.
  const initLikedSongs = useCallback(async () => {
    try {
      // Step 1: Migrate legacy guest key → canonical key (only if needed)
      const canonical = await localStorage.getItemAsync("rw_liked_songs");
      const guest = await localStorage.getItemAsync("rw_guest_liked");
      if (guest) {
        try {
          const guestSongs: Song[] = JSON.parse(guest);
          if (Array.isArray(guestSongs) && guestSongs.length > 0) {
            if (!canonical) {
              // No canonical yet — move guest directly
              await localStorage.setItemAsync("rw_liked_songs", guest);
            } else {
              // Both exist — merge, then write canonical
              const canonicalSongs: Song[] = JSON.parse(canonical) || [];
              const canonicalIds = new Set((canonicalSongs || []).map((s: Song) => s.id));
              const merged = [...canonicalSongs, ...guestSongs.filter((s: Song) => !canonicalIds.has(s.id))];
              await localStorage.setItemAsync("rw_liked_songs", JSON.stringify(merged));
            }
          }
          await localStorage.removeItemAsync("rw_guest_liked");
        } catch { /* bad JSON, just remove guest key */ }
      }

      // Step 2: Migrate legacy album guest key
      const canonicalAlbums = await localStorage.getItemAsync("rw_liked_albums");
      const guestAlbums = await localStorage.getItemAsync("rw_guest_liked_albums");
      if (guestAlbums) {
        try {
          const guestAlbumData: AlbumData[] = JSON.parse(guestAlbums);
          if (Array.isArray(guestAlbumData) && guestAlbumData.length > 0 && !canonicalAlbums) {
            await localStorage.setItemAsync("rw_liked_albums", guestAlbums);
          }
          await localStorage.removeItemAsync("rw_guest_liked_albums");
        } catch {}
      }

      // Step 2.5: Load file-system backup if storage keys are empty
      const fileBackup = await readLibraryFromFileBackup();

      // Step 3: Load liked songs from canonical key or backup file
      let raw = await localStorage.getItemAsync("rw_liked_songs");
      if (!raw && fileBackup?.likedSongs && Array.isArray(fileBackup.likedSongs)) {
        raw = JSON.stringify(fileBackup.likedSongs);
        await localStorage.setItemAsync("rw_liked_songs", raw);
      }
      try {
        if (raw && likedSongsSeq.current === 0) {
          const val = JSON.parse(raw);
          if (Array.isArray(val)) {
            likedSongsRef.current = val;
            setLikedSongs(val);
          }
        }
      } catch {}

      // Step 4: Load liked albums
      let rawAlbums = await localStorage.getItemAsync("rw_liked_albums");
      if (!rawAlbums && fileBackup?.likedAlbums && Array.isArray(fileBackup.likedAlbums)) {
        rawAlbums = JSON.stringify(fileBackup.likedAlbums);
        await localStorage.setItemAsync("rw_liked_albums", rawAlbums);
      }
      try {
        if (rawAlbums) {
          const val = JSON.parse(rawAlbums);
          if (Array.isArray(val) && likedAlbumsRef.current.length === 0) {
            likedAlbumsRef.current = val;
            setLikedAlbums(val);
          }
        }
      } catch {}

      // Step 5: Load custom playlists / folders
      let rawPlaylists = await localStorage.getItemAsync("rw_playlists");
      if (!rawPlaylists && fileBackup?.playlists && Array.isArray(fileBackup.playlists)) {
        rawPlaylists = JSON.stringify(fileBackup.playlists);
        await localStorage.setItemAsync("rw_playlists", rawPlaylists);
      }
      try {
        if (rawPlaylists) {
          const val = JSON.parse(rawPlaylists);
          if (Array.isArray(val)) {
            setStoredPlaylists((prev) => (prev.length === 0 ? val : prev));
          }
        }
      } catch {}

      // Step 6: Load liked videos
      let rawVideos = await localStorage.getItemAsync("rw_liked_videos");
      if (!rawVideos && fileBackup?.likedVideos && Array.isArray(fileBackup.likedVideos)) {
        rawVideos = JSON.stringify(fileBackup.likedVideos);
        await localStorage.setItemAsync("rw_liked_videos", rawVideos);
      }
      try {
        if (rawVideos && likedVideosSeq.current === 0) {
          const val = JSON.parse(rawVideos);
          if (Array.isArray(val)) {
            likedVideosRef.current = val;
            setLikedVideos(val);
          }
        }
      } catch {}
    } catch (err) {
      console.warn("initLikedSongs failed:", err);
    }
  }, []);

  // Run on mount and when app comes back to foreground
  useEffect(() => {
    initLikedSongs();
  }, [initLikedSongs]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        initLikedSongs();
      }
    });
    return () => sub.remove();
  }, [initLikedSongs]);

  // Load downloads from AsyncStorage after initialization
  useEffect(() => {
    const loadDownloads = async () => {
      try {
        const raw = await AsyncStorage.getItem("rw_downloads");
        if (raw) {
          const val = JSON.parse(raw);
          const songs: Song[] = Array.isArray(val) ? val : [];
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
    (songId: string) => downloadedSongs.some((s) => String(s.id) === String(songId)),
    [downloadedSongs]
  );

  const downloadSong = useCallback(
    async (song: Song) => {
      if (downloadedSongs.some((s) => String(s.id) === String(song.id))) return;
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

        const inMemorySong = {
          ...downloadedSong,
          audioUrl: (FileSystem.documentDirectory || "") + downloadedSong.audioUrl,
          albumArt: downloadedSong.albumArt && downloadedSong.albumArt.endsWith("_art.jpg")
            ? (FileSystem.documentDirectory || "") + downloadedSong.albumArt
            : downloadedSong.albumArt,
        };
        const next = [...downloadedSongs, inMemorySong];
        
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
        await AsyncStorage.setItem("rw_downloads", JSON.stringify(stripped));
        setDownloadedSongs(next);
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
      // 1. Update list and store in AsyncStorage first for instant UI response and robustness
      const next = downloadedSongs.filter((s) => String(s.id) !== String(songId));
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
      await AsyncStorage.setItem("rw_downloads", JSON.stringify(stripped));
      setDownloadedSongs(next);

      // 2. Cleanup physical files in the background without blocking the UI/state flow
      const audioLocalUri = (FileSystem.documentDirectory || "") + songId + ".mp3";
      const artLocalUri = (FileSystem.documentDirectory || "") + songId + "_art.jpg";
      FileSystem.deleteAsync(audioLocalUri, { idempotent: true }).catch(() => {});
      FileSystem.deleteAsync(artLocalUri, { idempotent: true }).catch(() => {});
    } catch (err) {
      console.error("Failed to delete downloaded song:", err);
    }
  }, [downloadedSongs]);

  // ── Load liked albums ────────────────────────────────────────────────────────

  const loadLikedAlbums = useCallback(async () => {
    try {
      const raw = await localStorage.getItemAsync("rw_liked_albums");
      if (raw) {
        const val = JSON.parse(raw);
        if (Array.isArray(val)) {
          likedAlbumsRef.current = val;
          setLikedAlbums(val);
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to load liked albums:", err);
    }
    setLikedAlbums([]);
  }, []);

  // ── Load liked songs ─────────────────────────────────────────────────────────

  const loadLikedSongs = useCallback(async () => {
    const seqAtStart = likedSongsSeq.current;
    try {
      const raw = await localStorage.getItemAsync("rw_liked_songs");
      if (likedSongsSeq.current !== seqAtStart) return;
      if (raw) {
        const val = JSON.parse(raw);
        if (Array.isArray(val)) {
          likedSongsRef.current = val;
          setLikedSongs(val);
          return;
        }
      }
    } catch {}
  }, []);

  // ── Load liked videos ────────────────────────────────────────────────────────

  const loadLikedVideos = useCallback(async () => {
    const seqAtStart = likedVideosSeq.current;
    try {
      const raw = await localStorage.getItemAsync("rw_liked_videos");
      if (likedVideosSeq.current !== seqAtStart) return;
      if (raw) {
        const val = JSON.parse(raw);
        if (Array.isArray(val)) {
          likedVideosRef.current = val;
          setLikedVideos(val);
          return;
        }
      }
    } catch {}
  }, []);

  const isVideoLiked = useCallback((video: any) => {
    if (!video || (!video.id && !video.videoId)) return false;
    return likedVideosRef.current.some(
      (v) => (v.id && video.id && String(v.id) === String(video.id)) ||
             (v.videoId && video.videoId && String(v.videoId) === String(video.videoId))
    );
  }, []);

  const _readLikedVideos = async (): Promise<any[]> => {
    try {
      const raw = await localStorage.getItemAsync("rw_liked_videos");
      if (raw) {
        const val = JSON.parse(raw);
        if (Array.isArray(val)) return val;
      }
    } catch {}
    return likedVideosRef.current || [];
  };

  const toggleLikeVideo = useCallback(async (video: any) => {
    if (!video) return;
    try {
      const current = await _readLikedVideos();
      const liked = current.some(
        (v) => (v.id && video.id && String(v.id) === String(video.id)) ||
               (v.videoId && video.videoId && String(v.videoId) === String(video.videoId))
      );
      const nextLiked = liked
        ? current.filter(
            (v) => !(v.id && video.id && String(v.id) === String(video.id)) &&
                   !(v.videoId && video.videoId && String(v.videoId) === String(video.videoId))
          )
        : [video, ...current];

      likedVideosSeq.current += 1;
      likedVideosRef.current = nextLiked;
      setLikedVideos(nextLiked);
      await localStorage.setItemAsync("rw_liked_videos", JSON.stringify(nextLiked));
      saveLibraryToFileBackup({ likedVideos: nextLiked }).catch(() => {});
      DeviceEventEmitter.emit("LIKED_VIDEOS_UPDATED");
    } catch (err) {
      console.warn("Failed to toggle like video:", err);
    }
  }, []);

  // ── Load recently played ─────────────────────────────────────────────────────

  const loadRecentlyPlayed = useCallback(async () => {
    try {
      const raw = await localStorage.getItemAsync("rw_recently_played") || await AsyncStorage.getItem("rw_recently_played");
      if (raw) {
        const val = JSON.parse(raw);
        if (Array.isArray(val)) {
          setRecentlyPlayed(val);
          return;
        }
      }
    } catch { /* ignore */ }
    setRecentlyPlayed([]);
  }, []);

  // ── Load playlists ───────────────────────────────────────────────────────────

  const loadPlaylists = useCallback(async () => {
    try {
      const raw = await localStorage.getItemAsync("rw_playlists");
      if (raw) {
        const val = JSON.parse(raw);
        if (Array.isArray(val)) {
          setStoredPlaylists(val);
          return;
        }
      }
    } catch { /* ignore */ }
    setStoredPlaylists([]);
  }, []);

  // Load non-liked data on mount
  useEffect(() => {
    loadRecentlyPlayed();
    loadPlaylists();
  }, [loadRecentlyPlayed, loadPlaylists]);


  // ── Derived playlists ─────────────────────────────────────────────────────────

  const playlists: Playlist[] = storedPlaylists.map((p) => ({
    ...p,
    song_count: p.song_count ?? p.songs.length,
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
      await localStorage.setItemAsync("rw_recently_played", JSON.stringify(newRecent));
      saveLibraryToFileBackup({ recentlyPlayed: newRecent }).catch(() => {});
    } catch { /* ignore */ }
  }, []);

  // ── Like / Unlike ─────────────────────────────────────────────────────────────

  const isSongMatch = (a: Song, b: Song) => {
    if (!a || !b) return false;
    const aId = a.id ? String(a.id).trim() : "";
    const bId = b.id ? String(b.id).trim() : "";
    
    // Exact ID match if both IDs are non-empty
    if (aId && bId && aId === bId) return true;
    
    // Check title and artist match using normalized title
    const normA = normalizeSongTitle(a.title, a.movie, a.album);
    const normB = normalizeSongTitle(b.title, b.movie, b.album);
    if (normA && normB && normA === normB) {
      const aArtist = (a.artist || "").toLowerCase().trim();
      const bArtist = (b.artist || "").toLowerCase().trim();
      if (aArtist === bArtist || !aArtist || !bArtist) {
        return true;
      }
    }

    // Fallback ID comparison ignoring common provider prefixes
    if (aId && bId) {
      const cleanA = aId.replace(/^(yt_|saavn_|gen_|local_)/, "");
      const cleanB = bId.replace(/^(yt_|saavn_|gen_|local_)/, "");
      if (cleanA && cleanB && cleanA === cleanB) return true;
    }

    return false;
  };

  const isLiked = useCallback(
    (song: Song) => {
      if (!song) return false;
      return likedSongsRef.current.some((s) => isSongMatch(s, song));
    },
    [likedSongs]
  );

  const _readLikedSongs = async (): Promise<Song[]> => {
    try {
      const raw = await localStorage.getItemAsync("rw_liked_songs");
      if (raw) {
        const val = JSON.parse(raw);
        if (Array.isArray(val)) return val;
      }
    } catch {}
    return likedSongsRef.current || [];
  };

  const toggleLike = useCallback(
    async (song: Song) => {
      if (!song || !song.title) return;
      try {
        const current = await _readLikedSongs();
        const liked = current.some((s) => isSongMatch(s, song));
        const nextLiked = liked
          ? current.filter((s) => !isSongMatch(s, song))
          : [song, ...current.filter((s) => !isSongMatch(s, song))];

        likedSongsSeq.current += 1;
        likedSongsRef.current = nextLiked;
        setLikedSongs(nextLiked);
        await localStorage.setItemAsync("rw_liked_songs", JSON.stringify(nextLiked));
        saveLibraryToFileBackup({ likedSongs: nextLiked }).catch(() => {});
        DeviceEventEmitter.emit("LIKED_SONGS_UPDATED");
      } catch (err) {
        console.warn("Failed to toggle like:", err);
      }
    },
    []
  );

  // ── Playlist CRUD ─────────────────────────────────────────────────────────────
  // All functions read from storage first to avoid stale React state closures.

  const _readPlaylists = async (): Promise<StoredPlaylist[]> => {
    try {
      const raw = await localStorage.getItemAsync("rw_playlists");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const _writePlaylists = async (list: StoredPlaylist[]) => {
    const jsonStr = JSON.stringify(list);
    await localStorage.setItemAsync("rw_playlists", jsonStr);
    setStoredPlaylists(list);
    saveLibraryToFileBackup({ playlists: list }).catch(() => {});
    DeviceEventEmitter.emit("PLAYLISTS_UPDATED");
  };

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
      try {
        const current = await _readPlaylists();
        await _writePlaylists([created, ...current]);
        return created;
      } catch {
        return null;
      }
    },
    []
  );

  const removePlaylist = useCallback(async (playlistId: string) => {
    try {
      const current = await _readPlaylists();
      await _writePlaylists(current.filter((p) => p.id !== playlistId));
    } catch {}
  }, []);

  const updatePlaylistName = useCallback(
    async (playlistId: string, newName: string) => {
      try {
        const current = await _readPlaylists();
        await _writePlaylists(
          current.map((p) => (p.id === playlistId ? { ...p, name: newName } : p))
        );
      } catch {}
    },
    []
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, song: Song) => {
      try {
        const current = await _readPlaylists();
        const list = current.map((p) => {
          if (p.id !== playlistId) return p;
          const pSongs = Array.isArray(p.songs) ? p.songs : [];
          if (pSongs.some((s) => isSongMatch(s, song))) return p;
          return {
            ...p,
            song_count: pSongs.length + 1,
            songs: [...pSongs, song],
          };
        });
        await _writePlaylists(list);
      } catch (err) {
        console.warn("Failed to add to playlist:", err);
      }
    },
    []
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, target: string | Song) => {
      if (!target) return;
      try {
        const current = await _readPlaylists();
        const targetSong: Song = typeof target === "string" 
          ? { id: target, title: "", artist: "", duration: 0, albumArt: "", audioUrl: "" }
          : target;
        const targetIdStr = typeof target === "string" ? target : String(target.id || "");

        const list = current.map((p) => {
          if (p.id !== playlistId) return p;
          const pSongs = Array.isArray(p.songs) ? p.songs : [];
          const remaining = pSongs.filter((s) => {
            if (!s) return false;
            const sIdStr = String(s.id || "").trim();

            // 1. Direct ID match
            if (targetIdStr && sIdStr === targetIdStr) return false;

            // 2. Full song match (title & artist comparison)
            if (targetSong.title && isSongMatch(s, targetSong)) return false;

            // 3. Provider-prefix-agnostic ID match
            if (sIdStr && targetIdStr) {
              const cleanS = sIdStr.replace(/^(yt_|saavn_|gen_|local_)/, "").trim();
              const cleanT = targetIdStr.replace(/^(yt_|saavn_|gen_|local_)/, "").trim();
              if (cleanS && cleanT && cleanS === cleanT) return false;
            }

            return true;
          });
          return {
            ...p,
            song_count: remaining.length,
            songs: remaining,
          };
        });
        await _writePlaylists(list);
      } catch (err) {
        console.warn("Failed to remove from playlist:", err);
      }
    },
    []
  );

  const getPlaylist = useCallback(
    async (playlistId: string): Promise<Song[]> => {
      const current = await _readPlaylists();
      const match = current.find((p) => p.id === playlistId);
      return match?.songs || [];
    },
    []
  );

  const isAlbumLiked = useCallback(
    (album: AlbumData) => {
      if (!album || !album.title) return false;
      const targetTitle = album.title.toLowerCase().trim();
      return likedAlbumsRef.current.some(
        (a) => a.title && a.title.toLowerCase().trim() === targetTitle
      );
    },
    [likedAlbums]
  );

  const _readLikedAlbums = async (): Promise<AlbumData[]> => {
    try {
      const raw = await localStorage.getItemAsync("rw_liked_albums");
      if (raw) {
        const val = JSON.parse(raw);
        if (Array.isArray(val)) return val;
      }
    } catch {}
    return likedAlbumsRef.current || [];
  };

  const toggleLikeAlbum = useCallback(
    async (album: AlbumData) => {
      if (!album || !album.title) return;
      try {
        const currentAlbums = await _readLikedAlbums();
        const targetTitle = album.title.toLowerCase().trim();
        const isAlreadyLiked = currentAlbums.some(
          (a) => a.title && a.title.toLowerCase().trim() === targetTitle
        );

        const cleanAlbumSongs = deduplicateSongs(album.songs || []);
        const cleanAlbum: AlbumData = {
          ...album,
          songs: cleanAlbumSongs,
        };

        const nextLikedAlbums = isAlreadyLiked
          ? currentAlbums.filter((a) => a.title && a.title.toLowerCase().trim() !== targetTitle)
          : [cleanAlbum, ...currentAlbums.filter((a) => a.title && a.title.toLowerCase().trim() !== targetTitle)];

        likedAlbumsRef.current = nextLikedAlbums;
        setLikedAlbums(nextLikedAlbums);
        const jsonStr = JSON.stringify(nextLikedAlbums);
        await localStorage.setItemAsync("rw_liked_albums", jsonStr);
        saveLibraryToFileBackup({ likedAlbums: nextLikedAlbums }).catch(() => {});
        DeviceEventEmitter.emit("LIKED_ALBUMS_UPDATED");
      } catch (err) {
        console.warn("Failed to toggle liked album:", err);
      }
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
        likedVideos,
        toggleLikeVideo,
        isVideoLiked,
        loadLikedVideos,
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