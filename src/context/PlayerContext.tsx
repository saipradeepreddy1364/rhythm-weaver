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
import { Audio } from "expo-av";
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [progress, setProgressState] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);
  const [showPlayer, setShowPlayer] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "one" | "all">("off");
  const [isRadioMode, setIsRadioMode] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const currentSongRef = useRef<Song | null>(null);
  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<"off" | "one" | "all">("off");
  const radioFetchingRef = useRef(false);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);

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

  // Configure Audio for background play
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  // Play audio natively using expo-av
  const playAudioDirectly = useCallback(async (song: Song) => {
    if (!song.audioUrl) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: song.audioUrl },
        { shouldPlay: true, volume: volume },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      console.warn("[PlayerContext] Native play failed, skipping to next:", err);
      setTimeout(() => nextSongInternal(), 1000);
    }
  }, [volume]);

  // Handle updates from native sound playback
  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.error(`[PlayerContext] expo-av playback error: ${status.error}`);
        nextSongInternal();
      }
      return;
    }

    setProgressState(status.positionMillis / 1000);
    if (status.durationMillis) {
      setDuration(status.durationMillis / 1000);
    }
    setIsPlaying(status.isPlaying);

    if (status.didJustFinish) {
      nextSongInternal();
    }
  }, []);

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

  const nextSongInternal = useCallback(() => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    if (repeatRef.current === "one") {
      if (soundRef.current) {
        soundRef.current.setPositionAsync(0).then(() => soundRef.current?.playAsync()).catch(() => {});
      }
      setProgressState(0);
      return;
    }

    let nextIdx: number;

    if (shuffleRef.current) {
      if (q.length === 1) nextIdx = 0;
      else {
        do { nextIdx = Math.floor(Math.random() * q.length); }
        while (nextIdx === idx);
      }
    } else if (repeatRef.current === "off") {
      if (idx >= q.length - 1) {
        // Queue finished, fall back to radio suggestions
        const seed = q[idx];
        if (!radioFetchingRef.current && seed) {
          radioFetchingRef.current = true;
          setIsRadioMode(true);
          fetchRadioSongs(seed).then((radioSongs) => {
            radioFetchingRef.current = false;
            if (radioSongs.length === 0) {
              setIsRadioMode(false);
              setIsPlaying(false);
              if (soundRef.current) soundRef.current.pauseAsync().catch(() => {});
              return;
            }
            const newQ = [...queueRef.current, ...radioSongs];
            const newIdx = queueRef.current.length;
            setQueue(newQ);
            setQueueIndex(newIdx);
            setCurrentSong(newQ[newIdx]);
            playAudioDirectly(newQ[newIdx]);
          });
        } else {
          setIsPlaying(false);
          if (soundRef.current) soundRef.current.pauseAsync().catch(() => {});
        }
        return;
      }
      nextIdx = idx + 1;
    } else {
      nextIdx = (idx + 1) % q.length;
    }

    const nextSongObj = q[nextIdx];
    setQueueIndex(nextIdx);
    setCurrentSong(nextSongObj);
    playAudioDirectly(nextSongObj);
  }, [fetchRadioSongs, playAudioDirectly]);

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
      playAudioDirectly(song);
    },
    [playAudioDirectly]
  );

  const togglePlay = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {}
  }, [isPlaying]);

  const prevSong = useCallback(() => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    if (progress > 3) {
      if (soundRef.current) soundRef.current.setPositionAsync(0).catch(() => {});
      setProgressState(0);
      return;
    }

    const prevIdx = (idx - 1 + q.length) % q.length;
    const prevSongObj = q[prevIdx];
    setQueueIndex(prevIdx);
    setCurrentSong(prevSongObj);
    playAudioDirectly(prevSongObj);
  }, [progress, playAudioDirectly]);

  const setProgress = useCallback((value: number) => {
    if (soundRef.current) {
      soundRef.current.setPositionAsync(value * 1000).catch(() => {});
      setProgressState(value);
    }
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(value).catch(() => {});
    }
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

  const toggleShuffle = useCallback(() => { setShuffle((v) => !v); }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((v) => v === "off" ? "one" : v === "one" ? "all" : "off");
  }, []);

  const addToQueue = useCallback((song: Song) => {
    setQueue((prev) => {
      if (prev.some((s) => s.id === song.id)) return prev;
      return [...prev, song];
    });
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentSong, isPlaying, queue, queueIndex, progress, duration,
        volume, showPlayer, shuffle, repeat, isRadioMode,
        playSong, togglePlay, nextSong: nextSongInternal, prevSong,
        setProgress, setVolume, setShowPlayer,
        toggleFavorite, isFavorite, addToQueue,
        toggleShuffle, cycleRepeat,
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