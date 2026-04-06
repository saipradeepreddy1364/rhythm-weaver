export interface Song {
  id: string;
  title: string;
  artist: string;
  duration: number;
  albumArt: string;
  audioUrl: string;
  language?: string;
  year?: number;
  genre?: string;
  album?: string;      // ADD THIS - for album grouping
  movie?: string;      // ADD THIS - for movie grouping
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function mapApiSong(item: any): Song {
  const imageUrl =
    item.image?.[2]?.url ||
    item.image?.[1]?.url ||
    item.image?.[0]?.url ||
    "";

  const audioUrl =
    item.downloadUrl?.[4]?.url ||
    item.downloadUrl?.[3]?.url ||
    item.downloadUrl?.[2]?.url ||
    item.downloadUrl?.[1]?.url ||
    item.downloadUrl?.[0]?.url ||
    "";

  const artists = Array.isArray(item.artists?.primary)
    ? item.artists.primary.map((a: any) => a.name).join(", ")
    : item.primaryArtists || "Unknown";

  return {
    id: item.id,
    title: item.name || item.title || "Unknown",
    artist: artists,
    duration: Number(item.duration) || 0,
    albumArt: imageUrl,
    audioUrl: audioUrl,
    language: item.language,
    year: item.year ? Number(item.year) : undefined,
    genre: item.genre,
    album: item.album || item.movie || "",     // ADD THIS
    movie: item.movie || item.album || "",     // ADD THIS
  };
}

export const allSongs: Song[] = [];