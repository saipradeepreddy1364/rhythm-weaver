/**
 * useMediaSession.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles lock-screen / notification controls and hardware media keys.
 *
 * KEY DESIGN:
 *  1. All action handlers are stored in refs — never stale, never re-registered.
 *  2. next/prev resolve the stream URL BEFORE setting audio.src so the audio
 *     element never tries to load a missing or expired URL.
 *  3. We pre-fetch and cache the NEXT song's stream URL while the current song
 *     is playing. When the lock-screen "next" button fires, the URL is already
 *     in the cache — no network round-trip needed under JS throttle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useCallback } from "react";

const BACKEND_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

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
  playAudioDirectly: (song: Song) => void;
  nextSong: () => void;
  prevSong: () => void;
  togglePlay: () => void;
  queueRef: React.RefObject<Song[]>;
  queueIndexRef: React.RefObject<number>;
}

// ── URL cache: songId → resolved stream URL ───────────────────────────────────
// Shared across hook instances (module-level) so it survives re-mounts.
const urlCache = new Map<string, string>();

/**
 * Resolve the best playable stream URL for a song.
 * Priority: cache → song.audioUrl (if non-empty) → backend /songs/{id} fetch.
 * Always stores the result in cache so the next call is instant.
 */
async function resolveStreamUrl(song: Song): Promise<string | null> {
  if (urlCache.has(song.id)) return urlCache.get(song.id)!;

  // Use the song's own audioUrl if it's a real HTTP URL
  if (song.audioUrl && song.audioUrl.startsWith("http")) {
    urlCache.set(song.id, song.audioUrl);
    return song.audioUrl;
  }

  // Fetch fresh details from the backend
  try {
    const res = await fetch(`${BACKEND_URL}/songs/${song.id}`);
    if (!res.ok) return null;
    const json = await res.json();

    // Walk the response shape to find downloadUrl
    const data = json?.data;
    const songData = Array.isArray(data) ? data[0] : data;
    if (!songData) return null;

    const downloadUrl = songData.downloadUrl || songData.audioUrl || songData.url;
    let url: string | null = null;

    if (Array.isArray(downloadUrl)) {
      // JioSaavn: [{quality:"320kbps", url:"..."}, ...] — pick highest quality
      const sorted = [...downloadUrl].sort((a, b) => {
        const qa = parseInt(a.quality) || 0;
        const qb = parseInt(b.quality) || 0;
        return qb - qa;
      });
      url = sorted[0]?.url || null;
    } else if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) {
      url = downloadUrl;
    }

    if (url) urlCache.set(song.id, url);
    return url;
  } catch {
    return null;
  }
}

/** Pre-warm the cache for a song without blocking. Fire-and-forget. */
function prefetchUrl(song: Song | undefined) {
  if (!song || urlCache.has(song.id)) return;
  resolveStreamUrl(song).catch(() => {/* silent */});
}

