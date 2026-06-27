import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image } from 'react-native'
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import TrackPlayer, {
  Capability,
  State,
  Event,
  useProgress,
  usePlaybackState,
  useActiveTrack,
  RepeatMode,
  AndroidAudioContentType,
} from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Song, mapApiSong } from "../data/songs";
import { api } from "../services/api";
import { localStorage } from "../lib/storage";

// ─── Playback History & Offline Helpers ──────────────────────────────────────
const RECENT_LIMIT_MS = 3 * 60 * 60 * 1000; // 3 hours

// Normalize song title to strip suffixes like "(From 'Movie')", "- Remix" etc. for deduplication
function normalizeSongTitle(title: string): string {
  let s = (title || "").toLowerCase().trim();
  // Remove common trailing junk in parentheses/brackets recursively
  while (true) {
    const prev = s;
    s = s
      .replace(/\s*\((from|original|soundtrack|ost|single|recreated|reprise|remix|version|extended|cover|acoustic|live|unplugged|instrumental|remastered|lofi|slowed|reverb|edit|theme|feat|ft|featuring|mix|lyrical|video)[^)]*\)/gi, "")
      .replace(/\s*\[(from|original|soundtrack|ost|single|recreated|reprise|remix|version|extended|cover|acoustic|live|unplugged|instrumental|remastered|lofi|slowed|reverb|edit|theme|feat|ft|featuring|mix|lyrical|video)[^\]]*\]/gi, "")
      .trim();
    if (s === prev) break;
  }
  
  // Remove trailing single / remix / reprise etc. with dash
  s = s.replace(/\s*-\s*(single|recreated|reprise|remix|version|extended|cover|acoustic|live|unplugged|instrumental|remastered|lofi|slowed|reverb|edit|theme|mix|lyrical|video)\b.*/gi, "");
  
  // Strip featuring/feat at the end
  s = s.replace(/\s*(feat\.?|ft\.?|featuring)\s+.*/gi, "");
  
  // Strip any trailing parentheses/brackets at the end of the string entirely
  s = s.replace(/\s*\([^)]*\)$/gi, "");
  s = s.replace(/\s*\[[^\]]*\]$/gi, "");
  
  // Clean up punctuation and spacing
  s = s.replace(/[^a-z0-9\s]/gi, "").replace(/\s+/g, " ").trim();
  return s;
}

