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
 *  6. WakeLock is re-acquired on every visibilitychange back to "visible" so
 *     screen-lock → unlock never drops background audio on Android.
 *
 *  WHY MUSIC WAS STOPPING AFTER 2 SONGS ON LOCK SCREEN:
 *  ──────────────────────────────────────────────────────
 *  The previous fix used setInterval on the MAIN thread to refresh JioSaavn
 *  CDN URLs every 90 s. Browsers FREEZE main-thread timers when the screen
 *  locks (both Android Chrome and iOS Safari). So after song 1 ended, the
 *  timer had never fired, song 2's URL was already stale, and playback died.
 *
 *  THE FIX — two independent layers:
 *
 *  7. Web Worker refresh (primary): The worker runs on a separate OS thread.
 *     Worker timers are NOT frozen on lock screen. It re-fetches every song's
 *     URL every 60 s and posts them back to the main thread to update urlCache.
 *     The worker code is inlined as a Blob so no extra Vite config is needed.
 *
 *  8. 80%-progress pre-fetch (secondary guarantee): When audio reaches 80%
 *     of the current song, we immediately evict + re-fetch the NEXT song's URL
 *     on the main thread via the `timeupdate` event. This fires while the
 *     screen is still on (user is listening), guaranteeing the URL is fresh
 *     before the next song starts — even if the worker is momentarily delayed.
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
  pausePlayback: () => void;
  resumePlayback: () => void;
  nextSong: () => void;
  prevSong: () => void;
  togglePlay: () => void;
  queueRef: React.RefObject<Song[]>;
  queueIndexRef: React.RefObject<number>;
}

// ─── Module-level URL cache (survives re-mounts) ──────────────────────────────
export const urlCache = new Map<string, string>();
if (typeof window !== "undefined") (window as any).__rwUrlCache = urlCache;

/**
 * Resolve the best playable stream URL for a song.
 * Order: memory cache → backend fetch.
 */
export async function resolveStreamUrl(song: Song): Promise<string | null> {
  if (urlCache.has(song.id)) return urlCache.get(song.id)!;

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

// ─── Hidden buffer element ────────────────────────────────────────────────────
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
    if (el.src === url) return;
    el.src     = url;
    el.preload = "auto";
    el.load();
  }).catch(() => {});
}

// ─── Keep-alive ───────────────────────────────────────────────────────────────
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

// ─── Web Worker — URL refresh on a non-throttled OS thread ───────────────────
// Inlined as a Blob string so no extra Vite/webpack config is required.
// Worker timers run on a separate OS thread and are NOT frozen by the browser
// when the screen locks — this is the key difference from main-thread setInterval.
//
// Protocol:
//   main → worker:  { type: "START"|"UPDATE", songIds: string[], backendUrl: string }
//                   { type: "STOP" }
//   worker → main:  { type: "URLS", urls: Record<string, string> }

const WORKER_SRC = `
let timerId = null;
let ids = [];
let base = "";

async function fetchOne(id) {
  try {
    const r = await fetch(base + "/songs/" + id);
    if (!r.ok) return [id, null];
    const j = await r.json();
    const d = j && j.data;
    const s = Array.isArray(d) ? d[0] : d;
    if (!s) return [id, null];
    const dl = s.downloadUrl || s.audioUrl || s.url;
    if (Array.isArray(dl) && dl.length) {
      const sorted = dl.slice().sort(function(a,b){
        return (parseInt(String(b.quality))||0)-(parseInt(String(a.quality))||0);
      });
      return [id, sorted[0] && sorted[0].url ? sorted[0].url : null];
    }
    if (typeof dl === "string" && dl.indexOf("http") === 0) return [id, dl];
    return [id, null];
  } catch(e) { return [id, null]; }
}

async function doRefresh() {
  if (!ids.length || !base) return;
  var results = await Promise.allSettled(ids.map(fetchOne));
  var out = {};
  results.forEach(function(r){
    if (r.status === "fulfilled" && r.value && r.value[1]) out[r.value[0]] = r.value[1];
  });
  if (Object.keys(out).length) self.postMessage({ type: "URLS", urls: out });
}

self.onmessage = function(e) {
  var t = e.data && e.data.type;
  if (t === "STOP") {
    if (timerId !== null) { clearInterval(timerId); timerId = null; }
    ids = [];
    return;
  }
  if (t === "START" || t === "UPDATE") {
    ids = e.data.songIds || [];
    if (e.data.backendUrl) base = e.data.backendUrl;
    doRefresh();
    if (t === "START") {
      if (timerId !== null) clearInterval(timerId);
      timerId = setInterval(doRefresh, 60000);
    }
  }
};
`;

let _worker: Worker | null = null;

function getWorker(): Worker | null {
  if (_worker) return _worker;
  try {
    const blob = new Blob([WORKER_SRC], { type: "application/javascript" });
    _worker = new Worker(URL.createObjectURL(blob));
    return _worker;
  } catch {
    return null; // graceful fallback if Blob Workers blocked
  }
}

