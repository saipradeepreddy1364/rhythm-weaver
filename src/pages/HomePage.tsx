import { useEffect, useState, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { Music2, User, LogOut, ChevronDown, ChevronUp, Play, Disc3, ArrowLeft } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";

// ─── Daily rotation ───────────────────────────────────────────────────────────

function todaysSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
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

// ─── Album + Artist queries (30+ entries) ─────────────────────────────────────

const ALBUM_QUERIES = [
  // ── Blockbuster Films ──
  { title: "Kalki 2898 AD",          query: "Kalki 2898 AD songs",                    type: "album" },
  { title: "Animal",                 query: "Animal movie songs bollywood",            type: "album" },
  { title: "Jawan",                  query: "Jawan movie songs shahrukh",              type: "album" },
  { title: "Dunki",                  query: "Dunki movie songs 2023",                  type: "album" },
  { title: "Leo",                    query: "Leo Tamil movie songs",                   type: "album" },
  { title: "Jailer",                 query: "Jailer Tamil movie songs",                type: "album" },
  { title: "Pushpa 2",               query: "Pushpa 2 Telugu songs",                   type: "album" },
  { title: "Devara",                 query: "Devara Jr NTR songs",                     type: "album" },
  { title: "RRR",                    query: "RRR movie songs",                         type: "album" },
  { title: "Pathaan",                query: "Pathaan movie songs",                     type: "album" },
  { title: "Rocky Aur Rani",         query: "Rocky Aur Rani Kii Prem Kahaani songs",  type: "album" },
  { title: "Tu Jhoothi Main Makkar", query: "Tu Jhoothi Main Makkar songs",            type: "album" },
  { title: "Stree 2",                query: "Stree 2 movie songs 2024",                type: "album" },
  { title: "Fighter",                query: "Fighter movie songs Hrithik 2024",        type: "album" },
  { title: "Singham Returns",        query: "Singham Returns movie songs 2024",        type: "album" },
  { title: "Merry Christmas",        query: "Merry Christmas movie songs 2024",        type: "album" },
  { title: "HanuMan",                query: "HanuMan Telugu movie songs",              type: "album" },
  { title: "Salaar",                 query: "Salaar Prabhas movie songs",              type: "album" },
  { title: "Bhool Bhulaiyaa 3",      query: "Bhool Bhulaiyaa 3 songs 2024",           type: "album" },
  { title: "Singham Again",          query: "Singham Again songs 2024",               type: "album" },

  // ── Popular Artists ──
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
  { title: "KGF Chapter 2",          query: "KGF Chapter 2 songs Kannada",            type: "album" },
  { title: "Mirzapur Soundtrack",    query: "Mirzapur web series songs",              type: "album" },
];

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectionData {
  title: string;
  songs: Song[];
}

interface AlbumData {
  title: string;
  coverArt: string;
  songs: Song[];
  type?: string;
}

interface HomePageProps {
  onRequireAuth?: () => void;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

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

/** Fetch 100+ songs for an album/artist by paginating across multiple pages */
async function fetchAlbumSongs(query: string, targetCount = 120): Promise<Song[]> {
  const seen = new Set<string>();
  const all: Song[] = [];
  const pageSize = 50;
  const maxPages = Math.ceil(targetCount / pageSize);

  for (let page = 1; page <= maxPages; page++) {
    try {
      if (page > 1) await sleep(300);
      const res = await api.searchSongs(query, page, pageSize);
      const items = extractResults(res);
      const songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
      for (const s of songs) {
        if (s.id && !seen.has(s.id)) {
          seen.add(s.id);
          all.push(s);
        }
      }
      // Stop early if API returned fewer than pageSize (no more results)
      if (songs.length < pageSize) break;
      if (all.length >= targetCount) break;
    } catch { break; }
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

// ─── Album Detail Page ────────────────────────────────────────────────────────

function AlbumModal({
  album,
  onClose,
  onRequireAuth,
}: {
  album: AlbumData;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();
  const [songs, setSongs] = useState<Song[]>(album.songs);
  const [loadingMore, setLoadingMore] = useState(false);

  // If album was opened with few songs, try to load more
  useEffect(() => {
    if (album.songs.length < 60) {
      setLoadingMore(true);
      const aq = ALBUM_QUERIES.find((a) => a.title === album.title);
      if (aq) {
        fetchAlbumSongs(aq.query, 120).then((fetched) => {
          if (fetched.length > album.songs.length) setSongs(fetched);
          setLoadingMore(false);
        });
      } else {
        setLoadingMore(false);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col"
      style={{ background: "#0d0d0d" }}
    >
      {/* Blurred cover background */}
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
        <div className="flex items-center gap-3 px-4 pt-12 pb-4">
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
              {loadingMore ? "Loading songs…" : `${songs.length} songs`}
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

        {/* Song list */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {loadingMore && songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <p className="text-sm text-white/40">Loading songs…</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2 pb-32">
              {songs.map((song) => (
                <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
              ))}
              {loadingMore && (
                <div className="flex items-center justify-center py-6">
                  <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { user, logout } = useAuth();
  const { recentlyPlayed } = usePlayer();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sections, setSections] = useState<SectionData[]>([]);

  // Separate album sections: films vs artists
  const [filmAlbums, setFilmAlbums] = useState<AlbumData[]>([]);
  const [artistAlbums, setArtistAlbums] = useState<AlbumData[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);

  const [openAlbum, setOpenAlbum] = useState<AlbumData | null>(null);

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

  // ── Load song sections ──────────────────────────────────────────────────────
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

  // ── Load all albums with 100+ songs each ────────────────────────────────────
  useEffect(() => {
    let unmounted = false;
    setAlbumsLoading(true);

    async function loadAlbums() {
      // Load all albums in parallel (initial quick fetch of ~20 songs each)
      const settled = await Promise.allSettled(
        ALBUM_QUERIES.map(async ({ title, query, type }) => {
          try {
            const res = await api.searchSongs(query, 1, 30);
            const songs = extractResults(res).map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
            if (songs.length < 3) return null;
            return { title, coverArt: songs[0].albumArt || "", songs, type } as AlbumData;
          } catch {
            return null;
          }
        })
      );
      if (unmounted) return;

      const result = settled
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter((a): a is AlbumData => a !== null);

      setFilmAlbums(result.filter((a) => a.type !== "artist"));
      setArtistAlbums(result.filter((a) => a.type === "artist"));
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
    const shuffled = [...pool].sort((a, b) => {
      const ha = ((a.id?.charCodeAt(0) ?? 0) + seed) % 997;
      const hb = ((b.id?.charCodeAt(0) ?? 0) + seed) % 997;
      return ha - hb;
    });
    return shuffled;
  })();

  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>

      {/* ── Album detail modal ── */}
      {openAlbum && (
        <AlbumModal
          album={openAlbum}
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
              className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
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

      {/* ── Featured Movie Albums ── */}
      <AlbumRow
        title="Featured Albums"
        albums={filmAlbums}
        loading={albumsLoading}
        onOpen={setOpenAlbum}
      />

      {/* ── Popular Artists ── */}
      <AlbumRow
        title="Popular Artists"
        albums={artistAlbums}
        loading={albumsLoading}
        onOpen={setOpenAlbum}
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

      {/* ── Song sections ── */}
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

// ─── AlbumRow — horizontal scrollable row of album cards ─────────────────────

function AlbumRow({
  title,
  albums,
  loading,
  onOpen,
  roundCovers = false,
}: {
  title: string;
  albums: AlbumData[];
  loading: boolean;
  onOpen: (a: AlbumData) => void;
  roundCovers?: boolean;
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
              <div className="h-3 w-24 rounded mb-1.5" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="h-2.5 w-16 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
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
              {/* Cover art */}
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
                {/* Play button — hidden for round (artist) covers */}
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
              </div>

              {/* Label */}
              <p className="text-sm font-semibold text-white truncate leading-tight text-center">
                {album.title}
              </p>
              <p className="text-xs mt-0.5 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                {album.songs.length}+ songs
              </p>
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