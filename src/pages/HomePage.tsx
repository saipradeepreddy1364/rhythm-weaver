import { useEffect, useState, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
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

// ─── Dynamic current year — auto-updates every year ──────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
const PREV_YEAR    = CURRENT_YEAR - 1;

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function todaysSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Changes every 1 minute — used for Quick Picks rotation */
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

// ─── Query pools — fully dynamic using CURRENT_YEAR ──────────────────────────

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

// ─── Current-year hit query pools (for dedicated Hindi & Telugu sections) ─────
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

// ─── Film discovery query pools — large pool so daily rotation gives variety ──
// Each day todaysSeed() selects a different subset via seededShuffle, ensuring
// a completely different set of movies appears every day.
const FILM_DISCOVERY_QUERIES_POOL = [
  // Hindi / Bollywood
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
  // Telugu / Tollywood
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
  // Tamil / Kollywood
  `new tamil film songs ${CURRENT_YEAR}`,
  `kollywood new movie songs ${CURRENT_YEAR}`,
  `tamil movie release ${CURRENT_YEAR}`,
  `tamil blockbuster ${CURRENT_YEAR}`,
  // Kannada / Sandalwood
  `new kannada film songs ${CURRENT_YEAR}`,
  `sandalwood new movie songs ${CURRENT_YEAR}`,
  // Malayalam / Mollywood
  `new malayalam film songs ${CURRENT_YEAR}`,
  `mollywood new movie songs ${CURRENT_YEAR}`,
];

// ─── Artist discovery queries ─────────────────────────────────────────────────
const ARTIST_DISCOVERY_QUERIES = [
  "popular hindi playback singer songs",
  "top bollywood singer hits",
  "popular telugu playback singer songs",
  "best indian singer all time hits",
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

// ─── Section definitions — current-year hits appear first ────────────────────
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
  title: string;
  coverArt: string;
  songs: Song[];
  type: string;
  query?: string;
}

interface HomePageProps {
  onRequireAuth?: () => void;
}

// ─── Helper: safely read artist name from API response ────────────────────────
// The raw API may return `primaryArtists` or `singers` fields that are not in
// the typed Song interface. We cast safely so TypeScript is happy.
type RawSong = Song & {
  primaryArtists?: string;
  singers?: string;
};

function getArtistName(song: Song): string {
  const raw = song as RawSong;
  const field =
    raw.primaryArtists ||
    raw.singers ||
    (song as Song & { artist?: string }).artist ||
    "";
  return field.split(",")[0].trim();
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSection(query: string, limit = 25): Promise<Song[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1500);
      const res   = await api.searchSongs(query, 1, limit);
      const items = extractResults(res);
      const songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
      if (songs.length > 0) return songs;
    } catch {
      /* silent retry */
    }
  }
  return [];
}

async function fetchLanguageSongs(
  queries: string[],
  targetPerQuery = 50
): Promise<Song[]> {
  const seen = new Set<string>();
  const all: Song[] = [];
  for (const query of queries) {
    try {
      for (let pg = 1; pg <= 4; pg++) {
        if (pg > 1) await sleep(200);
        const res   = await api.searchSongs(query, pg, targetPerQuery);
        const items = extractResults(res);
        const songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
        let added = 0;
        for (const s of songs) {
          if (s.id && !seen.has(s.id)) {
            seen.add(s.id);
            all.push(s);
            added++;
          }
        }
        if (items.length < targetPerQuery || added === 0) break;
      }
    } catch {
      /* continue */
    }
    await sleep(150);
  }
  return all;
}

