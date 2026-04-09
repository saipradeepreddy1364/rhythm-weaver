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
import { api } from "@/services/api";

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

function loadRecentTimestamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RECENTLY_PLAYED_TS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadPlayHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PLAYED_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function pruneAndSaveHistory(history: Record<string, number>): Record<string, number> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const pruned: Record<string, number> = {};
  for (const [id, ts] of Object.entries(history)) {
    if (ts >= cutoff) pruned[id] = ts;
  }
  localStorage.setItem(PLAYED_HISTORY_KEY, JSON.stringify(pruned));
  return pruned;
}

function pickNext(
  queue: Song[],
  currentIdx: number,
  playHistory: Record<string, number>,
  recentTimestamps: Record<string, number>
): number {
  if (queue.length === 0) return 0;
  const len = queue.length;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const recentlyPlayedIds = new Set<string>();
  for (const [id, ts] of Object.entries(playHistory)) {
    if (ts >= cutoff) recentlyPlayedIds.add(id);
  }
  for (const [id, ts] of Object.entries(recentTimestamps)) {
    if (ts >= cutoff) recentlyPlayedIds.add(id);
  }

  for (let offset = 1; offset <= len; offset++) {
    const idx = (currentIdx + offset) % len;
    if (!recentlyPlayedIds.has(queue[idx].id)) return idx;
  }
  return (currentIdx + 1) % len;
}

