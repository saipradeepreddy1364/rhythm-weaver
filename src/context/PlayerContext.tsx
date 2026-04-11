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

// ─── Resolve a fresh audioUrl using the shared module-level cache ─────────────
// Uses resolveStreamUrl from useMediaSession so the URL cache is shared between
// PlayerContext and the lock-screen handlers — no duplicate fetches.
async function resolveSongAudioUrl(song: Song): Promise<Song> {
  if (song.audioUrl && song.audioUrl.startsWith("http")) return song;
  try {
    const url = await resolveStreamUrl(song);
    if (url) return { ...song, audioUrl: url };
  } catch (err) {
    console.error("[PlayerContext] Failed to fetch audioUrl for", song.id, err);
  }
  return song;
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

  // ── Radio / Library-continuation: fetch more songs based on the last-played song ──
  // When fromLibrary=true, builds a language-first query so the continuation
  // feels like "more songs you'd like" rather than generic radio.
  const fetchRadioSongs = useCallback(
    async (seed: Song, fromLibrary = false): Promise<Song[]> => {
      const artist = (seed as any).artist || "";
      const movie  = (seed as any).movie  || (seed as any).album || "";
      const lang   = (seed as any).language || "";

      // Build query pool — language-first for library queues
      const queries: string[] = [];
      if (fromLibrary) {
        // Priority: language > artist > movie > fallback
        if (lang)   queries.push(`${lang} songs`, `trending ${lang} songs`, `popular ${lang} songs`);
        if (artist) queries.push(`${artist} songs`, `${artist} hits`);
        if (movie)  queries.push(`${movie} songs`);
        queries.push("trending bollywood songs", "trending hindi songs");
      } else {
        if (lang && artist) queries.push(`${lang} songs ${artist}`);
        else if (lang)      queries.push(`${lang} songs`);
        else if (artist)    queries.push(`${artist} songs`);
        else if (movie)     queries.push(`${movie} songs`);
        queries.push("trending songs india");
      }

      const existingIds = new Set(queueRef.current.map((s) => s.id));
      const { mapApiSong }  = await import("@/data/songs").catch(() => ({ mapApiSong: null as any }));
      const { extractResults } = await import("@/services/api").catch(() => ({ extractResults: null as any }));

      for (const query of queries) {
        try {
          const res  = await api.searchSongs(query, 1, 50);
          const raw  = extractResults ? extractResults(res) : (Array.isArray(res) ? res : (res?.data ?? []));
          if (!Array.isArray(raw) || raw.length === 0) continue;

          const songs: Song[] = raw
            .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
            .filter((s: any): s is Song => !!s && !!s.id && !existingIds.has(s.id));

          if (songs.length >= 5) return songs.slice(0, 30);
        } catch (err) {
          console.warn("[PlayerContext] Radio fetch failed for query:", query, err);
        }
      }
      return [];
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Resolve all missing audioUrls in a queue ─────────────────────────────
  const resolveQueueAudioUrls = useCallback(async (songs: Song[]) => {
    const unresolved = songs.filter((s) => !s.audioUrl);
    if (unresolved.length === 0) return;
    await Promise.allSettled(
      unresolved.map(async (song) => {
        const resolved = await resolveSongAudioUrl(song);
        if (resolved.audioUrl === song.audioUrl) return;
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
  // FIX: Now resolves missing audioUrl instead of silently returning.
  const playAudioDirectly = useCallback((song: Song) => {
    const audio = audioRef.current;
    if (!audio) return;

    const doPlay = (s: Song) => {
      if (!s.audioUrl) {
        console.warn("[PlayerContext] playAudioDirectly: no audioUrl for", s.id);
        // Skip to next rather than silently failing
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
                { src: s.albumArt, sizes: "96x96", type: "image/jpeg" },
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

    if (song.audioUrl) {
      doPlay(song);
    } else {
      // FIX: Resolve URL instead of skipping — critical for liked songs from backend
      resolveSongAudioUrl(song).then((resolved) => {
        // Patch the queue so future next/prev calls use the resolved URL
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
    }
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
          // Pass fromLibrary flag so fetchRadioSongs picks language-first queries
          fetchRadioSongs(seed, libraryQueueRef.current).then((radioSongs) => {
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

    if (!candidate.audioUrl) {
      // FIX: Resolve URL before playing — never auto-skip just because URL is missing.
      // This was causing the entire liked-songs library to be skipped on new devices.
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
      console.error("Audio playback error — skipping to next");
      setTimeout(() => nextSongInternalRef.current(), 800);
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
      const prevIdx = (idx - 1 + q.length) % q.length;
      const candidate = q[prevIdx];
      if (candidate) {
        playAudioDirectly(candidate);
        queueIndexRef.current = prevIdx;
        setQueueIndex(prevIdx);
        setCurrentSong(candidate);
        setIsPlaying(true);
        intendToPlayRef.current = true;
        addToRecentlyPlayedInternal(candidate);
        lastPlayedSongRef.current = candidate;
      }
    },
    togglePlay,
    queueRef,
    queueIndexRef,
  });

  // ── playSong ─────────────────────────────────────────────────────────────
  const playSong = useCallback(
    async (song: Song, songQueue?: Song[], fromLibrary?: boolean) => {
      // Reset radio mode
      setIsRadioMode(false);
      radioFetchingRef.current = false;

      // Set libraryQueueRef SYNCHRONOUSLY before any await
      libraryQueueRef.current = !!fromLibrary;

      // FIX: For library queues, do NOT clear play history.
      // The old code cleared it but that had no real benefit — the skip logic
      // has been removed entirely. Songs are never auto-skipped based on history anymore.

      const resolved = await resolveSongAudioUrl(song);

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

      // If same song is already playing, just update queue reference silently
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

      // Resolve remaining songs in queue in background
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
    const prevIdx = (idx - 1 + q.length) % q.length;
    const candidate = q[prevIdx];

    if (!candidate.audioUrl) {
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