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

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("rw_favorites");
    if (saved) {
      try {
        setFavorites(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem("rw_favorites", JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  // Define nextSong first before using it in useEffect
  const nextSong = useCallback(() => {
    setQueue((q) => {
      let nextSongToPlay: Song | null = null;
      
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
        nextSongToPlay = next;
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

  // Setup audio event listeners
  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => setProgressState(Math.floor(audio.currentTime));
    const onDurationChange = () => setDuration(Math.floor(audio.duration) || 0);
    const onEnded = () => {
      // Auto play next song
      if (currentSong && queue.length > 0) {
        nextSong();
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = (e: Event) => {
      console.error("Audio error:", e);
      // Try to play next song on error
      if (currentSong && queue.length > 0) {
        nextSong();
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [currentSong, queue, nextSong]);

  const playSong = useCallback((song: Song, newQueue?: Song[]) => {
    const audio = audioRef.current;

    if (!song.audioUrl) {
      console.warn("No audio URL for song:", song.title);
      return;
    }

    try {
      audio.src = song.audioUrl;
      audio.currentTime = 0;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("Audio play error:", err);
          if (err.name === 'NotAllowedError') {
            alert('Please interact with the page first to play music.');
          }
        });
      }

      setCurrentSong(song);
      setIsPlaying(true);
      setProgressState(0);
      setShowPlayer(true);

      if (newQueue) setQueue(newQueue);

      setRecentlyPlayed((prev) => {
        const filtered = prev.filter((s) => s.id !== song.id);
        return [song, ...filtered].slice(0, 20);
      });
    } catch (err) {
      console.error("Error playing song:", err);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (audio.paused) {
      audio.play().catch((err) => console.error("Audio play error:", err));
    } else {
      audio.pause();
    }
  }, []);

  const setProgress = useCallback((p: number) => {
    const audio = audioRef.current;
    audio.currentTime = p;
    setProgressState(p);
  }, []);

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