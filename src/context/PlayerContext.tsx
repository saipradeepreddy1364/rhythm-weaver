import React, { createContext, useContext, useState, useCallback } from "react";
import { Song } from "@/data/songs";

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  progress: number;
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
  const [progress, setProgress] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [showPlayer, setShowPlayer] = useState(false);

  const playSong = useCallback((song: Song, newQueue?: Song[]) => {
    setCurrentSong(song);
    setIsPlaying(true);
    setProgress(0);
    setShowPlayer(false);
    if (newQueue) setQueue(newQueue);
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(s => s.id !== song.id);
      return [song, ...filtered].slice(0, 20);
    });
  }, []);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  const nextSong = useCallback(() => {
    if (!currentSong || queue.length === 0) return;
    const idx = queue.findIndex(s => s.id === currentSong.id);
    const next = queue[(idx + 1) % queue.length];
    playSong(next, queue);
  }, [currentSong, queue, playSong]);

  const prevSong = useCallback(() => {
    if (!currentSong || queue.length === 0) return;
    const idx = queue.findIndex(s => s.id === currentSong.id);
    const prev = queue[(idx - 1 + queue.length) % queue.length];
    playSong(prev, queue);
  }, [currentSong, queue, playSong]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const tick = useCallback(() => {
    setProgress(prev => prev + 1);
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  return (
    <PlayerContext.Provider value={{
      currentSong, isPlaying, queue, progress, favorites, recentlyPlayed,
      playSong, togglePlay, nextSong, prevSong, setProgress, tick, toggleFavorite, isFavorite,
      showPlayer, setShowPlayer,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