export function useMediaSession({
  audioRef,
  currentSong,
  isPlaying,
  playAudioDirectly,
  nextSong,
  prevSong,
  togglePlay,
  queueRef,
  queueIndexRef,
}: UseMediaSessionOptions) {

  // ── Keep all callbacks in refs so handlers are never stale ────────────────
  const nextSongRef          = useRef(nextSong);
  const prevSongRef          = useRef(prevSong);
  const togglePlayRef        = useRef(togglePlay);
  const playAudioDirectlyRef = useRef(playAudioDirectly);
  const isPlayingRef         = useRef(isPlaying);

  useEffect(() => { nextSongRef.current          = nextSong;        }, [nextSong]);
  useEffect(() => { prevSongRef.current          = prevSong;        }, [prevSong]);
  useEffect(() => { togglePlayRef.current        = togglePlay;      }, [togglePlay]);
  useEffect(() => { playAudioDirectlyRef.current = playAudioDirectly; }, [playAudioDirectly]);
  useEffect(() => { isPlayingRef.current         = isPlaying;       }, [isPlaying]);

  // ── Pre-fetch next song URL whenever the current song or queue changes ─────
  // This runs while the current song is playing so that by the time the user
  // (or lock-screen control) hits "next", the URL is already cached and the
  // audio element can start instantly without a network round-trip.
  useEffect(() => {
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    if (!q || q.length === 0) return;

    // Pre-fetch next AND prev so both skip directions are instant
    const nextIdx = (idx + 1) % q.length;
    const prevIdx = (idx - 1 + q.length) % q.length;
    prefetchUrl(q[nextIdx]);
    if (nextIdx !== prevIdx) prefetchUrl(q[prevIdx]);
  }, [currentSong?.id, queueRef, queueIndexRef]);

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

  // ── 3. Action handlers — registered ONCE, read from refs ─────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const trySet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported */ }
    };

    // play / pause
    trySet("play", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.play().catch(() => {});
      navigator.mediaSession.playbackState = "playing";
      if (!isPlayingRef.current) togglePlayRef.current();
    });

    trySet("pause", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      navigator.mediaSession.playbackState = "paused";
      if (isPlayingRef.current) togglePlayRef.current();
    });

    trySet("stop", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      navigator.mediaSession.playbackState = "paused";
      if (isPlayingRef.current) togglePlayRef.current();
    });

    // nexttrack ── resolve URL first (usually already cached), then play
    trySet("nexttrack", () => {
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;

      const nextIdx    = (idx + 1) % q.length;
      const nextSongItem = q[nextIdx];
      if (!nextSongItem) return;

      // Kick off React state sync immediately (updates UI when screen unlocks)
      nextSongRef.current();

      // Resolve URL and play — cache hit is synchronous-equivalent
      resolveStreamUrl(nextSongItem).then((url) => {
        const audio = audioRef.current;
        if (!audio || !url) return;
        // Inline play so we don't wait for React re-render
        audio.src = url;
        audio.load();
        audio.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
        // Also pre-warm the one after next
        const afterNext = (nextIdx + 1) % q.length;
        prefetchUrl(q[afterNext]);
      });
    });

    // previoustrack ── same pattern
    trySet("previoustrack", () => {
      const audio = audioRef.current;

      // If more than 3 s in, restart current track without a fetch
      if (audio && audio.currentTime > 3) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }

      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;

      const prevIdx    = (idx - 1 + q.length) % q.length;
      const prevSongItem = q[prevIdx];
      if (!prevSongItem) return;

      prevSongRef.current(); // React state sync

      resolveStreamUrl(prevSongItem).then((url) => {
        const a = audioRef.current;
        if (!a || !url) return;
        a.src = url;
        a.load();
        a.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
      });
    });

    // seek
    trySet("seekto", (details) => {
      const audio = audioRef.current;
      if (audio && details.seekTime != null) {
        audio.currentTime = details.seekTime;
        try {
          if (audio.duration && isFinite(audio.duration)) {
            navigator.mediaSession.setPositionState({
              duration:    audio.duration,
              playbackRate: audio.playbackRate,
              position:    Math.min(details.seekTime, audio.duration),
            });
          }
        } catch { /* ignore */ }
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

    // Re-assert playback state when screen unlocks (iOS resets handlers)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        navigator.mediaSession.playbackState = isPlayingRef.current ? "playing" : "paused";
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      (["play","pause","stop","nexttrack","previoustrack","seekto","seekbackward","seekforward"] as MediaSessionAction[])
        .forEach((a) => trySet(a, null));
    };
  }, []); // empty deps intentional — all live state read from refs

  // ── 4. Position state ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const audio = audioRef.current;
    if (!audio) return;

    const updatePosition = () => {
      if (!audio.duration || !isFinite(audio.duration)) return;
      try {
        navigator.mediaSession.setPositionState({
          duration:     audio.duration,
          playbackRate: audio.playbackRate,
          position:     Math.min(audio.currentTime, audio.duration),
        });
      } catch { /* ignore */ }
    };

    audio.addEventListener("timeupdate",     updatePosition);
    audio.addEventListener("durationchange", updatePosition);
    return () => {
      audio.removeEventListener("timeupdate",     updatePosition);
      audio.removeEventListener("durationchange", updatePosition);
    };
  }, [audioRef, currentSong]);

  // ── 5. Audio element attributes for background / lock-screen playback ─────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setAttribute("playsinline",        "true");
    audio.setAttribute("webkit-playsinline", "true");
    audio.setAttribute("x-webkit-airplay",   "allow");
    (audio as any).disableRemotePlayback = false;
  }, [audioRef, currentSong]);
}

// Export so PlayerContext can also use the same cache when resolving URLs
export { resolveStreamUrl, urlCache };