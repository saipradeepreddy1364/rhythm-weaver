export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };
      playlists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          cover_art: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          cover_art?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          cover_art?: string | null;
          is_public?: boolean;
          updated_at?: string;
        };
      };
      playlist_songs: {
        Row: {
          id: string;
          playlist_id: string;
          song_id: string;
          song_title: string;
          song_artist: string;
          song_album: string | null;
          song_album_art: string | null;
          song_audio_url: string;
          song_duration: number | null;
          added_at: string;
          position: number;
        };
        Insert: {
          id?: string;
          playlist_id: string;
          song_id: string;
          song_title: string;
          song_artist: string;
          song_album?: string | null;
          song_album_art?: string | null;
          song_audio_url: string;
          song_duration?: number | null;
          added_at?: string;
          position?: number;
        };
        Update: {
          position?: number;
        };
      };
      liked_songs: {
        Row: {
          id: string;
          user_id: string;
          song_id: string;
          song_title: string;
          song_artist: string;
          song_album: string | null;
          song_album_art: string | null;
          song_audio_url: string;
          song_duration: number | null;
          liked_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          song_id: string;
          song_title: string;
          song_artist: string;
          song_album?: string | null;
          song_album_art?: string | null;
          song_audio_url: string;
          song_duration?: number | null;
          liked_at?: string;
        };
        Update: Record<string, never>;
      };
      liked_albums: {
        Row: {
          id: string;
          user_id: string;
          album_title: string;
          cover_art: string | null;
          album_type: string | null;
          songs_data: any;
          liked_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          album_title: string;
          cover_art?: string | null;
          album_type?: string | null;
          songs_data: any;
          liked_at?: string;
        };
        Update: {
          cover_art?: string | null;
          album_type?: string | null;
          songs_data?: any;
        };
      };
      recently_played: {
        Row: {
          id: string;
          user_id: string;
          song_id: string;
          song_title: string;
          song_artist: string;
          song_album: string | null;
          song_album_art: string | null;
          song_audio_url: string;
          song_duration: number | null;
          played_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          song_id: string;
          song_title: string;
          song_artist: string;
          song_album?: string | null;
          song_album_art?: string | null;
          song_audio_url: string;
          song_duration?: number | null;
          played_at?: string;
        };
        Update: Record<string, never>;
      };
    };
  };
};