import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Song } from "@/data/songs";
import { useAuth } from "./AuthContext";

interface Playlist {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  cover_art?: string;
  song_count?: number;
}

interface LibraryContextType {
  likedSongs: Song[];
  recentlyPlayed: Song[];
  playlists: Playlist[];
  toggleLike: (song: Song) => Promise<void>;
  isLiked: (songId: string) => boolean;
  addToRecentlyPlayed: (song: Song) => void;
  createNewPlaylist: (name: string) => Promise<void>;
  removePlaylist: (playlistId: string) => Promise<void>;
  updatePlaylistName: (playlistId: string, newName: string) => Promise<void>;
  addToPlaylist: (playlistId: string, song: Song) => Promise<void>;
  removeFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  getPlaylist: (playlistId: string) => Promise<Song[]>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    if (user) {
      loadLikedSongs();
      loadPlaylists();
    }
  }, [user]);

  useEffect(() => {
    const stored = localStorage.getItem("rw_recently_played");
    if (stored) {
      try {
        setRecentlyPlayed(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const loadLikedSongs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("liked_songs")
      .select("song_data")
      .eq("user_id", user.id);
    
    if (data) {
      const songs = data.map((item: any) => item.song_data as Song);
      setLikedSongs(songs);
    }
  };

  const loadPlaylists = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("playlists")
      .select("*")
      .eq("user_id", user.id);
    
    if (data) {
      const playlistsWithCounts: Playlist[] = [];
      for (const playlist of data) {
        const { count } = await supabase
          .from("playlist_songs")
          .select("*", { count: "exact", head: true })
          .eq("playlist_id", playlist.id);
        playlistsWithCounts.push({ ...playlist, song_count: count || 0 });
      }
      setPlaylists(playlistsWithCounts);
    }
  };

  const toggleLike = async (song: Song) => {
    if (!user) return;
    
    const isAlreadyLiked = likedSongs.some(s => s.id === song.id);
    
    if (isAlreadyLiked) {
      await supabase
        .from("liked_songs")
        .delete()
        .eq("user_id", user.id)
        .eq("song_id", song.id);
      
      setLikedSongs(prev => prev.filter(s => s.id !== song.id));
    } else {
      const { error } = await supabase
        .from("liked_songs")
        .insert({ user_id: user.id, song_id: song.id, song_data: song });
      
      if (!error) {
        setLikedSongs(prev => [...prev, song]);
      }
    }
  };

  const isLiked = (songId: string) => {
    return likedSongs.some(s => s.id === songId);
  };

  const addToRecentlyPlayed = (song: Song) => {
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(s => s.id !== song.id);
      const updated = [song, ...filtered].slice(0, 50);
      localStorage.setItem("rw_recently_played", JSON.stringify(updated));
      
      const timestamps = JSON.parse(localStorage.getItem("rw_recent_ts") || "{}");
      timestamps[song.id] = Date.now();
      localStorage.setItem("rw_recent_ts", JSON.stringify(timestamps));
      
      return updated;
    });
  };

  const createNewPlaylist = async (name: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("playlists")
      .insert({ user_id: user.id, name })
      .select()
      .single();
    
    if (data && !error) {
      setPlaylists(prev => [...prev, { ...data, song_count: 0 }]);
    }
  };

  const removePlaylist = async (playlistId: string) => {
    if (!user) return;
    await supabase.from("playlists").delete().eq("id", playlistId);
    setPlaylists(prev => prev.filter(p => p.id !== playlistId));
  };

  const updatePlaylistName = async (playlistId: string, newName: string) => {
    if (!user) return;
    await supabase
      .from("playlists")
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq("id", playlistId);
    
    setPlaylists(prev =>
      prev.map(p => (p.id === playlistId ? { ...p, name: newName } : p))
    );
  };

  const addToPlaylist = async (playlistId: string, song: Song) => {
    if (!user) return;
    await supabase
      .from("playlist_songs")
      .insert({ playlist_id: playlistId, song_id: song.id, song_data: song });
  };

  const removeFromPlaylist = async (playlistId: string, songId: string) => {
    if (!user) return;
    await supabase
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", playlistId)
      .eq("song_id", songId);
  };

  const getPlaylist = async (playlistId: string): Promise<Song[]> => {
    const { data } = await supabase
      .from("playlist_songs")
      .select("song_data")
      .eq("playlist_id", playlistId);
    
    return data?.map((item: any) => item.song_data as Song) || [];
  };

  return (
    <LibraryContext.Provider
      value={{
        likedSongs,
        recentlyPlayed,
        playlists,
        toggleLike,
        isLiked,
        addToRecentlyPlayed,
        createNewPlaylist,
        removePlaylist,
        updatePlaylistName,
        addToPlaylist,
        removeFromPlaylist,
        getPlaylist,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used within LibraryProvider");
  return context;
}