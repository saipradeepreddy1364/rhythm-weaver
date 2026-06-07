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
} from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Song, mapApiSong } from "../data/songs";
import { api } from "../services/api";

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
  const [volume, setVolumeState] = useState(0.7);
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

  const isPlaying = playbackState ? playbackState.state === State.Playing : false;
  const progress = progressData.position;
  const duration = progressData.duration;

  // TrackPlayer Setup on mount
  useEffect(() => {
    const init = async () => {
      try {
        await TrackPlayer.setupPlayer({});
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
      } catch (e) {
        // Suppress error if already setup
      }
    };
    init();
  }, []);

  // Sync active track changes back to currentSong and queueIndex
  useEffect(() => {
    if (activeTrack) {
      const matched = queueRef.current.find(s => s.id === activeTrack.id);
      if (matched) {
        setCurrentSong(matched);
      } else {
        setCurrentSong({
          id: activeTrack.id,
          title: activeTrack.title || "",
          artist: activeTrack.artist || "",
          audioUrl: activeTrack.url,
          albumArt: activeTrack.artwork,
        } as any);
      }
    } else {
      setCurrentSong(null);
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

  // Radio suggestions fetching
  const fetchRadioSongs = useCallback(async (seed: Song): Promise<Song[]> => {
    const artist = seed.artist || "";
    const movie = seed.movie || seed.album || "";
    const lang = seed.language || "";

    let query = artist || movie || "trending songs";
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
      return songs.filter((s) => !existingIds.has(s.id)).slice(0, 20);
    } catch (err) {
      console.warn("[PlayerContext] Radio fetch failed:", err);
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
            const tracksToAdd = radioSongs.map((s) => ({
              id: s.id,
              url: s.audioUrl || "",
              title: s.title,
              artist: s.artist,
              album: s.album || s.movie || "",
              artwork: s.albumArt || "",
            }));
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

  const playSong = useCallback(
    async (song: Song, songQueue?: Song[]) => {
      setIsRadioMode(false);
      radioFetchingRef.current = false;

      let q = songQueue || [song];
      const idx = q.findIndex((s) => s.id === song.id);
      const safeIdx = idx >= 0 ? idx : 0;

      setQueue(q);
      setQueueIndex(safeIdx);
      setCurrentSong(song);

      try {
        await TrackPlayer.reset();
        const tracks = q.map((s) => ({
          id: s.id,
          url: s.audioUrl || "",
          title: s.title,
          artist: s.artist,
          album: s.album || s.movie || "",
          artwork: s.albumArt || "",
        }));
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
          const tracks = newQ.map((s) => ({
            id: s.id,
            url: s.audioUrl || "",
            title: s.title,
            artist: s.artist,
            album: s.album || s.movie || "",
            artwork: s.albumArt || "",
          }));
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
          const tracks = originalQueue.map((s) => ({
            id: s.id,
            url: s.audioUrl || "",
            title: s.title,
            artist: s.artist,
            album: s.album || s.movie || "",
            artwork: s.albumArt || "",
          }));
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

      TrackPlayer.add({
        id: song.id,
        url: song.audioUrl || "",
        title: song.title,
        artist: song.artist,
        album: song.album || song.movie || "",
        artwork: song.albumArt || "",
      }).catch(() => {});

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