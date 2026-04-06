const BASE_URL = (import.meta as any).env?.VITE_API_BACKEND_URL || "https://musicbackend-g2sp.onrender.com/api";

export const api = {
  // Auth endpoints
  login: async (email: string, password: string) => {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return response.json();
  },
  
  register: async (email: string, password: string, username: string) => {
    const response = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username }),
    });
    return response.json();
  },
  
  logout: async () => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
      },
    });
    return response.json();
  },
  
  verifyToken: async (token: string) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/verify`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await response.json();
      return data.valid === true;
    } catch {
      return false;
    }
  },
  
  // Search endpoint
  searchSongs: async (query: string, page: number = 1, limit: number = 50) => {
    const encoded = encodeURIComponent(query);
    const response = await fetch(`${BASE_URL}/search/songs?query=${encoded}&page=${page}&limit=${limit}`);
    return response.json();
  },
  
  // Playlist endpoints
  getPlaylist: async (playlistId: string) => {
    const response = await fetch(`${BASE_URL}/playlists/${playlistId}`);
    return response.json();
  },
  
  // User library endpoints
  getLikedSongs: async () => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/liked`, {
      headers: { "Authorization": token ? `Bearer ${token}` : "" },
    });
    return response.json();
  },
  
  likeSong: async (songId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/like`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify({ songId }),
    });
    return response.json();
  },
  
  unlikeSong: async (songId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/unlike`, {
      method: "DELETE",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify({ songId }),
    });
    return response.json();
  },
  
  getPlaylists: async () => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/playlists`, {
      headers: { "Authorization": token ? `Bearer ${token}` : "" },
    });
    return response.json();
  },
  
  createPlaylist: async (name: string) => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/playlists`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify({ name }),
    });
    return response.json();
  },
  
  updatePlaylist: async (playlistId: string, name: string) => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/playlists/${playlistId}`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify({ name }),
    });
    return response.json();
  },
  
  deletePlaylist: async (playlistId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/playlists/${playlistId}`, {
      method: "DELETE",
      headers: { "Authorization": token ? `Bearer ${token}` : "" },
    });
    return response.json();
  },
  
  addToPlaylist: async (playlistId: string, songId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify({ songId }),
    });
    return response.json();
  },
  
  removeFromPlaylist: async (playlistId: string, songId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs/${songId}`, {
      method: "DELETE",
      headers: { "Authorization": token ? `Bearer ${token}` : "" },
    });
    return response.json();
  },
  
  getPlaylistSongs: async (playlistId: string) => {
    const token = localStorage.getItem("rw_session_token");
    const response = await fetch(`${BASE_URL}/user/playlists/${playlistId}/songs`, {
      headers: { "Authorization": token ? `Bearer ${token}` : "" },
    });
    return response.json();
  },
};

export function extractResults(data: any): any[] {
  if (data && data.results) return data.results;
  if (data && data.data) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}