function stopWorker() {
  if (_worker) {
    try { _worker.postMessage({ type: "STOP" }); } catch { /**/ }
    try { _worker.terminate(); } catch { /**/ }
    _worker = null;
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

  const nextSongRef        = useRef(nextSong);
  const prevSongRef        = useRef(prevSong);
  const togglePlayRef      = useRef(togglePlay);
  const pauseRef           = useRef(pausePlayback);
  const resumeRef          = useRef(resumePlayback);
  const isPlayingRef       = useRef(isPlaying);
  const nextPrefetchedRef  = useRef(false); // guard for 80% prefetch

  useEffect(() => { nextSongRef.current   = nextSong;       }, [nextSong]);
  useEffect(() => { prevSongRef.current   = prevSong;       }, [prevSong]);
  useEffect(() => { togglePlayRef.current = togglePlay;     }, [togglePlay]);
  useEffect(() => { pauseRef.current      = pausePlayback;  }, [pausePlayback]);
  useEffect(() => { resumeRef.current     = resumePlayback; }, [resumePlayback]);
  useEffect(() => { isPlayingRef.current  = isPlaying;      }, [isPlaying]);

  // ── Keep-alive + Wake Lock ────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      startKeepAlive();
      acquireWakeLock();
    } else {
      stopKeepAlive();
      releaseWakeLock();
    }
  }, [isPlaying]);

  // ── Web Worker: start once, receive URL updates ───────────────────────────
  useEffect(() => {
    const worker = getWorker();
    if (!worker) return;

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "URLS") return;
      // Atomically update the shared URL cache with fresh URLs from the worker
      const urls: Record<string, string> = e.data.urls;
      for (const [id, url] of Object.entries(urls)) {
        urlCache.set(id, url);
      }
    };
    worker.addEventListener("message", onMessage);

    // Kick off the first refresh + 60-second loop inside the worker
    const q = queueRef.current;
    worker.postMessage({
      type: "START",
      songIds: q ? q.map((s) => s.id) : [],
      backendUrl: BACKEND_URL,
    });

    return () => {
      worker.removeEventListener("message", onMessage);
      stopWorker();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep worker queue in sync when songs change ───────────────────────────
  useEffect(() => {
    const worker = getWorker();
    if (!worker) return;
    const q = queueRef.current;
    if (!q || q.length === 0) return;
    worker.postMessage({
      type: "UPDATE",
      songIds: q.map((s) => s.id),
      backendUrl: BACKEND_URL,
    });
    nextPrefetchedRef.current = false; // reset 80% guard on song change
  }, [currentSong?.id, queueRef]);

  // ── Pre-buffer next song on song/queue change ─────────────────────────────
  useEffect(() => {
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    if (!q || q.length === 0) return;
    const nextIdx = (idx + 1) % q.length;
    const prevIdx = (idx - 1 + q.length) % q.length;
    prefetchAndBuffer(q[nextIdx]);
    if (prevIdx !== nextIdx) resolveStreamUrl(q[prevIdx]).catch(() => {});
  }, [currentSong?.id, queueRef, queueIndexRef]);

  // ── 80% progress: proactively refresh next song's URL ────────────────────
  // Fires on the main thread via timeupdate while the screen is still on.
  // This is the second independent guarantee that the next URL is always fresh.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (nextPrefetchedRef.current) return;
      const dur = audio.duration;
      if (!dur || !isFinite(dur) || dur < 1) return;
      if (audio.currentTime / dur < 0.80) return;

      nextPrefetchedRef.current = true;
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;
      const next = q[(idx + 1) % q.length];
      if (!next) return;

      // Evict stale entry and fetch a brand-new URL right now
      urlCache.delete(next.id);
      resolveStreamUrl(next).then((url) => {
        if (!url) return;
        const el = getBufferAudio();
        if (el.src !== url) { el.src = url; el.preload = "auto"; el.load(); }
      }).catch(() => {});
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [audioRef, currentSong?.id, queueRef, queueIndexRef]);

  // ── Audio focus: OS-initiated pause/play (calls, other apps) ─────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let osPaused = false;

    const onPause = () => {
      if (isPlayingRef.current) {
        osPaused = true;
        pauseRef.current();
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
      }
    };
    const onPlay = () => {
      if (osPaused) {
        osPaused = false;
        resumeRef.current();
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
      }
    };

    audio.addEventListener("pause", onPause);
    audio.addEventListener("play",  onPlay);
    return () => {
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play",  onPlay);
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
      const nextIdx = (idx + 1) % q.length;
      const nextItem = q[nextIdx];
      if (!nextItem) return;
      nextSongRef.current();
      resolveStreamUrl(nextItem).then((url) => {
        const audio = audioRef.current;
        if (!audio || !url) return;
        audio.src = url;
        audio.load();
        audio.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
        if (!isPlayingRef.current) resumeRef.current();
        prefetchAndBuffer(q[(nextIdx + 1) % q.length]);
      });
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
      const prevIdx = (idx - 1 + q.length) % q.length;
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

    // ── Screen unlock: force-resume stalled audio ─────────────────────────
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
            // Last resort: fetch a completely fresh URL for the current song
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
      } catch { /* ignore */ }
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