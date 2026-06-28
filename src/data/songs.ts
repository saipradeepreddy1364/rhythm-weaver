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
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const totalSec = Math.floor(Math.abs(seconds));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
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

  let imageUrl =
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

  if (typeof imageUrl === "string" && imageUrl.startsWith("http://")) {
    imageUrl = imageUrl.replace("http://", "https://");
  }

  // ── Audio URL ──────────────────────────────────────────────────────────────
  // Use direct JioSaavn URL if available (faster playback), else fallback to our backend stream endpoint
  const songId = String(item.id || item.songId || item.song_id || "");
  const downloadUrlArray = item.downloadUrl || item.download_url || item.downloadUrls || [];
  let audioUrl = "";
  if (Array.isArray(downloadUrlArray) && downloadUrlArray.length > 0) {
    audioUrl = downloadUrlArray[downloadUrlArray.length - 1]?.url || downloadUrlArray[downloadUrlArray.length - 1]?.link || "";
  }
  if (!audioUrl) {
    audioUrl = item.audioUrl || item.audio_url || item.url || item.media_url || item.mediaUrl || "";
  }
  if (!audioUrl && songId) {
    audioUrl = `https://musicbackend-xg4u.onrender.com/api/songs/${songId}/stream`;
  }

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

  // ── Duration ───────────────────────────────────────────────────────────────
  // JioSaavn returns duration as a string e.g. "245". parseInt handles string|number|undefined.
  const rawDuration = item.duration ?? item.length ?? item.durationMs;
  const duration =
    typeof rawDuration === "number" && rawDuration > 0
      ? rawDuration
      : typeof rawDuration === "string"
        ? (parseInt(rawDuration, 10) || 0)
        : 0;

  return {
    id: String(item.id || item.songId || item.song_id || Math.random()),
    title: item.name || item.title || item.song || item.songName || "Unknown",
    artist,
    duration,
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