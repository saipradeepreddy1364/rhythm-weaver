import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, Modal, ActivityIndicator, Dimensions, Platform, DeviceEventEmitter } from 'react-native'
import React, { useState, useEffect, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Song, mapApiSong } from "../data/songs";
import { api, extractResults } from "../services/api";
import { SongRow } from "../components/SongRow";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { useLibrary, normalizeSongTitle } from "../context/LibraryContext";

import { localStorage, sessionStorage } from "../lib/storage";

const CURRENT_YEAR = new Date().getFullYear();

// ─── Browse categories ────────────────────────────────────────────────────────
const BROWSE_CATEGORIES = [
  { label: "Trending",     query: "trending hindi songs 2025", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80" },
  { label: "New Releases", query: "new bollywood songs 2025",  cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80" },
  { label: "Hindi",        query: "top hindi hits 2025",        cover: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&q=80" },
  { label: "Telugu",       query: "trending telugu songs 2025", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80" },
  { label: "Tamil",        query: "trending tamil songs 2025",  cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80" },
  { label: "Romantic",     query: "hindi romantic songs 2025",  cover: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=300&q=80" },
  { label: "Punjabi",      query: "top punjabi songs 2025",     cover: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&q=80" },
  { label: "Devotional",   query: "devotional songs hindi 2025",cover: "https://images.unsplash.com/photo-1542442248-61590e0c8ee0?w=300&q=80" },
  { label: "Malayalam",    query: "trending malayalam songs 2025",cover: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=300&q=80" },
  { label: "Lofi/Chill",   query: "lofi chill hindi songs",     cover: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&q=80" },
  { label: "Retro",        query: "90s bollywood hits",         cover: "https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300&q=80" },
  { label: "Kannada",      query: "trending kannada songs 2025",cover: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80" },
];

const LANGUAGE_EXTRA_QUERIES: Record<string, string[]> = {
  "Hindi":     ["popular hindi songs", "hindi film songs superhit", "hindi songs chartbuster"],
  "Telugu":    ["popular telugu songs", "telugu film songs superhit", "telugu songs chartbuster"],
  "Tamil":     ["popular tamil songs", "tamil film songs superhit", "kollywood superhit songs"],
  "Malayalam": ["popular malayalam songs", "malayalam film songs", "mollywood superhit songs"],
  "Kannada":   ["popular kannada songs", "kannada film songs", "sandalwood superhit songs"],
  "Punjabi":   ["popular punjabi songs", "punjabi hits", "punjabi new songs"],
};

const LANGUAGE_NAMES = [
  "hindi", "telugu", "tamil", "malayalam", "kannada", "punjabi",
  "bengali", "marathi", "odia", "gujarati", "bhojpuri", "haryanvi",
  "rajasthani", "assamese", "english", "Sanskrit",
];

const LANGUAGE_BEST_MOVIE: Record<string, string> = {
  hindi:      "Dilwale Dulhania Le Jayenge",
  telugu:     "Baahubali 2 The Conclusion",
  tamil:      "Vikram Tamil 2022",
  malayalam:  "Drishyam Malayalam",
  kannada:    "KGF Chapter 2",
  punjabi:    "Jatt and Juliet Punjabi",
  bengali:    "Devdas Bengali songs",
  marathi:    "Sairat Marathi",
  odia:       "Odia film songs",
  gujarati:   "Chhello Show Gujarati",
  bhojpuri:   "Nirahua Hindustani Bhojpuri",
  haryanvi:   "Haryanvi superhit songs",
  english:    "Avengers Endgame soundtrack",
};

const LANGUAGE_SONG_QUERIES: Record<string, string[]> = {
  hindi: [
    "top hindi songs 2025", "superhit hindi songs 2024", "hindi film songs 2023",
    "bollywood hits 2022", "hindi romantic songs", "hindi sad songs",
  ],
  telugu: [
    "trending telugu songs 2025", "telugu hits 2024", "telugu film songs 2023",
    "tollywood songs 2022", "telugu romantic songs", "telugu sad songs",
  ],
  tamil: [
    "trending tamil songs 2025", "tamil hits 2024", "tamil film songs 2023",
    "tamil romantic songs", "tamil sad songs",
  ],
  malayalam: [
    "trending malayalam songs 2025", "malayalam hits 2024", "malayalam film songs 2023",
    "malayalam romantic songs", "malayalam sad songs",
  ],
  kannada: [
    "trending kannada songs 2025", "kannada hits 2024", "kannada film songs 2023",
    "kannada romantic songs", "kannada sad songs",
  ],
  punjabi: [
    "top punjabi songs 2025", "punjabi hits 2024", "punjabi love songs",
    "punjabi folk songs", "punjabi sad songs",
  ],
};

function getLanguageQueries(lang: string): string[] {
  const key = lang.toLowerCase().trim();
  const def = [`${key} songs`, `${key} hit songs`, `${key} film songs`, `${key} romantic songs`].slice(0, 5);
  return LANGUAGE_SONG_QUERIES[key] || def;
}

function detectLanguageSearch(query: string): string | null {
  const clean = query.trim().toLowerCase();
  for (const lang of LANGUAGE_NAMES) {
    if (clean === lang) return lang;
    if (clean === `${lang} songs` || clean === `${lang} song`) return lang;
    if (clean === `${lang} music`) return lang;
  }
  return null;
}

// ─── Person/Artist name detection with optional language suffix ──────────────
// Returns { name, language } if query looks like "PersonName [LanguageName]"
// e.g. "Prabhas Telugu" → { name: "Prabhas", language: "telugu" }
// e.g. "AR Rahman"      → { name: "AR Rahman", language: null }
function detectPersonSearchWithLang(query: string): { name: string; language: string | null } | null {
  const clean = query.trim();
  if (clean.length < 2 || clean.length > 60) return null;

  const words = clean.trim().split(/\s+/);
  if (words.length < 1 || words.length > 6) return null;

  // Check if last word is a language name
  let language: string | null = null;
  let nameWords = words;
  const lastWord = words[words.length - 1].toLowerCase();
  if (LANGUAGE_NAMES.includes(lastWord)) {
    language = lastWord;
    nameWords = words.slice(0, -1);
    if (nameWords.length === 0) return null; // query was just a language name
  }

  // Must not contain song/movie/non-name keywords in the name portion
  const songKeywords = [
    "songs", "song", "music", "hits", "album", "movie", "film", "remix",
    "latest", "new", "best", "top", "trending", "2024", "2025",
  ];
  const nameStr = nameWords.join(" ").toLowerCase();
  if (songKeywords.some((k) => nameStr.includes(k))) return null;

  // Name words: 1–5 words, each word starts with a letter (alphabetic)
  if (nameWords.length < 1 || nameWords.length > 5) return null;
  if (!nameWords.every((w) => /^[a-zA-Z\u0900-\u097F]+/.test(w))) return null;

  return { name: nameWords.join(" "), language };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

function cleanSong(song: Song): Song {
  return {
    ...song,
    title:  decodeHtml(song.title  || ""),
    artist: decodeHtml(song.artist || ""),
    album:  decodeHtml(song.album   || ""),
    movie:  decodeHtml(song.movie   || ""),
  };
}

const PRELOAD_SESSION_KEY = (k: string) => `preload_songs_v2_${k}`;
function getPreloadedSongs(key: string): Song[] {
  try {
    const raw = sessionStorage.getItem(PRELOAD_SESSION_KEY(key.toLowerCase()));
    if (!raw) return [];
    return JSON.parse(raw) as Song[];
  } catch { return []; }
}

const CATEGORY_CACHE_KEY = (k: string) => `search_cat_cache_${k.toLowerCase()}`;
function getCategoryCache(label: string): { songs: Song[]; coverArt: string } {
  try {
    const raw = localStorage.getItem(CATEGORY_CACHE_KEY(label));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.songs) && parsed.songs.length > 0) {
        return parsed;
      }
    }
  } catch {}
  const pre = getPreloadedSongs(label);
  return { songs: pre, coverArt: pre[0]?.albumArt || "" };
}

function saveCategoryCache(label: string, songs: Song[], coverArt: string) {
  try {
    localStorage.setItem(CATEGORY_CACHE_KEY(label), JSON.stringify({ songs, coverArt }));
  } catch {}
}

// Background preloading disabled to prevent thread freezing and button click delay
function startCategoryPreload() {
  return;
}

startCategoryPreload();

// ─── Category Song List Modal ─────────────────────────────────────────────────
function CategorySongModal({
  label,
  songs,
  coverArt,
  loading,
  onClose,
  onRequireAuth,
}: {
  label: string;
  songs: Song[];
  coverArt: string;
  loading: boolean;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();

  return (
    <View style={modalStyles.container}>
      {coverArt && (
        <Image
          source={{ uri: coverArt }}
          style={modalStyles.backgroundImage}
          blurRadius={20}
          resizeMode="cover"
        />
      )}
      <View style={modalStyles.overlay} />

      <View style={modalStyles.content}>
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity delayPressIn={0} onPress={onClose} style={modalStyles.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={modalStyles.headerMeta}>
            <Text style={modalStyles.headerTitle} numberOfLines={1}>{label}</Text>
            <Text style={modalStyles.headerSubtitle} numberOfLines={1}>
              {loading ? "Loading songs…" : `${songs.length} songs`}
            </Text>
          </View>

          {songs.length > 0 ? (
            <TouchableOpacity delayPressIn={0} onPress={() => playSong(songs[0], songs)} style={modalStyles.playBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="play" size={24} color="#000" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Large cover art */}
        {coverArt ? (
          <View style={modalStyles.coverWrapper}>
            <Image source={{ uri: coverArt }} style={modalStyles.coverImage} resizeMode="cover" />
          </View>
        ) : null}

        {/* Songs list */}
        <ScrollView style={modalStyles.songsScroll} contentContainerStyle={modalStyles.songsScrollContent}>
          {loading && songs.length === 0 ? (
            <View style={modalStyles.centerLoading}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={modalStyles.loadingText}>Loading songs…</Text>
            </View>
          ) : (
            <View style={{ paddingBottom: 60 }}>
              {songs.map((song) => (
                <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
              ))}

              {loading && songs.length > 0 ? (
                <View style={modalStyles.fetchingMoreRow}>
                  <ActivityIndicator size="small" color="#1DB954" />
                  <Text style={modalStyles.fetchingMoreText}>Finding more songs…</Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Language Album Modal ─────────────────────────────────────────────────────
function LanguageAlbumModal({
  language,
  onClose,
  onRequireAuth,
}: {
  language: string;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();
  const [songs, setSongs]               = useState<Song[]>([]);
  const [loadingMore, setLoadingMore]   = useState(true);
  const [loadingCover, setLoadingCover] = useState(true);
  const [coverArt, setCoverArt]         = useState<string | null>(null);
  const [totalFetched, setTotalFetched] = useState(0);

  const displayName = language.charAt(0).toUpperCase() + language.slice(1);

  useEffect(() => {
    let unmounted = false;
    setLoadingMore(true);
    setLoadingCover(true);

    const bestMovie = LANGUAGE_BEST_MOVIE[language.toLowerCase()];
    if (bestMovie) {
      api.searchSongs(bestMovie, 1, 1).then((res) => {
        if (unmounted) return;
        const items = extractResults(res);
        if (items[0]?.image) {
          const mapped = mapApiSong(items[0]);
          if (mapped.albumArt) setCoverArt(mapped.albumArt);
        }
        setLoadingCover(false);
      }).catch(() => {
        if (!unmounted) setLoadingCover(false);
      });
    } else {
      setLoadingCover(false);
    }

    const queries = getLanguageQueries(language);
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();
    let allSongs: Song[] = [];

    (async () => {
      for (const q of queries) {
        if (unmounted) break;
        for (let page = 1; page <= 6; page++) {
          if (unmounted) break;
          try {
            if (page > 1) await sleep(200);
            const res     = await api.searchSongs(q, page, 50);
            const items   = extractResults(res);
            if (items.length === 0) break;
            const mapped = items.map(mapApiSong).map(cleanSong).filter((s: Song) => s.audioUrl);
            let added = 0;
            for (const s of mapped) {
              if (!s.id) continue;
              const tKey = normalizeSongTitle(s.title, s.movie || s.album);
              if (!seenIds.has(s.id) && (!tKey || !seenTitles.has(tKey))) {
                seenIds.add(s.id);
                if (tKey) seenTitles.add(tKey);
                allSongs = [...allSongs, s];
                added++;
              }
            }
            if (!unmounted) {
              setSongs(allSongs);
              setTotalFetched(allSongs.length);
            }
            if (items.length < 50 || added === 0) break;
          } catch {
            break;
          }
        }
        await sleep(150);
      }
      if (!unmounted) setLoadingMore(false);
    })();

    return () => { unmounted = true; };
  }, [language]);

  return (
    <View style={modalStyles.container}>
      {coverArt && (
        <Image
          source={{ uri: coverArt }}
          style={modalStyles.backgroundImage}
          blurRadius={20}
          resizeMode="cover"
        />
      )}
      <View style={modalStyles.overlay} />

      <View style={modalStyles.content}>
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity delayPressIn={0} onPress={onClose} style={modalStyles.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={modalStyles.headerMeta}>
            <Text style={modalStyles.headerTitle} numberOfLines={1}>{displayName} Music</Text>
            <Text style={modalStyles.headerSubtitle} numberOfLines={1}>
              {loadingMore ? `Loading (${totalFetched} songs…)` : `${songs.length} songs`}
            </Text>
          </View>

          {songs.length > 0 ? (
            <TouchableOpacity delayPressIn={0} onPress={() => playSong(songs[0], songs)} style={modalStyles.playBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="play" size={24} color="#000" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Large cover art */}
        {coverArt ? (
          <View style={modalStyles.coverWrapper}>
            <Image source={{ uri: coverArt }} style={modalStyles.coverImage} resizeMode="cover" />
          </View>
        ) : null}

        {/* Songs list */}
        <ScrollView style={modalStyles.songsScroll} contentContainerStyle={modalStyles.songsScrollContent}>
          {songs.length === 0 && (loadingCover || loadingMore) ? (
            <View style={modalStyles.centerLoading}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={modalStyles.loadingText}>Fetching {displayName} songs…</Text>
            </View>
          ) : (
            <View style={{ paddingBottom: 60 }}>
              {songs.map((song) => (
                <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
              ))}

              {loadingMore && (
                <View style={modalStyles.fetchingMoreRow}>
                  <ActivityIndicator size="small" color="#1DB954" />
                  <Text style={modalStyles.fetchingMoreText}>
                    Loading more songs ({totalFetched} so far)…
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────
interface CategoryCardProps {
  label: string;
  query: string;
  coverArt: string;
  onSelect: (label: string, query: string, coverArt: string) => void;
}

function CategoryCard({ label, query, coverArt, onSelect }: CategoryCardProps) {
  return (
    <TouchableOpacity delayPressIn={0} onPress={() => onSelect(label, query, coverArt)} style={styles.categoryBtn} activeOpacity={0.8}>
      <View style={styles.categoryCoverWrapper}>
        {coverArt ? (
          <Image source={{ uri: coverArt }} style={styles.categoryCover} />
        ) : (
          <View style={[styles.categoryCover, styles.categoryCoverPlaceholder]}>
            <MaterialCommunityIcons name="music" size={24} color="rgba(255,255,255,0.2)" />
          </View>
        )}

        <View style={styles.categoryPlayOverlay}>
          <MaterialCommunityIcons name="play" size={14} color="#000" style={{ marginLeft: 1 }} />
        </View>
      </View>

      <Text style={styles.categoryLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Album Detail View ───────────────────────────────────────────────────────
interface Album {
  id?: string;
  title: string;
  coverArt: string;
  songs: Song[];
  type: string;
  query: string;
}

function AlbumModal({
  album,
  onClose,
  onRequireAuth,
}: {
  album: Album;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();
  const [songs, setSongs] = useState<Song[]>(album.songs);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let unmounted = false;
    if (!album.id) {
      // Fallback: search for album songs using query
      setLoading(true);
      api.searchSongs(album.query, 1, 50).then((res) => {
        if (unmounted) return;
        const items = extractResults(res);
        const mapped = items.map(mapApiSong).map(cleanSong).filter((s) => s.audioUrl);
        if (mapped.length > 0) setSongs(mapped);
        setLoading(false);
      }).catch(() => {
        if (!unmounted) setLoading(false);
      });
      return;
    }

    setLoading(true);
    api.getAlbumDetails(album.id)
      .then((res) => {
        if (unmounted) return;
        const raw = extractResults(res);
        const mapped = raw.map(mapApiSong).map(cleanSong).filter((s) => s.audioUrl);
        if (mapped.length > 0) {
          setSongs(mapped);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn("Failed to fetch album details:", err);
        if (!unmounted) setLoading(false);
      });

    return () => { unmounted = true; };
  }, [album.id, album.query]);

  return (
    <View style={modalStyles.container}>
      {album.coverArt && (
        <Image
          source={{ uri: album.coverArt }}
          style={modalStyles.backgroundImage}
          blurRadius={20}
          resizeMode="cover"
        />
      )}
      <View style={modalStyles.overlay} />

      <View style={modalStyles.content}>
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity delayPressIn={0} onPress={onClose} style={modalStyles.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={modalStyles.headerMeta}>
            <Text style={modalStyles.headerTitle} numberOfLines={1}>{album.title}</Text>
            <Text style={modalStyles.headerSubtitle} numberOfLines={1}>
              Album
            </Text>
          </View>

          {songs.length > 0 ? (
            <TouchableOpacity delayPressIn={0} onPress={() => playSong(songs[0], songs)} style={modalStyles.playBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="play" size={24} color="#000" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Large cover art */}
        {album.coverArt ? (
          <View style={modalStyles.coverWrapper}>
            <Image source={{ uri: album.coverArt }} style={modalStyles.coverImage} resizeMode="cover" />
          </View>
        ) : null}

        {/* Songs list */}
        <ScrollView style={modalStyles.songsScroll} contentContainerStyle={modalStyles.songsScrollContent}>
          <View style={{ paddingBottom: 60 }}>
            {songs.map((song) => (
              <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

async function fetchAllPages(query: string, maxPages = 60, seen?: Set<string>): Promise<Song[]> {
  const all: Song[] = [];
  const localSeen = seen || new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    try {
      if (page > 1) await sleep(200);
      const res   = await api.searchSongs(query, page, 50);
      const items = extractResults(res);
      if (items.length === 0) break;
      const songs = items.map(mapApiSong).map(cleanSong).filter((s) => Boolean(s.audioUrl));
      let added = 0;
      for (const s of songs) {
        if (!s.id) continue;
        const titleKey = normalizeSongTitle(s.title, s.movie || s.album);
        if (!localSeen.has(s.id) && !localSeen.has(titleKey)) {
          localSeen.add(s.id);
          localSeen.add(titleKey);
          all.push(s);
          added++;
        }
      }
      if (items.length < 50 || added === 0) break;
    } catch {
      break;
    }
  }
  return all;
}

async function fetchAllArtistSongs(artistName: string, language?: string | null): Promise<Song[]> {
  const lang = language?.toLowerCase().trim();
  const queries = lang
    ? [
        `${artistName} ${lang} songs`,
        `${artistName} ${lang} hits`,
        `${artistName} ${lang} film songs`,
        `${artistName} ${lang} romantic songs`,
        `${artistName} ${lang} latest songs`,
      ]
    : [
        `${artistName} songs`,
        `${artistName} hits`,
        `${artistName} movie songs`,
        `${artistName} romantic songs`,
        `${artistName} album songs`,
      ];
  const seen = new Set<string>();
  const all: Song[] = [];
  for (const q of queries) {
    try {
      const songs = await fetchAllPages(q, 8, seen);
      all.push(...songs);
    } catch { /* continue */ }
  }
  return all;
}

// ─── Artist Profile Modal ─────────────────────────────────────────────────────
interface Artist {
  id?: string;
  name: string;
  coverArt: string;
  songs: Song[];
  language?: string | null;
}

function ArtistModal({
  artist,
  onClose,
  onRequireAuth,
}: {
  artist: Artist;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();
  const [songs, setSongs] = useState<Song[]>(artist.songs);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unmounted = false;
    setLoading(true);

    if (artist.id) {
      api.getArtistSongs(artist.id, 1)
        .then((res) => {
          if (unmounted) return;
          const raw = extractResults(res);
          const mapped = raw.map(mapApiSong).map(cleanSong).filter((s) => s.audioUrl);
          if (mapped.length > 0) {
            setSongs(mapped);
          }
          setLoading(false);
        })
        .catch(() => {
          if (unmounted) return;
          // Fallback with language
          fetchAllArtistSongs(artist.name, artist.language)
            .then((fetched: Song[]) => {
              if (!unmounted) {
                if (fetched.length > 0) setSongs(fetched);
                setLoading(false);
              }
            })
            .catch(() => {
              if (!unmounted) setLoading(false);
            });
        });
    } else {
      fetchAllArtistSongs(artist.name, artist.language)
        .then((fetched: Song[]) => {
          if (!unmounted) {
            if (fetched.length > 0) setSongs(fetched);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!unmounted) setLoading(false);
        });
    }

    return () => { unmounted = true; };
  }, [artist.id, artist.name]);

  return (
    <View style={modalStyles.container}>
      {artist.coverArt && (
        <Image
          source={{ uri: artist.coverArt }}
          style={modalStyles.backgroundImage}
          blurRadius={20}
          resizeMode="cover"
        />
      )}
      <View style={modalStyles.overlay} />

      <View style={modalStyles.content}>
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity delayPressIn={0} onPress={onClose} style={modalStyles.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={modalStyles.headerMeta}>
            <Text style={modalStyles.headerTitle} numberOfLines={1}>{artist.name}</Text>
            <Text style={modalStyles.headerSubtitle} numberOfLines={1}>
              Artist
            </Text>
          </View>

          {songs.length > 0 ? (
            <TouchableOpacity delayPressIn={0} onPress={() => playSong(songs[0], songs)} style={modalStyles.playBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="play" size={24} color="#000" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Large cover art */}
        {artist.coverArt ? (
          <View style={modalStyles.coverWrapper}>
            <Image source={{ uri: artist.coverArt }} style={[modalStyles.coverImage, { borderRadius: 80 }]} resizeMode="cover" />
          </View>
        ) : null}

        {/* Songs list */}
        <ScrollView style={modalStyles.songsScroll} contentContainerStyle={modalStyles.songsScrollContent}>
          <View style={{ paddingBottom: 60 }}>
            {songs.map((song) => (
              <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Helpers: group search results into structured objects ────────────────────
function groupIntoAlbums(songs: Song[]): Album[] {
  const map = new Map<string, Album>();
  for (const s of songs) {
    const title = s.album || s.movie || "";
    if (!title) continue;
    const key = title.toLowerCase().trim();
    if (!map.has(key)) {
      map.set(key, {
        id: s.albumId || "",
        title,
        coverArt: s.albumArt || "",
        songs: [],
        type: "movie",
        query: `${title} songs`,
      });
    }
    const album = map.get(key)!;
    if (!album.id && s.albumId) album.id = s.albumId;
    if (!album.coverArt && s.albumArt) album.coverArt = s.albumArt;
    const sTitleKey = s.title.toLowerCase().trim();
    if (!album.songs.some((existing) => existing.title.toLowerCase().trim() === sTitleKey)) {
      album.songs.push(s);
    }
  }
  return [...map.values()];
}

function groupIntoArtists(songs: Song[]): Artist[] {
  const map = new Map<string, Artist>();
  for (const s of songs) {
    const name = s.artist;
    if (!name) continue;
    const cleanName = name.split(",")[0]?.trim();
    if (!cleanName || cleanName.length < 2) continue;
    const key = cleanName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        id: s.artistId || "",
        name: cleanName,
        coverArt: s.albumArt || "",
        songs: [],
      });
    }
    const artist = map.get(key)!;
    if (!artist.id && s.artistId) artist.id = s.artistId;
    if (!artist.coverArt && s.albumArt) artist.coverArt = s.albumArt;
    artist.songs.push(s);
  }
  return [...map.values()];
}

function firstSuccessArray(promises: Promise<Song[] | null>[]): Promise<Song[] | null> {
  return new Promise((resolve) => {
    let completedCount = 0;
    let resolved = false;

    promises.forEach((p) => {
      p.then((val) => {
        if (val && val.length > 0 && !resolved) {
          resolved = true;
          resolve(val);
        }
      }).catch(() => {
        // ignore
      }).finally(() => {
        completedCount++;
        if (completedCount === promises.length && !resolved) {
          resolve(null);
        }
      });
    });
  });
}

async function searchInvidious(query: string): Promise<Song[]> {
  const INVIDIOUS_INSTANCES = [
    "https://iv.melmac.space",
    "https://invidious.flokinet.to",
    "https://invidious.privacydev.net",
    "https://invidious.nerdvpn.de",
    "https://invidious.slipfox.xyz",
    "https://inv.tux.pizza"
  ];

  const fetchPromises = INVIDIOUS_INSTANCES.map(async (instance) => {
    try {
      const res = await Promise.race([
        fetch(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            "Accept": "application/json"
          }
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
      ]);
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items) && items.length > 0) {
          return items.slice(0, 30).map((item: any) => ({
            id: `yt-${item.videoId}`,
            title: decodeHtml(item.title || "Unknown Title"),
            artist: decodeHtml(item.author || "YouTube"),
            duration: item.lengthSeconds || 0,
            albumArt: item.videoThumbnails?.[0]?.url || "",
            audioUrl: `youtube://${item.videoId}`,
            album: "YouTube Web",
            movie: "YouTube Web"
          }));
        }
      }
    } catch (err) {
      // Ignore
    }
    return null;
  });

  try {
    const results = await firstSuccessArray(fetchPromises);
    return results || [];
  } catch (err) {
    console.warn("[SearchPage] Invidious search failed:", err);
  }
  return [];
}

async function searchPiped(query: string): Promise<Song[]> {
  const PIPED_INSTANCES = [
    "https://pipedapi.adminforge.de",
    "https://pipedapi.projectsegfau.lt",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi-libre.kavin.rocks",
    "https://pipedapi.leptons.xyz",
    "https://api.looleh.xyz",
    "https://piapi.ggtyler.dev",
    "https://pipedapi.moomoo.me",
    "https://pipedapi.ox.am",
    "https://piped-api.garudalinux.org",
    "https://pipedapi.tokhmi.xyz"
  ];

  const fetchPromises = PIPED_INSTANCES.map(async (instance) => {
    try {
      const res = await Promise.race([
        fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            "Accept": "application/json"
          }
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
      ]);
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        if (items.length > 0) {
          return items.slice(0, 30).map((item: any) => ({
            id: `yt-${item.videoId}`,
            title: decodeHtml(item.title || "Unknown Title"),
            artist: decodeHtml(item.uploaderName || "YouTube"),
            duration: item.duration || 0,
            albumArt: item.thumbnail || "",
            audioUrl: `youtube://${item.videoId}`,
            album: "YouTube Web",
            movie: "YouTube Web"
          }));
        }
      }
    } catch (err) {
      // Ignore individual failures
    }
    return null;
  });

  try {
    const results = await firstSuccessArray(fetchPromises);
    if (results && results.length > 0) return results;
  } catch (err) {
    console.warn("[SearchPage] Parallel searchPiped failed:", err);
  }

  // Fallback to Invidious search
  console.log("[SearchPage] Piped search failed. Trying Invidious search...");
  return await searchInvidious(query);
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface SearchPageProps {
  onRequireAuth?: () => void;
}

function SearchPageComponent({ onRequireAuth }: SearchPageProps) {
  const [query, setQuery]             = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults]         = useState<Song[]>([]);
  const [loading, setLoading]         = useState(false);
  const [activeTab, setActiveTab]     = useState<"all" | "songs" | "albums" | "artists" | "youtube">("all");

  const [activeCategory, setActiveCategory] = useState<{ label: string; coverArt: string } | null>(null);
  const [categorySongs, setCategorySongs]   = useState<Song[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [activeLangAlbum, setActiveLangAlbum] = useState<string | null>(null);
  const [activeAlbum, setActiveAlbum]       = useState<Album | null>(null);
  const [activeArtist, setActiveArtist]     = useState<Artist | null>(null);
  const [autoArtistQuery, setAutoArtistQuery] = useState<string | null>(null);
  const [autoArtistLang, setAutoArtistLang]   = useState<string | null>(null);

  // Load and dynamically resolve generic stock category cover art with correct album arts
  const [categoryCovers, setCategoryCovers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    BROWSE_CATEGORIES.forEach((cat) => {
      const cache = getCategoryCache(cat.label);
      initial[cat.label] = cache.coverArt || cat.cover;
    });
    return initial;
  });

  useEffect(() => {
    let unmounted = false;
    const resolveCovers = async () => {
      for (const cat of BROWSE_CATEGORIES) {
        if (unmounted) break;
        const cache = getCategoryCache(cat.label);
        if (cache.coverArt) continue;

        try {
          const res = await api.searchSongs(cat.query, 1, 1);
          const raw = extractResults(res);
          if (raw.length > 0) {
            const mapped = mapApiSong(raw[0]);
            if (mapped.albumArt) {
              if (!unmounted) {
                setCategoryCovers((prev) => ({ ...prev, [cat.label]: mapped.albumArt! }));
              }
              saveCategoryCache(cat.label, [], mapped.albumArt!);
            }
          }
        } catch {
          // continue
        }
        await sleep(400);
      }
    };
    
    const timer = setTimeout(resolveCovers, 1500);
    return () => {
      unmounted = true;
      clearTimeout(timer);
    };
  }, []);

  // Debounce query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);
    return () => clearTimeout(handler);
  }, [query]);

  // Handle Search Queries
  useEffect(() => {
    const clean = debouncedQuery.trim();
    if (!clean) {
      setResults([]);
      setLoading(false);
      return;
    }

    // If it is just a language query, open the LanguageAlbumModal right away
    const langDetected = detectLanguageSearch(clean);
    if (langDetected) {
      setActiveLangAlbum(langDetected);
      setQuery("");
      return;
    }

    // Check if query looks like a person name (with optional language suffix)
    const personMatch = detectPersonSearchWithLang(clean);
    if (personMatch) {
      setAutoArtistQuery(personMatch.name);
      setAutoArtistLang(personMatch.language);
    } else {
      setAutoArtistQuery(null);
      setAutoArtistLang(null);
    }

    setLoading(true);
    // Search using the full original query (including language word) for best results
    api.searchSongs(clean, 1, 60)
      .then((res) => {
        const raw = extractResults(res);
        const songs = raw.map(mapApiSong).map(cleanSong).filter((s: Song) => s.audioUrl);
        setResults(songs);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("[SearchPage] JioSaavn search failed:", err);
        setResults([]);
        setLoading(false);
      });
  }, [debouncedQuery]);

  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
  };

  const handleCategorySelect = async (label: string, query: string, coverArt: string) => {
    const lang = detectLanguageSearch(label);
    if (lang) {
      setActiveLangAlbum(lang);
      return;
    }

    setActiveCategory({ label, coverArt });
    setCategorySongs([]);
    setCategoryLoading(true);

    const cache = getCategoryCache(label);
    if (cache.songs.length > 0) {
      setCategorySongs(cache.songs);
      setActiveCategory({ label, coverArt: cache.coverArt || coverArt });
      setCategoryLoading(false);
      return;
    }

    try {
      const extraQueries = LANGUAGE_EXTRA_QUERIES[label] || [];
      const allQueries   = [query, ...extraQueries];
      const seen         = new Set<string>();
      const allSongs: Song[] = [];

      for (const q of allQueries) {
        for (let page = 1; page <= 4; page++) {
          try {
            if (page > 1) await new Promise(r => setTimeout(r, 200));
            const res     = await api.searchSongs(q, page, 50);
            const items   = extractResults(res);
            const fetched = items.map(mapApiSong).map(cleanSong).filter((s: Song) => s.audioUrl);
            for (const s of fetched) {
              if (s.id && !seen.has(s.id)) {
                seen.add(s.id);
                allSongs.push(s);
              }
            }
            if (items.length < 50) break;
          } catch { break; }
        }
      }

      const resolvedCover = allSongs[0]?.albumArt || coverArt;
      setCategorySongs(allSongs);
      setActiveCategory({ label, coverArt: resolvedCover });
      saveCategoryCache(label, allSongs, resolvedCover);
      
      setCategoryCovers((prev) => ({ ...prev, [label]: resolvedCover }));
    } catch (err) {
      console.warn("[SearchPage] Failed to load category songs:", err);
    } finally {
      setCategoryLoading(false);
    }
  };

  const songsResult = results;
  const albumsResult = groupIntoAlbums(results);
  const artistsResult = groupIntoArtists(results);
  const jioSongs = results;
  const ytSongs: Song[] = [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={styles.headerTitle}>Search</Text>
          <TouchableOpacity delayPressIn={0} onPress={() => DeviceEventEmitter.emit("OPEN_EQUALIZER_MODAL")} activeOpacity={0.7} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="equalizer" size={22} color="#1DB954" />
          </TouchableOpacity>
        </View>

        {/* Search TextInput Input bar */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
          <TextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              if (!text.trim()) {
                setDebouncedQuery("");
                setResults([]);
                setActiveCategory(null);
                setActiveArtist(null);
                setActiveAlbum(null);
              }
            }}
            placeholder="Artists, songs, or movie soundtracks..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            style={styles.textInput}
            clearButtonMode="while-editing"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity
              delayPressIn={0}
              onPress={() => {
                setQuery("");
                setDebouncedQuery("");
                setResults([]);
                setActiveCategory(null);
                setActiveArtist(null);
                setActiveAlbum(null);
              }}
              style={{ padding: 4 }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>

        {/* (Filter tabs hidden because YouTube is disabled) */}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {query.trim().length === 0 ? (
          // Category Grid View (when query is empty)
          <View>
            <Text style={styles.sectionTitle}>Browse Categories</Text>
            <View style={styles.grid}>
              {BROWSE_CATEGORIES.map((cat) => (
                <View key={cat.label} style={styles.gridCell}>
                  <CategoryCard
                    label={cat.label}
                    query={cat.query}
                    coverArt={categoryCovers[cat.label] || cat.cover}
                    onSelect={handleCategorySelect}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : loading ? (
          // Loader Spinner
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#1DB954" />
            <Text style={styles.loadingText}>Searching Medley…</Text>
          </View>
        ) : results.length === 0 ? (
          // Empty state
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="magnify-close" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>Check your spelling, or search a different query.</Text>
          </View>
        ) : (
          // Results list view
          <View style={{ paddingBottom: 60 }}>
            {/* Artist/Person Album Card — shown when query looks like a name */}
            {autoArtistQuery && jioSongs.length > 0 && activeTab === "all" ? (
              <TouchableOpacity
                delayPressIn={0}
                activeOpacity={0.8}
                onPress={() => {
                  const coverArt = jioSongs[0]?.albumArt || "";
                  setActiveArtist({
                    name: autoArtistQuery,
                    coverArt,
                    songs: jioSongs,
                    language: autoArtistLang,
                  });
                }}
                style={styles.artistAlbumCard}
              >
                <View style={styles.artistAlbumCardLeft}>
                  {jioSongs[0]?.albumArt ? (
                    <Image source={{ uri: jioSongs[0].albumArt }} style={styles.artistAlbumCardCover} />
                  ) : (
                    <View style={[styles.artistAlbumCardCover, styles.artistAlbumCardCoverPlaceholder]}>
                      <MaterialCommunityIcons name="account-music" size={28} color="rgba(255,255,255,0.3)" />
                    </View>
                  )}
                </View>
                <View style={styles.artistAlbumCardMeta}>
                  <Text style={styles.artistAlbumCardLabel}>
                    {autoArtistLang
                      ? `${autoArtistLang.charAt(0).toUpperCase() + autoArtistLang.slice(1)} Album`
                      : "Album"}
                  </Text>
                  <Text style={styles.artistAlbumCardName} numberOfLines={1}>{autoArtistQuery}</Text>
                  <Text style={styles.artistAlbumCardSub}>
                    {autoArtistLang
                      ? `See all ${autoArtistLang} songs →`
                      : "See all songs →"}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color="#1DB954" />
              </TouchableOpacity>
            ) : null}
            {/* All / Albums — Elevated to top for fast movie/album access */}
            {(activeTab === "all" || activeTab === "albums") && albumsResult.length > 0 ? (
              <View style={styles.resultSection}>
                {activeTab === "all" && <Text style={styles.sectionSubHeader}>Albums / Movies</Text>}
                {albumsResult.slice(0, activeTab === "all" ? 6 : undefined).map((album) => (
                  <TouchableOpacity delayPressIn={0} key={album.title} onPress={() => setActiveAlbum(album)} style={styles.albumRowItem} activeOpacity={0.7}>
                    {album.coverArt ? (
                      <Image source={{ uri: album.coverArt }} style={styles.albumCoverImage} />
                    ) : (
                      <View style={[styles.albumCoverImage, styles.albumCoverPlaceholder]}>
                        <MaterialCommunityIcons name="disc" size={20} color="rgba(255,255,255,0.2)" />
                      </View>
                    )}
                    <View style={styles.albumMeta}>
                      <Text style={styles.albumTitleText} numberOfLines={1}>{album.title}</Text>
                      <Text style={styles.albumSubtitleText}>{album.songs.length} songs</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* All - JioSaavn Songs */}
            {activeTab === "all" && jioSongs.length > 0 ? (
              <View style={styles.resultSection}>
                <Text style={styles.sectionSubHeader}>Songs</Text>
                {jioSongs.slice(0, 30).map((song) => (
                  <SongRow key={song.id} song={song} queue={jioSongs} onRequireAuth={handleRequireAuth} />
                ))}
              </View>
            ) : null}

            {/* All / Artists */}
            {(activeTab === "all" || activeTab === "artists") && artistsResult.length > 0 ? (
              <View style={styles.resultSection}>
                {activeTab === "all" && <Text style={styles.sectionSubHeader}>Artists</Text>}
                {artistsResult.slice(0, activeTab === "all" ? 6 : undefined).map((artist) => (
                  <TouchableOpacity delayPressIn={0} key={artist.name} onPress={() => setActiveArtist(artist)} style={styles.albumRowItem} activeOpacity={0.7}>
                    {artist.coverArt ? (
                      <Image source={{ uri: artist.coverArt }} style={[styles.albumCoverImage, { borderRadius: 22 }]} />
                    ) : (
                      <View style={[styles.albumCoverImage, styles.albumCoverPlaceholder, { borderRadius: 22 }]}>
                        <MaterialCommunityIcons name="account" size={20} color="rgba(255,255,255,0.2)" />
                      </View>
                    )}
                    <View style={styles.albumMeta}>
                      <Text style={styles.albumTitleText} numberOfLines={1}>{artist.name}</Text>
                      <Text style={styles.albumSubtitleText}>Artist profile</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Sub modals overlays */}
      {activeCategory ? (
        <CategorySongModal
          label={activeCategory.label}
          songs={categorySongs}
          coverArt={activeCategory.coverArt}
          loading={categoryLoading}
          onClose={() => setActiveCategory(null)}
          onRequireAuth={handleRequireAuth}
        />
      ) : null}

      {activeLangAlbum ? (
        <LanguageAlbumModal
          language={activeLangAlbum}
          onClose={() => setActiveLangAlbum(null)}
          onRequireAuth={handleRequireAuth}
        />
      ) : null}

      {activeAlbum ? (
        <AlbumModal
          album={activeAlbum}
          onClose={() => setActiveAlbum(null)}
          onRequireAuth={handleRequireAuth}
        />
      ) : null}

      {activeArtist ? (
        <ArtistModal
          artist={activeArtist}
          onClose={() => setActiveArtist(null)}
          onRequireAuth={handleRequireAuth}
        />
      ) : null}


      
    </View>
  );
}

// ─── Native Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  artistAlbumCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.25)",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
  },
  artistAlbumCardLeft: {
    marginRight: 14,
  },
  artistAlbumCardCover: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  artistAlbumCardCoverPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  artistAlbumCardMeta: {
    flex: 1,
  },
  artistAlbumCardLabel: {
    fontSize: 10,
    color: "#1DB954",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  artistAlbumCardName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  artistAlbumCardSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
    paddingHorizontal: 16,
    backgroundColor: "#121212",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    marginBottom: 12,
  },
  textInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
  },
  filterTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  filterTabBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  activeFilterTabBtn: {
    backgroundColor: "#1DB954",
  },
  filterTabText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.5)",
  },
  activeFilterTabText: {
    color: "#000",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridCell: {
    width: "48%",
    marginBottom: 16,
  },
  // Category Card Styles
  categoryBtn: {
    width: "100%",
  },
  categoryCoverWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  categoryCover: {
    width: "100%",
    height: "100%",
  },
  categoryCoverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  categoryPlayOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    marginTop: 8,
  },
  categorySongCount: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.8)",
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  resultSection: {
    marginBottom: 20,
  },
  sectionSubHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    paddingBottom: 4,
  },
  albumRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  albumCoverImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  albumCoverPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  albumMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  albumTitleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  albumSubtitleText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
});

const modalStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0d0d0d",
    zIndex: 100,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13, 13, 13, 0.85)",
  },
  content: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 50,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerMeta: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  coverWrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  coverImage: {
    width: 160,
    height: 160,
    borderRadius: 16,
  },
  coverPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  songsScroll: {
    flex: 1,
  },
  songsScrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 80,
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    marginTop: 10,
  },
  fetchingMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 8,
  },
  fetchingMoreText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
});

export default React.memo(SearchPageComponent);