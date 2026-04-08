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
  shuffle: boolean;
  repeat: "off" | "one" | "all";
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
  toggleShuffle: () => void;
  cycleRepeat: () => void;
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

/** Prune entries older than 24 hours and persist */
function pruneAndSaveHistory(history: Record<string, number>): Record<string, number> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // full day
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
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // avoid songs played any time today

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
  const [shuffle, setShuffle]         = useState(false);
  const [repeat, setRepeat]           = useState<"off" | "one" | "all">("off");

  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const queueRef          = useRef<Song[]>([]);
  const queueIndexRef     = useRef(0);
  const playHistoryRef    = useRef<Record<string, number>>(loadPlayHistory());
  const shuffleRef        = useRef(false);
  const repeatRef         = useRef<"off" | "one" | "all">("off");
  // Keep recent timestamps in a ref so pickNext can access them without stale closure
  const recentTimestampsRef = useRef<Record<string, number>>(loadRecentTimestamps());

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

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

  /** Update MediaSession metadata + position state for lock screen */
  const updateMediaSession = useCallback((song: Song, playing: boolean, pos = 0, dur = 0) => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:   song.title,
      artist:  song.artist,
      album:   song.movie || song.album || "",
      artwork: song.albumArt
        ? [
            { src: song.albumArt, sizes: "96x96",   type: "image/jpeg" },
            { src: song.albumArt, sizes: "128x128",  type: "image/jpeg" },
            { src: song.albumArt, sizes: "192x192",  type: "image/jpeg" },
            { src: song.albumArt, sizes: "256x256",  type: "image/jpeg" },
            { src: song.albumArt, sizes: "384x384",  type: "image/jpeg" },
            { src: song.albumArt, sizes: "512x512",  type: "image/jpeg" },
          ]
        : [],
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    // setPositionState lets the OS show a seek bar and enables next/prev on lock screen
    if (dur > 0 && isFinite(dur)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: 1,
          position: Math.min(pos, dur),
        });
      } catch { /**/ }
    }
  }, []);

  const nextSongInternal = useCallback(() => {
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    // Repeat-one: restart current song
    if (repeatRef.current === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      setProgressState(0);
      return;
    }

    let nextIdx: number;
    if (shuffleRef.current) {
      // Random next song (not the same as current)
      if (q.length === 1) { nextIdx = 0; }
      else {
        do { nextIdx = Math.floor(Math.random() * q.length); }
        while (nextIdx === idx);
      }
    } else {
      // Prune stale entries first
      const history = pruneAndSaveHistory(playHistoryRef.current);
      playHistoryRef.current = history;
      nextIdx = pickNext(q, idx, history, recentTimestampsRef.current);
    }

    // Repeat-all: wrap around silently (pickNext already does this, but be explicit)
    if (!shuffleRef.current && repeatRef.current === "off" && nextIdx <= idx && q.length > 1) {
      // allow wrap — pickNext returns 0 when all played, that's fine
    }

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

    const handleTimeUpdate     = () => {
      if (!isNaN(audio.currentTime)) {
        setProgressState(audio.currentTime);
        // Keep lock screen seek bar in sync (throttle: every ~1s is fine)
        if ("mediaSession" in navigator && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              playbackRate: audio.playbackRate || 1,
              position: Math.min(audio.currentTime, audio.duration),
            });
          } catch { /**/ }
        }
      }
    };
    const handleDurationChange = () => { if (!isNaN(audio.duration) && isFinite(audio.duration)) setDuration(audio.duration); };
    const handleEnded          = () => { nextSongInternal(); };
    const handlePlay           = () => {
      setIsPlaying(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    };
    const handlePause          = () => {
      setIsPlaying(false);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    };
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
    updateMediaSession(currentSong, true, 0, 0);
  }, [currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle play/pause toggle — also update MediaSession playback state
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
    if (currentSong) {
      const dur = audioRef.current.duration;
      const pos = audioRef.current.currentTime;
      updateMediaSession(currentSong, isPlaying, pos, dur);
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volume changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Register MediaSession action handlers
  // Re-registers on visibilitychange so iOS lock screen controls keep working after screen unlock
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const registerHandlers = () => {
      navigator.mediaSession.setActionHandler("play", () => {
        setIsPlaying(true);
        audioRef.current?.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        setIsPlaying(false);
        audioRef.current?.pause();
        navigator.mediaSession.playbackState = "paused";
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        setIsPlaying(false);
        audioRef.current?.pause();
        navigator.mediaSession.playbackState = "paused";
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        const q   = queueRef.current;
        const idx = queueIndexRef.current;
        if (q.length === 0) return;
        if (audioRef.current && audioRef.current.currentTime > 3) {
          audioRef.current.currentTime = 0;
          setProgressState(0);
          navigator.mediaSession.playbackState = "playing";
          return;
        }
        const prevIdx = (idx - 1 + q.length) % q.length;
        queueIndexRef.current = prevIdx;
        setQueueIndex(prevIdx);
        setCurrentSong(q[prevIdx]);
        setIsPlaying(true);
        addToRecentlyPlayedInternal(q[prevIdx]);
        markPlayed(q[prevIdx].id);
        navigator.mediaSession.playbackState = "playing";
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        nextSongInternal();
        navigator.mediaSession.playbackState = "playing";
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime != null && audioRef.current) {
          audioRef.current.currentTime = details.seekTime;
          setProgressState(details.seekTime);
          try {
            const dur = audioRef.current.duration;
            if (dur > 0 && isFinite(dur)) {
              navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: 1,
                position: Math.min(details.seekTime, dur),
              });
            }
          } catch { /**/ }
        }
      });
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        if (audioRef.current) {
          const skip = details.seekOffset || 10;
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - skip);
          setProgressState(audioRef.current.currentTime);
        }
      });
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        if (audioRef.current) {
          const skip = details.seekOffset || 10;
          const dur  = audioRef.current.duration;
          audioRef.current.currentTime = Math.min(isFinite(dur) ? dur : Infinity, audioRef.current.currentTime + skip);
          setProgressState(audioRef.current.currentTime);
        }
      });
    };

    // Register immediately
    registerHandlers();

    // Re-register when screen unlocks — iOS drops handlers on lock screen
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        registerHandlers();
        if (audioRef.current) {
          navigator.mediaSession.playbackState = audioRef.current.paused ? "paused" : "playing";
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      try {
        (["play","pause","stop","previoustrack","nexttrack","seekto","seekbackward","seekforward"] as MediaSessionAction[])
          .forEach((a) => { try { navigator.mediaSession.setActionHandler(a, null); } catch { /**/ } });
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

  const toggleShuffle = useCallback(() => {
    setShuffle((v) => !v);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((v) => v === "off" ? "all" : v === "all" ? "one" : "off");
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentSong, isPlaying, queue, queueIndex, progress, duration,
        volume, showPlayer, recentlyPlayed, shuffle, repeat,
        playSong, togglePlay, nextSong, prevSong,
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