function getPlaybackHistory(): any[] {
  try {
    const raw = localStorage.getItem("rw_playback_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function logPlayback(song: Song) {
  if (!song || !song.id) return;
  try {
    const history = getPlaybackHistory();
    const now = Date.now();
    const filtered = history.filter((h) => now - h.timestamp < RECENT_LIMIT_MS);
    
    if (!filtered.some((h) => h.id === song.id)) {
      filtered.push({
        id: song.id,
        title: song.title,
        artist: song.artist,
        timestamp: now,
      });
      localStorage.setItem("rw_playback_history", JSON.stringify(filtered));
    }
  } catch (err) {
    console.warn("Failed to log playback history:", err);
  }
}

function filterQueueByHistory(song: Song, songQueue: Song[]): Song[] {
  const history = getPlaybackHistory();
  const now = Date.now();
  const activeHistory = history.filter((h) => now - h.timestamp < RECENT_LIMIT_MS);
  
  const recentIds = new Set<string>();
  const recentKeys = new Set<string>();
  activeHistory.forEach((h) => {
    recentIds.add(h.id);
    if (h.title) {
      const key = normalizeSongTitle(h.title);
      recentKeys.add(key);
    }
  });
  
  return songQueue.filter((s) => {
    if (s.id === song.id) return true;
    if (recentIds.has(s.id)) return false;
    if (s.title) {
      const key = normalizeSongTitle(s.title);
      if (recentKeys.has(key)) return false;
    }
    return true;
  });
}

function resolveTrack(s: Song) {
  let downloadedList: any[] = [];
  try {
    const raw = localStorage.getItem("rw_downloads");
    if (raw) downloadedList = JSON.parse(raw);
  } catch {}
  
  const downloaded = downloadedList.find((d) => d.id === s.id);
  
  let trackUrl = s.audioUrl;
  if (downloaded?.audioUrl) {
    trackUrl = downloaded.audioUrl;
  } else if (!trackUrl || trackUrl.includes("oasth.me")) {
    trackUrl = `https://musicbackend-xg4u.onrender.com/api/songs/${s.id}/stream`;
  }

  return {
    id: s.id,
    url: trackUrl,
    title: s.title,
    artist: s.artist,
    album: s.album || s.movie || "",
    artwork: downloaded?.albumArt || s.albumArt || "",
  };
}

async function resolvePipedAudioUrl(videoId: string): Promise<string | null> {
  const PIPED_INSTANCES = [
    "https://pipedapi.adminforge.de",
    "https://pipedapi.projectsegfau.lt",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi-libre.kavin.rocks",
    "https://pipedapi.leptons.xyz",
    "https://api.looleh.xyz"
  ];
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await Promise.race([
        fetch(`${instance}/streams/${videoId}`),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);
      if (!res.ok) continue;
      const data = await res.json();
      const audioStreams = data.audioStreams || [];
      if (audioStreams.length === 0) continue;
      // Pick the last stream (highest quality)
      const bestStream = audioStreams[audioStreams.length - 1];
      return bestStream.url || null;
    } catch (err) {
      console.warn(`[PlayerContext] Piped streams fetch ${instance} failed:`, err);
    }
  }
  return null;
}

async function getDirectAudioUrl(url: string): Promise<string> {
  if (url && url.startsWith("youtube://")) {
    const videoId = url.replace("youtube://", "");
    console.log(`[PlayerContext] Resolving YouTube URL for video ID: ${videoId}`);
    const resolved = await resolvePipedAudioUrl(videoId);
    if (resolved) {
      console.log(`[PlayerContext] Successfully resolved YouTube URL: ${resolved.substring(0, 50)}...`);
      return resolved;
    }
  }
  return url;
}

interface PlayerContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  queueIndex: number;
  progress: number;
  duration: number;
  volume: number;
  showPlayer: boolean;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  isRadioMode: boolean;
  playSong: (song: Song, songQueue?: Song[], fromLibrary?: boolean) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  setProgress: (value: number) => void;
  setVolume: (value: number) => void;
  setShowPlayer: (show: boolean) => void;
  toggleFavorite: (songId: string) => void;
  isFavorite: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const LANGUAGE_QUERY_POOLS: Record<string, string[]> = {
  telugu: [
    `trending telugu songs ${CURRENT_YEAR}`,
    `top tollywood hits ${CURRENT_YEAR}`,
    "best telugu songs",
    `new telugu songs ${CURRENT_YEAR}`,
    `viral telugu songs ${CURRENT_YEAR}`,
    `popular telugu film songs ${CURRENT_YEAR}`,
    `telugu chartbusters ${CURRENT_YEAR}`,
    "super hit telugu songs",
  ],
  hindi: [
    `trending hindi songs ${CURRENT_YEAR}`,
    `top hindi hits ${CURRENT_YEAR}`,
    `best new hindi songs ${CURRENT_YEAR}`,
    `viral hindi songs ${CURRENT_YEAR}`,
    `popular hindi songs ${CURRENT_YEAR}`,
    `latest hindi film songs ${CURRENT_YEAR}`,
    `hindi chartbusters ${CURRENT_YEAR}`,
    "super hit hindi songs",
  ],
  tamil: [
    `trending tamil songs ${CURRENT_YEAR}`,
    `top kollywood hits ${CURRENT_YEAR}`,
    "best tamil songs",
    `new tamil songs ${CURRENT_YEAR}`,
    `viral tamil songs ${CURRENT_YEAR}`,
    `popular tamil film songs ${CURRENT_YEAR}`,
    `tamil chartbusters ${CURRENT_YEAR}`,
    "super hit tamil songs",
  ],
  punjabi: [
    `top punjabi songs ${CURRENT_YEAR}`,
    `trending punjabi ${CURRENT_YEAR}`,
    `new punjabi hits ${CURRENT_YEAR}`,
    "best punjabi songs",
    `viral punjabi songs ${CURRENT_YEAR}`,
    "popular punjabi",
    `punjabi chartbusters ${CURRENT_YEAR}`,
    "super hit punjabi songs",
  ],
  kannada: [
    `trending kannada songs ${CURRENT_YEAR}`,
    `top sandalwood hits ${CURRENT_YEAR}`,
    "best kannada songs",
    `new kannada songs ${CURRENT_YEAR}`,
    "popular kannada film songs",
    `viral kannada songs ${CURRENT_YEAR}`,
    `kannada chartbusters ${CURRENT_YEAR}`,
    "super hit kannada songs",
  ],
  malayalam: [
    `trending malayalam songs ${CURRENT_YEAR}`,
    `top mollywood hits ${CURRENT_YEAR}`,
    "best malayalam songs",
    `new malayalam songs ${CURRENT_YEAR}`,
    "popular malayalam film songs",
    `viral malayalam songs ${CURRENT_YEAR}`,
    `malayalam chartbusters ${CURRENT_YEAR}`,
    "super hit malayalam songs",
  ],
  english: [
    `trending english songs ${CURRENT_YEAR}`,
    `top billboard hits ${CURRENT_YEAR}`,
    `best pop songs ${CURRENT_YEAR}`,
    `new english release ${CURRENT_YEAR}`,
    `popular english songs ${CURRENT_YEAR}`,
    `english chartbusters ${CURRENT_YEAR}`,
  ]
};

const SIMILAR_LANGUAGES: Record<string, string[]> = {
  telugu: ["hindi"],
  hindi: ["telugu"],
};

function decodeHtml(str: string): string {
  if (!str) return str;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'");
}

async function searchPiped(query: string): Promise<Song[]> {
  const PIPED_INSTANCES = [
    "https://pipedapi.adminforge.de",
    "https://pipedapi.projectsegfau.lt",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi-libre.kavin.rocks",
    "https://pipedapi.leptons.xyz",
    "https://api.looleh.xyz"
  ];
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await Promise.race([
        fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000))
      ]);
      if (!res.ok) continue;
      const data = await res.json();
      const items = data.items || [];
      if (items.length === 0) continue;
      return items.slice(0, 15).map((item: any) => ({
        id: `yt-${item.videoId}`,
        title: decodeHtml(item.title || "Unknown Title"),
        artist: decodeHtml(item.uploaderName || "YouTube"),
        duration: item.duration || 0,
        albumArt: item.thumbnail || "",
        audioUrl: `youtube://${item.videoId}`,
        album: "YouTube Web",
        movie: "YouTube Web"
      }));
    } catch (err) {
      console.warn(`[PlayerContext] Piped fallback search failed on ${instance}:`, err);
    }
  }
  return [];
}

