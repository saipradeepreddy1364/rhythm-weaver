/**
 * useMediaSession.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles lock-screen / notification controls, hardware media keys,
 * audio focus (phone calls, other apps), and background buffering.
 *
 * KEY DESIGN:
 *  1. All action handlers live in refs — never stale, registered ONCE.
 *  2. A hidden <audio> element pre-buffers the NEXT song while the current
 *     one plays. When lock-screen "next" fires, the data is already in the
 *     browser's media cache — no network round-trip under JS throttle.
 *  3. We listen to the main audio element's `pause` / `play` events to detect
 *     OS audio-focus changes (phone calls, other apps). When the OS pauses us,
 *     we sync React state so the notification drawer shows the correct button.
 *  4. A keep-alive ping hits the backend every 4 minutes so Render's free
 *     tier never cold-starts mid-session.
 *  5. resolveStreamUrl + urlCache are exported for PlayerContext to share.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";

const BACKEND_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

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
  /** Pause React state — called when OS steals audio focus (calls, other apps) */
  pausePlayback: () => void;
  /** Resume React state — called when OS returns audio focus */
  resumePlayback: () => void;
  nextSong: () => void;
  prevSong: () => void;
  togglePlay: () => void;
  queueRef: React.RefObject<Song[]>;
  queueIndexRef: React.RefObject<number>;
}

// ─── Module-level URL cache (survives re-mounts) ──────────────────────────────
export const urlCache = new Map<string, string>();

/**
 * Resolve the best playable stream URL for a song.
 * Order: memory cache → song.audioUrl → backend fetch.
 * Always stores the resolved URL in cache.
 */
