const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

// Add timeout to fetch requests
const fetchWithTimeout = (url: string, timeout = 30000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(id));
};

export const api = {
  searchSongs: (query: string, page = 1, limit = 20) =>
    fetchWithTimeout(`${BASE_URL}/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Search error:", err);
        return { data: { data: { results: [] } } };
      }),

  searchArtists: (query: string, page = 1, limit = 10) =>
    fetchWithTimeout(`${BASE_URL}/search/artists?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Artist search error:", err);
        return { data: { data: { results: [] } } };
      }),

  searchAlbums: (query: string, page = 1, limit = 10) =>
    fetchWithTimeout(`${BASE_URL}/search/albums?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Album search error:", err);
        return { data: { data: { results: [] } } };
      }),

  getSong: (id: string) =>
    fetchWithTimeout(`${BASE_URL}/songs/${id}`, 10000)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Get song error:", err);
        return null;
      }),

  getSuggestions: (id: string, limit = 10) =>
    fetchWithTimeout(`${BASE_URL}/songs/${id}/suggestions?limit=${limit}`, 10000)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Suggestions error:", err);
        return { data: { data: { results: [] } } };
      }),

  getPlaylist: (id: string, page = 1, limit = 100) =>
    fetchWithTimeout(`${BASE_URL}/playlists?id=${id}`, 15000)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Get playlist error:", err);
        return { data: { data: { songs: [] } } };
      }),

  getCharts: () =>
    fetchWithTimeout(`${BASE_URL}/search/songs?query=top+hindi+hits+2025&page=1&limit=50`, 15000)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Charts error:", err);
        return { data: { data: { results: [] } } };
      }),

  getAlbum: (id: string) =>
    fetchWithTimeout(`${BASE_URL}/albums?id=${id}`, 10000)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Get album error:", err);
        return { data: { data: { songs: [] } } };
      }),

  getArtistSongs: (id: string, page = 1) =>
    fetchWithTimeout(`${BASE_URL}/artists/${id}/songs?page=${page}&sortBy=popularity&sortOrder=desc`, 10000)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Artist songs error:", err);
        return { data: { data: { results: [] } } };
      }),
};

/**
 * Extract results from nested API response structure
 */
export function extractResults(res: any): any[] {
  return (
    res?.data?.data?.results ||
    res?.data?.data?.songs ||
    res?.data?.data?.list ||
    res?.data?.results ||
    res?.data?.songs ||
    res?.data?.list ||
    (Array.isArray(res?.data) ? res.data : [])
  );
}

export function extractSongs(res: any): any[] {
  return extractResults(res);
}