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

const RECENTLY_PLAYED_KEY    = "rw_recently_played";
const RECENTLY_PLAYED_TS_KEY = "rw_recent_ts";
const FAVORITES_KEY          = "rw_favorites";
const PLAYED_HISTORY_KEY     = "rw_played_history";

/** Load the full recently-played timestamp map: { [songId]: timestamp } */
function loadRecentTimestamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RECENTLY_PLAYED_TS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Load play history: { [songId]: timestamp } */
function loadPlayHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PLAYED_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Prune entries older than 10 hours and persist */
function pruneAndSaveHistory(history: Record<string, number>): Record<string, number> {
  const cutoff = Date.now() - 10 * 60 * 60 * 1000;
  const pruned: Record<string, number> = {};
  for (const [id, ts] of Object.entries(history)) {
    if (ts >= cutoff) pruned[id] = ts;
  }
  localStorage.setItem(PLAYED_HISTORY_KEY, JSON.stringify(pruned));
  return pruned;
}

/**
 * Pick next song from queue:
 * 1. Avoid songs played in last 10 hours (playHistory).
 * 2. Also avoid songs in recentTimestamps (the full recently-played list within 10hr window).
 * 3. If all songs have been played recently → reset and just go forward.
 */
function pickNext(
  queue: Song[],
  currentIdx: number,
  playHistory: Record<string, number>,
  recentTimestamps: Record<string, number>
): number {
  if (queue.length === 0) return 0;
  const len = queue.length;
  const cutoff = Date.now() - 10 * 60 * 60 * 1000;

  // Build a combined "played recently" set
  const recentlyPlayedIds = new Set<string>();
  for (const [id, ts] of Object.entries(playHistory)) {
    if (ts >= cutoff) recentlyPlayedIds.add(id);
  }
  for (const [id, ts] of Object.entries(recentTimestamps)) {
    if (ts >= cutoff) recentlyPlayedIds.add(id);
  }

  // Forward pass: find next unplayed song
  for (let offset = 1; offset <= len; offset++) {
    const idx = (currentIdx + offset) % len;
    if (!recentlyPlayedIds.has(queue[idx].id)) return idx;
  }
  // All played — reset and go to next index to avoid stopping
  return (currentIdx + 1) % len;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [queue, setQueue]             = useState<Song[]>([]);
  const [queueIndex, setQueueIndex]   = useState(0);
  const [progress, setProgressState]  = useState(0);
  const [duration, setDuration]       = useState(0);
  const [volume, setVolumeState]      = useState(0.7);
  const [showPlayer, setShowPlayer]   = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [favorites, setFavorites]     = useState<string[]>([]);

  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const queueRef          = useRef<Song[]>([]);
  const queueIndexRef     = useRef(0);
  const playHistoryRef    = useRef<Record<string, number>>(loadPlayHistory());
  // Keep recent timestamps in a ref so pickNext can access them without stale closure
  const recentTimestampsRef = useRef<Record<string, number>>(loadRecentTimestamps());

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  // Load favorites
  useEffect(() => {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) { try { setFavorites(JSON.parse(saved)); } catch { /**/ } }
  }, []);
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  // Load recently played
  useEffect(() => {
    const saved = localStorage.getItem(RECENTLY_PLAYED_KEY);
    if (saved) { try { setRecentlyPlayed(JSON.parse(saved)); } catch { /**/ } }
  }, []);

  const addToRecentlyPlayedInternal = useCallback((song: Song) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const updated  = [song, ...filtered].slice(0, 50);
      localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
      // Keep the timestamp map up to date
      const ts = { ...recentTimestampsRef.current, [song.id]: Date.now() };
      recentTimestampsRef.current = ts;
      localStorage.setItem(RECENTLY_PLAYED_TS_KEY, JSON.stringify(ts));
      return updated;
    });
  }, []);

  /** Mark song as played in 10-hour history */
  const markPlayed = useCallback((songId: string) => {
    playHistoryRef.current = pruneAndSaveHistory({
      ...playHistoryRef.current,
      [songId]: Date.now(),
    });
  }, []);

  /** Update MediaSession metadata for lock screen */
  const updateMediaSession = useCallback((song: Song, playing: boolean) => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:   song.title,
      artist:  song.artist,
      album:   song.movie || song.album || "",
      artwork: song.albumArt
        ? [{ src: song.albumArt, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, []);

  const nextSongInternal = useCallback(() => {
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    // Prune stale entries first
    const history = pruneAndSaveHistory(playHistoryRef.current);
    playHistoryRef.current = history;

    const nextIdx = pickNext(q, idx, history, recentTimestampsRef.current);
    queueIndexRef.current = nextIdx;
    setQueueIndex(nextIdx);
    setCurrentSong(q[nextIdx]);
    setIsPlaying(true);
    addToRecentlyPlayedInternal(q[nextIdx]);
    markPlayed(q[nextIdx].id);
  }, [addToRecentlyPlayedInternal, markPlayed]);

  // Setup audio element ONCE
  useEffect(() => {
    const audio  = new Audio();
    audioRef.current = audio;
    audio.volume = 0.7;
    audio.preload = "auto";

    const handleTimeUpdate     = () => { if (!isNaN(audio.currentTime)) setProgressState(audio.currentTime); };
    const handleDurationChange = () => { if (!isNaN(audio.duration) && isFinite(audio.duration)) setDuration(audio.duration); };
    const handleEnded          = () => { nextSongInternal(); };
    const handlePlay           = () => setIsPlaying(true);
    const handlePause          = () => setIsPlaying(false);
    const handleError          = () => {
      console.error("Audio playback error — skipping to next");
      setTimeout(() => nextSongInternal(), 800);
    };

    audio.addEventListener("timeupdate",      handleTimeUpdate);
    audio.addEventListener("durationchange",  handleDurationChange);
    audio.addEventListener("ended",           handleEnded);
    audio.addEventListener("play",            handlePlay);
    audio.addEventListener("pause",           handlePause);
    audio.addEventListener("error",           handleError);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate",     handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended",          handleEnded);
      audio.removeEventListener("play",           handlePlay);
      audio.removeEventListener("pause",          handlePause);
      audio.removeEventListener("error",          handleError);
    };
  }, [nextSongInternal]);

  // When currentSong changes: load + play + update MediaSession
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
    updateMediaSession(currentSong, true);
  }, [currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle play/pause toggle
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
    if (currentSong) updateMediaSession(currentSong, isPlaying);
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volume changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Register MediaSession action handlers ONCE
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => {
      setIsPlaying(true);
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      setIsPlaying(false);
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (q.length === 0) return;
      const prevIdx = (idx - 1 + q.length) % q.length;
      queueIndexRef.current = prevIdx;
      setQueueIndex(prevIdx);
      setCurrentSong(q[prevIdx]);
      setIsPlaying(true);
      addToRecentlyPlayedInternal(q[prevIdx]);
      markPlayed(q[prevIdx].id);
    });
    navigator.mediaSession.setActionHandler("nexttrack",  () => { nextSongInternal(); });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
        setProgressState(details.seekTime);
      }
    });
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play",          null);
        navigator.mediaSession.setActionHandler("pause",         null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("nexttrack",     null);
        navigator.mediaSession.setActionHandler("seekto",        null);
      } catch { /**/ }
    };
  }, [nextSongInternal, addToRecentlyPlayedInternal, markPlayed]);

  const playSong = useCallback(
    (song: Song, songQueue?: Song[]) => {
      const q       = songQueue || [song];
      const idx     = q.findIndex((s) => s.id === song.id);
      const safeIdx = idx >= 0 ? idx : 0;
      queueRef.current      = q;
      queueIndexRef.current = safeIdx;
      setQueue(q);
      setQueueIndex(safeIdx);
      setCurrentSong(song);
      setIsPlaying(true);
      addToRecentlyPlayedInternal(song);
      markPlayed(song.id);
    },
    [addToRecentlyPlayedInternal, markPlayed]
  );

  const addToQueue = useCallback((song: Song) => {
    if (!queueRef.current.length || !currentSong) {
      const q = [song];
      queueRef.current      = q;
      queueIndexRef.current = 0;
      setQueue(q);
      setQueueIndex(0);
      setCurrentSong(song);
      setIsPlaying(true);
      markPlayed(song.id);
      return;
    }
    setQueue((prev) => {
      const idx  = queueIndexRef.current;
      const next = [...prev];
      next.splice(idx + 1, 0, song);
      queueRef.current = next;
      return next;
    });
  }, [currentSong, markPlayed]);

  const togglePlay = useCallback(() => { setIsPlaying((p) => !p); }, []);

  const nextSong = useCallback(() => { nextSongInternal(); }, [nextSongInternal]);

  const prevSong = useCallback(() => {
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setProgressState(0);
      return;
    }
    const prevIdx = (idx - 1 + q.length) % q.length;
    queueIndexRef.current = prevIdx;
    setQueueIndex(prevIdx);
    setCurrentSong(q[prevIdx]);
    setIsPlaying(true);
    addToRecentlyPlayedInternal(q[prevIdx]);
    markPlayed(q[prevIdx].id);
  }, [addToRecentlyPlayedInternal, markPlayed]);

  const setProgress = useCallback((value: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setProgressState(value);
    }
  }, []);

  const setVolume = useCallback((value: number) => { setVolumeState(value); }, []);

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
        currentSong, isPlaying, queue, queueIndex, progress, duration,
        volume, showPlayer, recentlyPlayed,
        playSong, togglePlay, nextSong, prevSong,
        setProgress, setVolume, setShowPlayer,
        toggleFavorite, isFavorite, addToQueue,
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