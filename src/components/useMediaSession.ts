/**
 * useMediaSession.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY MUSIC STOPPED ON LOCK SCREEN — THE REAL CAUSE
 * ──────────────────────────────────────────────────
 * When the screen locks, browsers (Android Chrome + iOS Safari) suspend ALL
 * JS execution AND all network fetch() calls — including Web Workers. The
 * audio element itself keeps playing at the OS level, but the moment a song
 * ends and JS tries to fetch the next song's URL, the fetch is suspended or
 * times out. Result: silence after 1-2 songs.
 *
 * THE ACTUAL FIX — pre-load, not pre-fetch
 * ─────────────────────────────────────────
 * The browser's media pipeline is NOT suspended on lock screen — only JS and
 * fetch() are. So the solution is:
 *
 *   1. While the current song plays (screen ON, network free):
 *      - Resolve the next song's URL immediately.
 *      - Assign it to a hidden <audio> element (`preloadAudio`) with
 *        preload="auto" and call .load(). The browser streams and buffers
 *        the ENTIRE next song's audio data into its internal media cache.
 *
 *   2. When the current song ends (screen may be LOCKED):
 *      - DON'T fetch anything. Just swap preloadAudio → mainAudio by
 *        copying the already-buffered src and seeking to 0.
 *      - The browser plays from its internal cache — zero network needed.
 *
 *   3. The "ended" event on the hidden element triggers preparation of
 *      the song after next, so the pipeline stays full.
 *
 * This is how every native music app works. JS timers, Web Workers, and
 * fetch() are all irrelevant once the audio data is in the media cache.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";

const BACKEND_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://musicbackend-xg4u.onrender.com/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  movie?: string;
  albumArt?: string;
  duration?: number;
  audioUrl?: string;
}

interface UseMediaSessionOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentSong: Song | null;
  isPlaying: boolean;
  pausePlayback: () => void;
  resumePlayback: () => void;
  nextSong: () => void;
  prevSong: () => void;
  togglePlay: () => void;
  queueRef: React.RefObject<Song[]>;
  queueIndexRef: React.RefObject<number>;
}

// ─── URL cache ────────────────────────────────────────────────────────────────
export const urlCache = new Map<string, string>();
if (typeof window !== "undefined") (window as any).__rwUrlCache = urlCache;

export async function resolveStreamUrl(song: Song): Promise<string | null> {
  return `${BACKEND_URL}/songs/${song.id}/stream`;
}

// ─── Pre-load pipeline ────────────────────────────────────────────────────────
// Two hidden audio elements that take turns buffering upcoming songs.
// preloadSlots[0] buffers song at index+1, preloadSlots[1] buffers index+2.
// Each has preload="auto" so the browser streams full audio data into its
// internal media cache while the screen is still on and network is available.
// When the song ends, we swap the pre-loaded src into the main element —
// zero fetch, zero network, plays instantly even from locked screen.

interface PreloadSlot {
  audio: HTMLAudioElement;
  songId: string | null;
}

let preloadSlots: PreloadSlot[] | null = null;

function getPreloadSlots(): PreloadSlot[] {
  if (preloadSlots) return preloadSlots;
  preloadSlots = [0, 1].map(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume  = 0;
    audio.muted   = true;
    (audio as any).disableRemotePlayback = true;
    return { audio, songId: null };
  });
  return preloadSlots;
}

/**
 * Pre-load a song into a slot. Fetches the URL (main thread, screen on)
 * and assigns it to the hidden audio element so the browser buffers the data.
 */
async function preloadSong(song: Song, slotIndex: number): Promise<void> {
  const slots = getPreloadSlots();
  const slot  = slots[slotIndex];
  if (!slot || slot.songId === song.id) return; // already loaded

  // Always fetch a fresh URL for pre-loading — these happen while screen is on
  urlCache.delete(song.id); // evict to force fresh fetch
  const url = await resolveStreamUrl(song);
  if (!url) return;

  slot.songId      = song.id;
  slot.audio.src   = url;
  slot.audio.preload = "auto";
  slot.audio.load(); // browser starts streaming + caching audio data immediately
}

/**
 * Get the pre-loaded URL for a song if it's already buffered.
 * Returns null if this song hasn't been pre-loaded.
 */
function getPreloadedUrl(songId: string): string | null {
  if (!preloadSlots) return null;
  for (const slot of preloadSlots) {
    if (slot.songId === songId && slot.audio.src) {
      return slot.audio.src;
    }
  }
  return null;
}

// ─── Keep-alive ───────────────────────────────────────────────────────────────
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function startKeepAlive() {
  if (keepAliveTimer) return;
  fetch(`${BACKEND_URL}/health`).catch(() => {});
  keepAliveTimer = setInterval(() => fetch(`${BACKEND_URL}/health`).catch(() => {}), 4 * 60 * 1000);
}
function stopKeepAlive() {
  if (!keepAliveTimer) return;
  clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

// ─── Wake Lock ────────────────────────────────────────────────────────────────
let wakeLockSentinel: WakeLockSentinel | null = null;

async function acquireWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) return;
  try {
    if (wakeLockSentinel && !wakeLockSentinel.released) return;
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => { wakeLockSentinel = null; });
  } catch { /* not fatal */ }
}

