import { useEffect, useState, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { Music2, User, LogOut, ChevronDown, ChevronUp, Play, Disc3, ArrowLeft } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";
import { MiniPlayer } from "@/components/MiniPlayer";

// ─── Daily seed (changes every day) ──────────────────────────────────────────

function todaysSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
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
  "trending hindi songs 2025", "top hindi hits 2025",
  "best new hindi songs",      "viral hindi songs 2025",
  "popular hindi songs 2025",  "latest hindi film songs",
  "hindi chartbusters 2025",   "super hit hindi songs 2025",
];
const TELUGU_QUERIES = [
  "trending telugu songs 2025", "top tollywood hits 2025",
  "best telugu songs 2025",     "new telugu songs 2025",
  "viral telugu songs 2025",    "popular telugu film songs",
  "telugu chartbusters 2025",   "super hit telugu songs",
];
const TAMIL_QUERIES = [
  "trending tamil songs 2025", "top kollywood hits 2025",
  "best tamil songs 2025",     "new tamil songs 2025",
  "viral tamil songs 2025",    "popular tamil film songs",
  "tamil chartbusters 2025",   "super hit tamil songs",
];
const BOLLYWOOD_QUERIES = [
  "latest bollywood hits 2025", "new bollywood songs 2025",
  "bollywood blockbuster 2025", "hit bollywood dance songs",
  "bollywood romantic 2025",    "bollywood party songs 2025",
  "bollywood new release 2025", "top bollywood songs 2025",
];
const PUNJABI_QUERIES = [
  "top punjabi songs 2025",    "trending punjabi 2025",
  "new punjabi hits 2025",     "best punjabi songs 2025",
  "viral punjabi songs 2025",  "popular punjabi 2025",
  "punjabi chartbusters 2025", "super hit punjabi songs",
];
const ROMANTIC_QUERIES = [
  "hindi romantic songs 2025", "love songs bollywood 2025",
  "best romantic hindi songs", "heart touching songs hindi",
  "sad romantic songs hindi",  "romantic duets bollywood",
  "romantic telugu songs 2025","best love songs indian",
];
const PARTY_QUERIES = [
  "party songs hindi 2025",  "bollywood dance hits 2025",
  "high energy hindi songs", "dj remix bollywood 2025",
  "club songs bollywood",    "dance floor hits india",
  "party anthems hindi",     "bollywood bangers 2025",
];
const RETRO_QUERIES = [
  "old hindi classic songs",  "90s bollywood hits",
  "80s hindi songs superhit", "retro bollywood classics",
  "evergreen hindi songs",    "golden era bollywood",
  "vintage hindi film songs", "old is gold hindi songs",
];
const KANNADA_QUERIES = [
  "trending kannada songs 2025", "top sandalwood hits 2025",
  "best kannada songs 2025",     "new kannada songs 2025",
  "popular kannada film songs",  "viral kannada songs 2025",
  "kannada chartbusters 2025",   "super hit kannada songs",
];
const MALAYALAM_QUERIES = [
  "trending malayalam songs 2025", "top mollywood hits 2025",
  "best malayalam songs 2025",     "new malayalam songs 2025",
  "popular malayalam film songs",  "viral malayalam songs 2025",
  "malayalam chartbusters 2025",   "super hit malayalam songs",
];

// ─── ALL album + artist entries ───────────────────────────────────────────────

