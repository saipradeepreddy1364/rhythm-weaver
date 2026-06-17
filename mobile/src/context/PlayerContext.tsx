import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image } from 'react-native'
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import TrackPlayer, {
  Capability,
  State,
  Event,
  useProgress,
  usePlaybackState,
  useActiveTrack,
  RepeatMode,
  AndroidAudioContentType,
} from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Song, mapApiSong } from "../data/songs";
import { api } from "../services/api";
import { localStorage } from "../lib/storage";

// ─── Playback History & Offline Helpers ──────────────────────────────────────
const RECENT_LIMIT_MS = 6 * 60 * 60 * 1000; // 6 hours

function getPlaybackHistory(): any[] {
  try {
    const raw = localStorage.getItem("rw_playback_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function logPlayback(song: Song) {
  if (!song || !song.id) return;
  try {
    const history = getPlaybackHistory();
    const now = Date.now();
    const filtered = history.filter((h) => now - h.timestamp < RECENT_LIMIT_MS);
    
    if (!filtered.some((h) => h.id === song.id)) {
      filtered.push({
        id: song.id,
        title: song.title,
        artist: song.artist,
        timestamp: now,
      });
      localStorage.setItem("rw_playback_history", JSON.stringify(filtered));
    }
  } catch (err) {
    console.warn("Failed to log playback history:", err);
  }
}

function filterQueueByHistory(song: Song, songQueue: Song[]): Song[] {
  const history = getPlaybackHistory();
  const now = Date.now();
  const activeHistory = history.filter((h) => now - h.timestamp < RECENT_LIMIT_MS);
  
  const recentIds = new Set<string>();
  const recentKeys = new Set<string>();
  activeHistory.forEach((h) => {
    recentIds.add(h.id);
    if (h.title) {
      const key = h.title.toLowerCase().trim() + "|" + (h.artist || "").toLowerCase().trim();
      recentKeys.add(key);
    }
  });
  
  return songQueue.filter((s) => {
    if (s.id === song.id) return true;
    if (recentIds.has(s.id)) return false;
    if (s.title) {
      const key = s.title.toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
      if (recentKeys.has(key)) return false;
    }
    return true;
  });
}

function resolveTrack(s: Song) {
  let downloadedList: any[] = [];
  try {
    const raw = localStorage.getItem("rw_downloads");
    if (raw) downloadedList = JSON.parse(raw);
  } catch {}
  
  const downloaded = downloadedList.find((d) => d.id === s.id);
  
  let trackUrl = s.audioUrl;
  if (downloaded?.audioUrl) {
    trackUrl = downloaded.audioUrl;
  } else if (!trackUrl || trackUrl.includes("saavncdn.com") || trackUrl.includes("oasth.me")) {
    trackUrl = `https://musicbackend-xg4u.onrender.com/api/songs/${s.id}/stream`;
  }

  return {
    id: s.id,
    url: trackUrl,
    title: s.title,
    artist: s.artist,
    album: s.album || s.movie || "",
    artwork: downloaded?.albumArt || s.albumArt || "",
  };
}

async function resolvePipedAudioUrl(videoId: string): Promise<string | null> {
  const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.yt",
    "https://piped-api.codespace.cz",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.owo.si",
    "https://api.looleh.xyz"
  ];
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await Promise.race([
        fetch(`${instance}/streams/${videoId}`),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);
      if (!res.ok) continue;
      const data = await res.json();
      const audioStreams = data.audioStreams || [];
      if (audioStreams.length === 0) continue;
      // Pick the last stream (highest quality)
      const bestStream = audioStreams[audioStreams.length - 1];
      return bestStream.url || null;
    } catch (err) {
      console.warn(`[PlayerContext] Piped streams fetch ${instance} failed:`, err);
    }
  }
  return null;
}

async function getDirectAudioUrl(url: string): Promise<string> {
  if (url && url.startsWith("youtube://")) {
    const videoId = url.replace("youtube://", "");
    console.log(`[PlayerContext] Resolving YouTube URL for video ID: ${videoId}`);
    const resolved = await resolvePipedAudioUrl(videoId);
    if (resolved) {
      console.log(`[PlayerContext] Successfully resolved YouTube URL: ${resolved.substring(0, 50)}...`);
      return resolved;
    }
  }
  return url;
}

