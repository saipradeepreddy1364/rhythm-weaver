import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { Song } from "@/data/songs";

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  progress: number;
  duration: number;
  favorites: Set<string>;
  recentlyPlayed: Song[];
}

interface PlayerContextType extends PlayerState {
  playSong: (song: Song, queue?: Song[]) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  setProgress: (p: number) => void;
  tick: () => void;
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  showPlayer: boolean;
  setShowPlayer: (v: boolean) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [progress, setProgressState] = useState(0);
  const [duration, setDuration] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [showPlayer, setShowPlayer] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(new Audio());

  // Setup audio event listeners once
  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => setProgressState(Math.floor(audio.currentTime));
    const onDurationChange = () => setDuration(Math.floor(audio.duration) || 0);
    const onEnded = () => {
      // Auto play next song
      setQueue((q) => {
        setCurrentSong((cur) => {
          if (!cur || q.length === 0) return cur;
          const idx = q.findIndex((s) => s.id === cur.id);
          const next = q[(idx + 1) % q.length];
          audio.src = next.audioUrl;
          audio.play().catch(() => {});
          setProgressState(0);
          setRecentlyPlayed((prev) => {
            const filtered = prev.filter((s) => s.id !== next.id);
            return [next, ...filtered].slice(0, 20);
          });
          return next;
        });
        return q;
      });
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const playSong = useCallback((song: Song, newQueue?: Song[]) => {
    const audio = audioRef.current;

    if (!song.audioUrl) {
      console.warn("No audio URL for song:", song.title);
      return;
    }

    audio.src = song.audioUrl;
    audio.currentTime = 0;
    audio.play().catch((err) => console.error("Audio play error:", err));

    setCurrentSong(song);
    setIsPlaying(true);
    setProgressState(0);
    setShowPlayer(false);

    if (newQueue) setQueue(newQueue);

    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      return [song, ...filtered].slice(0, 20);
    });
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (audio.paused) {
      audio.play().catch((err) => console.error("Audio play error:", err));
    } else {
      audio.pause();
    }
  }, []);

  const nextSong = useCallback(() => {
    setQueue((q) => {
      setCurrentSong((cur) => {
        if (!cur || q.length === 0) return cur;
        const idx = q.findIndex((s) => s.id === cur.id);
        const next = q[(idx + 1) % q.length];
        const audio = audioRef.current;
        audio.src = next.audioUrl;
        audio.play().catch(() => {});
        setProgressState(0);
        setRecentlyPlayed((prev) => {
          const filtered = prev.filter((s) => s.id !== next.id);
          return [next, ...filtered].slice(0, 20);
        });
        return next;
      });
      return q;
    });
  }, []);

  const prevSong = useCallback(() => {
    const audio = audioRef.current;
    // If more than 3 seconds played, restart current song
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    setQueue((q) => {
      setCurrentSong((cur) => {
        if (!cur || q.length === 0) return cur;
        const idx = q.findIndex((s) => s.id === cur.id);
        const prev = q[(idx - 1 + q.length) % q.length];
        audio.src = prev.audioUrl;
        audio.play().catch(() => {});
        setProgressState(0);
        setRecentlyPlayed((prevPlayed) => {
          const filtered = prevPlayed.filter((s) => s.id !== prev.id);
          return [prev, ...filtered].slice(0, 20);
        });
        return prev;
      });
      return q;
    });
  }, []);

  const setProgress = useCallback((p: number) => {
    const audio = audioRef.current;
    audio.currentTime = p;
    setProgressState(p);
  }, []);

  // tick is kept for backward compat but not used anymore
  const tick = useCallback(() => {}, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  return (
    <PlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        queue,
        progress,
        duration,
        favorites,
        recentlyPlayed,
        playSong,
        togglePlay,
        nextSong,
        prevSong,
        setProgress,
        tick,
        toggleFavorite,
        isFavorite,
        showPlayer,
        setShowPlayer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}