const ALL_ALBUM_ENTRIES = [
  { title: "Kalki 2898 AD",          query: "Kalki 2898 AD songs",                    type: "movie" },
  { title: "Animal",                 query: "Animal movie songs bollywood",            type: "movie" },
  { title: "Jawan",                  query: "Jawan movie songs shahrukh",              type: "movie" },
  { title: "Dunki",                  query: "Dunki movie songs 2023",                  type: "movie" },
  { title: "Leo",                    query: "Leo Tamil movie songs",                   type: "movie" },
  { title: "Jailer",                 query: "Jailer Tamil movie songs",                type: "movie" },
  { title: "Pushpa 2",               query: "Pushpa 2 Telugu songs",                   type: "movie" },
  { title: "Devara",                 query: "Devara Jr NTR songs",                     type: "movie" },
  { title: "RRR",                    query: "RRR movie songs",                         type: "movie" },
  { title: "Pathaan",                query: "Pathaan movie songs",                     type: "movie" },
  { title: "Rocky Aur Rani",         query: "Rocky Aur Rani Kii Prem Kahaani songs",  type: "movie" },
  { title: "Tu Jhoothi Main Makkar", query: "Tu Jhoothi Main Makkar songs",            type: "movie" },
  { title: "Stree 2",                query: "Stree 2 movie songs 2024",                type: "movie" },
  { title: "Fighter",                query: "Fighter movie songs Hrithik 2024",        type: "movie" },
  { title: "Singham Returns",        query: "Singham Returns movie songs 2024",        type: "movie" },
  { title: "HanuMan",                query: "HanuMan Telugu movie songs",              type: "movie" },
  { title: "Salaar",                 query: "Salaar Prabhas movie songs",              type: "movie" },
  { title: "Bhool Bhulaiyaa 3",      query: "Bhool Bhulaiyaa 3 songs 2024",           type: "movie" },
  { title: "Singham Again",          query: "Singham Again songs 2024",               type: "movie" },
  { title: "KGF Chapter 2",          query: "KGF Chapter 2 songs Kannada",            type: "movie" },
  { title: "Mirzapur Soundtrack",    query: "Mirzapur web series songs",              type: "movie" },
  { title: "Merry Christmas",        query: "Merry Christmas movie songs 2024",        type: "movie" },

  { title: "Arijit Singh Hits",      query: "Arijit Singh best songs",                type: "artist" },
  { title: "AR Rahman Classics",     query: "AR Rahman hit songs",                    type: "artist" },
  { title: "Shreya Ghoshal",         query: "Shreya Ghoshal best songs",              type: "artist" },
  { title: "Diljit Dosanjh",         query: "Diljit Dosanjh top songs",               type: "artist" },
  { title: "Badshah Hits",           query: "Badshah rap songs best",                 type: "artist" },
  { title: "Neha Kakkar",            query: "Neha Kakkar hit songs",                  type: "artist" },
  { title: "Atif Aslam",             query: "Atif Aslam best Hindi songs",            type: "artist" },
  { title: "Sonu Nigam",             query: "Sonu Nigam hit songs",                   type: "artist" },
  { title: "Kumar Sanu Classics",    query: "Kumar Sanu 90s hit songs",               type: "artist" },
  { title: "Lata Mangeshkar",        query: "Lata Mangeshkar golden songs",           type: "artist" },
  { title: "Kishore Kumar",          query: "Kishore Kumar evergreen songs",          type: "artist" },
  { title: "Mohammed Rafi",          query: "Mohammed Rafi classic hit songs",        type: "artist" },
  { title: "Asha Bhosle",            query: "Asha Bhosle best songs",                 type: "artist" },
  { title: "SP Balasubrahmanyam",    query: "SP Balasubrahmanyam hit songs telugu",   type: "artist" },

  { title: "Prabhas Hits",           query: "Prabhas songs all movies",               type: "hero" },
  { title: "Allu Arjun Hits",        query: "Allu Arjun songs all movies",            type: "hero" },
  { title: "Jr NTR Hits",            query: "Jr NTR songs all movies",                type: "hero" },
  { title: "Ram Charan Hits",        query: "Ram Charan songs all movies",            type: "hero" },
  { title: "Vijay Hits",             query: "Thalapathy Vijay songs all movies",      type: "hero" },
  { title: "Ajith Kumar Hits",       query: "Ajith Kumar songs all movies",           type: "hero" },
  { title: "Rajinikanth Hits",       query: "Rajinikanth songs all movies",           type: "hero" },
  { title: "Shah Rukh Khan Hits",    query: "Shah Rukh Khan songs all movies",        type: "hero" },
  { title: "Salman Khan Hits",       query: "Salman Khan songs all movies",           type: "hero" },
  { title: "Hrithik Roshan Hits",    query: "Hrithik Roshan songs all movies",        type: "hero" },
  { title: "Yash Hits",              query: "Yash KGF songs all movies",              type: "hero" },
  { title: "Mahesh Babu Hits",       query: "Mahesh Babu songs all movies",           type: "hero" },
];

