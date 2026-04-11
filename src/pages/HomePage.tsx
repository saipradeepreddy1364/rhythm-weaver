import { useEffect, useState, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import {
  Music2,
  User,
  LogOut,
  ChevronDown,
  ChevronUp,
  Play,
  Disc3,
  ArrowLeft,
} from "lucide-react";
import { AuthModal } from "@/components/AuthModal";
import { MiniPlayer } from "@/components/MiniPlayer";

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

// ─── Film discovery query pool ────────────────────────────────────────────────
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

// ─── Artist discovery queries ─────────────────────────────────────────────────
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
  "jubin nautiyal songs",
  "vishal mishra songs",
  "sachet tandon songs",
  "parampara tandon songs",
];

// ─── Background preload cache ─────────────────────────────────────────────────
// Starts fetching high-demand queries the moment the module is imported (before
// any component mounts). Results land in sessionStorage under "preload:<key>".
// SearchPage / LanguageAlbumModal reads from here first → instant results.

const PRELOAD_TARGETS: { key: string; queries: string[] }[] = [
  {
    key: "telugu",
    queries: [
      "trending telugu songs 2025", "telugu hits 2024", "telugu film songs 2023",
      "tollywood songs 2022", "telugu chartbusters 2021", "telugu songs 2020",
      "telugu romantic songs", "telugu folk songs", "telugu mass songs",
      "telugu melody songs", "telugu item songs", "telugu love songs",
      "telugu songs 2019", "telugu songs 2018", "telugu songs 2017",
      "tollywood 2010s hits", "telugu devotional songs", "telugu songs 2016",
      "telugu dance songs", "telugu sad songs",
    ],
  },
  {
    key: "hindi",
    queries: [
      "top hindi songs 2025", "superhit hindi songs 2024", "hindi film songs 2023",
      "bollywood hits 2022", "hindi chartbusters 2021", "bollywood songs 2020",
      "hindi romantic songs", "hindi dance songs", "hindi sad songs",
      "hindi songs 2019", "bollywood 2018 songs", "hindi item songs",
      "hindi party songs", "bollywood 90s hits", "bollywood 2000s superhits",
      "hindi melody songs", "bollywood 2010s hits", "hindi old classic songs",
      "hindi love songs", "bollywood blockbuster songs",
    ],
  },
  {
    key: "tamil",
    queries: [
      "trending tamil songs 2025", "tamil hits 2024", "kollywood songs 2023",
      "tamil film songs 2022", "tamil chartbusters 2021", "tamil songs 2020",
      "tamil romantic songs", "tamil folk songs", "tamil mass songs",
      "tamil songs 2019", "tamil melody songs", "tamil dance songs",
      "tamil love songs", "tamil devotional songs", "tamil songs 2018",
      "kollywood 2017 songs", "AR Rahman Tamil songs", "tamil sad songs",
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
  // ── Music directors / singers that users frequently search ─────────────────
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
const PRELOAD_MAX_PAGES   = 16;  // 16 pages × 50 = 800 songs per query in background
const PRELOAD_BATCH_DELAY = 300; // ms between pages — light on API

/**
 * Read pre-loaded songs for a key.
 * Returns [] immediately if not yet populated — caller should fall back to API.
 */
export function getPreloadedSongs(key: string): Song[] {
  try {
    const raw = sessionStorage.getItem(PRELOAD_SESSION_KEY(key.toLowerCase()));
    if (!raw) return [];
    return JSON.parse(raw) as Song[];
  } catch { return []; }
}

/**
 * Module-level fire-and-forget preloader.
 * Runs in the background; stores results in sessionStorage.
 * Called once when the module is first imported.
 */
let _preloadStarted = false;
function startBackgroundPreload() {
  if (_preloadStarted || typeof window === "undefined") return;
  _preloadStarted = true;

  // Delay the first call by 2 s so the initial homepage fetch gets priority
  setTimeout(async () => {
    for (const target of PRELOAD_TARGETS) {
      const sk = PRELOAD_SESSION_KEY(target.key);
      // Skip if already cached in this session
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

      // Pause 1 s between targets so we don't hammer the API
      await new Promise(r => setTimeout(r, 1000));
    }
  }, 2000);
}

// Fire immediately on module import
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
  /** true once the full discography / movie songs have been fetched */
  fullyLoaded?: boolean;
}

interface HomePageProps {
  onRequireAuth?: () => void;
}

type RawSong = Song & { primaryArtists?: string; singers?: string };

// ─── Decode HTML entities that sneak in via the API ──────────────────────────
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
  return decodeHtml(field.split(",")[0].trim());
}

// ─── Low-level fetch helpers ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Sanitise a song object — decode HTML entities in text fields */
function cleanSong(song: Song): Song {
  return {
    ...song,
    title:  decodeHtml(song.title  || ""),
    artist: decodeHtml((song as Song & { artist?: string }).artist || ""),
    album:  decodeHtml((song as Song & { album?: string }).album   || ""),
    movie:  decodeHtml((song as Song & { movie?: string }).movie   || ""),
  } as Song;
}

async function fetchSection(query: string, limit = 50): Promise<Song[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1500);
      const res   = await api.searchSongs(query, 1, limit);
      const items = extractResults(res);
      const songs = items.map(mapApiSong).map(cleanSong).filter((s: Song) => Boolean(s.audioUrl));
      if (songs.length > 0) return songs;
    } catch { /* silent retry */ }
  }
  return [];
}

