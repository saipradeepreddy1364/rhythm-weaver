// src/contexts/LibraryContext.tsx (COMPLETE CORRECTED VERSION)
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Song } from "@/data/songs";
import { useAuth } from "./AuthContext";

interface Playlist {
  id: string;
  name: string;
  user_id: string;
  description: string | null;
  cover_art: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  song_count?: number;
}

interface DBSongRow {
  song_id: string;
  song_title: string;
  song_artist: string;
  song_album_art: string | null;
  song_audio_url: string;
  song_duration: number | null;
  song_album: string | null;
}

interface DBPlaylistRow {
  id: string;
  name: string;
  user_id: string;
  description: string | null;
  cover_art: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface DBPlaylistSongRow extends DBSongRow {
  playlist_id: string;
  position: number;
}

interface LibraryContextType {
  likedSongs: Song[];
  recentlyPlayed: Song[];
  playlists: Playlist[];
  toggleLike: (song: Song) => Promise<void>;
  isLiked: (songId: string) => boolean;
  addToRecentlyPlayed: (song: Song) => Promise<void>;
  createNewPlaylist: (name: string) => Promise<Playlist | null>;
  removePlaylist: (playlistId: string) => Promise<void>;
  updatePlaylistName: (playlistId: string, newName: string) => Promise<void>;
  addToPlaylist: (playlistId: string, song: Song) => Promise<void>;
  removeFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  getPlaylist: (playlistId: string) => Promise<Song[]>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

// Complete type escape — tables are not in generated Supabase types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any;

const mapToSong = (item: DBSongRow): Song => ({
  id: item.song_id,
  title: item.song_title,
  artist: item.song_artist,
  albumArt: item.song_album_art || "",
  audioUrl: item.song_audio_url,
  duration: item.song_duration || 0,
  album: item.song_album || undefined,
});

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    if (user) {
      loadLikedSongs();
      loadPlaylists();
      loadRecentlyPlayedFromDB();
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

  const loadRecentlyPlayedFromDB = async () => {
    if (!user) return;

    const { data, error } = await db
      .from("recently_played")
      .select("*")
      .eq("user_id", user.id)
      .order("played_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error loading recently played:", error);
      return;
    }

    if (data && data.length > 0) {
      const songs: Song[] = (data as DBSongRow[]).map(mapToSong);
      setRecentlyPlayed(songs);
    }
  };

  const loadLikedSongs = async () => {
    if (!user) return;

    const { data, error } = await db
      .from("liked_songs")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.error("Error loading liked songs:", error);
      return;
    }

    if (data) {
      const songs: Song[] = (data as DBSongRow[]).map(mapToSong);
      setLikedSongs(songs);
    }
  };

  const loadPlaylists = async () => {
    if (!user) return;

    const { data, error } = await db
      .from("playlists")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.error("Error loading playlists:", error);
      return;
    }