function dedup(songs: Song[], seen: Set<string>): Song[] {
  const out: Song[] = [];
  for (const s of songs) {
    if (s.id && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

/** Deeply paginate one query to get ALL available songs with no hard cap. */
async function fetchAllPages(
  query: string,
  maxPages = 60,
  seen?: Set<string>
): Promise<Song[]> {
  const localSeen = seen ?? new Set<string>();
  const all: Song[] = [];
  const pageSize = 50;
  for (let page = 1; page <= maxPages; page++) {
    try {
      if (page > 1) await sleep(250);
      const res   = await api.searchSongs(query, page, pageSize);
      const items = extractResults(res);
      if (items.length === 0) break;
      const songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
      let added = 0;
      for (const s of songs) {
        if (s.id && !localSeen.has(s.id)) {
          localSeen.add(s.id);
          all.push(s);
          added++;
        }
      }
      if (items.length < pageSize) break;
      if (added === 0) break;
    } catch {
      break;
    }
  }
  return all;
}

/**
 * Fetch a COMPLETE artist discography — every song from first to latest.
 * Runs many query variations and paginates deeply (up to 60 pages each = 3000
 * songs per query) so no song is missed, no matter how prolific the artist.
 */
async function fetchAllArtistSongs(artistName: string): Promise<Song[]> {
  const name = artistName
    .replace(/ Hits$/i, "")
    .replace(/ Classics$/i, "")
    .replace(/ Songs$/i, "")
    .trim();

  // Wide variety of query templates to maximise API coverage
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

  for (const q of queries) {
    const batch = await fetchAllPages(q, 60, seen); // 60 pages × 50 = 3 000 per query
    all.push(...batch);
    await sleep(300);
  }

  return all;
}

/**
 * Fetch all songs for a movie album — strict filtering so only that film's
 * songs appear, paginating deeply.
 */
async function fetchAllMovieSongs(
  query: string,
  albumTitle: string
): Promise<Song[]> {
  const seen = new Set<string>();
  const all: Song[] = [];
  const pageSize = 50;
  const maxPages = 60;

  for (let page = 1; page <= maxPages; page++) {
    try {
      if (page > 1) await sleep(300);
      const res   = await api.searchSongs(query, page, pageSize);
      const items = extractResults(res);
      let songs   = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));

      // Strict filter: keep only songs that actually belong to this movie/album
      const titleLower = albumTitle.toLowerCase();
      const filtered = songs.filter(
        (s: Song) =>
          s.movie?.toLowerCase().includes(titleLower) ||
          s.album?.toLowerCase().includes(titleLower)
      );
      // Use filtered if we got a meaningful match, otherwise keep all
      if (filtered.length >= 2) songs = filtered;

      for (const s of songs) {
        if (s.id && !seen.has(s.id)) {
          seen.add(s.id);
          all.push(s);
        }
      }
      if (items.length < pageSize) break;
    } catch {
      break;
    }
  }
  return all;
}

/** Dispatcher: choose the right deep-fetch strategy by album type. */
async function fetchAllSongs(
  query: string,
  albumTitle: string,
  albumType: string
): Promise<Song[]> {
  if (albumType === "artist" || albumType === "hero") {
    return fetchAllArtistSongs(albumTitle);
  }
  return fetchAllMovieSongs(query, albumTitle);
}

/**
 * Discover current-year film albums dynamically.
 * Uses a DAILY-ROTATED subset of FILM_DISCOVERY_QUERIES_POOL so a completely
 * different set of movies appears every day — no static list needed.
 */
async function fetchCurrentYearFilmAlbums(
  unmountedRef: React.MutableRefObject<boolean>
): Promise<AlbumData[]> {
  // Pick a daily-rotated subset of 10 queries from the large pool
  const dailyQueries = seededShuffle(FILM_DISCOVERY_QUERIES_POOL, todaysSeed()).slice(0, 10);

  const albumMap = new Map<string, { songs: Song[]; query: string }>();
  const seen     = new Set<string>();

  for (const query of dailyQueries) {
    if (unmountedRef.current) break;
    try {
      for (let pg = 1; pg <= 3; pg++) {
        if (unmountedRef.current) break;
        if (pg > 1) await sleep(200);
        const res   = await api.searchSongs(query, pg, 50);
        const items = extractResults(res);
        const songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));

        for (const song of songs) {
          const key = (song.movie || song.album || "").trim();
          if (!key || key.length < 3) continue;
          if (!albumMap.has(key)) {
            albumMap.set(key, { songs: [], query: `${key} songs` });
          }
          const entry = albumMap.get(key)!;
          if (song.id && !seen.has(song.id)) {
            seen.add(song.id);
            entry.songs.push(song);
          }
        }
        if (items.length < 50) break;
      }
    } catch {
      /* continue */
    }
    await sleep(200);
  }

  const albums: AlbumData[] = [];
  for (const [title, { songs, query }] of albumMap.entries()) {
    if (songs.length >= 1) {
      albums.push({
        title,
        coverArt: songs[0].albumArt || "",
        songs,
        type: "movie",
        query,
      });
    }
  }

  // Sort by song count (richest albums first), then apply daily shuffle for variety
  const sorted  = albums.sort((a, b) => b.songs.length - a.songs.length).slice(0, 60);
  const rotated = seededShuffle(sorted, todaysSeed());
  return rotated.slice(0, 25);
}