export async function resolveStreamUrl(song: Song): Promise<string | null> {
  if (urlCache.has(song.id)) return urlCache.get(song.id)!;

  if (song.audioUrl && song.audioUrl.startsWith("http")) {
    urlCache.set(song.id, song.audioUrl);
    return song.audioUrl;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/songs/${song.id}`);
    if (!res.ok) return null;
    const json = await res.json();

    const data     = json?.data;
    const songData = Array.isArray(data) ? data[0] : data;
    if (!songData) return null;

    const downloadUrl = songData.downloadUrl ?? songData.audioUrl ?? songData.url;
    let url: string | null = null;

    if (Array.isArray(downloadUrl)) {
      const sorted = [...downloadUrl].sort((a, b) => {
        const qa = parseInt(String(a.quality)) || 0;
        const qb = parseInt(String(b.quality)) || 0;
        return qb - qa;
      });
      url = sorted[0]?.url ?? null;
    } else if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) {
      url = downloadUrl;
    }

    if (url) urlCache.set(song.id, url);
    return url;
  } catch {
    return null;
  }
}

// ─── Hidden buffer element — pre-loads next song's audio data ─────────────────
// One element shared across all hook instances via module scope.
let bufferAudio: HTMLAudioElement | null = null;

function getBufferAudio(): HTMLAudioElement {
  if (!bufferAudio) {
    bufferAudio = new Audio();
    bufferAudio.preload = "auto";
    bufferAudio.volume  = 0;
    bufferAudio.muted   = true;
    (bufferAudio as any).disableRemotePlayback = true;
  }
  return bufferAudio;
}

function prefetchAndBuffer(song: Song | undefined) {
  if (!song) return;
  resolveStreamUrl(song).then((url) => {
    if (!url) return;
    const el = getBufferAudio();
    if (el.src === url) return; // already buffering this URL
    el.src     = url;
    el.preload = "auto";
    el.load();  // loads/buffers but never plays
  }).catch(() => {});
}

// ─── Keep-alive: ping /health every 4 min to prevent Render cold starts ───────
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function startKeepAlive() {
  if (keepAliveTimer) return;
  fetch(`${BACKEND_URL}/health`).catch(() => {});
  keepAliveTimer = setInterval(
    () => fetch(`${BACKEND_URL}/health`).catch(() => {}),
    4 * 60 * 1000
  );
}
function stopKeepAlive() {
  if (!keepAliveTimer) return;
  clearInterval(keepAliveTimer);
  keepAliveTimer = null;
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

  // Keep all callbacks in refs so handlers are never stale
  const nextSongRef   = useRef(nextSong);
  const prevSongRef   = useRef(prevSong);
  const togglePlayRef = useRef(togglePlay);
  const pauseRef      = useRef(pausePlayback);
  const resumeRef     = useRef(resumePlayback);
  const isPlayingRef  = useRef(isPlaying);

  useEffect(() => { nextSongRef.current   = nextSong;        }, [nextSong]);
  useEffect(() => { prevSongRef.current   = prevSong;        }, [prevSong]);
  useEffect(() => { togglePlayRef.current = togglePlay;      }, [togglePlay]);
  useEffect(() => { pauseRef.current      = pausePlayback;   }, [pausePlayback]);
  useEffect(() => { resumeRef.current     = resumePlayback;  }, [resumePlayback]);
  useEffect(() => { isPlayingRef.current  = isPlaying;       }, [isPlaying]);

  // ── Keep-alive: start when playing, stop when paused/stopped ─────────────
  useEffect(() => {
    if (isPlaying) startKeepAlive();
    else           stopKeepAlive();
  }, [isPlaying]);

  // ── Pre-buffer next song whenever current song or queue changes ───────────
  // Runs while the current song plays — by the time screen locks or the user
  // hits "next", audio data is already in the browser's media cache.
  useEffect(() => {
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    if (!q || q.length === 0) return;

    const nextIdx = (idx + 1) % q.length;
    const prevIdx = (idx - 1 + q.length) % q.length;

    prefetchAndBuffer(q[nextIdx]);                              // buffer next
    if (prevIdx !== nextIdx) resolveStreamUrl(q[prevIdx]).catch(() => {}); // warm prev
  }, [currentSong?.id, queueRef, queueIndexRef]);

  // ── Audio focus: handle OS-initiated pause/play (calls, other apps) ───────
  // When a phone call comes in, the OS pauses the audio element directly.
  // We detect this via the `pause` event and sync React state so the
  // notification drawer and lock-screen both show the correct play button.
  // When the call ends, `play` fires and we resume.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let osPaused = false; // tracks whether OS (not us) caused the pause

    const handlePause = () => {
      // Only react if React thinks we're playing — means OS stole focus
      if (isPlayingRef.current) {
        osPaused = true;
        pauseRef.current();
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
      }
    };

    const handlePlay = () => {
      // Only react if we were OS-paused — don't double-fire on normal play
      if (osPaused) {
        osPaused = false;
        resumeRef.current();
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
      }
    };

    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play",  handlePlay);
    return () => {
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play",  handlePlay);
    };
  }, [audioRef]);

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

  // ── 3. Action handlers — registered ONCE, all live values via refs ────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const trySet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported */ }
    };

    // play — notification drawer "play" button
    trySet("play", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.play().catch(() => {});
      navigator.mediaSession.playbackState = "playing";
      if (!isPlayingRef.current) resumeRef.current();
    });

    // pause — notification drawer "pause" button
    trySet("pause", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      navigator.mediaSession.playbackState = "paused";
      if (isPlayingRef.current) pauseRef.current();
    });

    // stop
    trySet("stop", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      navigator.mediaSession.playbackState = "paused";
      if (isPlayingRef.current) pauseRef.current();
    });

    // nexttrack — URL already in cache + audio data already buffered → instant
    trySet("nexttrack", () => {
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;

      const nextIdx      = (idx + 1) % q.length;
      const nextSongItem = q[nextIdx];
      if (!nextSongItem) return;

      nextSongRef.current(); // React state sync (UI updates on screen unlock)

      resolveStreamUrl(nextSongItem).then((url) => {
        const audio = audioRef.current;
        if (!audio || !url) return;
        audio.src = url;
        audio.load();
        audio.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
        if (!isPlayingRef.current) resumeRef.current();
        // Pre-buffer the one after next
        prefetchAndBuffer(q[(nextIdx + 1) % q.length]);
      });
    });

    // previoustrack
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

      const prevIdx      = (idx - 1 + q.length) % q.length;
      const prevSongItem = q[prevIdx];
      if (!prevSongItem) return;

      prevSongRef.current();

      resolveStreamUrl(prevSongItem).then((url) => {
        const a = audioRef.current;
        if (!a || !url) return;
        a.src = url;
        a.load();
        a.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
        if (!isPlayingRef.current) resumeRef.current();
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
              duration:     audio.duration,
              playbackRate: audio.playbackRate,
              position:     Math.min(details.seekTime, audio.duration),
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

    // Re-assert state on visibility change (iOS drops handlers on lock/unlock)
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
  }, []); // empty deps intentional — all live state via refs

  // ── 4. Position state — keeps OS scrubber accurate ───────────────────────
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

  // ── 5. Audio element attributes for lock-screen / background playback ─────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setAttribute("playsinline",        "true");
    audio.setAttribute("webkit-playsinline", "true");
    audio.setAttribute("x-webkit-airplay",   "allow");
    (audio as any).disableRemotePlayback = false;
  }, [audioRef, currentSong]);
}