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
import { useMediaSession, resolveStreamUrl } from "../components/useMediaSession";
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

// ─── URL age — JioSaavn CDN URLs expire after ~60 min ────────────────────────
// The pre-load pipeline in useMediaSession fetches URLs while screen is ON,
// so this backstop mainly guards first-play. Set aggressively at 10 min.
const urlFetchedAt = new Map<string, number>();
const URL_MAX_AGE_MS = 10 * 60 * 1000;

function isUrlStale(songId: string): boolean {
  const t = urlFetchedAt.get(songId);
  return !t || Date.now() - t > URL_MAX_AGE_MS;
}

// ─── Resolve a fresh audioUrl using the shared module-level cache ─────────────
async function resolveSongAudioUrl(song: Song): Promise<Song> {
  const url = `https://musicbackend-xg4u.onrender.com/api/songs/${song.id}/stream`;
  return { ...song, audioUrl: url };
}

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSongRef = useRef<Song | null>(null);
  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<"off" | "one" | "all">("off");
  const intendToPlayRef = useRef(false);
  const songEndingRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const nextSongInternalRef = useRef<() => void>(() => {});
  const stallRetryRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlayedSongRef = useRef<Song | null>(null);
  const radioFetchingRef = useRef(false);
  const libraryQueueRef = useRef(false);
  // Consecutive error counter — stops cascade-skip when backend is down
  const consecutiveErrorsRef = useRef(0);
  const errorBackoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  useEffect(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }, [favorites]);

  // Re-acquire audio on visibility change (iOS drops audio context on lock)
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && intendToPlayRef.current) {
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
  }, []);

  const addToRecentlyPlayedInternal = useCallback((_song: Song) => {
    // Recently played is managed by LibraryContext (no localStorage here)
  }, []);

  // ── Radio: fetch more songs based on the last-played song ────────────────
  const fetchRadioSongs = useCallback(async (seed: Song): Promise<Song[]> => {
    const artist = seed.artist || "";
    const movie = (seed as any).movie || (seed as any).album || "";
    const lang = (seed as any).language || "";

    let query = artist || movie || "trending songs";
    if (lang) query = `${lang} songs ${artist}`.trim();
    else if (artist) query = `${artist} songs`;

    try {
      const apiAny = api as any;
      let res: any;
      if (typeof apiAny.search === "function") res = await apiAny.search(query);
      else if (typeof apiAny.getSongs === "function") res = await apiAny.getSongs(query);
      else if (typeof apiAny.searchSongs === "function") res = await apiAny.searchSongs(query);
      else if (typeof apiAny.getTrending === "function") res = await apiAny.getTrending();

      const raw = Array.isArray(res) ? res : (res?.data ?? res?.results ?? res?.songs ?? []);
      if (!Array.isArray(raw) || raw.length === 0) return [];

      const { mapApiSong } = await import("@/data/songs").catch(() => ({ mapApiSong: null }));
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

  // ── Resolve all audioUrls in a queue — eagerly in parallel ──────────────
  // Called when playSong() starts so ALL URLs are warm before any song is needed.
  // Also called proactively 10 min before each URL would expire.
  const resolveQueueAudioUrls = useCallback(async (songs: Song[]) => {
    // Resolve EVERYTHING in parallel — don't wait for previous ones
    await Promise.allSettled(
      songs.map(async (song) => {
        const resolved = await resolveSongAudioUrl(song);
        if (resolved.audioUrl === song.audioUrl && resolved.audioUrl) return;
        if (!resolved.audioUrl) return;
        const q = [...queueRef.current];
        const i = q.findIndex((s) => s.id === resolved.id);
        if (i >= 0) {
          q[i] = resolved;
          queueRef.current = q;
          setQueue([...q]);
          if (queueIndexRef.current === i) setCurrentSong(resolved);
        }
      })
    );
  }, []);

  // ── Direct audio playback — bypasses React render for locked-screen ───────
  // CRITICAL FIX: Always read the URL from urlCache FIRST (kept fresh by the
  // Web Worker even while the screen is locked), then fall back to song.audioUrl.
  // Previously we used song.audioUrl directly — but song objects in queueRef
  // hold the URL from when the song was first resolved (could be hours old).
  // The worker updates urlCache with fresh URLs every 60 s, but those never
  // made it into the actual song objects, so every song after the first played
  // with a stale expired URL and failed silently.
  const playAudioDirectly = useCallback((song: Song) => {
    const audio = audioRef.current;
    if (!audio) return;

    const doPlay = (s: Song) => {
      if (!s.audioUrl) {
        console.warn("[PlayerContext] playAudioDirectly: no audioUrl for", s.id);
        setTimeout(() => nextSongInternalRef.current(), 500);
        return;
      }
      stallRetryRef.current = 0;
      isTransitioningRef.current = true;
      const clearTransition = () => { isTransitioningRef.current = false; };
      const transitionGuard = setTimeout(clearTransition, 2000);
      audio.src = s.audioUrl;
      audio.load();
      intendToPlayRef.current = true;
      audio.play()
        .then(() => { clearTimeout(transitionGuard); isTransitioningRef.current = false; })
        .catch((err) => {
          clearTimeout(transitionGuard);
          isTransitioningRef.current = false;
          console.error("[PlayerContext] Direct play failed:", err);
        });
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: s.title,
          artist: s.artist || "",
          album: (s as any).movie || (s as any).album || "",
          artwork: s.albumArt
            ? [
                { src: s.albumArt, sizes: "96x96",   type: "image/jpeg" },
                { src: s.albumArt, sizes: "128x128", type: "image/jpeg" },
                { src: s.albumArt, sizes: "192x192", type: "image/jpeg" },
                { src: s.albumArt, sizes: "256x256", type: "image/jpeg" },
                { src: s.albumArt, sizes: "512x512", type: "image/jpeg" },
              ]
            : [],
        });
        navigator.mediaSession.playbackState = "playing";
      }
    };

    // Step 1: Check urlCache first — the Web Worker keeps this fresh every 60 s
    // even while the screen is locked. Song objects in queueRef hold stale URLs.
    const cachedUrl = (window as any).__rwUrlCache?.get(song.id) as string | undefined;
    if (cachedUrl) {
      doPlay({ ...song, audioUrl: cachedUrl });
      return;
    }

    // Step 2: Song object has a URL — use it but also refresh cache for next time
    if (song.audioUrl) {
      doPlay(song);
      // Async refresh in background so next play of this song gets a fresh URL
      resolveSongAudioUrl(song).catch(() => {});
      return;
    }

    // Step 3: No URL anywhere — fetch one now
    resolveSongAudioUrl(song).then((resolved) => {
      const q = [...queueRef.current];
      const i = q.findIndex((s) => s.id === resolved.id);
      if (i >= 0) {
        q[i] = resolved;
        queueRef.current = q;
        setQueue([...q]);
        if (queueIndexRef.current === i) setCurrentSong(resolved);
      }
      doPlay(resolved);
    });
  }, []);

  const nextSongInternal = useCallback(() => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    songEndingRef.current = true;

    // repeat:one — restart current
    if (repeatRef.current === "one") {
      const audio = audioRef.current;
      if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
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
        // repeat:off — queue finished, stop playback (for both library and regular queues).
        // User can enable repeat:all or repeat:one via the repeat button to change this behaviour.
        // Non-library queue: try radio
        const seed = lastPlayedSongRef.current ?? q[idx];
        if (!radioFetchingRef.current && seed) {
          radioFetchingRef.current = true;
          setIsRadioMode(true);
          fetchRadioSongs(seed).then((radioSongs) => {
            radioFetchingRef.current = false;
            if (radioSongs.length === 0) {
              setIsRadioMode(false);
              const q2 = queueRef.current;
              if (q2.length === 0) {
                songEndingRef.current = false;
                intendToPlayRef.current = false;
                setIsPlaying(false);
                if (audioRef.current) audioRef.current.pause();
                return;
              }
              // Fallback: loop the queue
              const firstSong = q2[0];
              queueIndexRef.current = 0;
              setQueueIndex(0);
              setCurrentSong(firstSong);
              setIsPlaying(true);
              intendToPlayRef.current = true;
              addToRecentlyPlayedInternal(firstSong);
              lastPlayedSongRef.current = firstSong;
              playAudioDirectly(firstSong);
              return;
            }
            const newQ = [...queueRef.current, ...radioSongs];
            const newIdx = queueRef.current.length;
            queueRef.current = newQ;
            queueIndexRef.current = newIdx;
            setQueue(newQ);
            setQueueIndex(newIdx);
            const next = newQ[newIdx];
            resolveSongAudioUrl(next).then((resolved) => {
              newQ[newIdx] = resolved;
              queueRef.current = [...newQ];
              setQueue([...newQ]);
              setCurrentSong(resolved);
              setIsPlaying(true);
              intendToPlayRef.current = true;
              addToRecentlyPlayedInternal(resolved);
              lastPlayedSongRef.current = resolved;
              playAudioDirectly(resolved);
            });
          });
        } else if (!seed) {
          songEndingRef.current = false;
          intendToPlayRef.current = false;
          setIsPlaying(false);
          if (audioRef.current) audioRef.current.pause();
        }
        return;
      }
      nextIdx = idx + 1;
    } else {
      // repeat:all — wrap around
      nextIdx = (idx + 1) % q.length;
    }

    const candidate = q[nextIdx];

    // CRITICAL FIX: Always check urlCache before trusting candidate.audioUrl.
    // The Web Worker refreshes urlCache every 60 s while the screen is locked,
    // but never writes back into the song objects stored in queueRef. So
    // candidate.audioUrl may be hours-old and expired. urlCache is always fresher.
    const cachedUrl = (window as any).__rwUrlCache?.get(candidate.id) as string | undefined;

    if (cachedUrl) {
      // Best case: worker already has a fresh URL ready — use it immediately
      const patchedQ = [...queueRef.current];
      const patched  = { ...candidate, audioUrl: cachedUrl };
      patchedQ[nextIdx]     = patched;
      queueRef.current      = patchedQ;
      queueIndexRef.current = nextIdx;
      setQueue(patchedQ);
      setQueueIndex(nextIdx);
      setCurrentSong(patched);
      setIsPlaying(true);
      intendToPlayRef.current = true;
      addToRecentlyPlayedInternal(patched);
      lastPlayedSongRef.current = patched;
      playAudioDirectly(patched);
    } else if (!candidate.audioUrl) {
      // No URL anywhere — fetch one now before playing
      resolveSongAudioUrl(candidate).then((resolved) => {
        if (!resolved.audioUrl) {
          console.warn("[PlayerContext] Could not resolve audioUrl for", resolved.id, "— skipping");
          queueIndexRef.current = nextIdx;
          nextSongInternalRef.current();
          return;
        }
        const patchedQ = [...queueRef.current];
        patchedQ[nextIdx] = resolved;
        queueRef.current = patchedQ;
        queueIndexRef.current = nextIdx;
        setQueue(patchedQ);
        setQueueIndex(nextIdx);
        setCurrentSong(resolved);
        setIsPlaying(true);
        intendToPlayRef.current = true;
        addToRecentlyPlayedInternal(resolved);
        lastPlayedSongRef.current = resolved;
        playAudioDirectly(resolved);
      });
    } else {
      // candidate.audioUrl exists and nothing fresher in cache — use it,
      // but kick off a background refresh so the NEXT song is always ready
      queueIndexRef.current = nextIdx;
      setQueueIndex(nextIdx);
      setCurrentSong(candidate);
      setIsPlaying(true);
      intendToPlayRef.current = true;
      addToRecentlyPlayedInternal(candidate);
      lastPlayedSongRef.current = candidate;
      playAudioDirectly(candidate);
    }
  }, [addToRecentlyPlayedInternal, fetchRadioSongs, playAudioDirectly]);

  // Keep ref current so audio ended listener never goes stale
  useEffect(() => { nextSongInternalRef.current = nextSongInternal; }, [nextSongInternal]);

  // ── Setup audio element ONCE ──────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = 0.7;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    audio.setAttribute("x-webkit-airplay", "allow");
    // NOTE: Do NOT set crossOrigin="anonymous" — JioSaavn CDN does not send CORS
    // headers, so setting this causes the browser to block the entire stream load,
    // preventing loadedmetadata from firing and leaving duration permanently at 0.

    const clearStallTimer = () => {
      if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
    };

    let lastProgressTime = -1;
    let lastProgressAt = 0;

    const handleTimeUpdate = () => {
      if (!isNaN(audio.currentTime)) {
        setProgressState(audio.currentTime);
        stallRetryRef.current = 0;
        lastProgressTime = audio.currentTime;
        lastProgressAt = Date.now();
        // Final fallback: read duration from audio element on every timeupdate.
        // By the time timeupdate fires, duration is always available. This catches
        // any edge case where loadedmetadata / durationchange / canplay were missed.
        if (!isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
          setDuration((prev) => (prev !== audio.duration ? audio.duration : prev));
        }
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
      if (!isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handleLoadedMetadata = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      if (!songEndingRef.current) nextSongInternalRef.current();
    };

    const handlePlay = () => {
      songEndingRef.current = false;
      consecutiveErrorsRef.current = 0; // successful play = backend is up
      setIsPlaying(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    };

    const handlePause = () => {
      // Ignore pauses fired during song transitions (src swap)
      if (isTransitioningRef.current) return;
      // If we intended to play (intendToPlayRef), this pause came from the OS
      // (phone call, another app). Don't fight it — sync React state.
      // useMediaSession's audio focus listener will handle the resumePlayback call.
      if (!intendToPlayRef.current) {
        setIsPlaying(false);
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
      }
    };

    const handleWaiting = () => {
      clearStallTimer();
      stallTimerRef.current = setTimeout(async () => {
        if (!intendToPlayRef.current) return;
        if (audio.currentTime !== lastProgressTime || (Date.now() - lastProgressAt) < 8000) return;
        stallRetryRef.current += 1;
        if (stallRetryRef.current > 5) {
          stallRetryRef.current = 0;
          nextSongInternalRef.current();
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
      }, 12000);
    };

    const handleCanPlay = () => {
      clearStallTimer();
      stallRetryRef.current = 0;
      // canplay is a reliable fallback for duration — fires after loadedmetadata
      // once enough data is buffered. By this point audio.duration is always set.
      if (!isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      if (intendToPlayRef.current && audio.paused) audio.play().catch(() => {});
    };

    const handleError = () => {
      clearStallTimer();
      consecutiveErrorsRef.current += 1;

      const song = currentSongRef.current;
      const errCode = (audio.error?.code ?? 0);

      // MEDIA_ERR_SRC_NOT_SUPPORTED (4) = URL expired or empty src.
      // Try to re-resolve before giving up. Clear the stale cache entry first.
      if (errCode === 4 && song) {
        // Evict the stale URL from both caches so resolveStreamUrl fetches fresh
        urlFetchedAt.delete(song.id);
        const { urlCache } = require ? { urlCache: null } : { urlCache: null };
        try { (window as any).__rwUrlCache?.delete(song.id); } catch { /**/ }

        console.warn("[PlayerContext] URL expired for", song.id, "— re-resolving before skip");
        resolveSongAudioUrl({ ...song, audioUrl: "" }).then((resolved) => {
          if (resolved.audioUrl && resolved.audioUrl !== song.audioUrl) {
            consecutiveErrorsRef.current = 0;
            // Patch queue
            const q = [...queueRef.current];
            const i = q.findIndex((s) => s.id === resolved.id);
            if (i >= 0) { q[i] = resolved; queueRef.current = q; setQueue([...q]); }
            setCurrentSong(resolved);
            playAudioDirectly(resolved);
          } else {
            // Re-resolve also failed — backend is down
            handleBackendDown();
          }
        }).catch(handleBackendDown);
        return;
      }

      // Circuit breaker: after 3 consecutive failures, stop cascade-skipping.
      // This prevents the whole queue from being burnt through in seconds when
      // the backend (Render free tier) is sleeping or down.
      if (consecutiveErrorsRef.current >= 3) {
        console.error("[PlayerContext] Backend appears down — pausing playback instead of cascade-skip");
        intendToPlayRef.current = false;
        setIsPlaying(false);
        if (audio) audio.pause();
        // Auto-retry after 15 s in case the backend was just cold-starting
        if (errorBackoffTimerRef.current) clearTimeout(errorBackoffTimerRef.current);
        errorBackoffTimerRef.current = setTimeout(() => {
          if (!intendToPlayRef.current && song) {
            consecutiveErrorsRef.current = 0;
            resolveSongAudioUrl({ ...song, audioUrl: "" }).then((resolved) => {
              if (resolved.audioUrl) {
                setCurrentSong(resolved);
                setIsPlaying(true);
                intendToPlayRef.current = true;
                playAudioDirectly(resolved);
              }
            }).catch(() => {});
          }
        }, 15_000);
        return;
      }

      console.error("Audio playback error — skipping to next");
      setTimeout(() => nextSongInternalRef.current(), 800);
    };

    const handleBackendDown = () => {
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= 3) {
        intendToPlayRef.current = false;
        setIsPlaying(false);
        if (audio) audio.pause();
      } else {
        setTimeout(() => nextSongInternalRef.current(), 800);
      }
    };

    const handleAbort = () => {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("stalled", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);
    audio.addEventListener("abort", handleAbort);

    return () => {
      clearStallTimer();
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("stalled", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("abort", handleAbort);
    };
  }, []);

  // When currentSong changes: load + play + MediaSession
  useEffect(() => {
    if (!currentSong || !audioRef.current) return;
    const audio = audioRef.current;
    const songId = currentSong.id;
    let cancelled = false;

    const startPlayback = (url: string) => {
      if (cancelled) return;
      const alreadyLoaded = audio.src === url || audio.src.endsWith(url);
      if (alreadyLoaded && !audio.paused) return;

      stallRetryRef.current = 0;
      setProgressState(0);
      const seedDuration =
        typeof currentSong.duration === "number" && currentSong.duration > 1
          ? currentSong.duration
          : 0;
      setDuration(seedDuration);

      isTransitioningRef.current = true;
      audio.src = url;
      audio.load();
      intendToPlayRef.current = true;
      audio.play()
        .then(() => { isTransitioningRef.current = false; })
        .catch((err) => {
          isTransitioningRef.current = false;
          if (cancelled) return;
          console.error("Autoplay blocked:", err);
          setIsPlaying(false);
          intendToPlayRef.current = false;
        });
    };

    if (currentSong.audioUrl) {
      startPlayback(currentSong.audioUrl);
    } else {
      setIsPlaying(true);
      intendToPlayRef.current = true;
      resolveSongAudioUrl(currentSong).then((resolved) => {
        if (cancelled) return;
        if (!resolved.audioUrl) {
          console.error("[PlayerContext] Could not resolve audioUrl for", songId,
            "— backend may be down (502). Cached URL will be used next time if available.");
          setIsPlaying(false);
          intendToPlayRef.current = false;
          // Don't auto-skip — let the user decide. A 502 means the whole backend
          // is down, so skipping would just fail on every song in the queue.
          return;
        }
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
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      intendToPlayRef.current = false;
      audioRef.current.pause();
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volume changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const togglePlay = useCallback(() => { setIsPlaying((p) => !p); }, []);

  // These two set isPlaying WITHOUT touching audio.play()/audio.pause() directly.
  // Used by useMediaSession to sync React state when the OS pauses/resumes audio
  // (phone calls, other apps taking audio focus) without causing double-play/pause.
  const pausePlayback  = useCallback(() => { setIsPlaying(false); intendToPlayRef.current = false; }, []);
  const resumePlayback = useCallback(() => { setIsPlaying(true);  intendToPlayRef.current = true;  }, []);

  // ── MediaSession ─────────────────────────────────────────────────────────
  useMediaSession({
    audioRef,
    currentSong,
    isPlaying,
    pausePlayback,
    resumePlayback,
    nextSong: nextSongInternal,
    prevSong: () => {
      const q = queueRef.current;
      const idx = queueIndexRef.current;
      if (q.length === 0) return;
      if (audioRef.current && audioRef.current.currentTime > 3) {
        audioRef.current.currentTime = 0;
        setProgressState(0);
        return;
      }
      const prevIdx   = (idx - 1 + q.length) % q.length;
      const candidate = q[prevIdx];
      if (!candidate) return;
      // Always prefer fresh URL from urlCache over stale song object URL
      const cachedUrl = (window as any).__rwUrlCache?.get(candidate.id) as string | undefined;
      const patched   = cachedUrl ? { ...candidate, audioUrl: cachedUrl } : candidate;
      playAudioDirectly(patched);
      queueIndexRef.current = prevIdx;
      setQueueIndex(prevIdx);
      setCurrentSong(patched);
      setIsPlaying(true);
      intendToPlayRef.current = true;
      addToRecentlyPlayedInternal(patched);
      lastPlayedSongRef.current = patched;
    },
    togglePlay,
    queueRef,
    queueIndexRef,
  });

  // ── playSong ─────────────────────────────────────────────────────────────
  const playSong = useCallback(
    async (song: Song, songQueue?: Song[], fromLibrary?: boolean) => {
      setIsRadioMode(false);
      radioFetchingRef.current = false;
      libraryQueueRef.current = !!fromLibrary;

      const resolved = await resolveSongAudioUrl(song);
      urlFetchedAt.set(resolved.id, Date.now());

      let q = songQueue || [resolved];
      if (resolved.audioUrl !== song.audioUrl) {
        q = q.map((s) => (s.id === resolved.id ? resolved : s));
      }

      const idx = q.findIndex((s) => s.id === resolved.id);
      const safeIdx = idx >= 0 ? idx : 0;

      queueRef.current = q;
      queueIndexRef.current = safeIdx;
      setQueue(q);
      setQueueIndex(safeIdx);
      lastPlayedSongRef.current = resolved;
      addToRecentlyPlayedInternal(resolved);
      consecutiveErrorsRef.current = 0;

      if (currentSong?.id === resolved.id && audioRef.current) {
        const audio = audioRef.current;
        if (!audio.paused) return;
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

      // Eagerly resolve ALL queue URLs in parallel so they're ready before lock screen.
      // This is the key fix: by the time any song needs to play, its URL is already cached.
      resolveQueueAudioUrls(q);
    },
    [addToRecentlyPlayedInternal, resolveQueueAudioUrls, currentSong]
  );

  const addToQueue = useCallback((song: Song) => {
    if (!queueRef.current.length || !currentSong) {
      const q = [song];
      queueRef.current = q;
      queueIndexRef.current = 0;
      setQueue(q);
      setQueueIndex(0);
      setCurrentSong(song);
      setIsPlaying(true);
      intendToPlayRef.current = true;
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

  const nextSong = useCallback(() => { nextSongInternal(); }, [nextSongInternal]);

  const prevSong = useCallback(() => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setProgressState(0);
      return;
    }
    const prevIdx   = (idx - 1 + q.length) % q.length;
    const candidate = q[prevIdx];
    const cachedUrl = (window as any).__rwUrlCache?.get(candidate.id) as string | undefined;

    if (cachedUrl) {
      const patched = { ...candidate, audioUrl: cachedUrl };
      const patchedQ = [...queueRef.current];
      patchedQ[prevIdx]     = patched;
      queueRef.current      = patchedQ;
      queueIndexRef.current = prevIdx;
      setQueue(patchedQ);
      setQueueIndex(prevIdx);
      setCurrentSong(patched);
      setIsPlaying(true);
      intendToPlayRef.current = true;
      addToRecentlyPlayedInternal(patched);
      lastPlayedSongRef.current = patched;
    } else if (!candidate.audioUrl) {
      resolveSongAudioUrl(candidate).then((resolved) => {
        const patchedQ = [...queueRef.current];
        patchedQ[prevIdx] = resolved;
        queueRef.current = patchedQ;
        queueIndexRef.current = prevIdx;
        setQueue(patchedQ);
        setQueueIndex(prevIdx);
        setCurrentSong(resolved);
        setIsPlaying(true);
        intendToPlayRef.current = true;
        addToRecentlyPlayedInternal(resolved);
        lastPlayedSongRef.current = resolved;
      });
    } else {
      queueIndexRef.current = prevIdx;
      setQueueIndex(prevIdx);
      setCurrentSong(candidate);
      setIsPlaying(true);
      intendToPlayRef.current = true;
      addToRecentlyPlayedInternal(candidate);
      lastPlayedSongRef.current = candidate;
    }
  }, [addToRecentlyPlayedInternal]);

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
    // off → one (repeat current song) → all (repeat whole queue) → off
    setRepeat((v) => v === "off" ? "one" : v === "one" ? "all" : "off");
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentSong, isPlaying, queue, queueIndex, progress, duration,
        volume, showPlayer, shuffle, repeat, isRadioMode,
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