async function fetchLanguageSongs(queries: string[], targetPerQuery = 50): Promise<Song[]> {
  const seen = new Set<string>();
  const all: Song[] = [];
  for (const query of queries) {
    try {
      for (let pg = 1; pg <= 4; pg++) {
        if (pg > 1) await sleep(200);
        const res   = await api.searchSongs(query, pg, targetPerQuery);
        const items = extractResults(res);
        const songs = items.map(mapApiSong).map(cleanSong).filter((s: Song) => Boolean(s.audioUrl));
        let added = 0;
        for (const s of songs) {
          if (s.id && !seen.has(s.id)) { seen.add(s.id); all.push(s); added++; }
        }
        if (items.length < targetPerQuery || added === 0) break;
      }
    } catch { /* continue */ }
    await sleep(150);
  }
  return all;
}

function dedup(songs: Song[], seen: Set<string>): Song[] {
  const out: Song[] = [];
  for (const s of songs) {
    if (s.id && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
  }
  return out;
}

/**
 * Paginate one query deeply — no hard cap.
 * 60 pages × 50 = up to 3 000 unique songs per query.
 * Pass a shared `seen` Set to deduplicate across sibling queries.
 */
async function fetchAllPages(query: string, maxPages = 60, seen?: Set<string>): Promise<Song[]> {
  const localSeen = seen ?? new Set<string>();
  const all: Song[] = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      if (page > 1) await sleep(220);
      const res   = await api.searchSongs(query, page, 50);
      const items = extractResults(res);
      if (items.length === 0) break;
      const songs = items.map(mapApiSong).map(cleanSong).filter((s: Song) => Boolean(s.audioUrl));
      let added = 0;
      for (const s of songs) {
        if (s.id && !localSeen.has(s.id)) { localSeen.add(s.id); all.push(s); added++; }
      }
      if (items.length < 50 || added === 0) break;
    } catch { break; }
  }
  return all;
}

/**
 * Fetch COMPLETE artist discography using 20 query variants in parallel batches.
 * Shared seen-set deduplicates across all variants.
 * No upper limit on songs returned.
 */
async function fetchAllArtistSongs(artistName: string): Promise<Song[]> {
  const name = artistName
    .replace(/ Hits$/i, "")
    .replace(/ Classics$/i, "")
    .replace(/ Songs$/i, "")
    .trim();

  const queries = [
    `${name} songs`,
    `${name} all songs`,
    `${name} hit songs`,
    `${name} best songs`,
    `${name} latest songs`,
    `${name} old songs`,
    `${name} popular songs`,
    `${name} film songs`,
    `${name} bollywood songs`,
    `${name} playback songs`,
    `${name} new songs ${CURRENT_YEAR}`,
    `${name} songs ${PREV_YEAR}`,
    `${name} songs collection`,
    `${name} superhit songs`,
    `${name} melody songs`,
    `${name} romantic songs`,
    `${name} sad songs`,
    `${name} devotional songs`,
    `${name} album songs`,
    `${name} movie songs`,
  ];

  const seen = new Set<string>();
  const all: Song[] = [];

  // 5 queries in parallel for maximum speed
  const BATCH = 5;
  for (let i = 0; i < queries.length; i += BATCH) {
    const batch   = queries.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((q) => fetchAllPages(q, 60, seen))
    );
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }
    if (i + BATCH < queries.length) await sleep(100);
  }

  return all;
}

