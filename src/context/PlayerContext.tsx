import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { Song } from "@/data/songs";

interface PlayerContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  queueIndex: number;
  progress: number;
  duration: number;
  volume: number;
  showPlayer: boolean;
  recentlyPlayed: Song[];
  favorites: Song[];  // Add favorites array
  playSong: (song: Song, songQueue?: Song[]) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  setProgress: (value: number) => void;
  setVolume: (value: number) => void;
  setShowPlayer: (show: boolean) => void;
  addToRecentlyPlayed: (song: Song) => void;
  toggleFavorite: (songId: string) => void;  // Add this
  isFavorite: (songId: string) => boolean;   // Add this
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const RECENTLY_PLAYED_KEY = "rw_recently_played";
const RECENTLY_PLAYED_TS_KEY = "rw_recent_ts";
const FAVORITES_KEY = "rw_favorites";

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [showPlayer, setShowPlayer] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<Song[]>([]);  // Add favorites state

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (e) { 
        console.error(e); 
      }
    }
  }, []);

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  // Load recently played from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(RECENTLY_PLAYED_KEY);
    if (saved) {
      try {
        setRecentlyPlayed(JSON.parse(saved));
      } catch (e) { 
        console.error(e); 
      }
    }
  }, []);

  // Save recently played to localStorage
  useEffect(() => {
    if (recentlyPlayed.length > 0) {
      localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(recentlyPlayed.slice(0, 50)));
    }
  }, [recentlyPlayed]);

  const addToRecentlyPlayed = (song: Song) => {
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(s => s.id !== song.id);
      const newList = [song, ...filtered].slice(0, 50);
      const timestamps: Record<string, number> = JSON.parse(localStorage.getItem(RECENTLY_PLAYED_TS_KEY) || "{}");
      timestamps[song.id] = Date.now();
      localStorage.setItem(RECENTLY_PLAYED_TS_KEY, JSON.stringify(timestamps));
      return newList;
    });
  };

  const toggleFavorite = (songId: string) => {
    const song = currentSong;
    if (!song) return;
    
    setFavorites(prev => {
      const exists = prev.some(s => s.id === songId);
      if (exists) {
        return prev.filter(s => s.id !== songId);
      } else {
        return [...prev, song];
      }
    });
  };

  const isFavorite = (songId: string): boolean => {
    return favorites.some(s => s.id === songId);
  };

  // Setup audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
      
      audioRef.current.addEventListener('timeupdate', () => {
        if (audioRef.current) {
          setProgress(audioRef.current.currentTime);
        }
      });
      
      audioRef.current.addEventListener('durationchange', () => {
        if (audioRef.current) {
          setDuration(audioRef.current.duration);
        }
      });
      
      audioRef.current.addEventListener('ended', () => {
        nextSong();
      });
      
      audioRef.current.addEventListener('play', () => setIsPlaying(true));
      audioRef.current.addEventListener('pause', () => setIsPlaying(false));
      audioRef.current.addEventListener('error', (e) => {
        console.error("Audio error:", e);
        nextSong();
      });
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('timeupdate', () => {});
        audioRef.current.removeEventListener('durationchange', () => {});
        audioRef.current.removeEventListener('ended', () => {});
        audioRef.current.removeEventListener('play', () => {});
        audioRef.current.removeEventListener('pause', () => {});
        audioRef.current.removeEventListener('error', () => {});
      }
    };
  }, []);

  // Play song when currentSong changes
  useEffect(() => {
    if (currentSong && audioRef.current) {
      const audio = audioRef.current;
      audio.src = currentSong.audioUrl;
      audio.load();
      if (isPlaying) {
        audio.play().catch(err => {
          console.error("Auto-play failed:", err);
          setIsPlaying(false);
        });
      }
    }
  }, [currentSong]);

  // Handle play/pause
  useEffect(() => {
    if (audioRef.current && currentSong) {
      if (isPlaying) {
        audioRef.current.play().catch(err => {
          console.error("Play failed:", err);
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong]);

  // Volume control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const playSong = (song: Song, songQueue?: Song[]) => {
    const newQueue = songQueue || [song];
    const newIndex = newQueue.findIndex(s => s.id === song.id);
    
    setQueue(newQueue);
    setQueueIndex(newIndex >= 0 ? newIndex : 0);
    setCurrentSong(song);
    setIsPlaying(true);
    setShowPlayer(true);
    addToRecentlyPlayed(song);
  };

  const togglePlay = () => {
    if (currentSong) {
      setIsPlaying(!isPlaying);
    }
  };

  const nextSong = () => {
    if (queue.length > 0) {
      const nextIndex = (queueIndex + 1) % queue.length;
      const next = queue[nextIndex];
      setQueueIndex(nextIndex);
      setCurrentSong(next);
      setIsPlaying(true);
      addToRecentlyPlayed(next);
    }
  };

  const prevSong = () => {
    if (queue.length > 0) {
      const prevIndex = (queueIndex - 1 + queue.length) % queue.length;
      const prev = queue[prevIndex];
      setQueueIndex(prevIndex);
      setCurrentSong(prev);
      setIsPlaying(true);
      addToRecentlyPlayed(prev);
    }
  };

  const handleSetProgress = (value: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setProgress(value);
    }
  };

  return (
    <PlayerContext.Provider value={{
      currentSong,
      isPlaying,
      queue,
      queueIndex,
      progress,
      duration,
      volume,
      showPlayer,
      recentlyPlayed,
      favorites,
      playSong,
      togglePlay,
      nextSong,
      prevSong,
      setProgress: handleSetProgress,
      setVolume,
      setShowPlayer,
      addToRecentlyPlayed,
      toggleFavorite,
      isFavorite,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}