interface PlayerContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  queueIndex: number;
  progress: number;
  duration: number;
  volume: number;
  showPlayer: boolean;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  isRadioMode: boolean;
  playSong: (song: Song, songQueue?: Song[], fromLibrary?: boolean) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  setProgress: (value: number) => void;
  setVolume: (value: number) => void;
  setShowPlayer: (show: boolean) => void;
  toggleFavorite: (songId: string) => void;
  isFavorite: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const FAVORITES_KEY = "rw_favorites";

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [volume, setVolumeState] = useState(1.0);
  const [showPlayer, setShowPlayer] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]);
  const [repeat, setRepeat] = useState<"off" | "one" | "all">("off");
  const [isRadioMode, setIsRadioMode] = useState(false);

  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);
  const repeatRef = useRef<"off" | "one" | "all">("off");
  const radioFetchingRef = useRef(false);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  // Load favorites from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then((saved: any) => {
      if (saved) {
        try { setFavorites(JSON.parse(saved)); } catch { /**/ }
      }
    });
  }, []);

  // Save favorites to AsyncStorage
  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  // TrackPlayer Hooks
  const playbackState = usePlaybackState();
  const activeTrack = useActiveTrack();
  const progressData = useProgress(500);

  const isPlaying = playbackState
    ? (playbackState.state === State.Playing ||
       playbackState.state === State.Buffering ||
       playbackState.state === State.Loading)
    : false;
  const progress = progressData.position;
  const duration = progressData.duration;

  // Radio suggestions fetching
  const fetchRadioSongs = useCallback(async (seed: Song): Promise<Song[]> => {
    // Try to get recommendations based on the song ID first (uses official suggestions endpoint)
    try {
      console.log(`[PlayerContext] Fetching radio suggestions for song ID: ${seed.id}`);
      const res = await api.getSongSuggestions(seed.id);
      const raw = res?.data || res?.results || [];
      if (Array.isArray(raw) && raw.length > 0) {
        const songs: Song[] = raw
          .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
          .filter((s: any): s is Song => !!s && !!s.id);

        if (songs.length > 0) {
          const existingIds = new Set(queueRef.current.map((s) => s.id));
          const existingKeys = new Set(queueRef.current.map((s) => (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim()));

          const history = getPlaybackHistory();
          const now = Date.now();
          const activeHistory = history.filter((h) => now - h.timestamp < RECENT_LIMIT_MS);

          const recentIds = new Set<string>();
          const recentKeys = new Set<string>();
          activeHistory.forEach((h) => {
            recentIds.add(h.id);
            if (h.title) {
              recentKeys.add(h.title.toLowerCase().trim() + "|" + (h.artist || "").toLowerCase().trim());
            }
          });

          const filtered = songs.filter((s) => {
            const key = (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
            if (existingIds.has(s.id) || existingKeys.has(key)) return false;
            if (recentIds.has(s.id) || recentKeys.has(key)) return false;
            return true;
          });

          if (filtered.length > 0) {
            console.log(`[PlayerContext] Found ${filtered.length} suggestions from ID suggestions endpoint`);
            return filtered.slice(0, 20);
          }
        }
      }
    } catch (err) {
      console.warn("[PlayerContext] ID suggestions fetch failed, falling back to search queries:", err);
    }

    // Fallback: search queries using artist, movie, or song title
    const artist = seed.artist || "";
    const movie = seed.movie || seed.album || "";
    const lang = seed.language || "";

    let query = artist || movie || seed.title || "trending songs";
    if (lang) query = `${lang} songs ${artist}`.trim();
    else if (artist) query = `${artist} songs`;

    try {
      const res = await api.searchSongs(query);
      const raw = res?.data?.results || res?.results || [];
      if (!Array.isArray(raw) || raw.length === 0) return [];

      const songs: Song[] = raw
        .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
        .filter((s: any): s is Song => !!s && !!s.id);

      const existingIds = new Set(queueRef.current.map((s) => s.id));
      const existingKeys = new Set(queueRef.current.map((s) => (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim()));

      const history = getPlaybackHistory();
      const now = Date.now();
      const activeHistory = history.filter((h) => now - h.timestamp < RECENT_LIMIT_MS);

      const recentIds = new Set<string>();
      const recentKeys = new Set<string>();
      activeHistory.forEach((h) => {
        recentIds.add(h.id);
        if (h.title) {
          recentKeys.add(h.title.toLowerCase().trim() + "|" + (h.artist || "").toLowerCase().trim());
        }
      });

      const filtered = songs.filter((s) => {
        const key = (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
        if (existingIds.has(s.id) || existingKeys.has(key)) return false;
        if (recentIds.has(s.id) || recentKeys.has(key)) return false;
        return true;
      });

      return filtered.slice(0, 20);
    } catch (err) {
      console.warn("[PlayerContext] Radio fallback fetch failed:", err);
      return [];
    }
  }, []);

  const nextSongInternal = useCallback(async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch (err) {
      const q = queueRef.current;
      const idx = queueIndexRef.current;
      if (q.length === 0) return;

      if (repeatRef.current === "one") {
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
        return;
      }

      if (repeatRef.current === "off") {
        if (idx >= q.length - 1) {
          const seed = q[idx];
          if (!radioFetchingRef.current && seed) {
            radioFetchingRef.current = true;
            setIsRadioMode(true);
            const radioSongs = await fetchRadioSongs(seed);
            radioFetchingRef.current = false;

            if (radioSongs.length === 0) {
              setIsRadioMode(false);
              await TrackPlayer.pause();
              return;
            }

            const newQ = [...queueRef.current, ...radioSongs];
            setQueue(newQ);

            // Add new tracks to TrackPlayer
            const tracksToAdd = radioSongs.map((s) => resolveTrack(s));
            await TrackPlayer.add(tracksToAdd);
            await TrackPlayer.skip(queueRef.current.length);
            await TrackPlayer.play();
          } else {
            await TrackPlayer.pause();
          }
          return;
        }
      }
    }
  }, [fetchRadioSongs]);

  // TrackPlayer Setup on mount
  useEffect(() => {
    let active = true;
    let queueEndedListener: any;
    let playbackErrorListener: any;

    const init = async () => {
      try {
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
          androidAudioContentType: AndroidAudioContentType.Music,
        });
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
          ],
        });
        await TrackPlayer.setVolume(volume);

        if (active) {
          queueEndedListener = TrackPlayer.addEventListener(
            Event.PlaybackQueueEnded,
            async (event) => {
              console.log("[PlayerContext] Playback queue ended, triggering nextSong/radio mode");
              await nextSongInternal();
            }
          );

          playbackErrorListener = TrackPlayer.addEventListener(
            Event.PlaybackError,
            async (error) => {
              console.warn("[PlayerContext] Playback error encountered:", error);
              try {
                const activeIndex = await TrackPlayer.getActiveTrackIndex();
                if (activeIndex !== undefined && activeIndex !== null) {
                  const track = await TrackPlayer.getTrack(activeIndex);
                  if (track && track.url && track.url.startsWith("youtube://")) {
                    const videoId = track.url.replace("youtube://", "");
                    console.log(`[PlayerContext] Playback error on YouTube track. Resolving video ID: ${videoId}`);
                    const directUrl = await resolvePipedAudioUrl(videoId);
                    if (directUrl) {
                      track.url = directUrl;
                      await TrackPlayer.remove(activeIndex);
                      await TrackPlayer.add(track, activeIndex);
                      await TrackPlayer.skip(activeIndex);
                      await TrackPlayer.play();
                      return;
                    }
                  }
                }
              } catch (e) {
                console.warn("[PlayerContext] Error resolving YouTube URL after playback error:", e);
              }
              await nextSongInternal();
            }
          );
        }
      } catch (e) {
        // Suppress error if already setup
      }
    };
    init();

    return () => {
      active = false;
      if (queueEndedListener) {
        queueEndedListener.remove();
      }
      if (playbackErrorListener) {
        playbackErrorListener.remove();
      }
    };
  }, [nextSongInternal]);

  // Sync active track changes back to currentSong and queueIndex
  useEffect(() => {
    if (activeTrack) {
      const matched = queueRef.current.find(s => s.id === activeTrack.id);
      if (matched) {
        setCurrentSong(matched);
        logPlayback(matched);
      } else {
        const newTrack = {
          id: activeTrack.id,
          title: activeTrack.title || "",
          artist: activeTrack.artist || "",
          audioUrl: activeTrack.url,
          albumArt: activeTrack.artwork,
        } as any;
        setCurrentSong(newTrack);
        logPlayback(newTrack);
      }
    } else {
      if (queueRef.current.length === 0) {
        setCurrentSong(null);
      }
    }

    // Sync queueIndex
    const syncIndex = async () => {
      try {
        const idx = await TrackPlayer.getActiveTrackIndex();
        if (idx !== undefined && idx !== null) {
          setQueueIndex(idx);
        }
      } catch {}
    };
    syncIndex();
  }, [activeTrack]);



  const playSong = useCallback(
    async (song: Song, songQueue?: Song[]) => {
      setIsRadioMode(false);
      radioFetchingRef.current = false;

      let q = songQueue || [song];

      // Filter out songs played in the last 6 hours (except selected song itself)
      q = filterQueueByHistory(song, q);

      // Deduplicate the queue by title + artist to prevent duplicates playing in sequence
      const seenKeys = new Set<string>();
      q = q.filter((s) => {
        if (s.id === song.id) {
          seenKeys.add((s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim());
          return true;
        }
        const key = (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      // Ensure the selected song is present in the queue
      if (!q.some((s) => s.id === song.id)) {
        q = [song, ...q];
      }

      const idx = q.findIndex((s) => s.id === song.id);
      const safeIdx = idx >= 0 ? idx : 0;

      setQueue(q);
      setQueueIndex(safeIdx);
      setCurrentSong(song);

      try {
        await TrackPlayer.reset();
        
        // Resolve the direct URL of the selected song
        const resolvedSongTrack = resolveTrack(song);
        const directUrl = await getDirectAudioUrl(resolvedSongTrack.url);
        resolvedSongTrack.url = directUrl;
        
        // Map the entire queue to tracks synchronously to avoid index desynchronization
        const tracks = q.map((s) => resolveTrack(s));
        if (safeIdx >= 0 && safeIdx < tracks.length) {
          tracks[safeIdx].url = directUrl;
        }
        
        await TrackPlayer.add(tracks);
        await TrackPlayer.skip(safeIdx);
        await TrackPlayer.play();
      } catch (err) {
        console.warn("[PlayerContext] TrackPlayer play failed:", err);
      }
    },
    []
  );

  const togglePlay = useCallback(async () => {
    try {
      const stateObj = await TrackPlayer.getPlaybackState();
      if (stateObj.state === State.Playing) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch {}
  }, []);

  const prevSong = useCallback(async () => {
    const q = queueRef.current;
    if (q.length === 0) return;

    if (progress > 3) {
      await TrackPlayer.seekTo(0);
      return;
    }

    try {
      await TrackPlayer.skipToPrevious();
    } catch {
      // Fallback
    }
  }, [progress]);

  const setProgress = useCallback((value: number) => {
    TrackPlayer.seekTo(value).catch(() => {});
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    TrackPlayer.setVolume(value).catch(() => {});
  }, []);

  const toggleFavorite = useCallback((songId: string) => {
    setFavorites((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId]
    );
  }, []);

  const isFavorite = useCallback(
    (songId: string): boolean => favorites.includes(songId),
    [favorites]
  );

  const toggleShuffle = useCallback(async () => {
    const newShuffle = !shuffle;
    setShuffle(newShuffle);

    if (newShuffle) {
      setOriginalQueue(queue);
      if (queue.length > 1 && currentSong) {
        const remaining = queue.filter((s) => s.id !== currentSong.id);
        const shuffled = [...remaining].sort(() => Math.random() - 0.5);
        const newQ = [currentSong, ...shuffled];
        setQueue(newQ);
        setQueueIndex(0);

        try {
          await TrackPlayer.reset();
          const tracks = newQ.map((s) => resolveTrack(s));
          await TrackPlayer.add(tracks);
          await TrackPlayer.play();
        } catch {}
      }
    } else {
      if (originalQueue.length > 0) {
        setQueue(originalQueue);
        const idx = originalQueue.findIndex((s) => s.id === currentSong?.id);
        const safeIdx = idx >= 0 ? idx : 0;
        setQueueIndex(safeIdx);

        try {
          await TrackPlayer.reset();
          const tracks = originalQueue.map((s) => resolveTrack(s));
          await TrackPlayer.add(tracks);
          await TrackPlayer.skip(safeIdx);
          await TrackPlayer.play();
        } catch {}
      }
    }
  }, [shuffle, queue, currentSong, originalQueue]);

  const cycleRepeat = useCallback(async () => {
    let newMode: "off" | "one" | "all";
    let nativeMode: RepeatMode;

    if (repeat === "off") {
      newMode = "one";
      nativeMode = RepeatMode.Track;
    } else if (repeat === "one") {
      newMode = "all";
      nativeMode = RepeatMode.Queue;
    } else {
      newMode = "off";
      nativeMode = RepeatMode.Off;
    }

    setRepeat(newMode);
    try {
      await TrackPlayer.setRepeatMode(nativeMode);
    } catch {}
  }, [repeat]);

  const addToQueue = useCallback((song: Song) => {
    setQueue((prev) => {
      if (prev.some((s) => s.id === song.id)) return prev;
      const newQ = [...prev, song];

      TrackPlayer.add(resolveTrack(song)).catch(() => {});

      return newQ;
    });
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        queue,
        queueIndex,
        progress,
        duration,
        volume,
        showPlayer,
        shuffle,
        repeat,
        isRadioMode,
        playSong,
        togglePlay,
        nextSong: nextSongInternal,
        prevSong,
        setProgress,
        setVolume,
        setShowPlayer,
        toggleFavorite,
        isFavorite,
        addToQueue,
        toggleShuffle,
        cycleRepeat,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}