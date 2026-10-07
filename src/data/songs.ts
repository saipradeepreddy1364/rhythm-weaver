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
  albumId?: string;
  artistId?: string;
  lyrics?: string;
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const totalSec = Math.floor(Math.abs(seconds));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function decodeHtmlEntities(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ─── Canonical Movie Cover Art Registry ─────────────────────────────────────
// Ensures blockbuster soundtracks always use their genuine official 500x500 poster
// even if individual tracks were indexed in random DJ / compilation / party albums.
export const movieCoverRegistry = new Map<string, string>([
  ["pushpa", "https://c.saavncdn.com/366/Pushpa-2-The-Rule-Telugu-Telugu-2024-20241205211012-500x500.jpg"],
  ["pushpa 2", "https://c.saavncdn.com/366/Pushpa-2-The-Rule-Telugu-Telugu-2024-20241205211012-500x500.jpg"],
  ["pushpa 2 the rule", "https://c.saavncdn.com/366/Pushpa-2-The-Rule-Telugu-Telugu-2024-20241205211012-500x500.jpg"],
  ["pushpa the rise", "https://c.saavncdn.com/blob/056/Pushpa-The-Rise-Telugu-2021-20211216115409-500x500.jpg"],
  ["pushpa the rise part 1", "https://c.saavncdn.com/blob/056/Pushpa-The-Rise-Telugu-2021-20211216115409-500x500.jpg"],
  ["pushpa the rise part 01", "https://c.saavncdn.com/blob/056/Pushpa-The-Rise-Telugu-2021-20211216115409-500x500.jpg"],
  ["devara", "https://c.saavncdn.com/313/Devara-Part-1-Telugu-Telugu-2024-20240926171010-500x500.jpg"],
  ["devara part 1", "https://c.saavncdn.com/313/Devara-Part-1-Telugu-Telugu-2024-20240926171010-500x500.jpg"],
  ["kalki", "https://c.saavncdn.com/320/Kalki-2898-AD-Telugu-Telugu-2024-20240710171011-500x500.jpg"],
  ["kalki 2898 ad", "https://c.saavncdn.com/320/Kalki-2898-AD-Telugu-Telugu-2024-20240710171011-500x500.jpg"],
  ["rrr", "https://c.saavncdn.com/003/RRR-Telugu-2021-20211210131008-500x500.jpg"],
  ["guntur kaaram", "https://c.saavncdn.com/445/Guntur-Kaaram-Telugu-2024-20240112181005-500x500.jpg"],
  ["salaar", "https://c.saavncdn.com/710/Salaar-Cease-Fire-Telugu-Telugu-2023-20231213191005-500x500.jpg"],
  ["animal", "https://c.saavncdn.com/000/Animal-Hindi-2023-20231124191004-500x500.jpg"],
  ["jawan", "https://c.saavncdn.com/000/Jawan-Hindi-2023-20230907151004-500x500.jpg"],
  ["stree 2", "https://c.saavncdn.com/490/Stree-2-Hindi-2024-20240824051003-500x500.jpg"],
]);

export function registerMovieCover(movieOrAlbumName: string, coverUrl: string) {
  if (!movieOrAlbumName || !coverUrl) return;
  const key = movieOrAlbumName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (key.length > 2 && !movieCoverRegistry.has(key)) {
    movieCoverRegistry.set(key, coverUrl);
  }
}

function isCompilationOrGeneric(name: string): boolean {
  if (!name) return false;
  const l = name.toLowerCase();
  const keywords = [
    "top 10", "top 20", "top 50", "dhamaka", "dj mix", "party hits",
    "dance hits", "remix", "chartbusters", "playlist", "collection",
    "non stop", "mashup", "superhit collection", "romantic hits", "evergreen"
  ];
  return keywords.some((k) => l.includes(k));
}

function isPlaceholderImage(url: string): boolean {
  if (!url) return true;
  return url.includes("default-film") || url.includes("default-music") || url.includes("artist-default") || url.includes("album-default");
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

  if (typeof imageUrl === "string") {
    if (imageUrl.startsWith("http://")) {
      imageUrl = imageUrl.replace("http://", "https://");
    }
    // Upgrade 50x50 or 150x150 thumbnails to crisp, high-resolution 500x500 posters
    imageUrl = imageUrl.replace(/-\d+x\d+\.(jpg|jpeg|png)/i, "-500x500.$1");
    if (isPlaceholderImage(imageUrl)) {
      imageUrl = "";
    }
  }

  // ── Audio URL ──────────────────────────────────────────────────────────────
  // Use direct JioSaavn URL if available (faster playback), else fallback to our backend stream endpoint
  const rawId = String(item.id || item.songId || item.song_id || "");
  const downloadUrlArray = item.downloadUrl || item.download_url || item.downloadUrls || [];
  let audioUrl = "";
  if (Array.isArray(downloadUrlArray) && downloadUrlArray.length > 0) {
    audioUrl = downloadUrlArray[downloadUrlArray.length - 1]?.url || downloadUrlArray[downloadUrlArray.length - 1]?.link || "";
  }
  if (!audioUrl) {
    audioUrl = item.audioUrl || item.audio_url || item.url || item.media_url || item.mediaUrl || "";
  }
  if (!audioUrl && rawId) {
    audioUrl = `https://musicbackend-7a1o.onrender.com/api/songs/${rawId}/stream`;
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

  const albumId =
    item.album?.id ||
    item.albumId ||
    item.album_id ||
    "";

  let artistId = "";
  if (Array.isArray(item.artists?.primary) && item.artists.primary.length > 0) {
    artistId = item.artists.primary[0].id || "";
  } else if (Array.isArray(item.artists?.all) && item.artists.all.length > 0) {
    artistId = item.artists.all[0].id || "";
  } else if (item.artistId) {
    artistId = item.artistId;
  } else if (item.artist_id) {
    artistId = item.artist_id;
  }

  const rawTitle = decodeHtmlEntities(item.name || item.title || item.song || item.songName || "Unknown");

  let movieName =
    item.movie ||
    item.film ||
    item.album?.name ||
    (typeof item.album === "string" ? item.album : "") ||
    "";

  // Extract movie from title if present (e.g. Peelings (From "Pushpa 2 The Rule"))
  const fromMovieMatch = rawTitle.match(/(?:from|soundtrack|film)\s*["'“]?([^"'”)\]]+)/i);
  if (fromMovieMatch) {
    const extractedMovie = fromMovieMatch[1].trim();
    if (extractedMovie.length > 2 && (!movieName || isCompilationOrGeneric(movieName))) {
      movieName = extractedMovie;
    }
  }

  // Resolve authentic movie poster if this song belongs to a registered movie
  const cleanMovieKey = (movieName || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const cleanAlbumKey = (albumName || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  let registeredCover = "";
  if (cleanMovieKey) {
    for (const [k, url] of movieCoverRegistry.entries()) {
      if (cleanMovieKey.includes(k) || k.includes(cleanMovieKey)) {
        registeredCover = url;
        break;
      }
    }
  }
  if (!registeredCover && cleanAlbumKey) {
    for (const [k, url] of movieCoverRegistry.entries()) {
      if (cleanAlbumKey.includes(k) || k.includes(cleanAlbumKey)) {
        registeredCover = url;
        break;
      }
    }
  }

  // If we have a registered canonical movie cover and current image is compilation, placeholder, or empty, use the authentic poster!
  if (registeredCover && (!imageUrl || isCompilationOrGeneric(albumName) || isPlaceholderImage(imageUrl))) {
    imageUrl = registeredCover;
  } else if (imageUrl && !isCompilationOrGeneric(albumName) && !isPlaceholderImage(imageUrl) && cleanMovieKey.length > 2) {
    // If current image is genuine and high-res, save it to registry for this movie
    movieCoverRegistry.set(cleanMovieKey, imageUrl);
  }

  // ── Duration ───────────────────────────────────────────────────────────────
  // JioSaavn returns duration as a string e.g. "245". parseInt handles string|number|undefined.
  const rawDuration = item.duration ?? item.length ?? item.durationMs;
  const duration =
    typeof rawDuration === "number" && rawDuration > 0
      ? rawDuration
      : typeof rawDuration === "string"
        ? (parseInt(rawDuration, 10) || 0)
        : 0;

  let finalSongId = rawId;
  if (!finalSongId) {
    const rawArtist = artist || "Unknown";
    finalSongId = `gen_${rawTitle.toLowerCase().replace(/[^a-z0-9]/g, "")}_${rawArtist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  }

  return {
    id: finalSongId,
    title: rawTitle,
    artist,
    duration,
    albumArt: imageUrl,
    audioUrl,
    language: item.language || undefined,
    year: item.year ? Number(item.year) : undefined,
    genre: item.genre || undefined,
    album: albumName || undefined,
    movie: movieName || undefined,
    albumId: albumId || undefined,
    artistId: artistId || undefined,
    lyrics: item.lyrics || undefined,
  };
}

export const allSongs: Song[] = [];