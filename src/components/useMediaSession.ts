/**
 * useMediaSession.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles lock-screen / notification controls and hardware media keys.
 *
 * KEY DESIGN: All action handlers are stored in refs and re-registered on a
 * single stable effect. This means:
 *  - Handlers NEVER go stale (no closure over old state)
 *  - The effect never tears down + re-registers on every render
 *  - next/prev call the audio element DIRECTLY — no React state involved,
 *    so playback continues even when the screen is locked and JS is throttled.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";

interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  movie?: string;
  albumArt?: string;
  duration?: number;
}

interface UseMediaSessionOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentSong: Song | null;
  isPlaying: boolean;
  // Direct-play callback — must set audio.src + audio.play() WITHOUT going
  // through React state. Provide the same playAudioDirectly from PlayerContext.
  playAudioDirectly: (song: Song) => void;
  nextSong: () => void;   // still called for React state sync (UI update on unlock)
  prevSong: () => void;
  togglePlay: () => void;
  // The full queue + index as refs so we can read them without React re-renders
  queueRef: React.RefObject<Song[]>;
  queueIndexRef: React.RefObject<number>;
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
  const nextSongRef         = useRef(nextSong);
  const prevSongRef         = useRef(prevSong);
  const togglePlayRef       = useRef(togglePlay);
  const playAudioDirectlyRef = useRef(playAudioDirectly);
  const isPlayingRef        = useRef(isPlaying);

  useEffect(() => { nextSongRef.current         = nextSong;        }, [nextSong]);
  useEffect(() => { prevSongRef.current         = prevSong;        }, [prevSong]);
  useEffect(() => { togglePlayRef.current       = togglePlay;      }, [togglePlay]);
  useEffect(() => { playAudioDirectlyRef.current = playAudioDirectly; }, [playAudioDirectly]);
  useEffect(() => { isPlayingRef.current        = isPlaying;       }, [isPlaying]);

  // ── 1. Metadata — update whenever song changes ────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!currentSong) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentSong.title  || "Unknown Title",
      artist: currentSong.artist || "Unknown Artist",
      album:  currentSong.movie  || currentSong.album || "",
      artwork: currentSong.albumArt
        ? [
            { src: currentSong.albumArt, sizes: "96x96",   type: "image/jpeg" },
            { src: currentSong.albumArt, sizes: "128x128",  type: "image/jpeg" },
            { src: currentSong.albumArt, sizes: "192x192",  type: "image/jpeg" },
            { src: currentSong.albumArt, sizes: "256x256",  type: "image/jpeg" },
            { src: currentSong.albumArt, sizes: "512x512",  type: "image/jpeg" },
          ]
        : [],
    });
  }, [currentSong]);

  // ── 2. Playback state sync ────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // ── 3. Action handlers — registered ONCE, always read from refs ───────────
  // This is the critical fix: handlers are never torn down and re-registered
  // on every render, and they read live values from refs instead of closures.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const trySet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported */ }
    };

    // play / pause — toggle audio element directly, then sync React state
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

    // nexttrack — play audio directly (bypasses React render pipeline) then
    // also call nextSong() so React state/UI updates when screen unlocks
    trySet("nexttrack", () => {
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;
      const nextIdx = (idx + 1) % q.length;
      const nextSongItem = q[nextIdx];
      if (nextSongItem) {
        playAudioDirectlyRef.current(nextSongItem); // immediate — no React needed
      }
      nextSongRef.current(); // React state sync for UI
    });

    // previoustrack — same pattern
    trySet("previoustrack", () => {
      const audio = audioRef.current;
      // If more than 3s in, restart current song
      if (audio && audio.currentTime > 3) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      const q   = queueRef.current;
      const idx = queueIndexRef.current;
      if (!q || q.length === 0) return;
      const prevIdx = (idx - 1 + q.length) % q.length;
      const prevSongItem = q[prevIdx];
      if (prevSongItem) {
        playAudioDirectlyRef.current(prevSongItem); // immediate — no React needed
      }
      prevSongRef.current(); // React state sync for UI
    });

    trySet("seekto", (details) => {
      const audio = audioRef.current;
      if (audio && details.seekTime != null) {
        audio.currentTime = details.seekTime;
        try {
          if (audio.duration && isFinite(audio.duration)) {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              playbackRate: audio.playbackRate,
              position: Math.min(details.seekTime, audio.duration),
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

    // Re-register when page becomes visible (iOS drops handlers on lock/unlock)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Re-assert playback state in case OS reset it
        navigator.mediaSession.playbackState = isPlayingRef.current ? "playing" : "paused";
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      (["play","pause","stop","nexttrack","previoustrack","seekto","seekbackward","seekforward"] as MediaSessionAction[])
        .forEach((a) => trySet(a, null));
    };
  }, []); // ← empty deps intentional: handlers read from refs, never go stale

  // ── 4. Position state — keep OS scrubber accurate ────────────────────────
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