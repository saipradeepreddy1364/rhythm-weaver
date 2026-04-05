const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://musicbackend-g2sp.onrender.com/api";

export const api = {
  searchSongs: (query: string, page = 1, limit = 20) =>
    fetch(`${BASE_URL}/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`)
      .then(r => r.json()),

  getCharts: () =>
    fetch(`${BASE_URL}/charts`).then(r => r.json()),

  getSong: (id: string) =>
    fetch(`${BASE_URL}/songs/${id}`).then(r => r.json()),

  getSuggestions: (id: string, limit = 10) =>
    fetch(`${BASE_URL}/songs/${id}/suggestions?limit=${limit}`).then(r => r.json()),

  searchArtists: (query: string) =>
    fetch(`${BASE_URL}/search/artists?query=${encodeURIComponent(query)}`).then(r => r.json()),
};