function calculateSongScore(song: Song, seed: Song): number {
  let score = 0;
  
  // 1. Language matching (Critical)
  const seedLang = seed.language ? seed.language.toLowerCase().trim() : "";
  const songLang = song.language ? song.language.toLowerCase().trim() : "";
  if (seedLang && songLang) {
    if (songLang === seedLang) {
      score += 150; // High boost for exact language match
    } else {
      score -= 100; // Strong penalty for mismatching language
    }
  }

  // 2. Year matching
  if (seed.year && song.year) {
    const yearDiff = Math.abs(seed.year - song.year);
    if (yearDiff === 0) {
      score += 60; // Perfect match
    } else if (yearDiff <= 2) {
      score += 45; // Within 2 years
    } else if (yearDiff <= 5) {
      score += 30; // Within 5 years
    } else if (yearDiff <= 10) {
      score += 15; // Within same decade
    } else {
      score -= Math.min(25, yearDiff * 1.5); // Penalty scales with difference
    }
  }

  // 3. Genre/Type matching
  const seedGenre = seed.genre ? seed.genre.toLowerCase().trim() : "";
  const songGenre = song.genre ? song.genre.toLowerCase().trim() : "";
  if (seedGenre && songGenre && songGenre === seedGenre) {
    score += 40; // Genre match boost
  }

  // 4. Artist matching (type of song / singer style)
  const seedArtists = seed.artist ? seed.artist.toLowerCase().split(",").map(a => a.trim()) : [];
  const songArtists = song.artist ? song.artist.toLowerCase().split(",").map(a => a.trim()) : [];
  const commonArtists = seedArtists.filter(a => songArtists.includes(a));
  if (commonArtists.length > 0) {
    score += 30 * commonArtists.length;
  }

  // 5. Album/Movie matching
  const seedMovie = seed.movie || seed.album || "";
  const songMovie = song.movie || song.album || "";
  if (seedMovie && songMovie && seedMovie.toLowerCase().trim() === songMovie.toLowerCase().trim()) {
    score += 50;
  }

  return score;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const FAVORITES_KEY = "rw_favorites";

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [volume, setVolumeState] = useState(1.0);
  const [showPlayer, setShowPlayer] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]);
  const [repeat, setRepeat] = useState<"off" | "one" | "all">("off");
  const [isRadioMode, setIsRadioMode] = useState(false);

  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);
  const repeatRef = useRef<"off" | "one" | "all">("off");
  const radioFetchingRef = useRef(false);
  const activeRecommendationFetchRef = useRef<string | null>(null);
  const activeFetchPromiseRef = useRef<Promise<Song[]> | null>(null);
  const fallbackRetryRef = useRef<Record<string, boolean>>({});
  const isSettingUpQueueRef = useRef(false);
  const isNavigatingHistoryRef = useRef(false);

  const loadHistoryFromStorage = useCallback((): { stack: Song[]; index: number } => {
    try {
      const rawStack = localStorage.getItem("rw_history_stack");
      const rawIndex = localStorage.getItem("rw_history_index");
      const stack = rawStack ? JSON.parse(rawStack) : [];
      const index = rawIndex ? parseInt(rawIndex, 10) : -1;
      return { stack, index };
    } catch {
      return { stack: [], index: -1 };
    }
  }, []);

  const saveHistoryToStorage = useCallback((stack: Song[], index: number) => {
    try {
      localStorage.setItem("rw_history_stack", JSON.stringify(stack));
      localStorage.setItem("rw_history_index", String(index));
    } catch (err) {
      console.warn("[PlayerContext] Failed to save history to storage:", err);
    }
  }, []);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  // Load favorites from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then((saved: any) => {
      if (saved) {
        try { setFavorites(JSON.parse(saved)); } catch { /**/ }
      }
    });
  }, []);

  // Save favorites to AsyncStorage
  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  // TrackPlayer Hooks
  const playbackState = usePlaybackState();
  const activeTrack = useActiveTrack();
  const progressData = useProgress(500);

  const isPlaying = playbackState
    ? (playbackState.state === State.Playing ||
       playbackState.state === State.Buffering ||
       playbackState.state === State.Loading)
    : false;
  const progress = progressData.position;
  const duration = progressData.duration;

  // Radio suggestions fetching (Language & Category Recommendations Engine)
  const fetchRadioSongs = useCallback(async (seed: Song): Promise<Song[]> => {
    let seedLang = seed.language ? seed.language.toLowerCase().trim() : "";
    if (seedLang !== "telugu" && seedLang !== "hindi") {
      seedLang = "";
    }

    // 1. If language is not set, look at other songs in the queue to infer it, or fetch it from JioSaavn API
    if (!seedLang) {
      const songsWithLang = queueRef.current.filter((s) => {
        if (!s.language) return false;
        const l = s.language.toLowerCase().trim();
        return l === "telugu" || l === "hindi";
      });
      if (songsWithLang.length > 0) {
        const langCounts: Record<string, number> = {};
        songsWithLang.forEach((s) => {
          const l = s.language!.toLowerCase().trim();
          langCounts[l] = (langCounts[l] || 0) + 1;
        });
        const sortedLangs = Object.keys(langCounts).sort((a, b) => langCounts[b] - langCounts[a]);
        if (sortedLangs.length > 0) {
          seedLang = sortedLangs[0];
          console.log(`[PlayerContext] Inferred language category from active queue: ${seedLang}`);
        }
      }
    }

    if (!seedLang && seed.id && !seed.id.startsWith("yt-") && !seed.audioUrl?.includes("piped")) {
      try {
        console.log(`[PlayerContext] Fetching full details to get language for: ${seed.id}`);
        const details = await api.getSongById(seed.id);
        const dataList = details?.data;
        if (Array.isArray(dataList) && dataList.length > 0) {
          const matched = dataList[0];
          if (matched && matched.language) {
            const resolved = String(matched.language).toLowerCase().trim();
            if (resolved === "telugu" || resolved === "hindi") {
              seedLang = resolved;
              console.log(`[PlayerContext] Resolved language from API details: ${seedLang}`);
            }
          }
        }
      } catch (err) {
        console.warn("[PlayerContext] Failed to fetch song details for language detection:", err);
      }
    }

    if (seedLang !== "telugu" && seedLang !== "hindi") {
      seedLang = "telugu"; // Default fallback
    }

    const recommendations: Song[] = [];
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();

    const existingIds = new Set(queueRef.current.map((s) => s.id));
    const existingKeys = new Set(queueRef.current.map((s) => normalizeSongTitle(s.title)));

    const history = getPlaybackHistory();
    const now = Date.now();
    const activeHistory = history.filter((h) => now - h.timestamp < RECENT_LIMIT_MS);

    const recentIds = new Set<string>();
    const recentKeys = new Set<string>();
    activeHistory.forEach((h) => {
      recentIds.add(h.id);
      if (h.title) {
        recentKeys.add(normalizeSongTitle(h.title));
      }
    });

    const addSongs = (list: Song[], bypassLangFilter = false) => {
      list.forEach((s) => {
        if (!s || !s.id) return;
        
        // Strict global requirement: only Telugu and Hindi songs allowed in continuous play/radio suggestions
        if (s.language) {
          const l = s.language.toLowerCase().trim();
          if (l !== "telugu" && l !== "hindi") {
            return;
          }
        }

        if (!bypassLangFilter && seedLang && s.language && s.language.toLowerCase().trim() !== seedLang) {
          return;
        }
        const key = normalizeSongTitle(s.title);
        if (
          !seenIds.has(s.id) &&
          !seenKeys.has(key) &&
          !existingIds.has(s.id) &&
          !existingKeys.has(key) &&
          !recentIds.has(s.id) &&
          !recentKeys.has(key)
        ) {
          seenIds.add(s.id);
          seenKeys.add(key);
          recommendations.push(s);
        }
      });
    };

    // Attempt 1: Get official suggestions from JioSaavn
    if (seed.id && !seed.id.startsWith("yt-")) {
      try {
        console.log(`[PlayerContext] Getting suggestions for song ID: ${seed.id}`);
        const res = await api.getSongSuggestions(seed.id);
        const raw = res?.data || res?.results || [];
        if (Array.isArray(raw) && raw.length > 0) {
          const suggestions = raw
            .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
            .filter((s: any): s is Song => !!s && !!s.id);
          addSongs(suggestions);
          console.log(`[PlayerContext] Suggestions API returned ${suggestions.length} items, added ${recommendations.length} matching language/unplayed items`);
        }
      } catch (err) {
        console.warn("[PlayerContext] Suggestions API call failed:", err);
      }
    }

    // Attempt 2: Search fallback based on artist + language
    const firstArtist = seed.artist ? seed.artist.split(",")[0].trim() : "";
    if (recommendations.length < 15 && seedLang && firstArtist) {
      try {
        const query = `${seedLang} songs ${firstArtist}`;
        console.log(`[PlayerContext] Fallback searching: "${query}"`);
        const res = await api.searchSongs(query, 1, 30);
        const raw = res?.data?.results || res?.results || [];
        if (Array.isArray(raw)) {
          const searchSongs = raw
            .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
            .filter((s: any): s is Song => !!s && !!s.id);
          addSongs(searchSongs);
        }
      } catch (err) {
        console.warn("[PlayerContext] Artist + Language fallback search failed:", err);
      }
    }

    // Attempt 3: Query the specific language pools (2 random queries from pool)
    if (recommendations.length < 15 && seedLang) {
      const pools = LANGUAGE_QUERY_POOLS[seedLang] || [`trending ${seedLang} songs`];
      const selectedQueries = [...pools].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const q of selectedQueries) {
        if (recommendations.length >= 20) break;
        try {
          console.log(`[PlayerContext] Querying language pool: "${q}"`);
          const res = await api.searchSongs(q, 1, 35);
          const raw = res?.data?.results || res?.results || [];
          if (Array.isArray(raw)) {
            const poolSongs = raw
              .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
              .filter((s: any): s is Song => !!s && !!s.id);
            addSongs(poolSongs);
          }
        } catch (err) {
          console.warn(`[PlayerContext] Language pool search failed for "${q}":`, err);
        }
      }
    }

    // Attempt 4: Search fallback based on movie / album name
    const movieOrAlbum = seed.movie || seed.album || "";
    if (recommendations.length < 15 && movieOrAlbum) {
      try {
        const query = `${movieOrAlbum} songs`;
        console.log(`[PlayerContext] Album/Movie fallback searching: "${query}"`);
        const res = await api.searchSongs(query, 1, 20);
        const raw = res?.data?.results || res?.results || [];
        if (Array.isArray(raw)) {
          const albumSongs = raw
            .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
            .filter((s: any): s is Song => !!s && !!s.id);
          addSongs(albumSongs);
        }
      } catch (err) {
        console.warn("[PlayerContext] Album/Movie fallback search failed:", err);
      }
    }

    // Attempt 5: Search fallback based on artist alone
    if (recommendations.length < 10 && firstArtist) {
      try {
        const query = `${firstArtist} songs`;
        console.log(`[PlayerContext] Ultimate artist search fallback: "${query}"`);
        const res = await api.searchSongs(query, 1, 20);
        const raw = res?.data?.results || res?.results || [];
        if (Array.isArray(raw)) {
          const artistSongs = raw
            .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
            .filter((s: any): s is Song => !!s && !!s.id);
          addSongs(artistSongs);
        }
      } catch (err) {
        console.warn("[PlayerContext] Ultimate artist search failed:", err);
      }
    }

    // Attempt 5b: Transition to similar languages / categories algorithm
    if (recommendations.length < 12 && seedLang) {
      const similarLangs = SIMILAR_LANGUAGES[seedLang] || [];
      for (const simLang of similarLangs) {
        if (recommendations.length >= 15) break;
        const pools = LANGUAGE_QUERY_POOLS[simLang] || [`trending ${simLang} songs`];
        const randomQ = pools[Math.floor(Math.random() * pools.length)];
        try {
          console.log(`[PlayerContext] Transitioning to similar category (${simLang}): "${randomQ}"`);
          const res = await api.searchSongs(randomQ, 1, 25);
          const raw = res?.data?.results || res?.results || [];
          if (Array.isArray(raw)) {
            const simSongs = raw
              .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
              .filter((s: any): s is Song => !!s && !!s.id);
            addSongs(simSongs, true); // Bypass language filter to allow similar languages
          }
        } catch (err) {
          console.warn(`[PlayerContext] Similar language pool query failed for "${randomQ}":`, err);
        }
      }
    }

    // Attempt 6: Continuous play general trending fallback
    if (recommendations.length < 10) {
      const fallbackQueries = [
        "popular songs",
        "trending songs 2025",
        "top music hits",
        "lofi chill beats",
        "global top hits"
      ];
      if (seedLang) {
        fallbackQueries.unshift(
          `top ${seedLang} hits`,
          `trending ${seedLang} songs`,
          `new ${seedLang} songs`
        );
      }
      for (const q of fallbackQueries) {
        if (recommendations.length >= 15) break;
        try {
          console.log(`[PlayerContext] Continuous playback fallback querying: "${q}"`);
          const res = await api.searchSongs(q, 1, 25);
          const raw = res?.data?.results || res?.results || [];
          if (Array.isArray(raw)) {
            const fallbackSongs = raw
              .map((item: any) => (mapApiSong ? mapApiSong(item) : item))
              .filter((s: any): s is Song => !!s && !!s.id);
            addSongs(fallbackSongs, true);
          }
        } catch (err) {
          console.warn(`[PlayerContext] Fallback query failed for "${q}":`, err);
        }
      }
    }

    // Attempt 7: Final YouTube search fallback (so playing never stops under any circumstances)
    if (recommendations.length < 5) {
      try {
        const query = seedLang 
          ? `trending ${seedLang} music songs`
          : `${seed.title || "popular"} song music`;
        console.log(`[PlayerContext] Final YouTube fallback querying: "${query}"`);
        const ytSongs = await searchPiped(query);
        addSongs(ytSongs, true);
      } catch (err) {
        console.warn("[PlayerContext] Final YouTube fallback failed:", err);
      }
    }

    // Sort recommendations based on similarity score with the seed song
    const scoredRecs = recommendations.map((song) => ({
      song,
      score: calculateSongScore(song, seed),
    }));
    scoredRecs.sort((a, b) => b.score - a.score);
    const sortedRecommendations = scoredRecs.map((sr) => sr.song);

    return sortedRecommendations.slice(0, 20);
  }, []);

  const fetchAndAppendRecommendations = useCallback(async (seed: Song): Promise<Song[]> => {
    if (activeRecommendationFetchRef.current === seed.id && activeFetchPromiseRef.current) {
      console.log(`[PlayerContext] Reusing active fetch promise for seed: ${seed.id}`);
      return activeFetchPromiseRef.current;
    }

    console.log(`[PlayerContext] Initiating recommendation fetch for seed: ${seed.id}`);
    activeRecommendationFetchRef.current = seed.id;
    radioFetchingRef.current = true;
    setIsRadioMode(true);

    const promise = fetchRadioSongs(seed).then(async (recommendations) => {
      if (activeRecommendationFetchRef.current !== seed.id) {
        console.log("[PlayerContext] Active recommendation seed changed, discarding fetched recommendations.");
        return [];
      }

      if (recommendations.length > 0) {
        const existingIds = new Set(queueRef.current.map((s) => s.id));
        const existingKeys = new Set(queueRef.current.map((s) => (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim()));
        
        const uniqueRecs = recommendations.filter((r) => {
          const key = (r.title || "").toLowerCase().trim() + "|" + (r.artist || "").toLowerCase().trim();
          return !existingIds.has(r.id) && !existingKeys.has(key);
        });

        if (uniqueRecs.length > 0) {
          console.log(`[PlayerContext] Appending ${uniqueRecs.length} recommendations to the queue.`);
          const oldLength = queueRef.current.length;
          const updatedQueue = [...queueRef.current, ...uniqueRecs];
          setQueue(updatedQueue);
          
          try {
            const tracksToAdd = uniqueRecs.map((s) => resolveTrack(s));
            await TrackPlayer.add(tracksToAdd);
            
            const playbackState = await TrackPlayer.getPlaybackState();
            const isPlayerStopped = playbackState.state === State.Stopped || 
                                    playbackState.state === State.None || 
                                    playbackState.state === State.Ended;
            
            const activeIndex = await TrackPlayer.getActiveTrackIndex();
            const isAtEnd = activeIndex === undefined || activeIndex === null || activeIndex >= oldLength - 1;

            if (isPlayerStopped && isAtEnd) {
              console.log(`[PlayerContext] Player is stopped/at end. Skipping to index ${oldLength} and playing.`);
              try {
                await TrackPlayer.skip(oldLength);
                await TrackPlayer.play();
              } catch (skipErr) {
                console.warn("[PlayerContext] Skip failed, resetting track player with entire updated queue.");
                await TrackPlayer.reset();
                const allTracks = updatedQueue.map((s) => resolveTrack(s));
                await TrackPlayer.add(allTracks);
                await TrackPlayer.skip(oldLength);
                await TrackPlayer.play();
              }
            }
          } catch (err) {
            console.warn("[PlayerContext] Failed to add recommendations to TrackPlayer:", err);
          }
        }
      }
      return recommendations;
    }).catch((err) => {
      console.warn("[PlayerContext] Error fetching/appending recommendations:", err);
      return [];
    }).finally(() => {
      if (activeRecommendationFetchRef.current === seed.id) {
        activeFetchPromiseRef.current = null;
        radioFetchingRef.current = false;
      }
    });

    activeFetchPromiseRef.current = promise;
    return promise;
  }, [fetchRadioSongs]);

  // Sync active track changes back to currentSong and queueIndex
  useEffect(() => {
    if (activeTrack) {
      // Clear retries for other tracks to save memory
      fallbackRetryRef.current = { [activeTrack.id]: fallbackRetryRef.current[activeTrack.id] || false };

      const matched = queueRef.current.find(s => s.id === activeTrack.id);
      const songToLog = matched || ({
        id: activeTrack.id,
        title: activeTrack.title || "",
        artist: activeTrack.artist || "",
        audioUrl: activeTrack.url,
        albumArt: activeTrack.artwork,
      } as any);

      setCurrentSong(songToLog);
      logPlayback(songToLog);

      // Sync with back/forward history stack
      if (songToLog && songToLog.id) {
        if (!isNavigatingHistoryRef.current) {
          const { stack, index } = loadHistoryFromStorage();
          if (index < 0 || stack[index]?.id !== songToLog.id) {
            const newStack = stack.slice(0, index + 1);
            newStack.push(songToLog);
            const trimmedStack = newStack.slice(-100); // Keep last 100 entries max
            const newIndex = trimmedStack.length - 1;
            saveHistoryToStorage(trimmedStack, newIndex);
            console.log(`[PlayerContext] History stack updated: appended ${songToLog.title}. Index is now ${newIndex}`);
          }
        }
        // Reset navigation flag
        isNavigatingHistoryRef.current = false;
      }
    } else {
      if (queueRef.current.length === 0) {
        setCurrentSong(null);
      }
    }

    // Sync queueIndex
    const syncIndex = async () => {
      if (isSettingUpQueueRef.current) {
        console.log("[PlayerContext] Sync index ignored during queue setup.");
        return;
      }
      if (activeTrack) {
        const matchedIdx = queueRef.current.findIndex(s => s.id === activeTrack.id);
        if (matchedIdx !== -1) {
          setQueueIndex(matchedIdx);

          // Proactive preloading: if we are within 3 songs of the end of the queue, prefetch recommendations
          const q = queueRef.current;
          if (q.length >= 1 && matchedIdx >= q.length - 3) {
            const seed = q[matchedIdx];
            if (seed && activeRecommendationFetchRef.current !== seed.id) {
              console.log(`[PlayerContext] Proactive preloading recommendations near queue end (index ${matchedIdx} of ${q.length})`);
              fetchAndAppendRecommendations(seed).catch((err) => {
                console.warn("[PlayerContext] Proactive preloading failed:", err);
              });
            }
          }
        }
      }
    };
    syncIndex();
  }, [activeTrack, fetchAndAppendRecommendations, loadHistoryFromStorage, saveHistoryToStorage]);

  const playSong = useCallback(
    async (song: Song, songQueue?: Song[]) => {
      setIsRadioMode(false);
      radioFetchingRef.current = false;

      let q = songQueue || [song];

      // Filter out songs played in the last 6 hours (except selected song itself)
      // Only filter by history if the user is playing a single song without an explicit group/queue
      if (!songQueue || songQueue.length <= 1) {
        q = filterQueueByHistory(song, q);
      }

      // Deduplicate the queue by normalized title to prevent duplicates playing in sequence
      const seenKeys = new Set<string>();
      q = q.filter((s) => {
        if (s.id === song.id) {
          seenKeys.add(normalizeSongTitle(s.title));
          return true;
        }
        const key = normalizeSongTitle(s.title);
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      // Ensure the selected song is present in the queue
      if (!q.some((s) => s.id === song.id)) {
        q = [song, ...q];
      }

      const idx = q.findIndex((s) => s.id === song.id);
      const safeIdx = idx >= 0 ? idx : 0;

      setQueue(q);
      setQueueIndex(safeIdx);
      setCurrentSong(song);

      isSettingUpQueueRef.current = true;
      try {
        await TrackPlayer.reset();
        
        // Resolve the direct URL of the selected song
        const resolvedSongTrack = resolveTrack(song);
        const directUrl = await getDirectAudioUrl(resolvedSongTrack.url);
        resolvedSongTrack.url = directUrl;
        
        // Slice the queue starting from safeIdx onwards
        const slicedQueue = q.slice(safeIdx);
        const tracks = slicedQueue.map((s) => resolveTrack(s));
        if (tracks.length > 0) {
          tracks[0].url = directUrl;
        }
        
        await TrackPlayer.add(tracks);
        await TrackPlayer.play();
      } catch (err) {
        console.warn("[PlayerContext] TrackPlayer play failed:", err);
      } finally {
        isSettingUpQueueRef.current = false;
        // Trigger a final index sync to ensure queueIndex matches the correct index
        if (activeTrack) {
          const matchedIdx = queueRef.current.findIndex(s => s.id === activeTrack.id);
          if (matchedIdx !== -1) {
            setQueueIndex(matchedIdx);
          }
        }
      }

      // Proactively load recommendations in the background if queue is short (e.g., single song or short search plays)
      if (q.length < 5) {
        fetchAndAppendRecommendations(song).catch((err) => {
          console.warn("[PlayerContext] Background recommendations failed in playSong:", err);
        });
      }
    },
    [fetchAndAppendRecommendations, activeTrack]
  );

  const skipToReactIndex = useCallback(async (targetIdx: number) => {
    const q = queueRef.current;
    if (targetIdx < 0 || targetIdx >= q.length) return;
    const targetSong = q[targetIdx];
    try {
      const nativeQueue = await TrackPlayer.getQueue();
      const nativeIdx = nativeQueue.findIndex(t => t.id === targetSong.id);
      if (nativeIdx !== -1) {
        console.log(`[PlayerContext] Skipping to song natively at index ${nativeIdx}`);
        await TrackPlayer.skip(nativeIdx);
        await TrackPlayer.play();
      } else {
        console.log(`[PlayerContext] Song not in native queue. Rebuilding queue starting from target index ${targetIdx}`);
        await playSong(targetSong, q);
      }
    } catch (err) {
      console.warn("[PlayerContext] skipToReactIndex failed, rebuilding queue:", err);
      await playSong(targetSong, q);
    }
  }, [playSong]);

  const nextSongInternal = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    if (repeatRef.current === "one") {
      try {
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
      } catch {}
      return;
    }

    // 1. Check if we can go forward in history stack
    const { stack, index } = loadHistoryFromStorage();
    if (index >= 0 && index < stack.length - 1) {
      const nextIndex = index + 1;
      const targetSong = stack[nextIndex];
      isNavigatingHistoryRef.current = true;
      saveHistoryToStorage(stack, nextIndex);
      console.log(`[PlayerContext] History stack next: Playing ${targetSong.title} at index ${nextIndex}`);
      await playSong(targetSong, q);
      return;
    }

    // 2. Default queue skip to next song
    if (idx < q.length - 1) {
      await skipToReactIndex(idx + 1);
    } else {
      if (repeatRef.current === "all") {
        await skipToReactIndex(0);
      } else if (repeatRef.current === "off") {
        const seed = q[idx];
        if (seed) {
          await fetchAndAppendRecommendations(seed);
        }
      }
    }
  }, [skipToReactIndex, fetchAndAppendRecommendations, loadHistoryFromStorage, saveHistoryToStorage, playSong]);

  const togglePlay = useCallback(async () => {
    try {
      const stateObj = await TrackPlayer.getPlaybackState();
      if (stateObj.state === State.Playing) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch {}
  }, []);

  const prevSong = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    if (progress > 3) {
      try {
        await TrackPlayer.seekTo(0);
      } catch {}
      return;
    }

    // 1. Check if we can go back in history stack
    const { stack, index } = loadHistoryFromStorage();
    if (index > 0) {
      const prevIndex = index - 1;
      const targetSong = stack[prevIndex];
      isNavigatingHistoryRef.current = true;
      saveHistoryToStorage(stack, prevIndex);
      console.log(`[PlayerContext] History stack previous: Playing ${targetSong.title} at index ${prevIndex}`);
      await playSong(targetSong, q);
      return;
    }

    // 2. Default queue skip to previous song
    if (idx > 0) {
      await skipToReactIndex(idx - 1);
    } else {
      if (repeatRef.current === "all") {
        await skipToReactIndex(q.length - 1);
      } else {
        try {
          await TrackPlayer.seekTo(0);
        } catch {}
      }
    }
  }, [progress, skipToReactIndex, loadHistoryFromStorage, saveHistoryToStorage, playSong]);

  // TrackPlayer Setup on mount
  useEffect(() => {
    let active = true;
    let queueEndedListener: any;
    let playbackErrorListener: any;

    const init = async () => {
      try {
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
          androidAudioContentType: AndroidAudioContentType.Music,
        });
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
          ],
        });
        await TrackPlayer.setVolume(volume);

        if (active) {
          queueEndedListener = TrackPlayer.addEventListener(
            Event.PlaybackQueueEnded,
            async (event) => {
              console.log("[PlayerContext] Playback queue ended, triggering nextSong/radio mode");
              await nextSongInternal();
            }
          );

          playbackErrorListener = TrackPlayer.addEventListener(
            Event.PlaybackError,
            async (error) => {
              console.warn("[PlayerContext] Playback error encountered:", error);
              try {
                const activeIndex = await TrackPlayer.getActiveTrackIndex();
                if (activeIndex !== undefined && activeIndex !== null) {
                  const track = await TrackPlayer.getTrack(activeIndex);
                  if (track && track.url) {
                    const retryKey = `${track.id}-${activeIndex}`;
                    if (fallbackRetryRef.current[retryKey]) {
                      console.warn(`[PlayerContext] Already attempted fallback for track ${track.id} at index ${activeIndex}. Skipping.`);
                    } else {
                      fallbackRetryRef.current[retryKey] = true;

                      if (track.url.startsWith("youtube://")) {
                        const videoId = track.url.replace("youtube://", "");
                        console.log(`[PlayerContext] Playback error on YouTube track. Resolving video ID: ${videoId}`);
                        const directUrl = await resolvePipedAudioUrl(videoId);
                        if (directUrl) {
                          track.url = directUrl;
                          await TrackPlayer.remove(activeIndex);
                          await TrackPlayer.add(track, activeIndex);
                          await TrackPlayer.skip(activeIndex);
                          await TrackPlayer.play();
                          return;
                        }
                      } else if (track.url.includes("saavncdn.com") || track.url.includes("oasth.me")) {
                        console.log(`[PlayerContext] Playback error on direct JioSaavn CDN track. Falling back to proxy.`);
                        track.url = `https://musicbackend-xg4u.onrender.com/api/songs/${track.id}/stream`;
                        await TrackPlayer.remove(activeIndex);
                        await TrackPlayer.add(track, activeIndex);
                        await TrackPlayer.skip(activeIndex);
                        await TrackPlayer.play();
                        return;
                      } else if (track.url.includes("musicbackend-xg4u.onrender.com")) {
                        console.log(`[PlayerContext] Playback error on backend stream proxy URL. Attempting to resolve direct JioSaavn CDN URL for track: ${track.id}`);
                        try {
                          const details = await api.getSongById(track.id);
                          const dataList = details?.data;
                          if (Array.isArray(dataList) && dataList.length > 0) {
                            const mapped = mapApiSong(dataList[0]);
                            if (mapped && mapped.audioUrl && !mapped.audioUrl.includes("musicbackend-xg4u.onrender.com") && !mapped.audioUrl.includes("oasth.me")) {
                              console.log(`[PlayerContext] Successfully resolved direct CDN URL for proxy fallback: ${mapped.audioUrl.substring(0, 50)}...`);
                              track.url = mapped.audioUrl;
                              await TrackPlayer.remove(activeIndex);
                              await TrackPlayer.add(track, activeIndex);
                              await TrackPlayer.skip(activeIndex);
                              await TrackPlayer.play();
                              return;
                            }
                          }
                        } catch (resolveErr) {
                          console.warn("[PlayerContext] Failed to resolve direct CDN URL from JioSaavn API:", resolveErr);
                        }
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn("[PlayerContext] Error resolving fallback after playback error:", e);
              }
              await nextSongInternal();
            }
          );
        }
      } catch (e) {
        // Suppress error if already setup
      }
    };
    init();

    return () => {
      active = false;
      if (queueEndedListener) {
        queueEndedListener.remove();
      }
      if (playbackErrorListener) {
        playbackErrorListener.remove();
      }
    };
  }, [nextSongInternal]);

  const setProgress = useCallback((value: number) => {
    TrackPlayer.seekTo(value).catch(() => {});
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    TrackPlayer.setVolume(value).catch(() => {});
  }, []);

  const toggleFavorite = useCallback((songId: string) => {
    setFavorites((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId]
    );
  }, []);

  const isFavorite = useCallback(
    (songId: string): boolean => favorites.includes(songId),
    [favorites]
  );

  const toggleShuffle = useCallback(async () => {
    const newShuffle = !shuffle;
    setShuffle(newShuffle);

    if (newShuffle) {
      setOriginalQueue(queue);
      if (queue.length > 1 && currentSong) {
        const remaining = queue.filter((s) => s.id !== currentSong.id);
        const shuffled = [...remaining].sort(() => Math.random() - 0.5);
        const newQ = [currentSong, ...shuffled];
        setQueue(newQ);
        setQueueIndex(0);

        try {
          await TrackPlayer.reset();
          const tracks = newQ.map((s) => resolveTrack(s));
          await TrackPlayer.add(tracks);
          await TrackPlayer.play();
        } catch {}
      }
    } else {
      if (originalQueue.length > 0) {
        setQueue(originalQueue);
        const idx = originalQueue.findIndex((s) => s.id === currentSong?.id);
        const safeIdx = idx >= 0 ? idx : 0;
        setQueueIndex(safeIdx);

        try {
          await TrackPlayer.reset();
          const tracks = originalQueue.map((s) => resolveTrack(s));
          await TrackPlayer.add(tracks);
          await TrackPlayer.skip(safeIdx);
          await TrackPlayer.play();
        } catch {}
      }
    }
  }, [shuffle, queue, currentSong, originalQueue]);

  const cycleRepeat = useCallback(async () => {
    let newMode: "off" | "one" | "all";
    let nativeMode: RepeatMode;

    if (repeat === "off") {
      newMode = "one";
      nativeMode = RepeatMode.Track;
    } else if (repeat === "one") {
      newMode = "all";
      nativeMode = RepeatMode.Queue;
    } else {
      newMode = "off";
      nativeMode = RepeatMode.Off;
    }

    setRepeat(newMode);
    try {
      await TrackPlayer.setRepeatMode(nativeMode);
    } catch {}
  }, [repeat]);

  const addToQueue = useCallback((song: Song) => {
    setQueue((prev) => {
      if (prev.some((s) => s.id === song.id)) return prev;
      const newQ = [...prev, song];

      TrackPlayer.add(resolveTrack(song)).catch(() => {});

      return newQ;
    });
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        queue,
        queueIndex,
        progress,
        duration,
        volume,
        showPlayer,
        shuffle,
        repeat,
        isRadioMode,
        playSong,
        togglePlay,
        nextSong: nextSongInternal,
        prevSong,
        setProgress,
        setVolume,
        setShowPlayer,
        toggleFavorite,
        isFavorite,
        addToQueue,
        toggleShuffle,
        cycleRepeat,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}