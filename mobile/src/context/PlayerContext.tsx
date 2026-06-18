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
const RECENT_LIMIT_MS = 6 * 60 * 60 * 1000; // 6 hours

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
      const key = h.title.toLowerCase().trim() + "|" + (h.artist || "").toLowerCase().trim();
      recentKeys.add(key);
    }
  });
  
  return songQueue.filter((s) => {
    if (s.id === song.id) return true;
    if (recentIds.has(s.id)) return false;
    if (s.title) {
      const key = s.title.toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
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
  telugu: ["tamil", "kannada", "malayalam", "hindi"],
  tamil: ["telugu", "kannada", "malayalam", "hindi"],
  kannada: ["telugu", "tamil", "malayalam", "hindi"],
  malayalam: ["telugu", "tamil", "kannada", "hindi"],
  hindi: ["punjabi", "bhojpuri", "haryanvi", "english"],
  punjabi: ["hindi", "haryanvi", "english"],
  english: ["hindi", "punjabi"],
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

    // 1. If language is not set, look at other songs in the queue to infer it, or fetch it from JioSaavn API
    if (!seedLang) {
      const songsWithLang = queueRef.current.filter((s) => s.language);
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
            seedLang = String(matched.language).toLowerCase().trim();
            console.log(`[PlayerContext] Resolved language from API details: ${seedLang}`);
          }
        }
      } catch (err) {
        console.warn("[PlayerContext] Failed to fetch song details for language detection:", err);
      }
    }

    const recommendations: Song[] = [];
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();

    const existingIds = new Set(queueRef.current.map((s) => s.id));
    const existingKeys = new Set(queueRef.current.map((s) => (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim()));

    const history = getPlaybackHistory();
    const now = Date.now();
    const activeHistory = history.filter((h) => now - h.timestamp < RECENT_LIMIT_MS);

    const recentIds = new Set<string>();
    const recentKeys = new Set<string>();
    activeHistory.forEach((h) => {
      recentIds.add(h.id);
      if (h.title) {
        recentKeys.add(h.title.toLowerCase().trim() + "|" + (h.artist || "").toLowerCase().trim());
      }
    });

    const addSongs = (list: Song[], bypassLangFilter = false) => {
      list.forEach((s) => {
        if (!s || !s.id) return;
        // Filter out songs that do not match the target language if a target language exists (unless bypassed)
        if (!bypassLangFilter && seedLang && s.language && s.language.toLowerCase().trim() !== seedLang) {
          return;
        }
        const key = (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
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

    return recommendations.slice(0, 20);
  }, []);

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

    if (idx < q.length - 1) {
      try {
        await TrackPlayer.skip(idx + 1);
        await TrackPlayer.play();
      } catch (err) {
        console.warn("[PlayerContext] skip(next) failed, trying skipToNext:", err);
        try {
          await TrackPlayer.skipToNext();
          await TrackPlayer.play();
        } catch {}
      }
    } else {
      if (repeatRef.current === "all") {
        try {
          await TrackPlayer.skip(0);
          await TrackPlayer.play();
        } catch {}
      } else if (repeatRef.current === "off") {
        const seed = q[idx];
        if (!radioFetchingRef.current && seed) {
          radioFetchingRef.current = true;
          setIsRadioMode(true);
          const radioSongs = await fetchRadioSongs(seed);
          radioFetchingRef.current = false;

          if (radioSongs.length === 0) {
            setIsRadioMode(false);
            await TrackPlayer.pause();
            return;
          }

          const newQ = [...queueRef.current, ...radioSongs];
          setQueue(newQ);

          // Add new tracks to TrackPlayer
          const tracksToAdd = radioSongs.map((s) => resolveTrack(s));
          try {
            await TrackPlayer.add(tracksToAdd);
            await TrackPlayer.skip(queueRef.current.length);
            await TrackPlayer.play();
          } catch (err) {
            console.warn("[PlayerContext] Failed to add radio songs:", err);
          }
        } else {
          try {
            await TrackPlayer.pause();
          } catch {}
        }
      }
    }
  }, [fetchRadioSongs]);

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
                  if (track && track.url && track.url.startsWith("youtube://")) {
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
                  } else if (track && track.url && (track.url.includes("saavncdn.com") || track.url.includes("oasth.me"))) {
                    console.log(`[PlayerContext] Playback error on direct JioSaavn CDN track. Falling back to proxy.`);
                    track.url = `https://musicbackend-xg4u.onrender.com/api/songs/${track.id}/stream`;
                    await TrackPlayer.remove(activeIndex);
                    await TrackPlayer.add(track, activeIndex);
                    await TrackPlayer.skip(activeIndex);
                    await TrackPlayer.play();
                    return;
                  }
                }
              } catch (e) {
                console.warn("[PlayerContext] Error resolving YouTube URL after playback error:", e);
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

  // Sync active track changes back to currentSong and queueIndex
  useEffect(() => {
    if (activeTrack) {
      const matched = queueRef.current.find(s => s.id === activeTrack.id);
      if (matched) {
        setCurrentSong(matched);
        logPlayback(matched);
      } else {
        const newTrack = {
          id: activeTrack.id,
          title: activeTrack.title || "",
          artist: activeTrack.artist || "",
          audioUrl: activeTrack.url,
          albumArt: activeTrack.artwork,
        } as any;
        setCurrentSong(newTrack);
        logPlayback(newTrack);
      }
    } else {
      if (queueRef.current.length === 0) {
        setCurrentSong(null);
      }
    }

    // Sync queueIndex
    const syncIndex = async () => {
      try {
        const idx = await TrackPlayer.getActiveTrackIndex();
        if (idx !== undefined && idx !== null) {
          setQueueIndex(idx);

          // Proactive preloading: if we are within 3 songs of the end of the queue, prefetch recommendations
          const q = queueRef.current;
          if (q.length >= 1 && idx >= q.length - 3 && !radioFetchingRef.current) {
            const seed = q[idx];
            if (seed && activeRecommendationFetchRef.current !== seed.id) {
              activeRecommendationFetchRef.current = seed.id;
              console.log(`[PlayerContext] Proactive preloading recommendations near queue end (index ${idx} of ${q.length})`);
              
              fetchRadioSongs(seed).then(async (recommendations) => {
                // Verify that the song hasn't changed while we were fetching
                if (activeRecommendationFetchRef.current !== seed.id) return;
                
                if (recommendations.length > 0) {
                  const existingIds = new Set(queueRef.current.map((s) => s.id));
                  const existingKeys = new Set(queueRef.current.map((s) => (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim()));
                  
                  const uniqueRecs = recommendations.filter((r) => {
                    const key = (r.title || "").toLowerCase().trim() + "|" + (r.artist || "").toLowerCase().trim();
                    return !existingIds.has(r.id) && !existingKeys.has(key);
                  });

                  if (uniqueRecs.length > 0) {
                    console.log(`[PlayerContext] Proactively appended ${uniqueRecs.length} recommendations to prevent playback gap.`);
                    const updatedQueue = [...queueRef.current, ...uniqueRecs];
                    setQueue(updatedQueue);
                    
                    try {
                      const tracksToAdd = uniqueRecs.map((s) => resolveTrack(s));
                      await TrackPlayer.add(tracksToAdd);
                    } catch (err) {
                      console.warn("[PlayerContext] Failed to add proactive recommendations to TrackPlayer:", err);
                    }
                  }
                }
              }).catch((err) => {
                console.warn("[PlayerContext] Proactive recommendation fetch failed:", err);
              });
            }
          }
        }
      } catch {}
    };
    syncIndex();
  }, [activeTrack, fetchRadioSongs]);



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

      // Deduplicate the queue by title + artist to prevent duplicates playing in sequence
      const seenKeys = new Set<string>();
      q = q.filter((s) => {
        if (s.id === song.id) {
          seenKeys.add((s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim());
          return true;
        }
        const key = (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
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

      try {
        await TrackPlayer.reset();
        
        // Resolve the direct URL of the selected song
        const resolvedSongTrack = resolveTrack(song);
        const directUrl = await getDirectAudioUrl(resolvedSongTrack.url);
        resolvedSongTrack.url = directUrl;
        
        // Map the entire queue to tracks synchronously to avoid index desynchronization
        const tracks = q.map((s) => resolveTrack(s));
        if (safeIdx >= 0 && safeIdx < tracks.length) {
          tracks[safeIdx].url = directUrl;
        }
        
        await TrackPlayer.add(tracks);
        await TrackPlayer.skip(safeIdx);
        await TrackPlayer.play();
      } catch (err) {
        console.warn("[PlayerContext] TrackPlayer play failed:", err);
      }

      // Proactively load recommendations in the background if queue is short (e.g., single song or short search plays)
      if (q.length < 5) {
        const currentSongId = song.id;
        activeRecommendationFetchRef.current = currentSongId;
        
        // Asynchronously fetch recommendations
        fetchRadioSongs(song).then(async (recommendations) => {
          // Verify that the song hasn't changed while we were fetching
          if (activeRecommendationFetchRef.current !== currentSongId) {
            console.log("[PlayerContext] Background recommendations aborted: active song changed.");
            return;
          }

          if (recommendations.length > 0) {
            // Filter out songs that might have been added to the queue in the meantime
            const existingIds = new Set(queueRef.current.map((s) => s.id));
            const existingKeys = new Set(queueRef.current.map((s) => (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim()));
            
            const uniqueRecs = recommendations.filter((r) => {
              const key = (r.title || "").toLowerCase().trim() + "|" + (r.artist || "").toLowerCase().trim();
              return !existingIds.has(r.id) && !existingKeys.has(key);
            });

            if (uniqueRecs.length > 0) {
              console.log(`[PlayerContext] Appending ${uniqueRecs.length} background recommendations to the queue.`);
              const updatedQueue = [...queueRef.current, ...uniqueRecs];
              setQueue(updatedQueue);

              try {
                const tracksToAdd = uniqueRecs.map((s) => resolveTrack(s));
                await TrackPlayer.add(tracksToAdd);
              } catch (err) {
                console.warn("[PlayerContext] Failed to add background recommendations to TrackPlayer:", err);
              }
            }
          }
        }).catch((err) => {
          console.warn("[PlayerContext] Error fetching background recommendations:", err);
        });
      }
    },
    [fetchRadioSongs]
  );

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

    if (idx > 0) {
      try {
        await TrackPlayer.skip(idx - 1);
        await TrackPlayer.play();
      } catch (err) {
        console.warn("[PlayerContext] skip(prev) failed, trying skipToPrevious:", err);
        try {
          await TrackPlayer.skipToPrevious();
          await TrackPlayer.play();
        } catch {}
      }
    } else {
      if (repeatRef.current === "all") {
        try {
          await TrackPlayer.skip(q.length - 1);
          await TrackPlayer.play();
        } catch {}
      } else {
        try {
          await TrackPlayer.seekTo(0);
        } catch {}
      }
    }
  }, [progress]);

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