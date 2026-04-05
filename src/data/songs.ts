export interface Song {
  id: string;
  title: string;
  artist: string;
  duration: number;
  albumArt: string;
  audioUrl: string;
  language?: string;
  year?: number;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function mapApiSong(item: any): Song {
  return {
    id: item.id,
    title: item.name,
    artist: item.artists?.primary?.map((a: any) => a.name).join(", ") || "Unknown",
    duration: Number(item.duration) || 0,
    albumArt: item.image?.[2]?.url || item.image?.[1]?.url || item.image?.[0]?.url || "",
    audioUrl: item.downloadUrl?.[4]?.url || item.downloadUrl?.[3]?.url || item.downloadUrl?.[2]?.url || "",
    language: item.language || "",
    year: Number(item.year) || undefined,
  };
}

export const allSongs: Song[] = [];