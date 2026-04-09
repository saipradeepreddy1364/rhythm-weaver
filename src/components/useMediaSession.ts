/**
 * useMediaSession.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop this hook into your PlayerContext (or import it from there).
 *
 * What it does:
 *  1. Registers Media Session metadata → lock-screen title / artist / album art
 *  2. Wires up hardware media keys / lock-screen buttons (play/pause/next/prev)
 *  3. Updates the "position state" so the OS scrubber works correctly
 *  4. Keeps the audio element's `playsinline` + `x-webkit-airplay` attributes
 *     set so browsers/iOS don't block background playback
 *
 * Usage — inside your PlayerContext:
 *
 *   import { useMediaSession } from "./useMediaSession";
 *
 *   // audioRef is the React ref wrapping your <audio> element
 *   useMediaSession({
 *     audioRef,
 *     currentSong,
 *     isPlaying,
 *     togglePlay,
 *     nextSong,
 *     prevSong,
 *   });
 *
 * That's it — no other changes needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";

interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  duration?: number;
}

interface UseMediaSessionOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentSong: Song | null;
  isPlaying: boolean;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
}

export function useMediaSession({
  audioRef,
  currentSong,
  isPlaying,
  togglePlay,
  nextSong,
  prevSong,
}: UseMediaSessionOptions) {

  // ── 1. Set metadata whenever the current song changes ──────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!currentSong) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const artwork: MediaImage[] = currentSong.albumArt
      ? [
          { src: currentSong.albumArt, sizes: "96x96",   type: "image/jpeg" },
          { src: currentSong.albumArt, sizes: "128x128",  type: "image/jpeg" },
          { src: currentSong.albumArt, sizes: "192x192",  type: "image/jpeg" },
          { src: currentSong.albumArt, sizes: "256x256",  type: "image/jpeg" },
          { src: currentSong.albumArt, sizes: "512x512",  type: "image/jpeg" },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentSong.title  || "Unknown Title",
      artist: currentSong.artist || "Unknown Artist",
      album:  currentSong.album  || "",
      artwork,
    });
  }, [currentSong]);

  // ── 2. Update playback state on the OS notification ────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // ── 3. Wire up action handlers (lock-screen buttons / headset keys) ────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play",          () => { if (!isPlaying) togglePlay(); }],
      ["pause",         () => { if (isPlaying)  togglePlay(); }],
      ["stop",          () => { if (isPlaying)  togglePlay(); }],
      ["nexttrack",     () => nextSong()],
      ["previoustrack", () => prevSong()],
      ["seekto", (details) => {
        const audio = audioRef.current;
        if (audio && details.seekTime != null) {
          audio.currentTime = details.seekTime;
        }
      }],
      ["seekbackward", (details) => {
        const audio = audioRef.current;
        if (audio) audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset ?? 10));
      }],
      ["seekforward", (details) => {
        const audio = audioRef.current;
        if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (details.seekOffset ?? 10));
      }],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers don't support every action — ignore
      }
    }

    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* */ }
      }
    };
  }, [isPlaying, togglePlay, nextSong, prevSong, audioRef]);

  // ── 4. Update position state so the OS progress bar is accurate ────────────
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

    audio.addEventListener("timeupdate", updatePosition);
    audio.addEventListener("durationchange", updatePosition);
    return () => {
      audio.removeEventListener("timeupdate", updatePosition);
      audio.removeEventListener("durationchange", updatePosition);
    };
  }, [audioRef, currentSong]);

  // ── 5. Ensure audio element attributes allow background / lock-screen play ─
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Required by iOS Safari to keep audio alive in background
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("x-webkit-airplay", "allow");
    // Prevent the browser from pausing when the page goes to background
    // (some Chromium builds respect this attribute)
    (audio as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false;
  }, [audioRef, currentSong]);
}