/**
 * Dynamically discover popular artists by searching and grouping results
 * by primary artist name — no static list.
 */
async function fetchDynamicArtists(
  unmountedRef: React.MutableRefObject<boolean>
): Promise<AlbumData[]> {
  const artistMap = new Map<string, Song[]>();
  const songSeen  = new Set<string>();

  for (const query of ARTIST_DISCOVERY_QUERIES) {
    if (unmountedRef.current) break;
    try {
      const res   = await api.searchSongs(query, 1, 50);
      const items = extractResults(res);
      const songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));

      for (const song of songs) {
        // ── FIX ts(2339): access extra API fields safely ──────────────────
        const artistName = getArtistName(song);
        if (!artistName || artistName.length < 2) continue;
        if (!artistMap.has(artistName)) artistMap.set(artistName, []);
        const arr = artistMap.get(artistName)!;
        if (song.id && !songSeen.has(song.id)) {
          songSeen.add(song.id);
          arr.push(song);
        }
      }
    } catch {
      /* continue */
    }
    await sleep(200);
  }

  const artists: AlbumData[] = [];
  for (const [name, songs] of artistMap.entries()) {
    if (songs.length >= 2) {
      artists.push({
        title:    name,
        coverArt: songs[0].albumArt || "",
        songs,
        type:     "artist",
        query:    `${name} songs`,
      });
    }
  }
  return artists.sort((a, b) => b.songs.length - a.songs.length).slice(0, 30);
}

// ─── Album Detail Modal ───────────────────────────────────────────────────────

