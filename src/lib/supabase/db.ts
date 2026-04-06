export interface Playlist {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  cover_art?: string;
  song_count?: number;
}

export interface PlaylistSong {
  id: string;
  playlist_id: string;
  song_id: string;
  added_at: string;
}