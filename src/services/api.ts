const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

export const api = {
  searchSongs: (query: string, page = 1, limit = 20) =>
    fetch(`${BASE_URL}/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`)
      .then((r) => r.json()),

  searchArtists: (query: string, page = 1, limit = 10) =>
    fetch(`${BASE_URL}/search/artists?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`)
      .then((r) => r.json()),

  searchAlbums: (query: string, page = 1, limit = 10) =>
    fetch(`${BASE_URL}/search/albums?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`)
      .then((r) => r.json()),

  getSong: (id: string) =>
    fetch(`${BASE_URL}/songs/${id}`).then((r) => r.json()),

  getSuggestions: (id: string, limit = 10) =>
    fetch(`${BASE_URL}/songs/${id}/suggestions?limit=${limit}`)
      .then((r) => r.json()),

  getPlaylist: (id: string, page = 1, limit = 100) =>
    fetch(`${BASE_URL}/playlists?id=${id}`)
      .then((r) => r.json()),

  getCharts: () =>
    fetch(`${BASE_URL}/search/songs?query=top+hindi+hits+2025&page=1&limit=50`)
      .then((r) => r.json()),

  getAlbum: (id: string) =>
    fetch(`${BASE_URL}/albums?id=${id}`).then((r) => r.json()),

  getArtistSongs: (id: string, page = 1) =>
    fetch(`${BASE_URL}/artists/${id}/songs?page=${page}&sortBy=popularity&sortOrder=desc`)
      .then((r) => r.json()),
};

export function extractResults(res: any): any[] {
  return (
    res?.data?.results ||
    res?.data?.songs ||
    res?.data?.list ||
    []
  );
}