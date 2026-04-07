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
  album?: string;
  movie?: string;
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Maps any API song object to our Song interface.
 * Handles both JioSaavn API v2 shapes and any backend wrapper variations.
 */
export function mapApiSong(item: any): Song {
  if (!item || typeof item !== "object") {
    return { id: "", title: "Unknown", artist: "Unknown", duration: 0, albumArt: "", audioUrl: "" };
  }

  // ── Album art ──────────────────────────────────────────────────────────────
  // Try all known image field shapes
  const imageUrl =
    item.image?.[2]?.url ||
    item.image?.[2]?.link ||
    item.image?.[1]?.url ||
    item.image?.[1]?.link ||
    item.image?.[0]?.url ||
    item.image?.[0]?.link ||
    (typeof item.image === "string" ? item.image : "") ||
    item.albumArt ||
    item.album_art ||
    item.cover_image ||
    item.coverImage ||
    item.thumbnail ||
    item.artwork ||
    "";

  // ── Audio URL ──────────────────────────────────────────────────────────────
  // Try all known download/stream URL shapes
  const audioUrl =
    item.downloadUrl?.[4]?.url ||
    item.downloadUrl?.[4]?.link ||
    item.downloadUrl?.[3]?.url ||
    item.downloadUrl?.[3]?.link ||
    item.downloadUrl?.[2]?.url ||
    item.downloadUrl?.[2]?.link ||
    item.downloadUrl?.[1]?.url ||
    item.downloadUrl?.[1]?.link ||
    item.downloadUrl?.[0]?.url ||
    item.downloadUrl?.[0]?.link ||
    (Array.isArray(item.downloadUrl) && typeof item.downloadUrl[0] === "string"
      ? item.downloadUrl[0]
      : "") ||
    item.streamUrl ||
    item.stream_url ||
    item.audioUrl ||
    item.audio_url ||
    item.mediaUrl ||
    item.media_url ||
    item.url ||
    item.playbackUrl ||
    item.playback_url ||
    "";

  // ── Artists ────────────────────────────────────────────────────────────────
  let artist = "Unknown";
  if (Array.isArray(item.artists?.primary)) {
    artist = item.artists.primary.map((a: any) => a.name || a.title || "").filter(Boolean).join(", ");
  } else if (Array.isArray(item.artists?.all)) {
    artist = item.artists.all.slice(0, 3).map((a: any) => a.name || a.title || "").filter(Boolean).join(", ");
  } else if (typeof item.artists === "string") {
    artist = item.artists;
  } else if (item.primaryArtists) {
    artist = item.primaryArtists;
  } else if (item.primary_artists) {
    artist = item.primary_artists;
  } else if (item.singer) {
    artist = item.singer;
  } else if (item.artistName) {
    artist = item.artistName;
  }

  // ── Album / movie ──────────────────────────────────────────────────────────
  const albumName =
    item.album?.name ||
    item.album?.title ||
    (typeof item.album === "string" ? item.album : "") ||
    item.albumName ||
    item.album_name ||
    item.movie ||
    item.film ||
    "";

  const movieName =
    item.movie ||
    item.film ||
    item.album?.name ||
    (typeof item.album === "string" ? item.album : "") ||
    "";

  return {
    id: String(item.id || item.songId || item.song_id || Math.random()),
    title: item.name || item.title || item.song || item.songName || "Unknown",
    artist,
    duration: Number(item.duration) || 0,
    albumArt: imageUrl,
    audioUrl,
    language: item.language || undefined,
    year: item.year ? Number(item.year) : undefined,
    genre: item.genre || undefined,
    album: albumName || undefined,
    movie: movieName || undefined,
  };
}

export const allSongs: Song[] = [];