function AlbumModal({
  album,
  albumType,
  albumQuery,
  onClose,
  onRequireAuth,
}: {
  album: AlbumData;
  albumType: string;
  albumQuery: string;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();
  const [songs, setSongs]             = useState<Song[]>(album.songs);
  const [loadingMore, setLoadingMore] = useState(true);

  useEffect(() => {
    setLoadingMore(true);
    fetchAllSongs(albumQuery, album.title, albumType)
      .then((fetched) => {
        if (fetched.length > 0) setSongs(fetched);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
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
                ? " · Fetching all songs…"
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
              {loadingMore
                ? `${songs.length} songs (loading more…)`
                : `${songs.length} songs`}
            </span>
          </div>
        )}

        {/* Song list */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {loadingMore && songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <p className="text-sm text-white/40">
                {albumType === "artist" || albumType === "hero"
                  ? "Fetching full discography…"
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
  label: string;
  mainQueries: string[];
  subCategories: { label: string; query: string }[];
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong }                      = usePlayer();
  const [allSongs, setAllSongs]           = useState<Song[]>([]);
  const [subSongs, setSubSongs]           = useState<Record<string, Song[]>>({});
  const [loading, setLoading]             = useState(true);
  const [activeTab, setActiveTab]         = useState("All");
  const fetchedRef                        = useRef(false);

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
        {/* Header */}
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

        {/* Tabs */}
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

        {/* Song list */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
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
  title:       string;
  albums:      AlbumData[];
  loading:     boolean;
  onOpen:      (a: AlbumData) => void;
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
              <div
                className="h-3 w-24 rounded mb-1"
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
            </div>
          ))}
        </div>
      ) : albums.length > 0 ? (
        <div
          className="flex gap-4 px-4 overflow-x-auto"
          style={{
            scrollbarWidth:          "none",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties}
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
                    {album.songs.length}+
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-white truncate leading-tight text-center">
                {album.title}
              </p>
              {showCount && !roundCovers && (
                <p
                  className="text-xs text-center mt-0.5"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {album.songs.length} songs
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
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Show {songs.length - PREVIEW} more
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── SimpleSection ────────────────────────────────────────────────────────────

function SimpleSection({
  title,
  children,
}: {
  title:    string;
  children: React.ReactNode;
}) {
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

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

function cacheSet(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* storage quota exceeded — silently ignore */
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { user, logout }   = useAuth();
  const { recentlyPlayed } = usePlayer();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu]   = useState(false);

  useEffect(() => {
    document.title = "Medly";
  }, []);

  // Cache keys are date-scoped so they refresh daily automatically
  const todayCacheKey  = `hp_sections_${todaysSeed()}`;
  const albumsCacheKey = `hp_albums_${todaysSeed()}`;

  // ── Sections state (song rows) ────────────────────────────────────────────
  const [sections, setSections] = useState<SectionData[]>(
    () => cacheGet<SectionData[]>(todayCacheKey) ?? []
  );

  // ── Albums state ──────────────────────────────────────────────────────────
  const [filmAlbums, setFilmAlbums] = useState<AlbumData[]>(() => {
    const c = cacheGet<{ film: AlbumData[]; artist: AlbumData[] }>(albumsCacheKey);
    return c?.film ?? [];
  });
  const [artistAlbums, setArtistAlbums] = useState<AlbumData[]>(() => {
    const c = cacheGet<{ film: AlbumData[]; artist: AlbumData[] }>(albumsCacheKey);
    return c?.artist ?? [];
  });
  const [albumsLoading, setAlbumsLoading] = useState(() => {
    const c = cacheGet<{ film: AlbumData[]; artist: AlbumData[] }>(albumsCacheKey);
    return !c || c.film.length === 0;
  });

  // ── Open album modal ──────────────────────────────────────────────────────
  const [openAlbum, setOpenAlbum] = useState<{
    album:      AlbumData;
    albumType:  string;
    albumQuery: string;
  } | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const loadedRef     = useRef(false);
  const albumsLoadRef = useRef(false);
  const unmountedRef  = useRef(false);
  const globalSeenRef = useRef(new Set<string>());

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleOpenAlbum = (album: AlbumData) => {
    setOpenAlbum({
      album,
      albumType:  album.type,
      albumQuery: album.query ?? `${album.title} songs`,
    });
  };

  // ── Load song sections ────────────────────────────────────────────────────
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const cached = cacheGet<SectionData[]>(todayCacheKey);
    if (cached && cached.length >= SECTION_DEFS.length) return;

    globalSeenRef.current = new Set<string>();
    if (cached) {
      cached.forEach((s) =>
        s.songs.forEach((song) => song.id && globalSeenRef.current.add(song.id))
      );
      setSections(cached);
    } else {
      setSections([]);
    }

    let unmounted = false;

    async function loadInBatches() {
      const INITIAL      = 4;
      const firstResults = await Promise.all(
        SECTION_DEFS.slice(0, INITIAL).map(({ pool, seed }) =>
          fetchSection(pickQuery(pool, seed), 25)
        )
      );
      if (unmounted) return;

      let updated: SectionData[] = cached ? [...cached] : [];
      firstResults.forEach((songs, idx) => {
        const { title } = SECTION_DEFS[idx];
        const unique    = dedup(songs, globalSeenRef.current);
        if (unique.length === 0) return;
        updated = [
          ...updated.filter((s) => s.title !== title),
          { title, songs: unique },
        ];
        updated.sort(
          (a, b) =>
            SECTION_DEFS.findIndex((d) => d.title === a.title) -
            SECTION_DEFS.findIndex((d) => d.title === b.title)
        );
      });
      setSections(updated);
      cacheSet(todayCacheKey, updated);

      for (let i = INITIAL; i < SECTION_DEFS.length; i += 2) {
        if (unmounted) return;
        await sleep(600);
        const batch   = SECTION_DEFS.slice(i, i + 2);
        const results = await Promise.all(
          batch.map(({ pool, seed }) => fetchSection(pickQuery(pool, seed), 25))
        );
        if (unmounted) return;
        results.forEach((songs, idx) => {
          const { title } = batch[idx];
          const unique    = dedup(songs, globalSeenRef.current);
          if (unique.length === 0) return;
          setSections((prev) => {
            const next = [
              ...prev.filter((s) => s.title !== title),
              { title, songs: unique },
            ];
            next.sort(
              (a, b) =>
                SECTION_DEFS.findIndex((d) => d.title === a.title) -
                SECTION_DEFS.findIndex((d) => d.title === b.title)
            );
            cacheSet(todayCacheKey, next);
            return next;
          });
        });
      }
    }

    loadInBatches();
    return () => {
      unmounted = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Quick Picks — rotate every 1 minute ───────────────────────────────────
  const [minuteTick, setMinuteTick] = useState(oneMinSeed());
  useEffect(() => {
    const id = setInterval(() => setMinuteTick(oneMinSeed()), 60_000); // 1 minute
    return () => clearInterval(id);
  }, []);

  const quickPickSongs = (() => {
    const pool = sections.flatMap((s) => s.songs);
    if (pool.length === 0) return [];
    return seededShuffle(pool, minuteTick).slice(0, 12);
  })();

  // ── Load dynamic film & artist albums ─────────────────────────────────────
  useEffect(() => {
    if (albumsLoadRef.current) return;
    albumsLoadRef.current = true;

    const cachedAlbums = cacheGet<{ film: AlbumData[]; artist: AlbumData[] }>(
      albumsCacheKey
    );
    if (cachedAlbums && cachedAlbums.film.length > 0) {
      setFilmAlbums(cachedAlbums.film);
      setArtistAlbums(cachedAlbums.artist);
      setAlbumsLoading(false);
      return;
    }

    setAlbumsLoading(true);

    async function loadDynamic() {
      const [filmResults, artistResults] = await Promise.all([
        fetchCurrentYearFilmAlbums(unmountedRef),
        fetchDynamicArtists(unmountedRef),
      ]);
      if (unmountedRef.current) return;
      setFilmAlbums(filmResults);
      setArtistAlbums(artistResults);
      setAlbumsLoading(false);
      cacheSet(albumsCacheKey, { film: filmResults, artist: artistResults });
    }

    loadDynamic();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>

      {/* Album detail modal */}
      {openAlbum && (
        <AlbumModal
          album={openAlbum.album}
          albumType={openAlbum.albumType}
          albumQuery={openAlbum.albumQuery}
          onClose={() => setOpenAlbum(null)}
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
            onClick={() =>
              user ? setShowUserMenu((v) => !v) : setShowAuthModal(true)
            }
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ background: user ? "#1DB954" : "rgba(255,255,255,0.1)" }}
          >
            {user ? (
              <span className="text-sm font-bold text-black">
                {(
                  user.username?.charAt(0) ||
                  user.email?.charAt(0) ||
                  "U"
                ).toUpperCase()}
              </span>
            ) : (
              <User className="w-4 h-4 text-white" />
            )}
          </button>
          {showUserMenu && user && (
            <div
              className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl overflow-hidden"
              style={{
                background: "#1a1a1a",
                border:     "1px solid rgba(255,255,255,0.08)",
                zIndex:     50,
              }}
            >
              <div
                className="px-4 py-3"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
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

      {/* ── Quick Picks (rotates every 1 minute) ── */}
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
                <div
                  className="w-12 h-12 flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                />
                <div
                  className="flex-1 h-3 rounded mr-2"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New Releases — dynamically discovered, daily rotating film albums ── */}
      <AlbumRow
        title={`New Releases ${CURRENT_YEAR}`}
        albums={filmAlbums}
        loading={albumsLoading}
        onOpen={handleOpenAlbum}
        showCount={true}
      />

      {/* ── Popular Artists — dynamically discovered ── */}
      <AlbumRow
        title="Popular Artists"
        albums={artistAlbums}
        loading={albumsLoading}
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

      {/* ── Song sections — current-year Hindi & Telugu hits appear first ── */}
      {sections.length === 0 ? (
        <div className="px-4 mb-5">
          <div
            className="h-4 w-36 rounded mb-4"
            style={{ background: "rgba(255,255,255,0.07)" }}
          />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2.5 mb-1 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div
                className="w-11 h-11 rounded-xl flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
              <div className="flex-1 space-y-1.5">
                <div
                  className="h-3 w-40 rounded"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                />
                <div
                  className="h-2.5 w-28 rounded"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                />
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