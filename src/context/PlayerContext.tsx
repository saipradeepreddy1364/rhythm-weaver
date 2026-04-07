import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { Song } from "@/data/songs";

interface PlayerContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  queueIndex: number;
  progress: number;
  duration: number;
  volume: number;
  showPlayer: boolean;
  recentlyPlayed: Song[];
  playSong: (song: Song, songQueue?: Song[]) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  setProgress: (value: number) => void;
  setVolume: (value: number) => void;
  setShowPlayer: (show: boolean) => void;
  toggleFavorite: (songId: string) => void;
  isFavorite: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const RECENTLY_PLAYED_KEY = "rw_recently_played";
const RECENTLY_PLAYED_TS_KEY = "rw_recent_ts";
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
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  // Load favorites
  useEffect(() => {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) {
      try { setFavorites(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  // Load recently played
  useEffect(() => {
    const saved = localStorage.getItem(RECENTLY_PLAYED_KEY);
    if (saved) {
      try { setRecentlyPlayed(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const addToRecentlyPlayedInternal = useCallback((song: Song) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const updated = [song, ...filtered].slice(0, 50);
      localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
      const ts: Record<string, number> = JSON.parse(
        localStorage.getItem(RECENTLY_PLAYED_TS_KEY) || "{}"
      );
      ts[song.id] = Date.now();
      localStorage.setItem(RECENTLY_PLAYED_TS_KEY, JSON.stringify(ts));
      return updated;
    });
  }, []);

  const nextSongInternal = useCallback(() => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;
    const nextIdx = (idx + 1) % q.length;
    queueIndexRef.current = nextIdx;
    setQueueIndex(nextIdx);
    setCurrentSong(q[nextIdx]);
    setIsPlaying(true);
    addToRecentlyPlayedInternal(q[nextIdx]);
  }, [addToRecentlyPlayedInternal]);

  // Setup audio element ONCE
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = 0.7;
    audio.preload = "auto";

    const handleTimeUpdate = () => {
      if (!isNaN(audio.currentTime)) setProgressState(audio.currentTime);
    };
    const handleDurationChange = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => { nextSongInternal(); };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      console.error("Audio playback error — skipping to next");
      setTimeout(() => nextSongInternal(), 800);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
    };
  }, [nextSongInternal]);

  // When currentSong changes: load + play
  useEffect(() => {
    if (!currentSong || !audioRef.current) return;
    const audio = audioRef.current;
    setProgressState(0);
    setDuration(0);
    audio.src = currentSong.audioUrl;
    audio.load();
    audio.play().catch((err) => {
      console.error("Autoplay blocked:", err);
      setIsPlaying(false);
    });
  }, [currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle play/pause toggle
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volume changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const playSong = useCallback(
    (song: Song, songQueue?: Song[]) => {
      const q = songQueue || [song];
      const idx = q.findIndex((s) => s.id === song.id);
      const safeIdx = idx >= 0 ? idx : 0;
      queueRef.current = q;
      queueIndexRef.current = safeIdx;
      setQueue(q);
      setQueueIndex(safeIdx);
      setCurrentSong(song);
      setIsPlaying(true);
      addToRecentlyPlayedInternal(song);
    },
    [addToRecentlyPlayedInternal]
  );

  /**
   * addToQueue: inserts song right after the current index so it plays next.
   * If no song is playing, it starts playing immediately.
   */
  const addToQueue = useCallback((song: Song) => {
    if (!queueRef.current.length || !currentSong) {
      // Nothing playing — just start it
      const q = [song];
      queueRef.current = q;
      queueIndexRef.current = 0;
      setQueue(q);
      setQueueIndex(0);
      setCurrentSong(song);
      setIsPlaying(true);
      return;
    }
    setQueue((prev) => {
      const idx = queueIndexRef.current;
      const next = [...prev];
      next.splice(idx + 1, 0, song);
      queueRef.current = next;
      return next;
    });
  }, [currentSong]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const nextSong = useCallback(() => {
    nextSongInternal();
  }, [nextSongInternal]);

  const prevSong = useCallback(() => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;
    const prevIdx = (idx - 1 + q.length) % q.length;
    queueIndexRef.current = prevIdx;
    setQueueIndex(prevIdx);
    setCurrentSong(q[prevIdx]);
    setIsPlaying(true);
    addToRecentlyPlayedInternal(q[prevIdx]);
  }, [addToRecentlyPlayedInternal]);

  const setProgress = useCallback((value: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setProgressState(value);
    }
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
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
        recentlyPlayed,
        playSong,
        togglePlay,
        nextSong,
        prevSong,
        setProgress,
        setVolume,
        setShowPlayer,
        toggleFavorite,
        isFavorite,
        addToQueue,
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