// ─── Resolve a fresh audioUrl when the stored one is missing/expired ──────────
// JioSaavn stream URLs are ephemeral — they are never stored in the backend.
// When a liked song is restored on a new device its audioUrl will be "".
// This helper fetches a fresh one by song ID before we attempt playback.
async function resolveAudioUrl(song: Song): Promise<Song> {
  if (song.audioUrl) return song; // already has a URL — nothing to do
  try {
    const freshUrl = await api.getSongById(song.id);
    if (freshUrl) return { ...song, audioUrl: freshUrl };
  } catch { /* fall through — return original */ }
  return song;
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

  const audioRef              = useRef<HTMLAudioElement | null>(null);
  const queueRef              = useRef<Song[]>([]);
  const queueIndexRef         = useRef(0);
  const playHistoryRef        = useRef<Record<string, number>>(loadPlayHistory());
  const shuffleRef            = useRef(false);
  const repeatRef             = useRef<"off" | "one" | "all">("off");
  const recentTimestampsRef   = useRef<Record<string, number>>(loadRecentTimestamps());
  const wakeLockRef           = useRef<WakeLockSentinel | null>(null);
  const intendToPlayRef       = useRef(false);
  const songEndingRef         = useRef(false);
  const stallRetryRef         = useRef(0);
  const stallTimerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Wake Lock ─────────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      if (wakeLockRef.current) return;
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      wakeLockRef.current.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
    } catch { /* not available */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && intendToPlayRef.current) {
        await requestWakeLock();
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) {
          try {
            await audio.play();
          } catch {
            const pos = audio.currentTime;
            const src = audio.src;
            if (src) {
              audio.src = src;
              audio.load();
              audio.currentTime = pos;
              audio.play().catch(() => {});
            }
          }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [requestWakeLock]);

  const addToRecentlyPlayedInternal = useCallback((song: Song) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const updated  = [song, ...filtered].slice(0, 50);
      localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
      const ts = { ...recentTimestampsRef.current, [song.id]: Date.now() };
      recentTimestampsRef.current = ts;
      localStorage.setItem(RECENTLY_PLAYED_TS_KEY, JSON.stringify(ts));
      return updated;
    });
  }, []);

  const markPlayed = useCallback((songId: string) => {
    playHistoryRef.current = pruneAndSaveHistory({
      ...playHistoryRef.current,
      [songId]: Date.now(),
    });
  }, []);

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

    songEndingRef.current = true;
    setTimeout(() => { songEndingRef.current = false; }, 3000);

    if (repeatRef.current === "one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      setProgressState(0);
      return;
    }

    let nextIdx: number;
    if (shuffleRef.current) {
      if (q.length === 1) { nextIdx = 0; }
      else {
        do { nextIdx = Math.floor(Math.random() * q.length); }
        while (nextIdx === idx);
      }
    } else {
      const history = pruneAndSaveHistory(playHistoryRef.current);
      playHistoryRef.current = history;
      nextIdx = pickNext(q, idx, history, recentTimestampsRef.current);
    }

    const nextSong = q[nextIdx];
    queueIndexRef.current = nextIdx;
    setQueueIndex(nextIdx);
    addToRecentlyPlayedInternal(nextSong);
    markPlayed(nextSong.id);

    // Resolve audioUrl before committing to state so the playback effect
    // always receives a song with a valid stream URL.
    resolveAudioUrl(nextSong).then((resolved) => {
      // Also patch the queue in-place so future plays of this song work too
      if (resolved.audioUrl !== nextSong.audioUrl) {
        queueRef.current = queueRef.current.map((s, i) =>
          i === nextIdx ? resolved : s
        );
        setQueue([...queueRef.current]);
      }
      setCurrentSong(resolved);
      setIsPlaying(true);
      intendToPlayRef.current = true;
    });
  }, [addToRecentlyPlayedInternal, markPlayed]);

  // ── Setup audio element ONCE ──────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = 0.7;
    audio.preload = "auto";

    (audio as any).setAttribute?.("playsinline", "true");
    (audio as any).setAttribute?.("webkit-playsinline", "true");
    (audio as any).setAttribute?.("x-webkit-airplay", "allow");
    audio.crossOrigin = "anonymous";

    const clearStallTimer = () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };

    const handleTimeUpdate = () => {
      if (!isNaN(audio.currentTime)) {
        setProgressState(audio.currentTime);
        stallRetryRef.current = 0;
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

    const handleDurationChange = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) setDuration(audio.duration);
    };

    const handleEnded = () => {
      if (!songEndingRef.current) nextSongInternal();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    };

    const handlePause = () => {
      setIsPlaying(false);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    };

    const handleWaiting = () => {
      clearStallTimer();
      stallTimerRef.current = setTimeout(async () => {
        if (!intendToPlayRef.current || audio.paused === false) return;
        stallRetryRef.current += 1;
        if (stallRetryRef.current > 3) {
          stallRetryRef.current = 0;
          nextSongInternal();
          return;
        }
        try {
          await audio.play();
        } catch {
          const pos = audio.currentTime;
          audio.load();
          audio.currentTime = pos;
          audio.play().catch(() => {});
        }
      }, 4000);
    };

    const handleCanPlay = () => {
      clearStallTimer();
      if (intendToPlayRef.current && audio.paused) {
        audio.play().catch(() => {});
      }
    };

    const handleError = () => {
      clearStallTimer();
      console.error("Audio playback error — skipping to next");
      setTimeout(() => nextSongInternal(), 800);
    };

    const handleAbort = () => {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    };

    audio.addEventListener("timeupdate",     handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended",          handleEnded);
    audio.addEventListener("play",           handlePlay);
    audio.addEventListener("pause",          handlePause);
    audio.addEventListener("waiting",        handleWaiting);
    audio.addEventListener("stalled",        handleWaiting);
    audio.addEventListener("canplay",        handleCanPlay);
    audio.addEventListener("error",          handleError);
    audio.addEventListener("abort",          handleAbort);

    return () => {
      clearStallTimer();
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate",     handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended",          handleEnded);
      audio.removeEventListener("play",           handlePlay);
      audio.removeEventListener("pause",          handlePause);
      audio.removeEventListener("waiting",        handleWaiting);
      audio.removeEventListener("stalled",        handleWaiting);
      audio.removeEventListener("canplay",        handleCanPlay);
      audio.removeEventListener("error",          handleError);
      audio.removeEventListener("abort",          handleAbort);
    };
  }, [nextSongInternal]);

  // When currentSong changes: load + play + wake lock + MediaSession
  useEffect(() => {
    if (!currentSong || !audioRef.current) return;
    const audio = audioRef.current;
    stallRetryRef.current = 0;
    setProgressState(0);
    setDuration(0);
    audio.src = currentSong.audioUrl;
    audio.load();
    intendToPlayRef.current = true;
    audio.play()
      .then(() => { requestWakeLock(); })
      .catch((err) => {
        console.error("Autoplay blocked:", err);
        setIsPlaying(false);
        intendToPlayRef.current = false;
      });
    updateMediaSession(currentSong, true, 0, 0);
  }, [currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle play/pause toggle
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;
    if (isPlaying) {
      intendToPlayRef.current = true;
      audioRef.current.play()
        .then(() => { requestWakeLock(); })
        .catch(() => setIsPlaying(false));
    } else {
      intendToPlayRef.current = false;
      audioRef.current.pause();
      releaseWakeLock();
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

  // ── MediaSession action handlers ─────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const registerHandlers = () => {
      try {
        navigator.mediaSession.setActionHandler("play", () => {
          intendToPlayRef.current = true;
          setIsPlaying(true);
          audioRef.current?.play().catch(() => {});
          navigator.mediaSession.playbackState = "playing";
          requestWakeLock();
        });
        navigator.mediaSession.setActionHandler("pause", () => {
          intendToPlayRef.current = false;
          setIsPlaying(false);
          audioRef.current?.pause();
          navigator.mediaSession.playbackState = "paused";
          releaseWakeLock();
        });
        navigator.mediaSession.setActionHandler("stop", () => {
          intendToPlayRef.current = false;
          setIsPlaying(false);
          audioRef.current?.pause();
          navigator.mediaSession.playbackState = "paused";
          releaseWakeLock();
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
          const prevSong = q[prevIdx];
          addToRecentlyPlayedInternal(prevSong);
          markPlayed(prevSong.id);
          resolveAudioUrl(prevSong).then((resolved) => {
            if (resolved.audioUrl !== prevSong.audioUrl) {
              queueRef.current = queueRef.current.map((s, i) =>
                i === prevIdx ? resolved : s
              );
              setQueue([...queueRef.current]);
            }
            setCurrentSong(resolved);
            setIsPlaying(true);
            intendToPlayRef.current = true;
          });
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
      } catch { /**/ }
    };

    registerHandlers();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        registerHandlers();
        if (audioRef.current) {
          navigator.mediaSession.playbackState = audioRef.current.paused ? "paused" : "playing";
          if (intendToPlayRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
          }
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
  }, [nextSongInternal, addToRecentlyPlayedInternal, markPlayed, requestWakeLock, releaseWakeLock]);

  // ── playSong: resolve audioUrl BEFORE setting currentSong ────────────────
  // This is the primary entry point from LikedSongs, Playlists, Search, etc.
  // Songs from the backend library on a fresh device have audioUrl = "".
  // We fetch a fresh stream URL first so the playback effect always gets a
  // valid src, with no silent failure.
  const playSong = useCallback(
    async (song: Song, songQueue?: Song[]) => {
      const q       = songQueue || [song];
      const idx     = q.findIndex((s) => s.id === song.id);
      const safeIdx = idx >= 0 ? idx : 0;

      // Resolve the clicked song immediately
      const resolved = await resolveAudioUrl(song);

      // Also patch the queue so songs played via next/prev later are already resolved
      const resolvedQueue = q.map((s, i) =>
        i === safeIdx ? resolved : s
      );

      queueRef.current      = resolvedQueue;
      queueIndexRef.current = safeIdx;
      setQueue(resolvedQueue);
      setQueueIndex(safeIdx);
      setCurrentSong(resolved);
      setIsPlaying(true);
      intendToPlayRef.current = true;
      addToRecentlyPlayedInternal(resolved);
      markPlayed(resolved.id);
    },
    [addToRecentlyPlayedInternal, markPlayed]
  );

  const addToQueue = useCallback((song: Song) => {
    if (!queueRef.current.length || !currentSong) {
      resolveAudioUrl(song).then((resolved) => {
        const q = [resolved];
        queueRef.current      = q;
        queueIndexRef.current = 0;
        setQueue(q);
        setQueueIndex(0);
        setCurrentSong(resolved);
        setIsPlaying(true);
        intendToPlayRef.current = true;
        markPlayed(resolved.id);
      });
      return;
    }
    // Queue for later — resolve lazily (will also be resolved in nextSongInternal)
    setQueue((prev) => {
      const insertIdx = queueIndexRef.current + 1;
      const next = [...prev];
      next.splice(insertIdx, 0, song);
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
    const prev = q[prevIdx];
    addToRecentlyPlayedInternal(prev);
    markPlayed(prev.id);
    resolveAudioUrl(prev).then((resolved) => {
      if (resolved.audioUrl !== prev.audioUrl) {
        queueRef.current = queueRef.current.map((s, i) =>
          i === prevIdx ? resolved : s
        );
        setQueue([...queueRef.current]);
      }
      setCurrentSong(resolved);
      setIsPlaying(true);
      intendToPlayRef.current = true;
    });
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

  const toggleShuffle = useCallback(() => { setShuffle((v) => !v); }, []);

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