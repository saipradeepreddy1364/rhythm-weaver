// ─── Base URL ─────────────────────────────────────────────────────────────────
// Your Spring Boot backend on Render.
// It proxies saavn.dev internally, so the frontend never calls saavn.dev directly.
// Override with VITE_API_BACKEND_URL in your Vercel environment variables.

const BASE_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://backend-u94c.onrender.com/api";

export const api = {

  // ── Auth ────────────────────────────────────────────────────────────────────
  // Your backend has no auth routes yet — these fail silently.
  // AuthContext + LibraryContext fall back to localStorage so the app works fine.

  login: async (email: string, password: string) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return res.json();
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
      return res.json();
    } catch {
      return { success: false, message: "Server unavailable." };
    }
  },

  logout: async () => {
    try {
      const token = localStorage.getItem("rw_session_token");
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

  verifyToken: async (token: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.valid === true;
    } catch {
      // Network error — keep user logged in, don't clear session
      return true;
    }
  },

  // ── Music Search ─────────────────────────────────────────────────────────────
  // GET /api/search/songs?query=...&page=...&limit=...
  // Your SearchController handles this and proxies to saavn.dev internally.

  searchSongs: async (query: string, page = 1, limit = 50) => {
    const res = await fetch(
      `${BASE_URL}/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
    return res.json();
  },

  // ── User Library ─────────────────────────────────────────────────────────────
  // These hit backend routes that don't exist yet — they fail silently.
  // LibraryContext stores everything in localStorage as the source of truth,
  // so the app works fully offline without these routes.

  getLikedSongs: async () => {
    try {
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/liked`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      return res.json();
    } catch {
      return { success: false, data: [] };
    }
  },

  likeSong: async (songId: string) => {
    try {
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ songId }),
      });
      return res.json();
    } catch {
      return { success: false };
    }
  },

  unlikeSong: async (songId: string) => {
    try {
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/unlike`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
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
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/playlists`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      return res.json();
    } catch {
      return { success: false, data: [] };
    }
  },

  createPlaylist: async (name: string) => {
    try {
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/playlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
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
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
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
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}`, {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      return res.json();
    } catch {
      return { success: false };
    }
  },

  addToPlaylist: async (playlistId: string, songId: string) => {
    try {
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
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
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(
        `${BASE_URL}/user/playlists/${playlistId}/songs/${songId}`,
        {
          method: "DELETE",
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        }
      );
      return res.json();
    } catch {
      return { success: false };
    }
  },

  getPlaylistSongs: async (playlistId: string) => {
    try {
      const token = localStorage.getItem("rw_session_token");
      const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
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
};

// ─── Deep recursive array finder ──────────────────────────────────────────────
/**
 * Finds the first array in a nested object that looks like a list of songs.
 * A "song-like" array has objects containing an `id` field.
 * Falls back to the first array found anywhere in the response.
 */
function findSongArray(data: any, depth = 0): any[] | null {
  if (depth > 5) return null;
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
      return data;
    }
    return data.length > 0 ? data : null;
  }
  if (data && typeof data === "object") {
    // Priority key order — most common shapes first
    const keys = ["results", "data", "songs", "tracks", "items", "list", "content"];
    for (const key of keys) {
      if (data[key] !== undefined) {
        const found = findSongArray(data[key], depth + 1);
        if (found && found.length > 0) return found;
      }
    }
    // Fall back: check every other key
    for (const key of Object.keys(data)) {
      if (keys.includes(key)) continue;
      const found = findSongArray(data[key], depth + 1);
      if (found && found.length > 0) return found;
    }
  }
  return null;
}

/**
 * Safely extract an array of raw song objects from ANY API response shape.
 * Never throws, always returns a plain array (possibly empty).
 */
export function extractResults(data: unknown): any[] {
  try {
    if (!data) return [];
    const found = findSongArray(data);
    return found ?? [];
  } catch {
    return [];
  }
}