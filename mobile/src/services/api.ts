// ─── Base URL ─────────────────────────────────────────────────────────────────
const BASE_URL =
  (typeof process !== "undefined" && process.env?.VITE_API_BACKEND_URL) ||
  "https://musicbackend-xg4u.onrender.com/api";

export const api = {
  // ── Music Search ──────────────────────────────────────────────────────────
  searchSongs: async (query: string, page = 1, limit = 50) => {
    const res = await fetch(
      `${BASE_URL}/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
    return res.json();
  },

  // GET /search?query={q}&page={p}&limit={l} -> Global search
  globalSearch: async (query: string, page = 1, limit = 50) => {
    const res = await fetch(
      `${BASE_URL}/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Global Search HTTP ${res.status}`);
    return res.json();
  },

  // ── Song Details ──────────────────────────────────────────────────────────
  getSongById: async (songId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/songs/${songId}`);
      if (!res.ok) throw new Error(`Song HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, data: null };
    }
  },

  // GET /songs/{id}/suggestions -> Get recommended tracks (returns up to 50 tracks)
  getSongSuggestions: async (songId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/songs/${songId}/suggestions`);
      if (!res.ok) throw new Error(`Suggestions HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, data: [] };
    }
  },

  // GET /songs/{id}/video-url -> Returns JSON of available video stream qualities (1080p, 720p, etc.)
  getSongVideoUrl: async (songId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/songs/${songId}/video-url`);
      if (!res.ok) throw new Error(`Video URL HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, streams: [] };
    }
  },

  // ── Lyrics ────────────────────────────────────────────────────────────────
  // Maps to GET /songs/{id}/lyrics on the Spring Boot backend.
  getSongLyrics: async (songId: string): Promise<{ success: boolean; data?: { lyrics?: string } }> => {
    try {
      const url = `${BASE_URL}/songs/${encodeURIComponent(songId)}/lyrics`;
      const res = await fetch(url);

      // 404 = backend confirmed no lyrics; anything else = retry once
      if (res.status === 404) return { success: false };

      if (!res.ok) {
        // Retry once after 1 second (handles cold-start / transient errors)
        await new Promise((r) => setTimeout(r, 1000));
        const retry = await fetch(url);
        if (!retry.ok) return { success: false };
        const json = await retry.json();
        return extractLyricsFromResponse(json);
      }

      const json = await res.json();
      return extractLyricsFromResponse(json);
    } catch {
      return { success: false };
    }
  },

  // ── Charts ────────────────────────────────────────────────────────────────
  // GET /charts -> Trending charts and top playlists
  getCharts: async () => {
    try {
      const res = await fetch(`${BASE_URL}/charts`);
      if (!res.ok) throw new Error(`Charts HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, charts: [] };
    }
  },

  // ── Albums ────────────────────────────────────────────────────────────────
  // GET /albums?id={id} -> Album details and tracklist
  getAlbumDetails: async (albumId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/albums?id=${albumId}`);
      if (!res.ok) throw new Error(`Album Details HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, data: null };
    }
  },

  // ── Artists ───────────────────────────────────────────────────────────────
  // GET /artists/{id} -> Artist profile
  getArtistProfile: async (artistId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/artists/${artistId}`);
      if (!res.ok) throw new Error(`Artist Profile HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, data: null };
    }
  },

  // GET /artists/{id}/songs?page={p} -> Paginated artist catalogue (up to page 20)
  getArtistSongs: async (artistId: string, page = 1) => {
    try {
      const res = await fetch(`${BASE_URL}/artists/${artistId}/songs?page=${page}`);
      if (!res.ok) throw new Error(`Artist Catalogue HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, data: [] };
    }
  },

  // ── Playlists ─────────────────────────────────────────────────────────────
  // GET /playlists?id={id} -> Fetch playlist tracks
  getPlaylist: async (playlistId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/playlists?id=${playlistId}`);
      if (!res.ok) throw new Error(`Playlist HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, data: null };
    }
  },
};

// ─── Lyrics response normaliser ──────────────────────────────────────────────
// Handles every shape the backend might return:
//   { success, data: { lyrics } }   ← standard ApiResponse wrapper
//   { lyrics }                      ← bare object
//   { data: "lyrics text" }         ← data is a plain string
function extractLyricsFromResponse(
  json: any
): { success: boolean; data?: { lyrics?: string } } {
  if (!json) return { success: false };
  if (json.success === true && json.data?.lyrics) {
    return { success: true, data: { lyrics: json.data.lyrics } };
  }
  if (typeof json.data === "string" && json.data.trim()) {
    return { success: true, data: { lyrics: json.data } };
  }
  const keys = ["lyrics", "lyric", "snippet", "lyricsSnippet", "lyricsText", "fullLyrics", "text"];
  for (const key of keys) {
    if (typeof json[key] === "string" && json[key].trim()) {
      return { success: true, data: { lyrics: json[key] } };
    }
  }
  if (json.data && typeof json.data === "object") {
    for (const key of keys) {
      if (typeof json.data[key] === "string" && json.data[key].trim()) {
         return { success: true, data: { lyrics: json.data[key] } };
      }
    }
  }
  return { success: false };
}

// ─── Helper: extract fresh audioUrl from a JioSaavn song response ─────────────
// JioSaavn returns downloadUrl as an array sorted low→high quality.
// We always pick the last entry (highest quality).
export function extractAudioUrl(data: any): string {
  if (!data) return "";
  if (Array.isArray(data.downloadUrl) && data.downloadUrl.length > 0) {
    return data.downloadUrl[data.downloadUrl.length - 1]?.url || "";
  }
  return data.audioUrl || data.url || data.media_url || "";
}

// ─── Deep recursive array finder ─────────────────────────────────────────────
function findSongArray(data: any, depth = 0): any[] | null {
  if (depth > 5) return null;
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) return data;
    return data.length > 0 ? data : null;
  }
  if (data && typeof data === "object") {
    const keys = ["results", "data", "songs", "tracks", "items", "list", "content"];
    for (const key of keys) {
      if (data[key] !== undefined) {
        const found = findSongArray(data[key], depth + 1);
        if (found && found.length > 0) return found;
      }
    }
    for (const key of Object.keys(data)) {
      if (keys.includes(key)) continue;
      const found = findSongArray(data[key], depth + 1);
      if (found && found.length > 0) return found;
    }
  }
  return null;
}

export function extractResults(data: unknown): any[] {
  try {
    if (!data) return [];
    const found = findSongArray(data);
    return found ?? [];
  } catch {
    return [];
  }
}