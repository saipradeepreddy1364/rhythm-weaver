const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://musicbackend-g2sp.onrender.com/api";

async function fetchApi(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // Handle double-nested: { data: { data: { results: [...] } } }
  return json;
}

export const api = {
  searchSongs: (query: string, page = 1, limit = 20) =>
    fetchApi(`${BASE_URL}/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),

  getCharts: () =>
    fetchApi(`${BASE_URL}/charts`),

  getSong: (id: string) =>
    fetchApi(`${BASE_URL}/songs/${id}`),

  getSuggestions: (id: string, limit = 10) =>
    fetchApi(`${BASE_URL}/songs/${id}/suggestions?limit=${limit}`),

  searchArtists: (query: string) =>
    fetchApi(`${BASE_URL}/search/artists?query=${encodeURIComponent(query)}`),
};

// Helper to extract results array from nested response
export function extractResults(res: any): any[] {
  return res?.data?.data?.results
    || res?.data?.results
    || res?.results
    || [];
}