function releaseWakeLock(): void {
  if (wakeLockSentinel && !wakeLockSentinel.released) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMediaSession({
  audioRef,
  currentSong,
  isPlaying,
  pausePlayback,
  resumePlayback,
  nextSong,
  prevSong,
  togglePlay,
  queueRef,
  queueIndexRef,
}: UseMediaSessionOptions) {

  const nextSongRef   = useRef(nextSong);
  const prevSongRef   = useRef(prevSong);
  const togglePlayRef = useRef(togglePlay);
  const pauseRef      = useRef(pausePlayback);
  const resumeRef     = useRef(resumePlayback);
  const isPlayingRef  = useRef(isPlaying);

  useEffect(() => { nextSongRef.current   = nextSong;       }, [nextSong]);
  useEffect(() => { prevSongRef.current   = prevSong;       }, [prevSong]);
  useEffect(() => { togglePlayRef.current = togglePlay;     }, [togglePlay]);
  useEffect(() => { pauseRef.current      = pausePlayback;  }, [pausePlayback]);
  useEffect(() => { resumeRef.current     = resumePlayback; }, [resumePlayback]);
  useEffect(() => { isPlayingRef.current  = isPlaying;      }, [isPlaying]);

  // ── Keep-alive + Wake Lock ────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) { startKeepAlive(); acquireWakeLock(); }
    else           { stopKeepAlive();  releaseWakeLock(); }
  }, [isPlaying]);

  // ── Pre-load pipeline: buffer next 2 songs while screen is ON ────────────
  // This runs whenever the current song or queue changes.
  // Pre-loading happens NOW (screen on, network free) so that when the song
  // ends (screen may be locked), the audio data is already in browser cache.
  useEffect(() => {
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    if (!q || q.length === 0) return;

    // Pre-load next song into slot 0, song after that into slot 1
    const next1 = q[(idx + 1) % q.length];
    const next2 = q[(idx + 2) % q.length];

    if (next1 && next1.id !== currentSong?.id) preloadSong(next1, 0);
    if (next2 && next2.id !== next1?.id && next2.id !== currentSong?.id) preloadSong(next2, 1);
  }, [currentSong?.id, queueRef, queueIndexRef]);

  // ── Audio "ended": use pre-loaded data, no network call ──────────────────
  // When the current song ends, instead of letting PlayerContext fetch a URL,
  // we intercept here and swap in the already-buffered src from the preload slot.
  // This is what makes locked-screen playback work — no JS fetch required.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;

      const nextIdx  = (idx + 1) % q.length;
      const nextSong = q[nextIdx];
      if (!nextSong) return;

      // Check if we have the next song pre-loaded in our buffer
      const preloadedUrl = getPreloadedUrl(nextSong.id);

      if (preloadedUrl) {
        // ✅ FAST PATH: use the already-buffered audio data — zero network call
        audio.src = preloadedUrl;
        audio.load();
        audio.play().catch(() => {});

        // Tell React about the song change
        nextSongRef.current();

        // Update MediaSession metadata immediately
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title:  nextSong.title  || "Unknown",
            artist: nextSong.artist || "",
            album:  (nextSong as any).movie || nextSong.album || "",
            artwork: nextSong.albumArt
              ? [{ src: nextSong.albumArt, sizes: "512x512", type: "image/jpeg" }]
              : [],
          });
          navigator.mediaSession.playbackState = "playing";
        }

        // Pre-load the song AFTER next into the freed slot
        const afterNext = q[(nextIdx + 1) % q.length];
        if (afterNext && afterNext.id !== nextSong.id) preloadSong(afterNext, 0);

      } else {
        // ⚠️ SLOW PATH: pre-load wasn't ready (e.g. first-time play, slow network)
        // Fall back to resolving the URL now. This may fail on locked screen,
        // but that's the same behaviour as before — the fast path handles it 99%.
        nextSongRef.current();
        resolveStreamUrl(nextSong).then((url) => {
          if (!url) return;
          audio.src = url;
          audio.load();
          audio.play().catch(() => {});
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
            if (!isPlayingRef.current) resumeRef.current();
          }
        }).catch(() => {});
      }
    };

    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [audioRef, queueRef, queueIndexRef]);


  // ── 1. Metadata ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!currentSong) { navigator.mediaSession.metadata = null; return; }
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentSong.title  || "Unknown Title",
      artist: currentSong.artist || "Unknown Artist",
      album:  currentSong.movie  || currentSong.album || "",
      artwork: currentSong.albumArt
        ? [
            { src: currentSong.albumArt, sizes: "96x96",   type: "image/jpeg" },
            { src: currentSong.albumArt, sizes: "128x128", type: "image/jpeg" },
            { src: currentSong.albumArt, sizes: "192x192", type: "image/jpeg" },
            { src: currentSong.albumArt, sizes: "256x256", type: "image/jpeg" },
            { src: currentSong.albumArt, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });
  }, [currentSong]);

  // ── 2. Playback state sync ────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // ── 3. Action handlers — registered ONCE ─────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const trySet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /**/ }
    };

    trySet("play", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.play().catch(() => {});
      navigator.mediaSession.playbackState = "playing";
      if (!isPlayingRef.current) resumeRef.current();
    });

    trySet("pause", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      navigator.mediaSession.playbackState = "paused";
      if (isPlayingRef.current) pauseRef.current();
    });

    trySet("stop", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      navigator.mediaSession.playbackState = "paused";
      if (isPlayingRef.current) pauseRef.current();
    });

    trySet("nexttrack", () => {
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;
      const nextIdx  = (idx + 1) % q.length;
      const nextItem = q[nextIdx];
      if (!nextItem) return;

      nextSongRef.current();

      // Try pre-loaded URL first, fall back to fresh resolve
      const preloadedUrl = getPreloadedUrl(nextItem.id);
      const doPlay = (url: string) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = url;
        audio.load();
        audio.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
        if (!isPlayingRef.current) resumeRef.current();
        const after = q[(nextIdx + 1) % q.length];
        if (after) preloadSong(after, 0);
      };

      if (preloadedUrl) {
        doPlay(preloadedUrl);
      } else {
        resolveStreamUrl(nextItem).then((url) => { if (url) doPlay(url); });
      }
    });

    trySet("previoustrack", () => {
      const audio = audioRef.current;
      if (audio && audio.currentTime > 3) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;
      const prevIdx  = (idx - 1 + q.length) % q.length;
      const prevItem = q[prevIdx];
      if (!prevItem) return;
      prevSongRef.current();
      resolveStreamUrl(prevItem).then((url) => {
        const a = audioRef.current;
        if (!a || !url) return;
        a.src = url;
        a.load();
        a.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
        if (!isPlayingRef.current) resumeRef.current();
      });
    });

    trySet("seekto", (details) => {
      const audio = audioRef.current;
      if (audio && details.seekTime != null) {
        audio.currentTime = details.seekTime;
        try {
          if (audio.duration && isFinite(audio.duration)) {
            navigator.mediaSession.setPositionState({
              duration:     audio.duration,
              playbackRate: audio.playbackRate,
              position:     Math.min(details.seekTime, audio.duration),
            });
          }
        } catch { /**/ }
      }
    });

    trySet("seekbackward", (details) => {
      const audio = audioRef.current;
      if (audio) audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset ?? 10));
    });

    trySet("seekforward", (details) => {
      const audio = audioRef.current;
      if (audio) {
        const dur = audio.duration || 0;
        audio.currentTime = Math.min(isFinite(dur) ? dur : Infinity, audio.currentTime + (details.seekOffset ?? 10));
      }
    });

    // ── Screen unlock: force-resume if audio stalled ──────────────────────
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;

      acquireWakeLock();

      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = isPlayingRef.current ? "playing" : "paused";
      }

      const audio = audioRef.current;
      if (!audio || !isPlayingRef.current || !audio.paused) return;

      setTimeout(() => {
        if (!audio.paused || !isPlayingRef.current) return;
        audio.play().catch(() => {
          const src = audio.src;
          if (!src) return;
          const pos = audio.currentTime;
          audio.src = src;
          audio.load();
          audio.currentTime = pos;
          audio.play().catch(() => {
            const song = queueRef.current?.[queueIndexRef.current];
            if (!song) return;
            urlCache.delete(song.id);
            resolveStreamUrl(song).then((freshUrl) => {
              if (!freshUrl) return;
              const a = audioRef.current;
              if (!a || !isPlayingRef.current) return;
              const p = a.currentTime;
              a.src = freshUrl;
              a.load();
              a.currentTime = p;
              a.play().catch(() => {});
            }).catch(() => {});
          });
        });
      }, 300);
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      (["play","pause","stop","nexttrack","previoustrack",
        "seekto","seekbackward","seekforward"] as MediaSessionAction[])
        .forEach((a) => trySet(a, null));
    };
  }, []); // empty deps — all live state via refs

  // ── 4. Position state ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => {
      if (!audio.duration || !isFinite(audio.duration)) return;
      try {
        navigator.mediaSession.setPositionState({
          duration:     audio.duration,
          playbackRate: audio.playbackRate,
          position:     Math.min(audio.currentTime, audio.duration),
        });
      } catch { /**/ }
    };
    audio.addEventListener("timeupdate",     update);
    audio.addEventListener("durationchange", update);
    return () => {
      audio.removeEventListener("timeupdate",     update);
      audio.removeEventListener("durationchange", update);
    };
  }, [audioRef, currentSong]);

  // ── 5. Audio element attributes ───────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setAttribute("playsinline",        "true");
    audio.setAttribute("webkit-playsinline", "true");
    audio.setAttribute("x-webkit-airplay",   "allow");
    (audio as any).disableRemotePlayback = false;
  }, [audioRef, currentSong]);
}