    if (data) {
      const playlistsWithCounts: Playlist[] = [];

      for (const playlist of data as DBPlaylistRow[]) {
        const { count, error: countError } = await db
          .from("playlist_songs")
          .select("*", { count: "exact", head: true })
          .eq("playlist_id", playlist.id);

        if (!countError) {
          playlistsWithCounts.push({ ...playlist, song_count: count || 0 });
        } else {
          playlistsWithCounts.push({ ...playlist, song_count: 0 });
        }
      }
      setPlaylists(playlistsWithCounts);
    }
  };

  const toggleLike = async (song: Song) => {
    if (!user) return;

    const isAlreadyLiked = likedSongs.some((s) => s.id === song.id);

    if (isAlreadyLiked) {
      const { error } = await db
        .from("liked_songs")
        .delete()
        .eq("user_id", user.id)
        .eq("song_id", song.id);

      if (!error) {
        setLikedSongs((prev) => prev.filter((s) => s.id !== song.id));
      } else {
        console.error("Error unliking song:", error);
      }
    } else {
      const { error } = await db
        .from("liked_songs")
        .insert({
          user_id: user.id,
          song_id: song.id,
          song_title: song.title,
          song_artist: song.artist,
          song_album: song.album || null,
          song_album_art: song.albumArt || null,
          song_audio_url: song.audioUrl,
          song_duration: song.duration || null,
        });

      if (!error) {
        setLikedSongs((prev) => [...prev, song]);
      } else {
        console.error("Error liking song:", error);
      }
    }
  };

  const isLiked = (songId: string) => {
    return likedSongs.some((s) => s.id === songId);
  };

  const addToRecentlyPlayed = async (song: Song) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const updated = [song, ...filtered].slice(0, 50);
      localStorage.setItem("rw_recently_played", JSON.stringify(updated));

      const timestamps = JSON.parse(localStorage.getItem("rw_recent_ts") || "{}");
      timestamps[song.id] = Date.now();
      localStorage.setItem("rw_recent_ts", JSON.stringify(timestamps));

      return updated;
    });

    if (user) {
      const { error } = await db
        .from("recently_played")
        .insert({
          user_id: user.id,
          song_id: song.id,
          song_title: song.title,
          song_artist: song.artist,
          song_album: song.album || null,
          song_album_art: song.albumArt || null,
          song_audio_url: song.audioUrl,
          song_duration: song.duration || null,
        });

      if (error) {
        console.error("Error saving to recently played:", error);
      }
    }
  };

  const createNewPlaylist = async (name: string): Promise<Playlist | null> => {
    if (!user) return null;

    const { data, error } = await db
      .from("playlists")
      .insert({
        user_id: user.id,
        name: name,
        is_public: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating playlist:", error);
      return null;
    }

    if (data) {
      const newPlaylist: Playlist = { ...(data as DBPlaylistRow), song_count: 0 };
      setPlaylists((prev) => [...prev, newPlaylist]);
      return newPlaylist;
    }
    return null;
  };

  const removePlaylist = async (playlistId: string) => {
    if (!user) return;

    const { error } = await db
      .from("playlists")
      .delete()
      .eq("id", playlistId);

    if (!error) {
      setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    } else {
      console.error("Error removing playlist:", error);
    }
  };

  const updatePlaylistName = async (playlistId: string, newName: string) => {
    if (!user) return;

    const { error } = await db
      .from("playlists")
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq("id", playlistId);

    if (!error) {
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id === playlistId) {
            return { ...p, name: newName };
          }
          return p;
        })
      );
    } else {
      console.error("Error updating playlist name:", error);
    }
  };

  const addToPlaylist = async (playlistId: string, song: Song) => {
    if (!user) return;

    const { data: existingSongs } = await db
      .from("playlist_songs")
      .select("position")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: false })
      .limit(1);

    const rows = existingSongs as { position: number }[] | null;
    const nextPosition = rows && rows.length > 0 ? rows[0].position + 1 : 0;

    const { error } = await db
      .from("playlist_songs")
      .insert({
        playlist_id: playlistId,
        song_id: song.id,
        song_title: song.title,
        song_artist: song.artist,
        song_album: song.album || null,
        song_album_art: song.albumArt || null,
        song_audio_url: song.audioUrl,
        song_duration: song.duration || null,
        position: nextPosition,
      });

    if (!error) {
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id === playlistId) {
            return { ...p, song_count: (p.song_count || 0) + 1 };
          }
          return p;
        })
      );
    } else {
      console.error("Error adding to playlist:", error);
    }
  };

  const removeFromPlaylist = async (playlistId: string, songId: string) => {
    if (!user) return;

    const { error } = await db
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", playlistId)
      .eq("song_id", songId);

    if (!error) {
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id === playlistId) {
            return { ...p, song_count: Math.max(0, (p.song_count || 0) - 1) };
          }
          return p;
        })
      );
    } else {
      console.error("Error removing from playlist:", error);
    }
  };

  const getPlaylist = async (playlistId: string): Promise<Song[]> => {
    const { data, error } = await db
      .from("playlist_songs")
      .select("*")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true });

    if (error) {
      console.error("Error getting playlist:", error);
      return [];
    }

    if (!data) return [];

    const songs: Song[] = (data as DBPlaylistSongRow[]).map(mapToSong);
    return songs;
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