const FILM_HERO_POOL = ALL_ALBUM_ENTRIES.filter((e) => e.type === "movie" || e.type === "hero");
const ARTIST_POOL    = ALL_ALBUM_ENTRIES.filter((e) => e.type === "artist");

function getTodaysAlbums() {
  const seed = todaysSeed();
  const shuffledFilm   = seededShuffle(FILM_HERO_POOL, seed);
  const shuffledArtist = seededShuffle(ARTIST_POOL, seed + 9999);
  return {
    filmEntries:   shuffledFilm.slice(0, 10),
    artistEntries: shuffledArtist.slice(0, 8),
  };
}

const SECTION_DEFS = [
  { title: "Trending Hindi",     pool: HINDI_QUERIES,     seed: 1 },
  { title: "Trending Telugu",    pool: TELUGU_QUERIES,    seed: 2 },
  { title: "Trending Tamil",     pool: TAMIL_QUERIES,     seed: 3 },
  { title: "Latest Bollywood",   pool: BOLLYWOOD_QUERIES, seed: 4 },
  { title: "Top Punjabi",        pool: PUNJABI_QUERIES,   seed: 5 },
  { title: "Romantic Vibes",     pool: ROMANTIC_QUERIES,  seed: 6 },
  { title: "Party Hits",         pool: PARTY_QUERIES,     seed: 7 },
  { title: "Old is Gold",        pool: RETRO_QUERIES,     seed: 8 },
  { title: "Trending Kannada",   pool: KANNADA_QUERIES,   seed: 9 },
  { title: "Trending Malayalam", pool: MALAYALAM_QUERIES, seed: 10 },
];

// ─── Language category queries for full song lists ────────────────────────────

const LANGUAGE_CATEGORIES = [
  {
    label: "Hindi",
    queries: ["top hindi songs 2025", "hindi hits 2025", "bollywood songs 2025", "latest hindi film songs 2025"],
    subCategories: [
      { label: "Romantic", query: "hindi romantic songs 2025" },
      { label: "Party/Dance", query: "hindi dance party songs 2025" },
      { label: "Devotional", query: "hindi devotional songs 2025" },
      { label: "Retro 90s", query: "90s hindi songs superhit" },
    ]
  },
  {
    label: "Telugu",
    queries: ["top telugu songs 2025", "tollywood hits 2025", "telugu film songs 2025", "new telugu songs 2025"],
    subCategories: [
      { label: "Romantic", query: "telugu romantic songs 2025" },
      { label: "Item Songs", query: "telugu item songs hit" },
      { label: "Devotional", query: "telugu devotional songs" },
      { label: "Old Hits", query: "old telugu songs evergreen" },
    ]
  },
  {
    label: "Tamil",
    queries: ["top tamil songs 2025", "kollywood hits 2025", "tamil film songs 2025", "new tamil songs 2025"],
    subCategories: [
      { label: "Romantic", query: "tamil romantic songs 2025" },
      { label: "Folk", query: "tamil folk songs hit" },
      { label: "Devotional", query: "tamil devotional songs" },
      { label: "Old Hits", query: "old tamil songs evergreen" },
    ]
  },
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
}

interface HomePageProps {
  onRequireAuth?: () => void;
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSection(query: string, limit = 25): Promise<Song[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1500);
      const res = await api.searchSongs(query, 1, limit);
      const items = extractResults(res);
      const songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
      if (songs.length > 0) return songs;
    } catch { /* silent retry */ }
  }
  return [];
}

/**
 * Fetch ALL available songs by paginating multiple pages.
 * Fetches up to targetCount songs, returns everything with audioUrl.
 */
