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
import { api, extractAudioUrl } from "@/services/api";

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
  isRadioMode: boolean;
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
  // Use a shorter 1-hour window so songs become "fresh" again sooner
  // and the user doesn't wait 24 hours before repeat:all loops back naturally
  const cutoff = Date.now() - 60 * 60 * 1000;

  const recentlyPlayedIds = new Set<string>();
  for (const [id, ts] of Object.entries(playHistory)) {
    if (ts >= cutoff) recentlyPlayedIds.add(id);
  }
  for (const [id, ts] of Object.entries(recentTimestamps)) {
    if (ts >= cutoff) recentlyPlayedIds.add(id);
  }

  // Count how many songs in the queue are NOT in recent history
  const unplayedCount = queue.filter((s) => !recentlyPlayedIds.has(s.id)).length;

  // If every song has been played recently, clear the block and just advance linearly
  // so playback never stalls (full-cycle complete — start over)
  if (unplayedCount === 0) {
    return (currentIdx + 1) % len;
  }

  for (let offset = 1; offset <= len; offset++) {
    const idx = (currentIdx + offset) % len;
    if (!recentlyPlayedIds.has(queue[idx].id)) return idx;
  }
  return (currentIdx + 1) % len;
}

// ─── Fetch a fresh audioUrl for a song that has none (e.g. loaded from backend
//     liked-songs list on a new device where localStorage is empty) ───────────
async function resolveSongAudioUrl(song: Song): Promise<Song> {
  if (song.audioUrl) return song; // already has a URL — nothing to do

  try {
    const res  = await api.getSongById(song.id);
    const data = res?.data ?? res;
    const audioUrl = extractAudioUrl(data);
    if (audioUrl) {
      return { ...song, audioUrl };
    }
  } catch (err) {
    console.error("[PlayerContext] Failed to fetch audioUrl for", song.id, err);
  }

  return song; // return as-is; audio element error handler will auto-skip
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
  const currentSongRef        = useRef<Song | null>(null); // always mirrors currentSong for background access
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
  const lastPlayedSongRef     = useRef<Song | null>(null); // seed for radio mode
  const radioFetchingRef      = useRef(false);             // prevent concurrent radio fetches
  const [isRadioMode, setIsRadioMode] = useState(false);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);

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

  // ── Wake Lock ──────────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      if (wakeLockRef.current) return;
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      wakeLockRef.current.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
    } catch { /* not available — ignore */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  // Re-acquire wake lock when page becomes visible again (iOS drops it on lock)
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

  // ── Radio: fetch more songs based on the last-played song's language/artist ──
  // Called automatically when the queue runs out in repeat:off mode.
  const fetchRadioSongs = useCallback(async (seed: Song): Promise<Song[]> => {
    // Build a query from available metadata — prefer language-aware terms
    const artist = seed.artist || "";
    const movie  = (seed as any).movie || (seed as any).album || "";
    // Detect language heuristically: Tamil/Telugu/Hindi artists often have
    // movie names in those scripts, but we can also check for known fields
    const lang   = (seed as any).language || "";

    // Build search query: artist name gives the best "similar songs" results
    let query = artist || movie || "trending songs";
    if (lang) query = `${lang} songs ${artist}`.trim();
    else if (artist) query = `${artist} songs`;

    try {
      // Use the existing api search — most music apps expose a search endpoint
      const res  = await (api as any).search?.(query) ?? await (api as any).getSongs?.(query);
      const raw  = Array.isArray(res) ? res : (res?.data ?? res?.results ?? []);
      if (!Array.isArray(raw) || raw.length === 0) return [];

      // Map to Song objects (reuse any existing mapper the app already has)
      const { mapApiSong } = await import("@/data/songs").catch(() => ({ mapApiSong: null }));
      const songs: Song[] = raw
        .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
        .filter((s: any): s is Song => !!s && !!s.id);

      // Exclude songs already in the current queue to avoid repeats
      const existingIds = new Set(queueRef.current.map((s) => s.id));
      return songs.filter((s) => !existingIds.has(s.id)).slice(0, 20);
    } catch (err) {
      console.warn("[PlayerContext] Radio fetch failed:", err);
      return [];
    }
  }, []);

  // ── Resolve all missing audioUrls in a queue (e.g. liked songs from backend) ─
  // Fires in the background; patches queueRef + state as each song resolves.
  const resolveQueueAudioUrls = useCallback(async (songs: Song[]) => {
    const unresolved = songs.filter((s) => !s.audioUrl);
    if (unresolved.length === 0) return;

    await Promise.allSettled(
      unresolved.map(async (song) => {
        const resolved = await resolveSongAudioUrl(song);
        if (resolved.audioUrl === song.audioUrl) return; // nothing changed
        // Patch in queueRef
        const q = [...queueRef.current];
        const i = q.findIndex((s) => s.id === resolved.id);
        if (i >= 0) {
          q[i] = resolved;
          queueRef.current = q;
          setQueue([...q]);
          // Also update currentSong if it's the one we just resolved
          if (queueIndexRef.current === i) {
            setCurrentSong(resolved);
          }
        }
      })
    );
  }, []);

  // ── Direct audio playback helper ─────────────────────────────────────────
  // CRITICAL for locked-screen playback: iOS/Android suspend React's render
  // pipeline when the screen is locked. This means setCurrentSong() + useEffect
  // won't fire to load the next song. We bypass React entirely by setting
  // audio.src and calling audio.play() directly from nextSongInternal.
  const playAudioDirectly = useCallback((song: Song) => {
    const audio = audioRef.current;
    if (!audio || !song.audioUrl) return;
    stallRetryRef.current = 0;
    audio.src = song.audioUrl;
    audio.load();
    intendToPlayRef.current = true;
    audio.play().catch((err) => {
      console.error("[PlayerContext] Direct play failed:", err);
    });
    // Update MediaSession metadata immediately so the lock screen shows the new song
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title:   song.title,
        artist:  song.artist || "",
        album:   (song as any).movie || (song as any).album || "",
        artwork: song.albumArt
          ? [
              { src: song.albumArt, sizes: "96x96",   type: "image/jpeg" },
              { src: song.albumArt, sizes: "128x128",  type: "image/jpeg" },
              { src: song.albumArt, sizes: "192x192",  type: "image/jpeg" },
              { src: song.albumArt, sizes: "256x256",  type: "image/jpeg" },
              { src: song.albumArt, sizes: "512x512",  type: "image/jpeg" },
            ]
          : [],
      });
      navigator.mediaSession.playbackState = "playing";
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
    } else if (repeatRef.current === "off") {
      if (idx >= q.length - 1) {
        // End of queue — kick off a radio fetch from the last played song
        const seed = lastPlayedSongRef.current ?? q[idx];
        if (!radioFetchingRef.current && seed) {
          radioFetchingRef.current = true;
          setIsRadioMode(true);
          fetchRadioSongs(seed).then((radioSongs) => {
            radioFetchingRef.current = false;
            if (radioSongs.length === 0) {
              // Nothing fetched — stop gracefully
              songEndingRef.current   = false;
              intendToPlayRef.current = false;
              setIsPlaying(false);
              setIsRadioMode(false);
              if (audioRef.current) audioRef.current.pause();
              return;
            }
            // Append radio songs to the queue and play the first new one
            const newQ    = [...queueRef.current, ...radioSongs];
            const newIdx  = queueRef.current.length; // first of the newly added
            queueRef.current      = newQ;
            queueIndexRef.current = newIdx;
            setQueue(newQ);
            setQueueIndex(newIdx);
            const next = newQ[newIdx];
            // Resolve audioUrl if needed then play
            resolveSongAudioUrl(next).then((resolved) => {
              newQ[newIdx] = resolved;
              queueRef.current = [...newQ];
              setQueue([...newQ]);
              setCurrentSong(resolved);
              setIsPlaying(true);
              intendToPlayRef.current = true;
              addToRecentlyPlayedInternal(resolved);
              markPlayed(resolved.id);
              lastPlayedSongRef.current = resolved;
              playAudioDirectly(resolved); // bypass React render for lock-screen
            });
          });
        } else if (!seed) {
          // No seed — just stop
          songEndingRef.current   = false;
          intendToPlayRef.current = false;
          setIsPlaying(false);
          if (audioRef.current) audioRef.current.pause();
        }
        return;
      }
      nextIdx = idx + 1;
    } else {
      // repeat === "all": smart history-based pick that wraps around
      const history = pruneAndSaveHistory(playHistoryRef.current);
      playHistoryRef.current = history;
      nextIdx = pickNext(q, idx, history, recentTimestampsRef.current);
    }

    const candidate = q[nextIdx];

    // If the next song has no audioUrl (backend-loaded liked song on new device),
    // fetch it asynchronously then update the queue and set as current song
    if (!candidate.audioUrl) {
      resolveSongAudioUrl(candidate).then((resolved) => {
        // Patch the queue so the resolved URL is used going forward
        const patchedQ = [...queueRef.current];
        patchedQ[nextIdx] = resolved;
        queueRef.current      = patchedQ;
        queueIndexRef.current = nextIdx;
        setQueue(patchedQ);
        setQueueIndex(nextIdx);
        setCurrentSong(resolved);
        setIsPlaying(true);
        intendToPlayRef.current = true;
        addToRecentlyPlayedInternal(resolved);
        markPlayed(resolved.id);
        lastPlayedSongRef.current = resolved;
        playAudioDirectly(resolved); // bypass React render for lock-screen
      });
    } else {
      queueIndexRef.current = nextIdx;
      setQueueIndex(nextIdx);
      setCurrentSong(candidate);
      setIsPlaying(true);
      intendToPlayRef.current = true;
      addToRecentlyPlayedInternal(candidate);
      markPlayed(candidate.id);
      lastPlayedSongRef.current = candidate;
      playAudioDirectly(candidate); // bypass React render for lock-screen
    }
  }, [addToRecentlyPlayedInternal, markPlayed, fetchRadioSongs, playAudioDirectly]);

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
        lastProgressTime = audio.currentTime;
        lastProgressAt   = Date.now();
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

    // Track last time-update so we can detect genuine freezes vs normal buffering
    let lastProgressTime = -1;
    let lastProgressAt   = 0;

    const handleWaiting = () => {
      clearStallTimer();
      stallTimerRef.current = setTimeout(async () => {
        if (!intendToPlayRef.current) return;

        // If currentTime has advanced since the stall started — just slow network, not frozen
        if (audio.currentTime !== lastProgressTime && (Date.now() - lastProgressAt) < 3000) return;

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
      stallRetryRef.current = 0; // reset on successful buffer — prevents cross-song counter accumulation
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
  // If audioUrl is empty (liked song from backend), resolve it here before playing.
  useEffect(() => {
    if (!currentSong || !audioRef.current) return;
    const audio = audioRef.current;
    const songId = currentSong.id;
    let cancelled = false;

    const startPlayback = (url: string) => {
      if (cancelled) return;
      // If playAudioDirectly() already loaded this URL (lock-screen transition),
      // don't reload — just ensure the play state is consistent.
      const audio = audioRef.current!;
      const alreadyLoaded = audio.src === url || audio.src.endsWith(url);
      if (alreadyLoaded && !audio.paused) {
        // Already playing — just sync React state and MediaSession
        requestWakeLock();
        updateMediaSession(currentSong, true, audio.currentTime, audio.duration);
        return;
      }
      stallRetryRef.current = 0;
      setProgressState(0);
      setDuration(0);
      audio.src = url;
      audio.load();
      intendToPlayRef.current = true;
      audio.play()
        .then(() => { requestWakeLock(); })
        .catch((err) => {
          if (cancelled) return;
          console.error("Autoplay blocked:", err);
          setIsPlaying(false);
          intendToPlayRef.current = false;
        });
      updateMediaSession(currentSong, true, 0, 0);
    };

    if (currentSong.audioUrl) {
      // URL already known — start immediately
      startPlayback(currentSong.audioUrl);
    } else {
      // audioUrl is empty (liked song from backend with no cached URL)
      // Show playing state while we fetch, then start audio
      setIsPlaying(true);
      intendToPlayRef.current = true;
      resolveSongAudioUrl(currentSong).then((resolved) => {
        if (cancelled) return;
        if (!resolved.audioUrl) {
          console.error("[PlayerContext] Could not resolve audioUrl for", songId);
          setIsPlaying(false);
          intendToPlayRef.current = false;
          setTimeout(() => nextSongInternal(), 800);
          return;
        }
        // Patch resolved URL into state so queue stays in sync
        setCurrentSong(resolved);
        setQueue((prev) => {
          const patched = prev.map((s) => s.id === resolved.id ? resolved : s);
          queueRef.current = patched;
          return patched;
        });
        startPlayback(resolved.audioUrl);
      });
    }

    return () => { cancelled = true; };
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
          setCurrentSong(q[prevIdx]);
          setIsPlaying(true);
          intendToPlayRef.current = true;
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

  // ── playSong — resolves audioUrl on the fly if missing ────────────────────
  const playSong = useCallback(
    async (song: Song, songQueue?: Song[]) => {
      // Reset radio mode whenever user explicitly picks a song
      setIsRadioMode(false);
      radioFetchingRef.current = false;

      // Resolve audioUrl before anything else — core fix for liked songs
      // loaded from the backend on a new device (no localStorage cache)
      const resolved = await resolveSongAudioUrl(song);

      // If we patched the URL, also patch it inside the queue so next/prev work
      let q = songQueue || [resolved];
      if (resolved.audioUrl !== song.audioUrl) {
        q = q.map((s) => (s.id === resolved.id ? resolved : s));
      }

      const idx     = q.findIndex((s) => s.id === resolved.id);
      const safeIdx = idx >= 0 ? idx : 0;

      queueRef.current      = q;
      queueIndexRef.current = safeIdx;
      setQueue(q);
      setQueueIndex(safeIdx);
      lastPlayedSongRef.current = resolved;
      addToRecentlyPlayedInternal(resolved);
      markPlayed(resolved.id);

      // If the user clicked the SAME song that's already current, the useEffect
      // on [currentSong?.id] won't re-fire — so restart the audio directly here.
      if (currentSong?.id === resolved.id && audioRef.current) {
        const audio = audioRef.current;
        audio.currentTime = 0;
        setProgressState(0);
        intendToPlayRef.current = true;
        setIsPlaying(true);
        audio.play().catch(() => {});
      } else {
        setCurrentSong(resolved);
        setIsPlaying(true);
        intendToPlayRef.current = true;
      }

      // Resolve any remaining songs in the queue that have no audioUrl in background
      resolveQueueAudioUrls(q);
    },
    [addToRecentlyPlayedInternal, markPlayed, resolveQueueAudioUrls, currentSong]
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
      intendToPlayRef.current = true;
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
    const candidate = q[prevIdx];

    if (!candidate.audioUrl) {
      resolveSongAudioUrl(candidate).then((resolved) => {
        const patchedQ = [...queueRef.current];
        patchedQ[prevIdx] = resolved;
        queueRef.current      = patchedQ;
        queueIndexRef.current = prevIdx;
        setQueue(patchedQ);
        setQueueIndex(prevIdx);
        setCurrentSong(resolved);
        setIsPlaying(true);
        intendToPlayRef.current = true;
        addToRecentlyPlayedInternal(resolved);
        markPlayed(resolved.id);
      });
    } else {
      queueIndexRef.current = prevIdx;
      setQueueIndex(prevIdx);
      setCurrentSong(candidate);
      setIsPlaying(true);
      intendToPlayRef.current = true;
      addToRecentlyPlayedInternal(candidate);
      markPlayed(candidate.id);
    }
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
        volume, showPlayer, recentlyPlayed, shuffle, repeat, isRadioMode,
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