/**
 * Fetch all songs for a movie album with strict title filtering.
 */
async function fetchAllMovieSongs(query: string, albumTitle: string): Promise<Song[]> {
  const seen       = new Set<string>();
  const all: Song[] = [];
  const titleLower = albumTitle.toLowerCase();

  for (let page = 1; page <= 60; page++) {
    try {
      if (page > 1) await sleep(280);
      const res   = await api.searchSongs(query, page, 50);
      const items = extractResults(res);
      let songs   = items.map(mapApiSong).map(cleanSong).filter((s: Song) => Boolean(s.audioUrl));
      const filtered = songs.filter(
        (s: Song) =>
          s.movie?.toLowerCase().includes(titleLower) ||
          s.album?.toLowerCase().includes(titleLower)
      );
      if (filtered.length >= 2) songs = filtered;
      for (const s of songs) {
        if (s.id && !seen.has(s.id)) { seen.add(s.id); all.push(s); }
      }
      if (items.length < 50) break;
    } catch { break; }
  }
  return all;
}

// ─── Film albums discovery ────────────────────────────────────────────────────

async function fetchCurrentYearFilmAlbums(
  unmountedRef: React.MutableRefObject<boolean>,
): Promise<AlbumData[]> {
  const dailyQueries = seededShuffle(FILM_DISCOVERY_QUERIES_POOL, todaysSeed()).slice(0, 10);
  const albumMap     = new Map<string, { songs: Song[]; query: string }>();
  const seen         = new Set<string>();

  for (const query of dailyQueries) {
    if (unmountedRef.current) break;
    try {
      for (let pg = 1; pg <= 3; pg++) {
        if (unmountedRef.current) break;
        if (pg > 1) await sleep(200);
        const res   = await api.searchSongs(query, pg, 50);
        const items = extractResults(res);
        const songs = items.map(mapApiSong).map(cleanSong).filter((s: Song) => Boolean(s.audioUrl));
        for (const song of songs) {
          const key = (song.movie || song.album || "").trim();
          if (!key || key.length < 3) continue;
          if (!albumMap.has(key)) albumMap.set(key, { songs: [], query: `${key} songs` });
          const entry = albumMap.get(key)!;
          if (song.id && !seen.has(song.id)) { seen.add(song.id); entry.songs.push(song); }
        }
        if (items.length < 50) break;
      }
    } catch { /* continue */ }
    await sleep(200);
  }

  const albums: AlbumData[] = [];
  for (const [title, { songs, query }] of albumMap.entries()) {
    if (songs.length >= 1) {
      albums.push({ title, coverArt: songs[0].albumArt || "", songs, type: "movie", query, fullyLoaded: false });
    }
  }

  const sorted  = albums.sort((a, b) => b.songs.length - a.songs.length).slice(0, 60);
  const rotated = seededShuffle(sorted, todaysSeed());
  return rotated.slice(0, 25);
}

// ─── Artist albums — discover + full pre-load ─────────────────────────────────
/**
 * Two-phase load:
 *   Phase 1 — Discover artist names via parallel API calls, emit stubs instantly.
 *   Phase 2 — For each artist, fetch ALL songs (deep pagination, parallel queries).
 *             Emit updated card as each artist finishes.
 *
 * `onArtistUpdated` is called in BOTH phases so the UI is never empty.
 */
