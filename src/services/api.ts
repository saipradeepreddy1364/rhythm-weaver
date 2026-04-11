// ─── Base URL ─────────────────────────────────────────────────────────────────
const BASE_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

// ─── Token helper — localStorage for persistent sessions ─────────────────────
const getToken = () => localStorage.getItem("rw_session_token");

export const api = {

  // ── Auth ────────────────────────────────────────────────────────────────────

  login: async (email: string, password: string) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      return json?.data ?? json;
    } catch {
      return { success: false, message: "Server unavailable." };
    }
  },

  register: async (email: string, password: string, username: string) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username }),
      });
      const json = await res.json();
      if (json?.data) return json.data;
      return { success: false, message: json?.error ?? json?.message ?? "Registration failed." };
    } catch {
      return { success: false, message: "Server unavailable." };
    }
  },

  logout: async () => {
    try {
      const token = getToken();
      const res = await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      return res.json();
    } catch {
      return { success: true };
    }
  },

  verifyToken: async (token: string): Promise<{ valid: boolean; user?: any; networkError?: boolean }> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status >= 500) {
        return { valid: true, networkError: true };
      }

      if (res.status === 401 || res.status === 403) {
        return { valid: false };
      }

      const json = await res.json();
      const data = json?.data ?? json;
      if (data?.valid === true && data?.user) {
        return { valid: true, user: data.user };
      }
      return { valid: false };
    } catch {
      return { valid: true, networkError: true };
    }
  },

  // ── Music Search ──────────────────────────────────────────────────────────

  searchSongs: async (query: string, page = 1, limit = 50) => {
    const res = await fetch(
      `${BASE_URL}/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
    return res.json();
  },

  // ── Get Song By ID — fetches fresh audioUrl for liked songs on new devices ─

  getSongById: async (songId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/songs/${songId}`);
      if (!res.ok) throw new Error(`Song HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, data: null };
    }
  },

  // ── User Library ──────────────────────────────────────────────────────────

  getLikedSongs: async () => {
    try {
      const res = await fetch(`${BASE_URL}/user/liked`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      return res.json();
    } catch {
      return { success: false, data: [] };
    }
  },

  likeSong: async (songId: string, songTitle?: string, songImage?: string) => {
    try {
      const res = await fetch(`${BASE_URL}/user/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ songId, songTitle: songTitle ?? "", songImage: songImage ?? "" }),
      });
      return res.json();
    } catch {
      return { success: false };
    }
  },

  unlikeSong: async (songId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/user/unlike`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ songId }),
      });
      return res.json();
    } catch {
      return { success: false };
    }
  },

  getPlaylists: async () => {
    try {
      const res = await fetch(`${BASE_URL}/user/playlists`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      return res.json();
    } catch {
      return { success: false, data: [] };
    }
  },

  createPlaylist: async (name: string) => {
    try {
      const res = await fetch(`${BASE_URL}/user/playlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ name }),
      });
      return res.json();
    } catch {
      return { success: false };
    }
  },

  updatePlaylist: async (playlistId: string, name: string) => {
    try {
      const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ name }),
      });
      return res.json();
    } catch {
      return { success: false };
    }
  },

  deletePlaylist: async (playlistId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      return res.json();
    } catch {
      return { success: false };
    }
  },

  addToPlaylist: async (playlistId: string, songId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ songId }),
      });
      return res.json();
    } catch {
      return { success: false };
    }
  },

  removeFromPlaylist: async (playlistId: string, songId: string) => {
    try {
      const res = await fetch(
        `${BASE_URL}/user/playlists/${playlistId}/songs/${songId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        }
      );
      return res.json();
    } catch {
      return { success: false };
    }
  },

  getPlaylistSongs: async (playlistId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      return res.json();
    } catch {
      return { success: false, data: [] };
    }
  },

  getPlaylist: async (playlistId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/playlists/${playlistId}`);
      if (!res.ok) throw new Error(`Playlist ${playlistId} HTTP ${res.status}`);
      return res.json();
    } catch {
      return { success: false, data: null };
    }
  },

  // ── Lyrics ────────────────────────────────────────────────────────────────
  // Maps to GET /songs/{id}/lyrics on the Spring Boot backend.
  // The backend tries 5 different JioSaavn API paths before giving up.
  // Returns { success: true, data: { lyrics: "..." } } or { success: false }.
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