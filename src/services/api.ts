const BASE_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

export const api = {
  login: async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  register: async (email: string, password: string, username: string) => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username }),
    });
    return res.json();
  },

  logout: async () => {
    const token = localStorage.getItem("rw_session_token");
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
    });
    return res.json();
  },

  verifyToken: async (token: string): Promise<boolean> => {
    // Throw on network error so caller knows to keep the session alive
    const res = await fetch(`${BASE_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.valid === true;
  },

  searchSongs: async (query: string, page = 1, limit = 50) => {
    const res = await fetch(
      `${BASE_URL}/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
    return res.json();
  },

  getPlaylist: async (playlistId: string) => {
    const res = await fetch(`${BASE_URL}/playlists/${playlistId}`);
    if (!res.ok) throw new Error(`Playlist ${playlistId} HTTP ${res.status}`);
    return res.json();
  },

  getLikedSongs: async () => {
    const token = localStorage.getItem("rw_session_token");
    const res = await fetch(`${BASE_URL}/user/liked`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    });
    return res.json();
  },

  likeSong: async (songId: string) => {
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
  },

  unlikeSong: async (songId: string) => {
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
  },

  getPlaylists: async () => {
    const token = localStorage.getItem("rw_session_token");
    const res = await fetch(`${BASE_URL}/user/playlists`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    });
    return res.json();
  },

  createPlaylist: async (name: string) => {
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
  },

  updatePlaylist: async (playlistId: string, name: string) => {
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
  },

  deletePlaylist: async (playlistId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}`, {
      method: "DELETE",
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    });
    return res.json();
  },

  addToPlaylist: async (playlistId: string, songId: string) => {
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
  },

  removeFromPlaylist: async (playlistId: string, songId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs/${songId}`, {
      method: "DELETE",
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    });
    return res.json();
  },

  getPlaylistSongs: async (playlistId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const res = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    });
    return res.json();
  },
};

/**
 * Safely pull an array of items out of ANY API response shape.
 * Returns [] instead of throwing when the response is unexpected.
 */
export function extractResults(data: unknown): any[] {
  try {
    if (!data) return [];
    if (Array.isArray(data)) return data;

    const d = data as Record<string, any>;

    // { results: [...] }
    if (Array.isArray(d.results)) return d.results;
    // { data: [...] }
    if (Array.isArray(d.data)) return d.data;
    // { data: { results: [...] } }
    if (d.data && typeof d.data === "object") {
      if (Array.isArray(d.data.results)) return d.data.results;
      if (Array.isArray(d.data.songs))   return d.data.songs;
    }
    // { songs: [...] }
    if (Array.isArray(d.songs)) return d.songs;
    // { tracks: [...] }
    if (Array.isArray(d.tracks)) return d.tracks;
  } catch {
    /* ignore any parsing error */
  }
  return [];
}