async function loadArtistAlbums(
  unmountedRef:    React.MutableRefObject<boolean>,
  onArtistUpdated: (artist: AlbumData) => void,
): Promise<void> {
  // ── Phase 1: parallel discovery ──────────────────────────────────────────
  const artistMap = new Map<string, { songs: Song[]; coverArt: string }>();
  const songSeen  = new Set<string>();

  const discoveryResults = await Promise.allSettled(
    ARTIST_DISCOVERY_QUERIES.map((q) =>
      api.searchSongs(q, 1, 50).then((res) =>
        extractResults(res).map(mapApiSong).map(cleanSong).filter((s: Song) => Boolean(s.audioUrl))
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
      if (song.id && !songSeen.has(song.id)) { songSeen.add(song.id); entry.songs.push(song); }
    }
  }

  if (unmountedRef.current) return;

  // Pick top 25 artists by discovery song count
  const topArtists = [...artistMap.entries()]
    .filter(([, v]) => v.songs.length >= 2)
    .sort((a, b) => b[1].songs.length - a[1].songs.length)
    .slice(0, 25);

  // Emit stubs immediately so artist cards appear in the UI right away
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

  // ── Phase 2: fetch full discography in batches of 3 ──────────────────────
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
          : stubSongs; // fall back to discovery songs if fetch failed

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
  const [songs, setSongs]             = useState<Song[]>(album.songs);
  const [loadingMore, setLoadingMore] = useState(!album.fullyLoaded);

  useEffect(() => {
    if (album.fullyLoaded) {
      setSongs(album.songs);
      setLoadingMore(false);
      return;
    }

    const controller = new AbortController();
    setLoadingMore(true);

    // For artist/hero: stream songs in as each query resolves
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
        `${name} album songs`, `${name} movie songs`,
        `${name} old songs`, `${name} devotional songs`, `${name} songs ${new Date().getFullYear() - 1}`,
      ];
      const seen = new Set<string>(album.songs.map((s) => s.id));
      let accumulated = [...album.songs];

      (async () => {
        for (const query of queries) {
          if (controller.signal.aborted) break;
          try {
            for (let pg = 1; pg <= 20; pg++) {
              if (controller.signal.aborted) break;
              if (pg > 1) await new Promise(r => setTimeout(r, 200));
              const res   = await (await import("@/services/api")).api.searchSongs(query, pg, 50);
              const items = (await import("@/services/api")).extractResults(res);
              if (items.length === 0) break;
              const { mapApiSong } = await import("@/data/songs");
              const newSongs = items.map(mapApiSong).filter((s: Song) => s.audioUrl && s.id && !seen.has(s.id));
              for (const s of newSongs) { seen.add(s.id); accumulated = [...accumulated, s]; }
              if (newSongs.length > 0 && !controller.signal.aborted) setSongs([...accumulated]);
              if (items.length < 50) break;
            }
          } catch { /* continue */ }
        }
        if (!controller.signal.aborted) setLoadingMore(false);
      })();
    } else {
      // Movie album: filter by title
      fetchAllMovieSongs(albumQuery, album.title)
        .then((fetched) => {
          if (!controller.signal.aborted) {
            if (fetched.length > 0) setSongs(fetched);
            setLoadingMore(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoadingMore(false);
        });
    }

    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const typeLabel =
    albumType === "movie"  ? "Movie Soundtrack" :
    albumType === "artist" ? "Artist — Full Discography" :
    albumType === "hero"   ? "Actor — All Movies" :
    "Album";

  return (
    <div className="fixed inset-0 z-[55] flex flex-col" style={{ background: "#0d0d0d" }}>
      {album.coverArt && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:    `url(${album.coverArt})`,
            backgroundSize:     "cover",
            backgroundPosition: "center",
            filter:             "blur(50px) saturate(2)",
            transform:          "scale(1.3)",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(13,13,13,0.6) 0%, rgba(13,13,13,0.95) 40%)",
        }}
      />

      <div className="relative flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-12 pb-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white truncate">{album.title}</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {typeLabel}
              {loadingMore
                ? songs.length > 0
                  ? ` · ${songs.length} songs (loading more…)`
                  : " · Loading songs…"
                : songs.length > 0
                ? ` · ${songs.length} songs`
                : ""}
            </p>
          </div>
          {songs.length > 0 && (
            <button
              onClick={() => playSong(songs[0], songs)}
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-xl flex-shrink-0"
              style={{ background: "#1DB954" }}
            >
              <Play className="w-5 h-5 text-black fill-black ml-0.5" />
            </button>
          )}
        </div>

        {/* Cover art */}
        <div className="px-4 mb-4 flex-shrink-0">
          <div
            className="rounded-2xl overflow-hidden mx-auto shadow-2xl"
            style={{ width: 180, height: 180 }}
          >
            {album.coverArt ? (
              <img
                src={album.coverArt}
                alt={album.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://via.placeholder.com/300x300?text=🎵";
                }}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <Disc3 className="w-12 h-12" style={{ color: "rgba(255,255,255,0.2)" }} />
              </div>
            )}
          </div>
        </div>

        {/* Song count badge */}
        {songs.length > 0 && (
          <div className="px-4 mb-3 flex-shrink-0">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: "rgba(29,185,84,0.15)", color: "#1DB954" }}
            >
              <Music2 className="w-3 h-3" />
              {loadingMore ? `${songs.length} songs (loading more…)` : `${songs.length} songs`}
            </span>
          </div>
        )}

        {/* Song list */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {loadingMore && songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <p className="text-sm text-white/40">
                {albumType === "artist" || albumType === "hero"
                  ? "Loading full discography…"
                  : "Loading songs…"}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2 pb-40">
              {songs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  queue={songs}
                  onRequireAuth={onRequireAuth}
                />
              ))}
              {loadingMore && songs.length > 0 && (
                <div className="flex items-center justify-center py-6 gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                  <span className="text-xs text-white/40">
                    Fetching more songs… ({songs.length} so far)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <MiniPlayer onRequireAuth={onRequireAuth} />
    </div>
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs         = ["All", ...subCategories.map((s) => s.label)];
  const displaySongs = activeTab === "All" ? allSongs : subSongs[activeTab] || [];

  return (
    <div className="fixed inset-0 z-[55] flex flex-col" style={{ background: "#0d0d0d" }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(29,185,84,0.15) 0%, rgba(13,13,13,0.98) 30%)",
        }}
      />
      <div className="relative flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-3 px-4 pt-12 pb-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white">{label} Music</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {loading ? "Loading…" : `${allSongs.length}+ songs`}
            </p>
          </div>
          {displaySongs.length > 0 && (
            <button
              onClick={() => playSong(displaySongs[0], displaySongs)}
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-xl flex-shrink-0"
              style={{ background: "#1DB954" }}
            >
              <Play className="w-5 h-5 text-black fill-black ml-0.5" />
            </button>
          )}
        </div>

        <div
          className="flex gap-2 px-4 pb-3 flex-shrink-0 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: activeTab === tab ? "#1DB954" : "rgba(255,255,255,0.1)",
                color:      activeTab === tab ? "#000" : "rgba(255,255,255,0.6)",
              }}
            >
              {tab}
              {tab !== "All" && subSongs[tab] && (
                <span className="ml-1 opacity-60">({subSongs[tab].length})</span>
              )}
              {tab === "All" && allSongs.length > 0 && (
                <span className="ml-1 opacity-60">({allSongs.length})</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {loading && displaySongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <p className="text-sm text-white/40">Loading {label} songs…</p>
            </div>
          ) : activeTab !== "All" && !subSongs[activeTab] ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <p className="text-sm text-white/40">Loading {activeTab} songs…</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2 pb-40">
              {displaySongs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  queue={displaySongs}
                  onRequireAuth={onRequireAuth}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <MiniPlayer onRequireAuth={onRequireAuth} />
    </div>
  );
}

// ─── AlbumRow ─────────────────────────────────────────────────────────────────

function AlbumRow({
  title,
  albums,
  loading,
  onOpen,
  roundCovers = false,
  showCount   = false,
}: {
  title:        string;
  albums:       AlbumData[];
  loading:      boolean;
  onOpen:       (a: AlbumData) => void;
  roundCovers?: boolean;
  showCount?:   boolean;
}) {
  const { playSong } = usePlayer();

  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-white mb-3 px-4">{title}</h2>
      {loading ? (
        <div className="flex gap-4 px-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0" style={{ width: 140 }}>
              <div
                className="mb-2"
                style={{
                  width:        140,
                  height:       140,
                  background:   "rgba(255,255,255,0.07)",
                  borderRadius: roundCovers ? "50%" : 12,
                }}
              />
              <div className="h-3 w-24 rounded mb-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            </div>
          ))}
        </div>
      ) : albums.length > 0 ? (
        <div
          className="flex gap-4 px-4 overflow-x-auto"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {albums.map((album) => (
            <div key={album.title} className="flex-shrink-0" style={{ width: 150 }}>
              <div
                className="relative overflow-hidden mb-2 cursor-pointer active:scale-95 transition-transform"
                style={{ width: 150, height: 150, borderRadius: roundCovers ? "50%" : 12 }}
                onClick={() => onOpen(album)}
              >
                {album.coverArt ? (
                  <img
                    src={album.coverArt}
                    alt={album.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://via.placeholder.com/300x300?text=🎵";
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <Disc3 className="w-10 h-10" style={{ color: "rgba(255,255,255,0.2)" }} />
                  </div>
                )}
                {!roundCovers && album.songs.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playSong(album.songs[0], album.songs);
                    }}
                    className="absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform"
                    style={{ background: "#1DB954" }}
                  >
                    <Play className="w-4 h-4 text-black fill-black ml-0.5" />
                  </button>
                )}
                {showCount && album.songs.length > 0 && (
                  <div
                    className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ background: "rgba(0,0,0,0.7)", color: "rgba(255,255,255,0.9)" }}
                  >
                    {album.fullyLoaded ? album.songs.length : `${album.songs.length}+`}
                  </div>
                )}
                {/* Small spinner on artist cards while full discography loads in background */}
                {roundCovers && !album.fullyLoaded && (
                  <div
                    className="absolute bottom-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.6)", pointerEvents: "none" }}
                  >
                    <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white/80 animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-white truncate leading-tight text-center">
                {album.title}
              </p>
              {showCount && !roundCovers && (
                <p className="text-xs text-center mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {album.fullyLoaded ? `${album.songs.length} songs` : `${album.songs.length}+ songs`}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
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
    <div className="mb-5">
      <h2 className="text-base font-bold text-white mb-2 px-4">{title}</h2>
      <div className="space-y-0.5 px-4">
        {visible.map((song) => (
          <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
        ))}
      </div>
      {songs.length > PREVIEW && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold mt-2 mx-4"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {expanded ? (
            <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
          ) : (
            <><ChevronDown className="w-3.5 h-3.5" /> Show {songs.length - PREVIEW} more</>
          )}
        </button>
      )}
    </div>
  );
}