async function fetchAllSongs(
  query: string,
  albumTitle: string,
  albumType: string,
  targetCount = 1000
): Promise<Song[]> {
  const seen = new Set<string>();
  const all: Song[] = [];
  const pageSize = 50;
  const maxPages = Math.ceil(targetCount / pageSize);

  for (let page = 1; page <= maxPages; page++) {
    try {
      if (page > 1) await sleep(300);
      const res = await api.searchSongs(query, page, pageSize);
      const items = extractResults(res);
      let songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));

      if (albumType === "movie") {
        const filtered = songs.filter((s: Song) =>
          s.movie?.toLowerCase().includes(albumTitle.toLowerCase()) ||
          s.album?.toLowerCase().includes(albumTitle.toLowerCase())
        );
        // Only filter strictly if we get enough matches
        if (filtered.length >= 2) songs = filtered;
      }

      for (const s of songs) {
        if (s.id && !seen.has(s.id)) {
          seen.add(s.id);
          all.push(s);
        }
      }
      // Stop if API returned fewer results than page size (no more data)
      if (items.length < pageSize) break;
      if (all.length >= targetCount) break;
    } catch { break; }
  }
  return all;
}

/**
 * Fetch songs for multiple queries combined (for language categories),
 * returning all unique songs across all queries.
 */
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
        const res = await api.searchSongs(query, pg, targetPerQuery);
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
    } catch { /* continue with next query */ }
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

// ─── Album Detail Modal ────────────────────────────────────────────────────────

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
  const [songs, setSongs] = useState<Song[]>(album.songs);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setLoadingMore(true);
    fetchAllSongs(albumQuery, album.title, albumType, 1000).then((fetched) => {
      if (fetched.length > 0) setSongs(fetched);
      setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const typeLabel =
    albumType === "movie"  ? "Movie Soundtrack" :
    albumType === "artist" ? "Artist" :
    albumType === "hero"   ? "Actor — All Movies" :
    "Album";

  return (
    <div className="fixed inset-0 z-[55] flex flex-col" style={{ background: "#0d0d0d" }}>
      {album.coverArt && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${album.coverArt})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(50px) saturate(2)",
            transform: "scale(1.3)",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(13,13,13,0.6) 0%, rgba(13,13,13,0.95) 40%)" }}
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
                ? " · Loading more…"
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
          <div className="rounded-2xl overflow-hidden mx-auto shadow-2xl" style={{ width: 180, height: 180 }}>
            {album.coverArt ? (
              <img
                src={album.coverArt}
                alt={album.title}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/300x300?text=🎵"; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
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
              {songs.length} songs available
            </span>
          </div>
        )}

        {/* Song list */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {loadingMore && songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <p className="text-sm text-white/40">Loading songs…</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2 pb-40">
              {songs.map((song) => (
                <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
              ))}
              {loadingMore && songs.length > 0 && (
                <div className="flex items-center justify-center py-6 gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                  <span className="text-xs text-white/40">Loading more songs…</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MiniPlayer inside modal */}
      <MiniPlayer onRequireAuth={onRequireAuth} />
    </div>
  );
}

// ─── Language Category Modal — shows all songs for a language with sub-categories ──

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
  const { playSong } = usePlayer();
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [subSongs, setSubSongs] = useState<Record<string, Song[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Fetch main language songs
    fetchLanguageSongs(mainQueries, 50).then((songs) => {
      setAllSongs(songs);
      setLoading(false);
    });

    // Fetch sub-category songs in background
    subCategories.forEach(async ({ label: subLabel, query }) => {
      const songs = await fetchSection(query, 50);
      setSubSongs((prev) => ({ ...prev, [subLabel]: songs }));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = ["All", ...subCategories.map((s) => s.label)];
  const displaySongs = activeTab === "All" ? allSongs : (subSongs[activeTab] || []);

  return (
    <div className="fixed inset-0 z-[55] flex flex-col" style={{ background: "#0d0d0d" }}>
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(29,185,84,0.15) 0%, rgba(13,13,13,0.98) 30%)" }}
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
                color: activeTab === tab ? "#000" : "rgba(255,255,255,0.6)",
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

        {/* Songs */}
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
                <SongRow key={song.id} song={song} queue={displaySongs} onRequireAuth={onRequireAuth} />
              ))}
            </div>
          )}
        </div>
      </div>

      <MiniPlayer onRequireAuth={onRequireAuth} />
    </div>
  );
}

