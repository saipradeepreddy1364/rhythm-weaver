import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Modal, ActivityIndicator, Dimensions, Platform } from 'react-native'
import React, { useEffect, useState, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Song, mapApiSong } from "../data/songs";
import { api, extractResults } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLibrary, Playlist } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { SongRow } from "../components/SongRow";
import { useNavigation } from "@react-navigation/native";
import { MiniPlayer } from "../components/MiniPlayer";
import { localStorage, sessionStorage } from "../lib/storage";

// ─── Dynamic current year ─────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
const PREV_YEAR    = CURRENT_YEAR - 1;

// ─── Seed helpers ─────────────────────────────────────────────────────────────
function todaysSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function oneMinSeed(): number {
  const d = new Date();
  return (
    d.getFullYear() * 100000000 +
    (d.getMonth() + 1) * 1000000 +
    d.getDate() * 10000 +
    d.getHours() * 100 +
    d.getMinutes()
  );
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickQuery(pool: string[], sectionOffset: number): string {
  return pool[(todaysSeed() + sectionOffset) % pool.length];
}

// ─── Query pools ──────────────────────────────────────────────────────────────
const HINDI_QUERIES = [
  `trending hindi songs ${CURRENT_YEAR}`,
  `top hindi hits ${CURRENT_YEAR}`,
  `best new hindi songs ${CURRENT_YEAR}`,
  `viral hindi songs ${CURRENT_YEAR}`,
  `popular hindi songs ${CURRENT_YEAR}`,
  `latest hindi film songs ${CURRENT_YEAR}`,
  `hindi chartbusters ${CURRENT_YEAR}`,
  `super hit hindi songs ${CURRENT_YEAR}`,
];

const TELUGU_QUERIES = [
  `trending telugu songs ${CURRENT_YEAR}`,
  `top tollywood hits ${CURRENT_YEAR}`,
  `best telugu songs ${CURRENT_YEAR}`,
  `new telugu songs ${CURRENT_YEAR}`,
  `viral telugu songs ${CURRENT_YEAR}`,
  `popular telugu film songs ${CURRENT_YEAR}`,
  `telugu chartbusters ${CURRENT_YEAR}`,
  `super hit telugu songs ${CURRENT_YEAR}`,
];

const TAMIL_QUERIES = [
  `trending tamil songs ${CURRENT_YEAR}`,
  `top kollywood hits ${CURRENT_YEAR}`,
  `best tamil songs ${CURRENT_YEAR}`,
  `new tamil songs ${CURRENT_YEAR}`,
  `viral tamil songs ${CURRENT_YEAR}`,
  `popular tamil film songs ${CURRENT_YEAR}`,
  `tamil chartbusters ${CURRENT_YEAR}`,
  `super hit tamil songs ${CURRENT_YEAR}`,
];

const BOLLYWOOD_QUERIES = [
  `latest bollywood hits ${CURRENT_YEAR}`,
  `new bollywood songs ${CURRENT_YEAR}`,
  `bollywood blockbuster ${CURRENT_YEAR}`,
  `hit bollywood dance songs ${CURRENT_YEAR}`,
  `bollywood romantic ${CURRENT_YEAR}`,
  `bollywood party songs ${CURRENT_YEAR}`,
  `bollywood new release ${CURRENT_YEAR}`,
  `top bollywood songs ${CURRENT_YEAR}`,
];

const PUNJABI_QUERIES = [
  `top punjabi songs ${CURRENT_YEAR}`,
  `trending punjabi ${CURRENT_YEAR}`,
  `new punjabi hits ${CURRENT_YEAR}`,
  `best punjabi songs ${CURRENT_YEAR}`,
  `viral punjabi songs ${CURRENT_YEAR}`,
  `popular punjabi ${CURRENT_YEAR}`,
  `punjabi chartbusters ${CURRENT_YEAR}`,
  `super hit punjabi songs ${CURRENT_YEAR}`,
];

const ROMANTIC_QUERIES = [
  `hindi romantic songs ${CURRENT_YEAR}`,
  `love songs bollywood ${CURRENT_YEAR}`,
  "best romantic hindi songs",
  "heart touching songs hindi",
  "sad romantic songs hindi",
  "romantic duets bollywood",
  `romantic telugu songs ${CURRENT_YEAR}`,
  "best love songs indian",
];

const PARTY_QUERIES = [
  `party songs hindi ${CURRENT_YEAR}`,
  `bollywood dance hits ${CURRENT_YEAR}`,
  "high energy hindi songs",
  `dj remix bollywood ${CURRENT_YEAR}`,
  "club songs bollywood",
  "dance floor hits india",
  "party anthems hindi",
  `bollywood bangers ${CURRENT_YEAR}`,
];

const RETRO_QUERIES = [
  "old hindi classic songs",
  "90s bollywood hits",
  "80s hindi songs superhit",
  "retro bollywood classics",
  "evergreen hindi songs",
  "golden era bollywood",
  "vintage hindi film songs",
  "old is gold hindi songs",
];

const KANNADA_QUERIES = [
  `trending kannada songs ${CURRENT_YEAR}`,
  `top sandalwood hits ${CURRENT_YEAR}`,
  `best kannada songs ${CURRENT_YEAR}`,
  `new kannada songs ${CURRENT_YEAR}`,
  "popular kannada film songs",
  `viral kannada songs ${CURRENT_YEAR}`,
  `kannada chartbusters ${CURRENT_YEAR}`,
  "super hit kannada songs",
];

const MALAYALAM_QUERIES = [
  `trending malayalam songs ${CURRENT_YEAR}`,
  `top mollywood hits ${CURRENT_YEAR}`,
  `best malayalam songs ${CURRENT_YEAR}`,
  `new malayalam songs ${CURRENT_YEAR}`,
  "popular malayalam film songs",
  `viral malayalam songs ${CURRENT_YEAR}`,
  `malayalam chartbusters ${CURRENT_YEAR}`,
  "super hit malayalam songs",
];

const HINDI_YEAR_QUERIES = [
  `new hindi film songs ${CURRENT_YEAR}`,
  `hindi movie songs ${CURRENT_YEAR}`,
  `bollywood songs ${CURRENT_YEAR}`,
  `superhit hindi ${CURRENT_YEAR}`,
  `hindi blockbuster ${CURRENT_YEAR}`,
  `latest hindi songs ${CURRENT_YEAR}`,
  `hindi new release ${CURRENT_YEAR}`,
  `top hindi film ${CURRENT_YEAR}`,
];

const TELUGU_YEAR_QUERIES = [
  `new telugu film songs ${CURRENT_YEAR}`,
  `tollywood songs ${CURRENT_YEAR}`,
  `telugu movie songs ${CURRENT_YEAR}`,
  `superhit telugu ${CURRENT_YEAR}`,
  `telugu blockbuster ${CURRENT_YEAR}`,
  `latest telugu songs ${CURRENT_YEAR}`,
  `telugu new release ${CURRENT_YEAR}`,
  `top telugu film ${CURRENT_YEAR}`,
];

const FILM_DISCOVERY_QUERIES_POOL = [
  `new hindi film songs ${CURRENT_YEAR}`,
  `latest bollywood movie ${CURRENT_YEAR}`,
  `hindi movie release ${CURRENT_YEAR}`,
  `bollywood new movie songs ${CURRENT_YEAR}`,
  `hindi film songs ${PREV_YEAR} ${CURRENT_YEAR}`,
  `bollywood blockbuster songs ${CURRENT_YEAR}`,
  `new bollywood film ${CURRENT_YEAR}`,
  `hindi movie soundtrack ${CURRENT_YEAR}`,
  `bollywood superhit movie ${CURRENT_YEAR}`,
  `hindi action movie songs ${CURRENT_YEAR}`,
  `hindi romantic movie ${CURRENT_YEAR}`,
  `bollywood drama songs ${CURRENT_YEAR}`,
  `new telugu film songs ${CURRENT_YEAR}`,
  `latest tollywood movie ${CURRENT_YEAR}`,
  `telugu movie release ${CURRENT_YEAR}`,
  `tollywood new movie songs ${CURRENT_YEAR}`,
  `telugu film songs ${PREV_YEAR} ${CURRENT_YEAR}`,
  `telugu blockbuster movie ${CURRENT_YEAR}`,
  `new tollywood film ${CURRENT_YEAR}`,
  `telugu movie soundtrack ${CURRENT_YEAR}`,
  `tollywood superhit movie ${CURRENT_YEAR}`,
  `telugu action movie songs ${CURRENT_YEAR}`,
  `telugu romantic movie ${CURRENT_YEAR}`,
  `tollywood drama songs ${CURRENT_YEAR}`,
  `new tamil film songs ${CURRENT_YEAR}`,
  `kollywood new movie songs ${CURRENT_YEAR}`,
  `tamil movie release ${CURRENT_YEAR}`,
  `tamil blockbuster ${CURRENT_YEAR}`,
  `new kannada film songs ${CURRENT_YEAR}`,
  `sandalwood new movie songs ${CURRENT_YEAR}`,
  `new malayalam film songs ${CURRENT_YEAR}`,
  `mollywood new movie songs ${CURRENT_YEAR}`,
];

const ARTIST_DISCOVERY_QUERIES = [
  "arijit singh songs",
  "shreya ghoshal songs",
  "sonu nigam songs",
  "ar rahman hit songs",
  "sid sriram songs",
  "anirudh ravichander songs",
  "neha kakkar songs",
  "atif aslam songs",
  "diljit dosanjh songs",
  "sp balasubrahmanyam songs",
  "kishore kumar songs",
  "lata mangeshkar songs",
  "armaan malik songs",
  "darshan raval songs",
  "b praak songs",
  "udit narayan songs",
  "kumar sanu songs",
  "asha bhosle songs",
  "sunidhi chauhan songs",
  "badshah songs",
  "guru randhawa songs",
];

const PRELOAD_TARGETS = [
  {
    key: "romantic",
    queries: [
      "hindi romantic songs 2025", "love songs bollywood 2024", "best romantic hindi",
      "heart touching songs hindi", "sad romantic songs hindi", "romantic duets bollywood",
      "romantic telugu songs 2025", "best love songs indian",
    ],
  },
  {
    key: "party",
    queries: [
      "party songs hindi 2025", "bollywood dance hits 2024", "high energy hindi songs",
      "dj remix bollywood 2025", "club songs bollywood", "dance floor hits india",
      "party anthems hindi", "bollywood bangers 2024",
    ],
  },
  {
    key: "retro",
    queries: [
      "old hindi classic songs", "90s bollywood hits", "80s hindi songs superhit",
      "retro bollywood classics", "evergreen hindi songs", "golden era bollywood",
      "vintage hindi film songs", "old is gold hindi songs",
    ],
  },
  {
    key: "kannada",
    queries: [
      "trending kannada songs 2025", "sandalwood songs 2024", "kannada hits 2023",
      "kannada film songs 2022", "kannada songs 2021", "kannada songs 2020",
      "kannada romantic songs", "kannada folk songs", "kannada mass songs",
      "kannada songs 2019", "kannada melody songs", "sandalwood 2018 hits",
      "kannada love songs", "kannada 2017 songs",
    ],
  },
  {
    key: "malayalam",
    queries: [
      "trending malayalam songs 2025", "mollywood songs 2024", "malayalam hits 2023",
      "malayalam film songs 2022", "malayalam songs 2021", "malayalam songs 2020",
      "malayalam romantic songs", "malayalam folk songs", "malayalam sad songs",
      "malayalam songs 2019", "malayalam melody songs", "mollywood 2018 songs",
      "malayalam love songs", "malayalam devotional songs",
    ],
  },
  {
    key: "punjabi",
    queries: [
      "top punjabi songs 2025", "punjabi hits 2024", "punjabi songs 2023",
      "punjabi songs 2022", "punjabi chartbusters 2021", "punjabi songs 2020",
      "punjabi love songs", "punjabi folk songs", "punjabi bhangra songs",
      "punjabi songs 2019", "punjabi sad songs", "punjabi remix songs",
    ],
  },
  {
    key: "anirudh",
    queries: [
      "anirudh ravichander songs", "anirudh hits", "anirudh latest songs 2025",
      "anirudh best songs", "anirudh ravichander tamil", "anirudh telugu songs",
      "anirudh 2024 songs", "anirudh 2023 songs", "anirudh 2022 songs",
    ],
  },
  {
    key: "arijit singh",
    queries: [
      "arijit singh songs", "arijit singh hits 2024", "arijit singh bollywood",
      "arijit singh romantic", "arijit singh latest songs 2025",
      "arijit singh 2023 songs", "arijit singh 2022 songs", "arijit singh sad songs",
    ],
  },
  {
    key: "ar rahman",
    queries: [
      "ar rahman hit songs", "ar rahman tamil songs", "ar rahman hindi songs",
      "ar rahman best songs", "ar rahman oscar songs",
      "ar rahman 2024 songs", "ar rahman 2023 songs",
    ],
  },
  {
    key: "sid sriram",
    queries: [
      "sid sriram songs", "sid sriram telugu", "sid sriram tamil",
      "sid sriram latest 2025", "sid sriram hits", "sid sriram 2024",
    ],
  },
  {
    key: "shreya ghoshal",
    queries: [
      "shreya ghoshal songs", "shreya ghoshal hits", "shreya ghoshal latest 2025",
      "shreya ghoshal bollywood", "shreya ghoshal telugu", "shreya ghoshal tamil",
    ],
  },
  {
    key: "sp balasubrahmanyam",
    queries: [
      "sp balasubrahmanyam songs", "spb telugu hits", "spb tamil songs",
      "sp balasubrahmanyam hindi songs", "spb best songs",
    ],
  },
  {
    key: "thaman",
    queries: [
      "ss thaman songs", "thaman telugu hits 2025", "thaman latest songs",
      "thaman 2024 songs", "thaman 2023 songs",
    ],
  },
  {
    key: "devi sri prasad",
    queries: [
      "devi sri prasad songs", "dsp telugu hits", "dsp latest songs 2025",
      "dsp 2024 songs", "dsp 2023 songs",
    ],
  },
];

const PRELOAD_SESSION_KEY = (k: string) => `preload_songs_v2_${k}`;
const PRELOAD_MAX_PAGES   = 16;
const PRELOAD_BATCH_DELAY = 300;

export function getPreloadedSongs(key: string): Song[] {
  try {
    const raw = sessionStorage.getItem(PRELOAD_SESSION_KEY(key.toLowerCase()));
    if (!raw) return [];
    return JSON.parse(raw) as Song[];
  } catch { return []; }
}

let _preloadStarted = false;
function startBackgroundPreload() {
  if (_preloadStarted) return;
  _preloadStarted = true;

  setTimeout(async () => {
    for (const target of PRELOAD_TARGETS) {
      const sk = PRELOAD_SESSION_KEY(target.key);
      if (sessionStorage.getItem(sk)) continue;

      const seen = new Set<string>();
      const all: Song[] = [];

      for (const query of target.queries) {
        for (let page = 1; page <= PRELOAD_MAX_PAGES; page++) {
          try {
            if (page > 1) await new Promise(r => setTimeout(r, PRELOAD_BATCH_DELAY));
            const res   = await api.searchSongs(query, page, 50);
            const items = extractResults(res);
            if (items.length === 0) break;
            const songs = items.map(mapApiSong).map((s: Song) => ({
              ...s,
              title:  decodeHtml(s.title  || ""),
              artist: decodeHtml((s as Song & { artist?: string }).artist || ""),
              album:  decodeHtml((s as Song & { album?: string }).album   || ""),
              movie:  decodeHtml((s as Song & { movie?: string }).movie   || ""),
            } as Song)).filter((s: Song) => Boolean(s.audioUrl));
            let added = 0;
            for (const s of songs) {
              if (s.id && !seen.has(s.id)) { seen.add(s.id); all.push(s); added++; }
            }
            if (items.length < 50 || added === 0) break;
          } catch { break; }
        }
        await new Promise(r => setTimeout(r, 200));
      }

      if (all.length > 0) {
        try { sessionStorage.setItem(sk, JSON.stringify(all)); } catch { /* quota */ }
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }, 2000);
}

startBackgroundPreload();

// ─── Section definitions ──────────────────────────────────────────────────────
const SECTION_DEFS = [
  { title: `Hindi Hits ${CURRENT_YEAR}`,  pool: HINDI_YEAR_QUERIES,  seed: 11 },
  { title: `Telugu Hits ${CURRENT_YEAR}`, pool: TELUGU_YEAR_QUERIES, seed: 12 },
  { title: "Trending Hindi",               pool: HINDI_QUERIES,       seed: 1  },
  { title: "Trending Telugu",              pool: TELUGU_QUERIES,      seed: 2  },
  { title: "Trending Tamil",               pool: TAMIL_QUERIES,       seed: 3  },
  { title: "Latest Bollywood",             pool: BOLLYWOOD_QUERIES,   seed: 4  },
  { title: "Top Punjabi",                  pool: PUNJABI_QUERIES,     seed: 5  },
  { title: "Romantic Vibes",               pool: ROMANTIC_QUERIES,    seed: 6  },
  { title: "Party Hits",                   pool: PARTY_QUERIES,       seed: 7  },
  { title: "Old is Gold",                  pool: RETRO_QUERIES,       seed: 8  },
  { title: "Trending Kannada",             pool: KANNADA_QUERIES,     seed: 9  },
  { title: "Trending Malayalam",           pool: MALAYALAM_QUERIES,   seed: 10 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface SectionData {
  title: string;
  songs: Song[];
}

interface AlbumData {
  title:        string;
  coverArt:     string;
  songs:        Song[];
  type:         string;
  query?:       string;
  fullyLoaded?: boolean;
}

interface HomePageProps {
  onRequireAuth?: () => void;
}

type RawSong = Song & { primaryArtists?: string; singers?: string };

function decodeHtml(str: string): string {
  if (!str) return str;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function getArtistName(song: Song): string {
  const raw   = song as RawSong;
  const field =
    raw.primaryArtists ||
    raw.singers ||
    (song as Song & { artist?: string }).artist ||
    "";
  const name = field.split(",")[0] || "";
  return decodeHtml(name.trim());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

async function fetchSection(query: string, limit = 50): Promise<Song[]> {
  try {
    const res = await api.searchSongs(query, 1, limit);
    const raw = extractResults(res);
    return raw
      .map(mapApiSong)
      .map(cleanSong)
      .filter((s) => Boolean(s.audioUrl));
  } catch {
    return [];
  }
}

async function fetchLanguageSongs(queries: string[], targetPerQuery = 50): Promise<Song[]> {
  const seen = new Set<string>();
  const all: Song[] = [];
  const results = await Promise.allSettled(queries.map((q) => fetchSection(q, targetPerQuery)));
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const s of r.value) {
      if (s.id && !seen.has(s.id)) {
        seen.add(s.id);
        all.push(s);
      }
    }
  }
  return all;
}

function dedup(songs: Song[], seen: Set<string>): Song[] {
  const out: Song[] = [];
  for (const s of songs) {
    if (!s.id) continue;
    const titleKey = (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
    if (!seen.has(s.id) && !seen.has(titleKey)) {
      seen.add(s.id);
      seen.add(titleKey);
      out.push(s);
    }
  }
  return out;
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
        const titleKey = (s.title || "").toLowerCase().trim() + "|" + (s.artist || "").toLowerCase().trim();
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

async function fetchAllArtistSongs(artistName: string): Promise<Song[]> {
  const queries = [
    `${artistName} songs`, `${artistName} hits`, `${artistName} movie songs`,
    `${artistName} romantic songs`, `${artistName} album songs`,
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

async function fetchAllMovieSongs(query: string, albumTitle: string): Promise<Song[]> {
  const cleanTitle = albumTitle.replace(/[^a-zA-Z0-9\s]/g, "").trim().toLowerCase();
  const rawSongs = await fetchAllPages(query, 12);
  return rawSongs.filter((song) => {
    const sAlbum = (song.album || song.movie || "").replace(/[^a-zA-Z0-9\s]/g, "").trim().toLowerCase();
    return sAlbum.includes(cleanTitle) || cleanTitle.includes(sAlbum);
  });
}

async function fetchCurrentYearFilmAlbums(unmountedRef: React.RefObject<boolean>): Promise<AlbumData[]> {
  const seen = new Set<string>();
  const albums: AlbumData[] = [];
  const queries = seededShuffle(FILM_DISCOVERY_QUERIES_POOL, todaysSeed()).slice(0, 8);

  const results = await Promise.allSettled(
    queries.map((q) =>
      api.searchSongs(q, 1, 20).then((res) =>
        extractResults(res).map(mapApiSong).map(cleanSong).filter((s) => Boolean(s.audioUrl))
      )
    )
  );

  if (unmountedRef.current) return [];

  const albumMap = new Map<string, { songs: Song[]; coverArt: string }>();

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const song of r.value) {
      const title = song.album || song.movie || "";
      if (!title || title.length < 2) continue;
      const key = title.toLowerCase().trim();
      if (!albumMap.has(key)) albumMap.set(key, { songs: [], coverArt: "" });
      const entry = albumMap.get(key)!;
      if (!entry.coverArt && song.albumArt) entry.coverArt = song.albumArt;
      if (song.id) {
        const titleKey = (song.title || "").toLowerCase().trim() + "|" + (song.artist || "").toLowerCase().trim();
        if (!seen.has(song.id) && !seen.has(titleKey)) {
          seen.add(song.id);
          seen.add(titleKey);
          entry.songs.push(song);
        }
      }
    }
  }

  const sorted = [...albumMap.entries()]
    .filter(([, v]) => v.songs.length >= 3)
    .sort((a, b) => b[1].songs.length - a[1].songs.length);

  for (const [title, { songs, coverArt }] of sorted) {
    albums.push({
      title,
      coverArt,
      songs,
      type: "movie",
      query: `${title} movie songs`,
      fullyLoaded: false,
    });
  }

  return albums.slice(0, 25);
}

async function loadArtistAlbums(
  unmountedRef: React.RefObject<boolean>,
  onArtistUpdated: (album: AlbumData) => void
): Promise<void> {
  const artistMap = new Map<string, { songs: Song[]; coverArt: string }>();
  const songSeen  = new Set<string>();

  // Slice popular artists using today's seed to keep it fresh but light on boot
  const queries = seededShuffle(ARTIST_DISCOVERY_QUERIES, todaysSeed()).slice(0, 8);

  const discoveryResults = await Promise.allSettled(
    queries.map((q) =>
      api.searchSongs(q, 1, 20).then((res) =>
        extractResults(res).map(mapApiSong).map(cleanSong).filter((s) => Boolean(s.audioUrl))
      )
    )
  );

  if (unmountedRef.current) return;

  for (const result of discoveryResults) {
    if (result.status !== "fulfilled") continue;
    for (const song of result.value) {
      const name = getArtistName(song);
      if (!name || name.length < 2) continue;
      if (!artistMap.has(name)) artistMap.set(name, { songs: [], coverArt: "" });
      const entry = artistMap.get(name)!;
      if (!entry.coverArt && song.albumArt) entry.coverArt = song.albumArt;
      if (song.id) {
        const titleKey = (song.title || "").toLowerCase().trim() + "|" + (song.artist || "").toLowerCase().trim();
        if (!songSeen.has(song.id) && !songSeen.has(titleKey)) {
          songSeen.add(song.id);
          songSeen.add(titleKey);
          entry.songs.push(song);
        }
      }
    }
  }

  if (unmountedRef.current) return;

  const topArtists = [...artistMap.entries()]
    .filter(([, v]) => v.songs.length >= 2)
    .sort((a, b) => b[1].songs.length - a[1].songs.length)
    .slice(0, 25);

  for (const [name, { songs, coverArt }] of topArtists) {
    if (unmountedRef.current) return;
    onArtistUpdated({
      title:       name,
      coverArt,
      songs,
      type:        "artist",
      query:       `${name} songs`,
      fullyLoaded: false,
    });
  }

  const BATCH = 3;
  for (let i = 0; i < topArtists.length; i += BATCH) {
    if (unmountedRef.current) return;

    const batch = topArtists.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(([name]) => fetchAllArtistSongs(name))
    );

    for (let j = 0; j < batch.length; j++) {
      if (unmountedRef.current) return;
      const [name, { songs: stubSongs, coverArt }] = batch[j];
      const result = results[j];
      const fullSongs =
        result.status === "fulfilled" && result.value.length > 0
          ? result.value
          : stubSongs;

      onArtistUpdated({
        title:       name,
        coverArt:    fullSongs[0]?.albumArt || coverArt,
        songs:       fullSongs,
        type:        "artist",
        query:       `${name} songs`,
        fullyLoaded: true,
      });
    }

    if (i + BATCH < topArtists.length) await sleep(100);
  }
}

// ─── Album Detail Modal ───────────────────────────────────────────────────────
function AlbumModal({
  album,
  albumType,
  albumQuery,
  onClose,
  onRequireAuth,
}: {
  album:         AlbumData;
  albumType:     string;
  albumQuery:    string;
  onClose:       () => void;
  onRequireAuth: () => void;
}) {
  const { playSong }                  = usePlayer();
  const { isAlbumLiked, toggleLikeAlbum } = useLibrary();

  const isLiked = isAlbumLiked(album);

  const handleLikePress = async () => {
    await toggleLikeAlbum({
      ...album,
      songs,
      fullyLoaded: !loadingMore
    });
  };

  const [songs, setSongs]             = useState<Song[]>(() => {
    const seen = new Set<string>();
    return album.songs.filter(s => {
      const tKey = s.title.toLowerCase().trim();
      if (seen.has(tKey)) return false;
      seen.add(tKey);
      return true;
    });
  });
  const [loadingMore, setLoadingMore] = useState(!album.fullyLoaded);

  useEffect(() => {
    if (album.fullyLoaded) {
      const seen = new Set<string>();
      const dedupped = album.songs.filter(s => {
        const tKey = s.title.toLowerCase().trim();
        if (seen.has(tKey)) return false;
        seen.add(tKey);
        return true;
      });
      setSongs(dedupped);
      setLoadingMore(false);
      return;
    }

    const controller = new AbortController();
    setLoadingMore(true);

    if (albumType === "artist" || albumType === "hero") {
      const name = album.title
        .replace(/ Hits$/i, "")
        .replace(/ Classics$/i, "")
        .replace(/ Songs$/i, "")
        .trim();
      const queries = [
        `${name} songs`, `${name} all songs`, `${name} hit songs`,
        `${name} best songs`, `${name} latest songs`, `${name} popular songs`,
        `${name} film songs`, `${name} bollywood songs`, `${name} playback songs`,
        `${name} new songs ${new Date().getFullYear()}`,
        `${name} songs collection`, `${name} superhit songs`,
        `${name} melody songs`, `${name} romantic songs`, `${name} sad songs`,
      ];
      const seenIds = new Set<string>();
      const seenTitles = new Set<string>();
      const initialDedupped: Song[] = [];
      for (const s of album.songs) {
        const tKey = s.title.toLowerCase().trim();
        if (!seenTitles.has(tKey)) {
          seenTitles.add(tKey);
          if (s.id) seenIds.add(s.id);
          initialDedupped.push(s);
        }
      }
      let accumulated = [...initialDedupped];

      (async () => {
        for (const query of queries) {
          if (controller.signal.aborted) break;
          try {
            for (let pg = 1; pg <= 20; pg++) {
              if (controller.signal.aborted) break;
              if (pg > 1) await new Promise(r => setTimeout(r, 200));
              const res   = await api.searchSongs(query, pg, 50);
              const items = extractResults(res);
              if (items.length === 0) break;
              const newSongs = items.map(mapApiSong).filter((s: Song) => {
                if (!s.audioUrl || !s.id) return false;
                const tKey = s.title.toLowerCase().trim();
                if (seenIds.has(s.id) || seenTitles.has(tKey)) return false;
                return true;
              });
              for (const s of newSongs) {
                seenIds.add(s.id);
                seenTitles.add(s.title.toLowerCase().trim());
                accumulated.push(s);
              }
              if (newSongs.length > 0 && !controller.signal.aborted) setSongs([...accumulated]);
              if (items.length < 50) break;
            }
          } catch { /* continue */ }
        }
        if (!controller.signal.aborted) setLoadingMore(false);
      })();
    } else {
      fetchAllMovieSongs(albumQuery, album.title)
        .then((fetched) => {
          if (!controller.signal.aborted) {
            const seen = new Set<string>();
            const dedupped = fetched.filter(s => {
              const tKey = s.title.toLowerCase().trim();
              if (seen.has(tKey)) return false;
              seen.add(tKey);
              return true;
            });
            if (dedupped.length > 0) setSongs(dedupped);
            setLoadingMore(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoadingMore(false);
        });
    }

    return () => controller.abort();
  }, []);

  const typeLabel =
    albumType === "movie"  ? "Movie Soundtrack" :
    albumType === "artist" ? "Artist — Full Discography" :
    albumType === "hero"   ? "Actor — All Movies" :
    "Album";

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
              {typeLabel} · {songs.length} songs
            </Text>
          </View>

          <TouchableOpacity delayPressIn={0} onPress={handleLikePress} style={[modalStyles.backBtn, { marginRight: 12 }]} activeOpacity={0.7}>
            <MaterialCommunityIcons
              name={isLiked ? "heart" : "heart-outline"}
              size={20}
              color={isLiked ? "#f43f5e" : "#fff"}
            />
          </TouchableOpacity>

          {songs.length > 0 ? (
            <TouchableOpacity delayPressIn={0} onPress={() => playSong(songs[0], songs)} style={modalStyles.playBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="play" size={24} color="#000" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Large cover art */}
        <View style={modalStyles.coverWrapper}>
          {album.coverArt ? (
            <Image source={{ uri: album.coverArt }} style={modalStyles.coverImage} resizeMode="cover" />
          ) : (
            <View style={[modalStyles.coverImage, modalStyles.coverPlaceholder]}>
              <MaterialCommunityIcons name="disc" size={80} color="rgba(255,255,255,0.2)" />
            </View>
          )}
        </View>

        {/* Songs scroll */}
        <ScrollView style={modalStyles.songsScroll} contentContainerStyle={modalStyles.songsScrollContent}>
          {loadingMore && songs.length === 0 ? (
            <View style={modalStyles.centerLoading}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={modalStyles.loadingText}>
                {albumType === "artist" ? "Loading full discography…" : "Loading songs…"}
              </Text>
            </View>
          ) : (
            <View style={{ paddingBottom: 60 }}>
              {songs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  queue={songs}
                  onRequireAuth={onRequireAuth}
                  hideActions={true}
                />
              ))}

              {loadingMore && songs.length > 0 ? (
                <View style={modalStyles.fetchingMoreRow}>
                  <ActivityIndicator size="small" color="#1DB954" />
                  <Text style={modalStyles.fetchingMoreText}>
                    Fetching more songs… ({songs.length} so far)
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Language Category Modal ──────────────────────────────────────────────────
function LanguageCategoryModal({
  label,
  mainQueries,
  subCategories,
  onClose,
  onRequireAuth,
}: {
  label:         string;
  mainQueries:   string[];
  subCategories: { label: string; query: string }[];
  onClose:       () => void;
  onRequireAuth: () => void;
}) {
  const { playSong }              = usePlayer();
  const [allSongs, setAllSongs]   = useState<Song[]>([]);
  const [subSongs, setSubSongs]   = useState<Record<string, Song[]>>({});
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const fetchedRef                = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchLanguageSongs(mainQueries, 50).then((songs) => {
      setAllSongs(songs);
      setLoading(false);
    });
    subCategories.forEach(async ({ label: subLabel, query }) => {
      const songs = await fetchSection(query, 50);
      setSubSongs((prev) => ({ ...prev, [subLabel]: songs }));
    });
  }, []);

  const tabs         = ["All", ...subCategories.map((s) => s.label)];
  const displaySongs = activeTab === "All" ? allSongs : subSongs[activeTab] || [];

  return (
    <View style={modalStyles.container}>
      <View style={[modalStyles.overlay, { backgroundColor: "rgba(29, 185, 84, 0.12)" }]} />
      <View style={modalStyles.overlay} />

      <View style={modalStyles.content}>
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity delayPressIn={0} onPress={onClose} style={modalStyles.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={modalStyles.headerMeta}>
            <Text style={modalStyles.headerTitle}>{label} Music</Text>
            <Text style={modalStyles.headerSubtitle}>
              {loading ? "Loading…" : `${allSongs.length}+ songs`}
            </Text>
          </View>

          {displaySongs.length > 0 ? (
            <TouchableOpacity delayPressIn={0} onPress={() => playSong(displaySongs[0], displaySongs)} style={modalStyles.playBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="play" size={24} color="#000" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Horizontal scroll tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsScrollContent}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            const count = tab === "All" ? allSongs.length : (subSongs[tab]?.length || 0);

            return (
              <TouchableOpacity delayPressIn={0} key={tab} onPress={() => setActiveTab(tab)} style={[styles.langTab, isActive && styles.activeLangTab]} activeOpacity={0.7}>
                <Text style={[styles.langTabText, isActive && styles.activeLangTabText]}>
                  {tab} {count > 0 ? `(${count})` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Songs list */}
        <ScrollView style={modalStyles.songsScroll} contentContainerStyle={modalStyles.songsScrollContent}>
          {loading && displaySongs.length === 0 ? (
            <View style={modalStyles.centerLoading}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={modalStyles.loadingText}>Loading {label} songs…</Text>
            </View>
          ) : activeTab !== "All" && !subSongs[activeTab] ? (
            <View style={modalStyles.centerLoading}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={modalStyles.loadingText}>Loading {activeTab} songs…</Text>
            </View>
          ) : (
            <View style={{ paddingBottom: 60 }}>
              {displaySongs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  queue={displaySongs}
                  onRequireAuth={onRequireAuth}
                  hideActions={true}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── AlbumRow ─────────────────────────────────────────────────────────────────
function AlbumRow({
  title,
  albums,
  loading,
  onOpen,
  showCount,
  roundCovers,
}: {
  title:       string;
  albums:      AlbumData[];
  loading:     boolean;
  onOpen:      (album: AlbumData) => void;
  showCount?:  boolean;
  roundCovers?: boolean;
}) {
  return (
    <View style={styles.albumRowContainer}>
      <Text style={styles.sectionHeader}>{title}</Text>

      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollPadding}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.albumLoaderItem}>
              <View
                style={[
                  styles.albumArtSkeleton,
                  roundCovers && { borderRadius: 60 }
                ]}
              />
              <View style={styles.albumTextSkeleton} />
            </View>
          ))}
        </ScrollView>
      ) : albums.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollPadding}>
          {albums.map((album) => {
            const { playSong } = usePlayer();

            return (
              <View key={album.title} style={styles.albumItem}>
                <TouchableOpacity delayPressIn={0} onPress={() => onOpen(album)} style={[ styles.albumArtBtn, roundCovers && { borderRadius: 60 } ]} activeOpacity={0.8}>
                  {album.coverArt ? (
                    <Image source={{ uri: album.coverArt }} style={styles.albumCoverImage} />
                  ) : (
                    <View style={[styles.albumCoverImage, styles.albumCoverPlaceholder]}>
                      <MaterialCommunityIcons name="disc" size={32} color="rgba(255,255,255,0.2)" />
                    </View>
                  )}

                  {!roundCovers && album.songs.length > 0 ? (
                    <TouchableOpacity delayPressIn={0} onPress={() => playSong(album.songs[0], album.songs)} style={styles.playOverlayBtn} activeOpacity={0.8}>
                      <MaterialCommunityIcons name="play" size={16} color="#000" style={{ marginLeft: 1 }} />
                    </TouchableOpacity>
                  ) : null}

                  {showCount && album.songs.length > 0 ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>
                        {album.fullyLoaded ? album.songs.length : `${album.songs.length}+`}
                      </Text>
                    </View>
                  ) : null}

                  {roundCovers && !album.fullyLoaded ? (
                    <View style={styles.loadingSpinnerBadge}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : null}
                </TouchableOpacity>

                <Text style={styles.albumTitleText} numberOfLines={1}>
                  {album.title}
                </Text>

                {showCount && !roundCovers ? (
                  <Text style={styles.albumSubtitleText} numberOfLines={1}>
                    {album.fullyLoaded ? `${album.songs.length} songs` : `${album.songs.length}+ songs`}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────
function CollapsibleSection({
  title,
  songs,
  onRequireAuth,
}: {
  title:         string;
  songs:         Song[];
  onRequireAuth: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW                 = 5;
  const visible                 = expanded ? songs : songs.slice(0, PREVIEW);

  return (
    <View style={styles.simpleSection}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.songsListContainer}>
        {visible.map((song) => (
          <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} hideActions={true} />
        ))}
      </View>
      {songs.length > PREVIEW ? (
        <TouchableOpacity delayPressIn={0} onPress={() => setExpanded(!expanded)} style={styles.expandBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color="rgba(255,255,255,0.4)"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.expandText}>
            {expanded ? "Show less" : `Show ${songs.length - PREVIEW} more`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── SimpleSection ────────────────────────────────────────────────────────────
function SimpleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.simpleSection}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.songsListContainer}>{children}</View>
    </View>
  );
}

// ─── QuickPick tile ───────────────────────────────────────────────────────────
function QuickPick({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong } = usePlayer();
  return (
    <TouchableOpacity delayPressIn={0} onPress={() => playSong(song, queue)} style={styles.quickPickCard} activeOpacity={0.8}>
      {song.albumArt ? (
        <Image source={{ uri: song.albumArt }} style={styles.quickPickArt} />
      ) : (
        <View style={[styles.quickPickArt, styles.quickPickPlaceholder]}>
          <Text style={styles.quickPickIcon}>🎵</Text>
        </View>
      )}
      <Text style={styles.quickPickTitle} numberOfLines={1}>
        {song.title}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { user, logout }     = useAuth();
  const { recentlyPlayed }   = useLibrary();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu]   = useState(false);
  const navigation: any                   = useNavigation();
  const isOffline = false;

  const [sections,     setSections]     = useState<SectionData[]>(() => homePagePrefetcher.sections);
  const [filmAlbums,   setFilmAlbums]   = useState<AlbumData[]>  (() => homePagePrefetcher.filmAlbums);
  const [artistAlbums, setArtistAlbums] = useState<AlbumData[]>  (() => homePagePrefetcher.artistAlbums);
  const [albumsLoading, setAlbumsLoading] = useState(() =>
    homePagePrefetcher.filmAlbums.length === 0
  );

  useEffect(() => {
    const unsub = homePagePrefetcher.subscribe(() => {
      setSections(    [...homePagePrefetcher.sections]);
      setFilmAlbums(  [...homePagePrefetcher.filmAlbums]);
      setArtistAlbums([...homePagePrefetcher.artistAlbums]);
      setAlbumsLoading(homePagePrefetcher.filmAlbums.length === 0);
    });
    homePagePrefetcher.start();
    return unsub;
  }, []);

  const [openAlbum, setOpenAlbum] = useState<{
    album:      AlbumData;
    albumType:  string;
    albumQuery: string;
  } | null>(() => {
    try {
      const raw = sessionStorage.getItem("rw_open_album");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleOpenAlbum = (album: AlbumData) => {
    const state = {
      album,
      albumType:  album.type,
      albumQuery: album.query ?? `${album.title} songs`,
    };
    setOpenAlbum(state);
    try { sessionStorage.setItem("rw_open_album", JSON.stringify(state)); } catch { /**/ }
  };

  const handleCloseAlbum = () => {
    setOpenAlbum(null);
    try { sessionStorage.removeItem("rw_open_album"); } catch { /**/ }
  };

  const [minuteTick, setMinuteTick] = useState(oneMinSeed());
  useEffect(() => {
    const id = setInterval(() => setMinuteTick(prev => prev + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const quickPickSongs = (() => {
    const pool = sections.flatMap((s) => s.songs);
    if (pool.length === 0) return [];
    return seededShuffle(pool, minuteTick).slice(0, 12);
  })();



  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBadge}>
              <MaterialCommunityIcons name="music" size={16} color="#000" />
            </View>
            <Text style={styles.headerLogoText}>Medley</Text>
          </View>

          {(global as any).triggerOTAUpdateModal && (
            <TouchableOpacity 
              delayPressIn={0} 
              onPress={() => (global as any).triggerOTAUpdateModal()} 
              style={styles.devHeaderBtn}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="cloud-refresh" size={20} color="#1DB954" />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Picks */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeader}>Quick Picks</Text>
          {quickPickSongs.length > 0 ? (
            <View style={styles.quickPickGrid}>
              {quickPickSongs.map((song) => (
                <View key={song.id} style={styles.quickPickCell}>
                  <QuickPick song={song} queue={quickPickSongs} />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.quickPickGrid}>
              {Array.from({ length: 12 }).map((_, i) => (
                <View key={i} style={styles.quickPickCell}>
                  <View style={styles.quickPickSkeleton}>
                    <View style={styles.skeletonArt} />
                    <View style={styles.skeletonText} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* New Releases */}
        <AlbumRow
          title={`New Releases ${CURRENT_YEAR}`}
          albums={filmAlbums}
          loading={albumsLoading}
          onOpen={handleOpenAlbum}
          showCount={false}
        />

        {/* Popular Artists */}
        <AlbumRow
          title="Popular Artists"
          albums={artistAlbums}
          loading={albumsLoading && artistAlbums.length === 0}
          onOpen={handleOpenAlbum}
          roundCovers
        />

        {/* Recently Played */}
        {recentlyPlayed.length > 0 ? (
          <SimpleSection title="Recently Played">
            {recentlyPlayed.slice(0, 10).map((song) => (
              <SongRow
                key={song.id}
                song={song}
                queue={recentlyPlayed}
                onRequireAuth={handleRequireAuth}
                hideActions={true}
              />
            ))}
          </SimpleSection>
        ) : null}

        {/* Dynamic sections */}
        {sections.length === 0 ? (
          <View style={styles.simpleSection}>
            <View style={styles.skeletonSectionHeader} />
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <View style={styles.skeletonRowArt} />
                <View style={styles.skeletonRowTexts}>
                  <View style={styles.skeletonRowTitle} />
                  <View style={styles.skeletonRowArtist} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          sections.map(({ title, songs }) => (
            <CollapsibleSection
              key={title}
              title={title}
              songs={songs}
              onRequireAuth={handleRequireAuth}
            />
          ))
        )}
      </ScrollView>

      {/* Album Detail Modal */}
      {openAlbum ? (
        <AlbumModal
          album={openAlbum.album}
          albumType={openAlbum.albumType}
          albumQuery={openAlbum.albumQuery}
          onClose={handleCloseAlbum}
          onRequireAuth={handleRequireAuth}
        />
      ) : null}

      {/* Authentication Dialog */}
    </View>
  );
}

// ─── Module-level prefetcher class ───────────────────────────────────────────
class HomePagePrefetcher {
  private _sections:     SectionData[] = [];
  private _filmAlbums:   AlbumData[]   = [];
  private _artistAlbums: AlbumData[]   = [];
  private _ready        = false;
  private _listeners    = new Set<() => void>();
  private _running      = false;

  private get secKey()  { return `hp_sections_${todaysSeed()}`; }
  private get albKey()  { return `hp_albums_${todaysSeed()}`;   }

  get sections()     { return this._sections;     }
  get filmAlbums()   { return this._filmAlbums;   }
  get artistAlbums() { return this._artistAlbums; }
  get ready()        { return this._ready;        }

  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  private _notify() { this._listeners.forEach(fn => fn()); }

  start() {
    if (this._running) return;
    this._running = true;
    this._boot().catch(console.error);
  }

  private async _boot() {
    if (typeof (localStorage as any).ensureInitialized === "function") {
      await (localStorage as any).ensureInitialized();
    }

    const secCached = cacheGetWithAge<SectionData[]>(this.secKey);
    const albCached = cacheGetWithAge<{ film: AlbumData[]; artist: AlbumData[] }>(this.albKey);

    if (secCached) {
      this._sections = secCached.data;
      this._ready    = true;
      this._notify();
    }
    if (albCached) {
      this._filmAlbums   = albCached.data.film   ?? [];
      this._artistAlbums = albCached.data.artist ?? [];
      this._notify();
    }

    const sectionsOk = secCached && !secCached.stale
                       && secCached.data.length >= SECTION_DEFS.length;
    const albumsOk   = albCached && !albCached.stale
                       && albCached.data.film.length > 0
                       && albCached.data.artist.every(a => a.fullyLoaded);

    if (sectionsOk && albumsOk) {
      this._ready = true;
      this._notify();
      setTimeout(() => { this._running = false; this.start(); }, CACHE_TTL_MS);
      return;
    }

    const promises: Promise<any>[] = [];

    if (!sectionsOk) {
      promises.push((async () => {
        const seen = new Set<string>();
        this._sections.forEach(s => s.songs.forEach(song => {
          if (song.id) {
            seen.add(song.id);
            const titleKey = (song.title || "").toLowerCase().trim() + "|" + (song.artist || "").toLowerCase().trim();
            seen.add(titleKey);
          }
        }));

        const allResults = await Promise.all(
          SECTION_DEFS.map(({ pool, seed }) => fetchSection(pickQuery(pool, seed), 20))
        );

        let updated: SectionData[] = [...this._sections];
        allResults.forEach((songs, idx) => {
          const { title } = SECTION_DEFS[idx];
          const unique    = dedup(songs, seen);
          if (unique.length === 0) return;
          updated = [...updated.filter(s => s.title !== title), { title, songs: unique }];
        });
        updated.sort((a, b) =>
          SECTION_DEFS.findIndex(d => d.title === a.title) -
          SECTION_DEFS.findIndex(d => d.title === b.title)
        );
        this._sections = updated;
        cacheSet(this.secKey, updated);
        this._notify();
      })());
    }

    let fetchFilmPromise: Promise<AlbumData[]> = Promise.resolve(this._filmAlbums);
    if (!albCached || this._filmAlbums.length === 0) {
      fetchFilmPromise = (async () => {
        const dummyRef = { current: false };
        const film     = await fetchCurrentYearFilmAlbums(dummyRef);
        this._filmAlbums = film;
        this._notify();
        return film;
      })();
      promises.push(fetchFilmPromise);
    }

    if (!albumsOk) {
      promises.push((async () => {
        const dummyRef = { current: false };
        const filmSnap = await fetchFilmPromise;

        await loadArtistAlbums(dummyRef, (updated) => {
          const prev = this._artistAlbums;
          const idx  = prev.findIndex(a => a.title === updated.title);
          const next = idx >= 0
            ? [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)]
            : [...prev, updated];
          this._artistAlbums = next;
          if (next.length > 0 && next.every(a => a.fullyLoaded)) {
            cacheSet(this.albKey, { film: filmSnap, artist: next });
          }
          this._notify();
        });
      })());
    }

    if (promises.length > 0) {
      try {
        await Promise.all(promises);
      } catch (err) {
        console.warn("HomePagePrefetcher parallel prefetch error:", err);
      }
    }

    this._ready = true;
    this._notify();

    setTimeout(() => { this._running = false; this.start(); }, CACHE_TTL_MS);
  }
}

const CACHE_TTL_MS   = 3 * 60 * 60 * 1000; // 3 hours
const CACHE_STALE_MS = 30 * 60 * 1000;
export const homePagePrefetcher = new HomePagePrefetcher();

function cacheGetWithAge<T>(key: string): { data: T; stale: boolean } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    const age = Date.now() - ts;
    if (age > CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return { data: data as T, stale: age > CACHE_STALE_MS };
  } catch { return null; }
}

function cacheSet(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* give up */
  }
}

// ─── Native Styles ────────────────────────────────────────────────────────────
const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110, // padding for bottom miniplayer + navigation
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#121212",
    zIndex: 10,
  },
  devHeaderBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: "rgba(29, 185, 84, 0.1)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerLogoText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  headerRight: {
    position: "relative",
  },
  userMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeUserMenuBtn: {
    backgroundColor: "#1DB954",
  },
  userInitial: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#000",
  },
  userDropdown: {
    position: "absolute",
    right: 0,
    top: 36,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    width: 160,
    padding: 10,
    zIndex: 99,
  },
  dropdownInfo: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  dropdownName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
  },
  dropdownEmail: {
    fontSize: 9,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 4,
  },
  logoutText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
  },
  sectionContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  quickPickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  quickPickCell: {
    width: "49%",
    marginBottom: 8,
  },
  quickPickCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    overflow: "hidden",
    height: 48,
  },
  quickPickArt: {
    width: 48,
    height: 48,
  },
  quickPickPlaceholder: {
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
  },
  quickPickIcon: {
    color: "#fff",
    fontSize: 14,
  },
  quickPickTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.9)",
    flex: 1,
    marginLeft: 8,
    marginRight: 4,
  },
  quickPickSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6,
    height: 48,
  },
  skeletonArt: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  skeletonText: {
    flex: 1,
    height: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginHorizontal: 8,
    borderRadius: 2,
  },
  albumRowContainer: {
    marginBottom: 20,
  },
  horizontalScrollPadding: {
    paddingHorizontal: 12,
  },
  albumLoaderItem: {
    width: 110,
    marginHorizontal: 4,
  },
  albumArtSkeleton: {
    width: 110,
    height: 110,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 6,
  },
  albumTextSkeleton: {
    width: 80,
    height: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 2,
  },
  albumItem: {
    width: 115,
    marginHorizontal: 6,
    alignItems: "center",
  },
  albumArtBtn: {
    width: 115,
    height: 115,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#282828",
    marginBottom: 6,
  },
  albumCoverImage: {
    width: "100%",
    height: "100%",
  },
  albumCoverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  playOverlayBtn: {
    position: "absolute",
    bottom: 6,
    right: 6,
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
    elevation: 4,
  },
  countBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  loadingSpinnerBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  albumTitleText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    width: "100%",
  },
  albumSubtitleText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
    textAlign: "center",
  },
  simpleSection: {
    marginBottom: 20,
  },
  songsListContainer: {
    paddingHorizontal: 16,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginLeft: 16,
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  expandText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "600",
  },
  skeletonSectionHeader: {
    width: 110,
    height: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginLeft: 16,
    marginBottom: 12,
    borderRadius: 2,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  skeletonRowArt: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  skeletonRowTexts: {
    flex: 1,
    marginLeft: 12,
    gap: 6,
  },
  skeletonRowTitle: {
    width: 120,
    height: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 2,
  },
  skeletonRowArtist: {
    width: 80,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 2,
  },
  // Tabs for Categories
  tabsScroll: {
    maxHeight: 40,
    marginVertical: 8,
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  langTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 8,
  },
  activeLangTab: {
    backgroundColor: "#1DB954",
  },
  langTabText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.6)",
  },
  activeLangTabText: {
    color: "#000",
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
  offlineContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    flex: 1,
    backgroundColor: "#121212",
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  offlineDescription: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  offlineBtn: {
    backgroundColor: "#1DB954",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  offlineBtnText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#000",
  },
});