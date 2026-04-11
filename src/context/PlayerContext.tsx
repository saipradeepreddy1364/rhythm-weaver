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
import { useMediaSession } from "../components/useMediaSession";

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

const RECENTLY_PLAYED_KEY = "rw_recently_played";
const RECENTLY_PLAYED_TS_KEY = "rw_recent_ts";
const FAVORITES_KEY = "rw_favorites";

function loadRecentTimestamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RECENTLY_PLAYED_TS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ─── Fetch a fresh audioUrl for a song that has none ─────────────────────────
async function resolveSongAudioUrl(song: Song): Promise<Song> {
  if (song.audioUrl) return song;
  try {
    const res = await api.getSongById(song.id);
    const data = res?.data ?? res;
    const audioUrl = extractAudioUrl(data);
    if (audioUrl) return { ...song, audioUrl };
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
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
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
  const recentTimestampsRef = useRef<Record<string, number>>(loadRecentTimestamps());
  const intendToPlayRef = useRef(false);
  const songEndingRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const nextSongInternalRef = useRef<() => void>(() => {});
  const stallRetryRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlayedSongRef = useRef<Song | null>(null);
  const radioFetchingRef = useRef(false);
  // FIX: libraryQueueRef now only prevents RADIO mode — it no longer stops playback.
  // Library queues now loop just like regular queues when they reach the end.
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

  // Load recently played
  useEffect(() => {
    const saved = localStorage.getItem(RECENTLY_PLAYED_KEY);
    if (saved) { try { setRecentlyPlayed(JSON.parse(saved)); } catch { /**/ } }
  }, []);

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

  const addToRecentlyPlayedInternal = useCallback((song: Song) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const updated = [song, ...filtered].slice(0, 50);
      localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
      const ts = { ...recentTimestampsRef.current, [song.id]: Date.now() };
      recentTimestampsRef.current = ts;
      localStorage.setItem(RECENTLY_PLAYED_TS_KEY, JSON.stringify(ts));
      return updated;
    });
  }, []);

  const updateMediaSession = useCallback((song: Song, playing: boolean, pos = 0, dur = 0) => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: (song as any).movie || (song as any).album || "",
      artwork: song.albumArt
        ? [
            { src: song.albumArt, sizes: "96x96", type: "image/jpeg" },
            { src: song.albumArt, sizes: "128x128", type: "image/jpeg" },
            { src: song.albumArt, sizes: "192x192", type: "image/jpeg" },
            { src: song.albumArt, sizes: "256x256", type: "image/jpeg" },
            { src: song.albumArt, sizes: "384x384", type: "image/jpeg" },
            { src: song.albumArt, sizes: "512x512", type: "image/jpeg" },
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
    (audio as any).setAttribute?.("playsinline", "true");
    (audio as any).setAttribute?.("webkit-playsinline", "true");
    (audio as any).setAttribute?.("x-webkit-airplay", "allow");
    audio.crossOrigin = "anonymous";

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

    // loadedmetadata fires reliably before canplay and is the best source for duration
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
      if (isTransitioningRef.current) return;
      if (intendToPlayRef.current) {
        audio.play().catch(() => {
          setIsPlaying(false);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
        });
        return;
      }
      setIsPlaying(false);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
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
      if (alreadyLoaded && !audio.paused) {
        updateMediaSession(currentSong, true, audio.currentTime, audio.duration);
        return;
      }
      stallRetryRef.current = 0;
      setProgressState(0);

      // Seed duration immediately from song metadata so the seek bar isn't broken
      // while the browser loads the stream. Will be overwritten by loadedmetadata.
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
      updateMediaSession(currentSong, true, 0, seedDuration || 0);
    };

    if (currentSong.audioUrl) {
      startPlayback(currentSong.audioUrl);
    } else {
      setIsPlaying(true);
      intendToPlayRef.current = true;
      resolveSongAudioUrl(currentSong).then((resolved) => {
        if (cancelled) return;
        if (!resolved.audioUrl) {
          console.error("[PlayerContext] Could not resolve audioUrl for", songId);
          setIsPlaying(false);
          intendToPlayRef.current = false;
          setTimeout(() => nextSongInternalRef.current(), 800);
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

  const togglePlay = useCallback(() => { setIsPlaying((p) => !p); }, []);

  // ── MediaSession ─────────────────────────────────────────────────────────
  useMediaSession({
    audioRef,
    currentSong,
    isPlaying,
    playAudioDirectly,
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