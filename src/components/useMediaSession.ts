import { useEffect } from "react";

const BACKEND_URL = "https://musicbackend-7a1o.onrender.com/api";

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
  audioRef: any;
  currentSong: Song | null;
  isPlaying: boolean;
  pausePlayback: () => void;
  resumePlayback: () => void;
  nextSong: () => void;
  prevSong: () => void;
  togglePlay: () => void;
  queueRef: any;
  queueIndexRef: any;
}

export const urlCache = new Map<string, string>();

export async function resolveStreamUrl(song: Song): Promise<string | null> {
  return `${BACKEND_URL}/songs/${song.id}/stream`;
}

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
  // Mock no-op hook for React Native context since background audio is
  // handled natively via expo-av background configurations.
  useEffect(() => {
    // No-op
  }, [isPlaying, currentSong]);
}