// ─── AlbumRow — horizontal scrollable row of album cards WITH count label ─────

function AlbumRow({
  title,
  albums,
  loading,
  onOpen,
  roundCovers = false,
  showCount = false,
}: {
  title: string;
  albums: AlbumData[];
  loading: boolean;
  onOpen: (a: AlbumData) => void;
  roundCovers?: boolean;
  showCount?: boolean;
}) {
  const { playSong } = usePlayer();

  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-white mb-3 px-4">{title}</h2>
      {loading ? (
        <div className="flex gap-4 px-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0" style={{ width: 140 }}>
              <div
                className="mb-2"
                style={{
                  width: 140, height: 140,
                  background: "rgba(255,255,255,0.07)",
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
                style={{
                  width: 150,
                  height: 150,
                  borderRadius: roundCovers ? "50%" : 12,
                }}
                onClick={() => onOpen(album)}
              >
                {album.coverArt ? (
                  <img
                    src={album.coverArt}
                    alt={album.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://via.placeholder.com/300x300?text=🎵";
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
                {/* Song count badge on cover */}
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
              {/* Song count below title for non-round covers */}
              {showCount && !roundCovers && (
                <p className="text-xs text-center mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  songs,
  onRequireAuth,
}: {
  title: string;
  songs: Song[];
  onRequireAuth: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 5;
  const visible = expanded ? songs : songs.slice(0, PREVIEW);

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
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
            : <><ChevronDown className="w-3.5 h-3.5" /> Show {songs.length - PREVIEW} more</>
          }
        </button>
      )}
    </div>
  );
}

function SimpleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-white mb-2 px-4">{title}</h2>
      <div className="space-y-0.5 px-4">{children}</div>
    </div>
  );
}

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
            (e.target as HTMLImageElement).src = "https://via.placeholder.com/100x100?text=🎵";
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
      <span className="text-xs font-semibold truncate pr-2" style={{ color: "rgba(255,255,255,0.9)" }}>
        {song.title}
      </span>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { user, logout } = useAuth();
  const { recentlyPlayed } = usePlayer();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sections, setSections] = useState<SectionData[]>([]);

  const [filmAlbums, setFilmAlbums] = useState<AlbumData[]>([]);
  const [artistAlbums, setArtistAlbums] = useState<AlbumData[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);

  const [openAlbum, setOpenAlbum] = useState<{
    album: AlbumData;
    albumType: string;
    albumQuery: string;
  } | null>(null);

  const [openLanguage, setOpenLanguage] = useState<typeof LANGUAGE_CATEGORIES[0] | null>(null);

  const loadedRef = useRef(false);
  const globalSeenRef = useRef(new Set<string>());

  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleOpenAlbum = (album: AlbumData) => {
    const entry = ALL_ALBUM_ENTRIES.find((e) => e.title === album.title);
    setOpenAlbum({
      album,
      albumType: entry?.type ?? "movie",
      albumQuery: entry?.query ?? album.title,
    });
  };

  // ── Load song sections (daily rotating) ─────────────────────────────────────
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    globalSeenRef.current = new Set<string>();
    setSections([]);

    const BATCH_SIZE = 2;
    const BATCH_DELAY_MS = 500;
    let unmounted = false;

    async function loadInBatches() {
      for (let i = 0; i < SECTION_DEFS.length; i += BATCH_SIZE) {
        if (unmounted) return;
        const batch = SECTION_DEFS.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(({ pool, seed }) => fetchSection(pickQuery(pool, seed), 25))
        );
        if (unmounted) return;
        results.forEach((songs, idx) => {
          const { title } = batch[idx];
          const unique = dedup(songs, globalSeenRef.current);
          if (unique.length === 0) return;
          setSections((prev) => {
            const updated = [
              ...prev.filter((s) => s.title !== title),
              { title, songs: unique },
            ];
            updated.sort(
              (a, b) =>
                SECTION_DEFS.findIndex((d) => d.title === a.title) -
                SECTION_DEFS.findIndex((d) => d.title === b.title)
            );
            return updated;
          });
        });
        if (i + BATCH_SIZE < SECTION_DEFS.length) await sleep(BATCH_DELAY_MS);
      }
    }

    loadInBatches();
    return () => { unmounted = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load today's daily-rotating albums ──────────────────────────────────────
  useEffect(() => {
    let unmounted = false;
    setAlbumsLoading(true);

    const { filmEntries, artistEntries } = getTodaysAlbums();

    async function loadAlbums() {
      const filmSettled = await Promise.allSettled(
        filmEntries.map(async ({ title, query, type }) => {
          try {
            const res = await api.searchSongs(query, 1, 10);
            let songs = extractResults(res).map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
            if (type === "movie") {
              const filtered = songs.filter((s: Song) =>
                s.movie?.toLowerCase().includes(title.toLowerCase()) ||
                s.album?.toLowerCase().includes(title.toLowerCase())
              );
              if (filtered.length >= 2) songs = filtered;
            }
            if (songs.length < 1) return null;
            return { title, coverArt: songs[0].albumArt || "", songs, type } as AlbumData;
          } catch {
            return null;
          }
        })
      );

      const artistSettled = await Promise.allSettled(
        artistEntries.map(async ({ title, query, type }) => {
          try {
            const res = await api.searchSongs(query, 1, 10);
            const songs = extractResults(res).map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
            if (songs.length < 1) return null;
            return { title, coverArt: songs[0].albumArt || "", songs, type } as AlbumData;
          } catch {
            return null;
          }
        })
      );

      if (unmounted) return;

      const filmResult = filmSettled
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter((a): a is AlbumData => a !== null);

      const artistResult = artistSettled
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter((a): a is AlbumData => a !== null);

      setFilmAlbums(filmResult);
      setArtistAlbums(artistResult);
      setAlbumsLoading(false);
    }

    loadAlbums();
    return () => { unmounted = true; };
  }, []);

  // ── Daily-rotating quick picks ───────────────────────────────────────────────
  const quickPickSongs = (() => {
    const pool = sections.flatMap((s) => s.songs);
    if (pool.length === 0) return [];
    const seed = todaysSeed();
    return seededShuffle(pool, seed).slice(0, 12);
  })();

  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>

      {/* ── Album detail modal ── */}
      {openAlbum && (
        <AlbumModal
          album={openAlbum.album}
          albumType={openAlbum.albumType}
          albumQuery={openAlbum.albumQuery}
          onClose={() => setOpenAlbum(null)}
          onRequireAuth={handleRequireAuth}
        />
      )}

      {/* ── Language category modal ── */}
      {openLanguage && (
        <LanguageCategoryModal
          label={openLanguage.label}
          mainQueries={openLanguage.queries}
          subCategories={openLanguage.subCategories}
          onClose={() => setOpenLanguage(null)}
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
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Picks (daily rotating) ── */}
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

      {/* ── Featured Movie & Hero Albums (with song count) ── */}
      <AlbumRow
        title="Featured Albums"
        albums={filmAlbums}
        loading={albumsLoading}
        onOpen={handleOpenAlbum}
        showCount={true}
      />

      {/* ── Popular Artists ── */}
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
            <SongRow key={song.id} song={song} queue={recentlyPlayed} onRequireAuth={handleRequireAuth} />
          ))}
        </SimpleSection>
      )}

      {/* ── Song sections (daily rotating queries) ── */}
      {sections.length === 0 ? (
        <div className="px-4 mb-5">
          <div className="h-4 w-36 rounded mb-4" style={{ background: "rgba(255,255,255,0.07)" }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 mb-1 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
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
          <CollapsibleSection key={title} title={title} songs={songs} onRequireAuth={handleRequireAuth} />
        ))
      )}

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}