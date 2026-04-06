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

/**
 * The backend wraps the upstream JioSaavn response in its own ApiResponse,
 * producing a double-nested structure:
 *   { data: { data: { results: [...] } } }   ← search endpoints
 *   { data: { data: { songs:   [...] } } }   ← playlist / album endpoints
 *   { data: { data: { list:    [...] } } }   ← some playlist variants
 *
 * We try both depths so the function works regardless of nesting level.
 */
export function extractResults(res: any): any[] {
  return (
    // double-nested (backend ApiResponse wrapping upstream response)
    res?.data?.data?.results ||
    res?.data?.data?.songs   ||
    res?.data?.data?.list    ||
    // single-nested (direct upstream or future fix)
    res?.data?.results       ||
    res?.data?.songs         ||
    res?.data?.list          ||
    // bare array fallback
    (Array.isArray(res?.data) ? res.data : [])
  );
}

/**
 * Extract playlist/album songs — same double-nesting applies.
 */
export function extractSongs(res: any): any[] {
  return extractResults(res);
}