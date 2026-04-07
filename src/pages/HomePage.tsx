import { useEffect, useState } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Music2, User, LogOut, ChevronDown, ChevronUp } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";

// ─── Daily seed: changes once per day ────────────────────────────────────────

function todaysSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Pick today's query from a pool using a per-section seed offset. */
function pickQuery(pool: string[], sectionOffset: number): string {
  const idx = (todaysSeed() + sectionOffset) % pool.length;
  return pool[idx];
}

// ─── Query pools (8 entries each = different query every day for a week+) ────

const HINDI_QUERIES = [
  "trending hindi songs 2025",
  "top hindi hits 2025",
  "best new hindi songs",
  "viral hindi songs 2025",
  "popular hindi songs april 2025",
  "latest hindi film songs",
  "hindi chartbusters 2025",
  "super hit hindi songs 2025",
];
const TELUGU_QUERIES = [
  "trending telugu songs 2025",
  "top tollywood hits 2025",
  "best telugu songs 2025",
  "new telugu songs 2025",
  "viral telugu songs 2025",
  "popular telugu film songs",
  "telugu chartbusters 2025",
  "super hit telugu songs",
];
const TAMIL_QUERIES = [
  "trending tamil songs 2025",
  "top kollywood hits 2025",
  "best tamil songs 2025",
  "new tamil songs 2025",
  "viral tamil songs 2025",
  "popular tamil film songs",
  "tamil chartbusters 2025",
  "super hit tamil songs",
];
const BOLLYWOOD_QUERIES = [
  "latest bollywood hits 2025",
  "new bollywood songs 2025",
  "bollywood blockbuster 2025",
  "hit bollywood dance songs",
  "bollywood romantic 2025",
  "bollywood party songs 2025",
  "bollywood new release 2025",
  "top bollywood songs 2025",
];
const PUNJABI_QUERIES = [
  "top punjabi songs 2025",
  "trending punjabi 2025",
  "new punjabi hits 2025",
  "best punjabi songs 2025",
  "viral punjabi songs 2025",
  "popular punjabi 2025",
  "punjabi chartbusters 2025",
  "super hit punjabi songs",
];
const ROMANTIC_QUERIES = [
  "hindi romantic songs 2025",
  "love songs bollywood 2025",
  "best romantic hindi songs",
  "heart touching songs hindi",
  "sad romantic songs hindi",
  "romantic duets bollywood",
  "romantic telugu songs 2025",
  "best love songs indian",
];
const PARTY_QUERIES = [
  "party songs hindi 2025",
  "bollywood dance hits 2025",
  "high energy hindi songs",
  "dj remix bollywood 2025",
  "club songs bollywood",
  "dance floor hits india",
  "party anthems hindi",
  "bollywood bangers 2025",
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
  "trending kannada songs 2025",
  "top sandalwood hits 2025",
  "best kannada songs 2025",
  "new kannada songs 2025",
  "popular kannada film songs",
];
const MALAYALAM_QUERIES = [
  "trending malayalam songs 2025",
  "top mollywood hits 2025",
  "best malayalam songs 2025",
  "new malayalam songs 2025",
  "popular malayalam film songs",
];

// ─── Section definitions ──────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchSection(query: string, limit = 25): Promise<Song[]> {
  try {
    const res = await api.searchSongs(query, 1, limit);
    const items = extractResults(res); // always returns array
    return items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
  } catch {
    return [];
  }
}

/** Remove songs already in `seen`; mutates `seen` in-place. */
function dedup(songs: Song[], seen: Set<string>): Song[] {
  const out: Song[] = [];
  for (const s of songs) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

interface SectionData {
  title: string;
  songs: Song[];
}

const BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

async function wakeServer(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/search/songs?query=hindi&page=1&limit=1`);
  } catch { /* ignore */ }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HomePageProps {
  onRequireAuth?: () => void;
}

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { user, logout } = useAuth();
  const { recentlyPlayed } = usePlayer();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [waking, setWaking] = useState(true);

  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  useEffect(() => {
    const load = async () => {
      setWaking(true);
      await wakeServer();
      setWaking(false);
      setLoading(true);

      // Fetch all sections in parallel using today's rotated queries
      const results = await Promise.all(
        SECTION_DEFS.map(({ pool, seed }) =>
          fetchSection(pickQuery(pool, seed), 25)
        )
      );

      // Global dedup: each song appears in at most one section
      const globalSeen = new Set<string>();
      const built: SectionData[] = SECTION_DEFS
        .map(({ title }, i) => ({
          title,
          songs: dedup(results[i], globalSeen),
        }))
        .filter(({ songs }) => songs.length > 0);

      setSections(built);
      setLoading(false);
    };

    load();
  }, []);

  // ── Loading state ────────────────────────────────────────────────────────────

  if (waking || loading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-3"
        style={{ background: "#121212" }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1DB954" }} />
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          {waking ? "Starting music server…" : "Loading songs…"}
        </p>
        {waking && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Free server wakes up in ~15 seconds
          </p>
        )}
      </div>
    );
  }

  // Quick picks = first 6 unique songs from the first loaded section
  const quickPickSongs = sections[0]?.songs.slice(0, 6) ?? [];

  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>

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

        {/* User avatar */}
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
                {(user.username?.charAt(0) || user.email?.charAt(0) || "U").toUpperCase()}
              </span>
            ) : (
              <User className="w-4 h-4 text-white" />
            )}
          </button>

          {showUserMenu && user && (
            <div
              className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
              style={{
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.08)",
                zIndex: 50,
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
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Picks ── */}
      {quickPickSongs.length > 0 && (
        <div className="px-4 pt-4 mb-6">
          <h2 className="text-base font-bold text-white mb-3">Quick Picks</h2>
          <div className="grid grid-cols-2 gap-2">
            {quickPickSongs.map((song) => (
              <QuickPick key={song.id} song={song} queue={quickPickSongs} />
            ))}
          </div>
        </div>
      )}

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

      {/* ── Daily rotating sections ── */}
      {sections.map(({ title, songs }) => (
        <CollapsibleSection
          key={title}
          title={title}
          songs={songs}
          onRequireAuth={handleRequireAuth}
        />
      ))}

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
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

function SimpleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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