// ─── SimpleSection ────────────────────────────────────────────────────────────

function SimpleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-white mb-2 px-4">{title}</h2>
      <div className="space-y-0.5 px-4">{children}</div>
    </div>
  );
}

// ─── QuickPick tile ───────────────────────────────────────────────────────────

function QuickPick({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong } = usePlayer();
  return (
    <button
      onClick={() => playSong(song, queue)}
      className="flex items-center gap-2 rounded-lg overflow-hidden transition-all active:scale-95 text-left w-full"
      style={{ background: "rgba(255,255,255,0.08)", minWidth: 0 }}
    >
      {song.albumArt ? (
        <img
          src={song.albumArt}
          alt={song.title}
          className="w-12 h-12 object-cover flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              "https://via.placeholder.com/100x100?text=🎵";
          }}
        />
      ) : (
        <div
          className="w-12 h-12 flex-shrink-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#f43f5e,#7c3aed)" }}
        >
          <span className="text-white text-lg">🎵</span>
        </div>
      )}
      <span
        className="text-xs font-semibold truncate pr-2"
        style={{ color: "rgba(255,255,255,0.9)" }}
      >
        {song.title}
      </span>
    </button>
  );
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_TTL_MS   = 3 * 60 * 60 * 1000; // 3 hours
const CACHE_STALE_MS = 30 * 60 * 1000;      // 30 min → trigger bg refresh

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return data as T;
  } catch { return null; }
}

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
    try {
      Object.keys(localStorage).filter(k => k.startsWith("hp_")).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* give up */ }
  }
}

