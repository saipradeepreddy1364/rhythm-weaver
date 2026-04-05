export interface Song {
  id: string;
  title: string;
  artist: string;
  duration: number;
  albumArt: string;       // image URL from JioSaavn
  audioUrl: string;       // actual playable URL
  language?: string;
  year?: number;
  genre?: string;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Helper to map JioSaavn API response to our Song type
export function mapApiSong(item: any): Song {
  return {
    id: item.id,
    title: item.name,
    artist: item.artists?.primary?.map((a: any) => a.name).join(", ") || "Unknown",
    duration: item.duration || 0,
    albumArt: item.image?.[2]?.url || item.image?.[1]?.url || "",
    audioUrl: item.downloadUrl?.[4]?.url || item.downloadUrl?.[3]?.url || "",
    language: item.language,
    year: item.year,
  };
}

// Keep a small fallback for offline dev
export const allSongs: Song[] = [];