// ─── Module-level prefetcher ─────────────────────────────────────────────────
// Instantiated the moment HomePage.tsx is first imported — before any component
// mounts. Populates localStorage in the background so that when the user
// navigates to Home the component reads fully-loaded data and renders instantly.

class HomePagePrefetcher {
  private _sections:     SectionData[] = [];
  private _filmAlbums:   AlbumData[]   = [];
  private _artistAlbums: AlbumData[]   = [];
  private _ready        = false;
  private _listeners    = new Set<() => void>();
  private _running      = false;

  private get secKey()  { return `hp_sections_${todaysSeed()}`; }
  private get albKey()  { return `hp_albums_${todaysSeed()}`;   }

  // ── Public read accessors ──────────────────────────────────────────────────
  get sections()     { return this._sections;     }
  get filmAlbums()   { return this._filmAlbums;   }
  get artistAlbums() { return this._artistAlbums; }
  get ready()        { return this._ready;        }

  /** Subscribe to any state change. Returns an unsubscribe fn. */
  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  private _notify() { this._listeners.forEach(fn => fn()); }

  /** Called once when module is imported. Safe to call multiple times. */
  start() {
    if (this._running || typeof window === "undefined") return;
    this._running = true;
    this._boot().catch(console.error);
  }

  private async _boot() {
    // ── Step 1: hydrate from localStorage instantly ────────────────────────
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

    // ── Step 2: if everything is fresh, just schedule next refresh ─────────
    if (sectionsOk && albumsOk) {
      setTimeout(() => { this._running = false; this.start(); }, CACHE_TTL_MS);
      return;
    }

    // ── Step 3: fetch sections in parallel (all 12 at once) ───────────────
    if (!sectionsOk) {
      const seen = new Set<string>();
      this._sections.forEach(s => s.songs.forEach(song => song.id && seen.add(song.id)));

      const allResults = await Promise.all(
        SECTION_DEFS.map(({ pool, seed }) => fetchSection(pickQuery(pool, seed), 50))
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
      this._ready    = true;
      cacheSet(this.secKey, updated);
      this._notify();
    }

    // ── Step 4: fetch film albums ──────────────────────────────────────────
    if (!albCached || this._filmAlbums.length === 0) {
      const dummyRef = { current: false };
      const film     = await fetchCurrentYearFilmAlbums(dummyRef);
      this._filmAlbums = film;
      cacheSet(this.albKey, { film, artist: this._artistAlbums });
      this._notify();
    }

    // ── Step 5: fetch artist albums progressively (stub → full) ───────────
    if (!albumsOk) {
      const dummyRef = { current: false };
      const filmSnap = this._filmAlbums;

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
    }

    // ── Schedule next full refresh ─────────────────────────────────────────
    setTimeout(() => { this._running = false; this.start(); }, CACHE_TTL_MS);
  }
}

/** Singleton — starts fetching the instant this module is imported */
export const homePagePrefetcher = new HomePagePrefetcher();
homePagePrefetcher.start();

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { user, logout }     = useAuth();
  const { recentlyPlayed }   = useLibrary();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu]   = useState(false);

  useEffect(() => { document.title = "Medly"; }, []);

  // ── Read from prefetcher — renders instantly if cache is warm ────────────
  const [sections,     setSections]     = useState<SectionData[]>(() => homePagePrefetcher.sections);
  const [filmAlbums,   setFilmAlbums]   = useState<AlbumData[]>  (() => homePagePrefetcher.filmAlbums);
  const [artistAlbums, setArtistAlbums] = useState<AlbumData[]>  (() => homePagePrefetcher.artistAlbums);
  const [albumsLoading, setAlbumsLoading] = useState(() =>
    homePagePrefetcher.filmAlbums.length === 0
  );

  // Subscribe to prefetcher updates — re-render whenever new data arrives
  useEffect(() => {
    const unsub = homePagePrefetcher.subscribe(() => {
      setSections(    [...homePagePrefetcher.sections]);
      setFilmAlbums(  [...homePagePrefetcher.filmAlbums]);
      setArtistAlbums([...homePagePrefetcher.artistAlbums]);
      setAlbumsLoading(homePagePrefetcher.filmAlbums.length === 0);
    });
    // Also ensure prefetcher is running (safe no-op if already started)
    homePagePrefetcher.start();
    return unsub;
  }, []);

  const OPEN_ALBUM_KEY = "rw_open_album";

  // ── Open album modal ──────────────────────────────────────────────────────
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => { await logout(); setShowUserMenu(false); };

  const handleOpenAlbum = (album: AlbumData) => {
    const state = {
      album,
      albumType:  album.type,
      albumQuery: album.query ?? `${album.title} songs`,
    };
    setOpenAlbum(state);
    try { sessionStorage.setItem(OPEN_ALBUM_KEY, JSON.stringify(state)); } catch { /**/ }
  };

  const handleCloseAlbum = () => {
    setOpenAlbum(null);
    try { sessionStorage.removeItem(OPEN_ALBUM_KEY); } catch { /**/ }
  };

  // ── Quick Picks — rotate every minute ────────────────────────────────────
  const [minuteTick, setMinuteTick] = useState(oneMinSeed());
  useEffect(() => {
    const id = setInterval(() => setMinuteTick(oneMinSeed()), 60_000);
    return () => clearInterval(id);
  }, []);

  const quickPickSongs = (() => {
    const pool = sections.flatMap((s) => s.songs);
    if (pool.length === 0) return [];
    return seededShuffle(pool, minuteTick).slice(0, 12);
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>

      {/* Album detail modal */}
      {openAlbum && (
        <AlbumModal
          album={openAlbum.album}
          albumType={openAlbum.albumType}
          albumQuery={openAlbum.albumQuery}
          onClose={() => handleCloseAlbum()}
          onRequireAuth={handleRequireAuth}
        />
      )}

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-20 px-4 pt-12 pb-3 flex items-center justify-between"
        style={{ background: "rgba(18,18,18,0.97)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1DB954, #1ed760)" }}
          >
            <Music2 className="w-4 h-4 text-black" />
          </div>
          <h1 className="text-xl font-bold text-white">Home</h1>
        </div>
        <div className="relative">
          <button
            onClick={() => user ? setShowUserMenu((v) => !v) : setShowAuthModal(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ background: user ? "#1DB954" : "rgba(255,255,255,0.1)" }}
          >
            {user ? (
              <span className="text-sm font-bold text-black">
                {(user.username?.charAt(0) || user.email?.charAt(0) || "U").toUpperCase()}
              </span>
            ) : (
              <User className="w-4 h-4 text-white" />
            )}
          </button>
          {showUserMenu && user && (
            <div
              className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl overflow-hidden"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", zIndex: 50 }}
            >
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-sm font-semibold text-white">{user.username}</p>
                <p className="text-xs text-white/40 mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Picks ── */}
      <div className="px-4 pt-4 mb-6">
        <h2 className="text-base font-bold text-white mb-3">Quick Picks</h2>
        {quickPickSongs.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {quickPickSongs.map((song) => (
              <QuickPick key={song.id} song={song} queue={quickPickSongs} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg overflow-hidden"
                style={{ background: "rgba(255,255,255,0.05)", height: 48 }}
              >
                <div className="w-12 h-12 flex-shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />
                <div className="flex-1 h-3 rounded mr-2" style={{ background: "rgba(255,255,255,0.06)" }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New Releases ── */}
      <AlbumRow
        title={`New Releases ${CURRENT_YEAR}`}
        albums={filmAlbums}
        loading={albumsLoading}
        onOpen={handleOpenAlbum}
        showCount={true}
      />

      {/* ── Popular Artists ── */}
      <AlbumRow
        title="Popular Artists"
        albums={artistAlbums}
        loading={albumsLoading && artistAlbums.length === 0}
        onOpen={handleOpenAlbum}
        roundCovers
      />

      {/* ── Recently Played ── */}
      {recentlyPlayed.length > 0 && (
        <SimpleSection title="Recently Played">
          {recentlyPlayed.slice(0, 10).map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={recentlyPlayed}
              onRequireAuth={handleRequireAuth}
            />
          ))}
        </SimpleSection>
      )}

      {/* ── Song sections ── */}
      {sections.length === 0 ? (
        <div className="px-4 mb-5">
          <div className="h-4 w-36 rounded mb-4" style={{ background: "rgba(255,255,255,0.07)" }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2.5 mb-1 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="w-11 h-11 rounded-xl flex-shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
                <div className="h-2.5 w-28 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
              </div>
            </div>
          ))}
        </div>
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

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}