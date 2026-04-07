import { useEffect, useState, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { Music2, User, LogOut, ChevronDown, ChevronUp } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";

// ─── Daily rotation ───────────────────────────────────────────────────────────

function todaysSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function pickQuery(pool: string[], sectionOffset: number): string {
  return pool[(todaysSeed() + sectionOffset) % pool.length];
}

// ─── Query pools (8 per section = different query every day for 8 days) ───────

const HINDI_QUERIES = [
  "trending hindi songs 2025",
  "top hindi hits 2025",
  "best new hindi songs",
  "viral hindi songs 2025",
  "popular hindi songs 2025",
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
  "viral kannada songs 2025",
  "kannada chartbusters 2025",
  "super hit kannada songs",
];
const MALAYALAM_QUERIES = [
  "trending malayalam songs 2025",
  "top mollywood hits 2025",
  "best malayalam songs 2025",
  "new malayalam songs 2025",
  "popular malayalam film songs",
  "viral malayalam songs 2025",
  "malayalam chartbusters 2025",
  "super hit malayalam songs",
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

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one section with one automatic retry on failure.
 * Returns [] if both attempts fail — never throws.
 */
async function fetchSection(query: string, limit = 25): Promise<Song[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1500); // wait before retry
      const res = await api.searchSongs(query, 1, limit);
      const items = extractResults(res);
      const songs = items.map(mapApiSong).filter((s: Song) => Boolean(s.audioUrl));
      if (songs.length > 0) return songs;
    } catch {
      // swallow — retry or return []
    }
  }
  return [];
}

/** Remove songs already in `seen`; mutates `seen`. */
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectionData {
  title: string;
  songs: Song[];
}

interface HomePageProps {
  onRequireAuth?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { user, logout } = useAuth();
  const { recentlyPlayed } = usePlayer();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sections, setSections] = useState<SectionData[]>([]);
  const globalSeenRef = useRef(new Set<string>());
  const cancelledRef = useRef(false);

  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  useEffect(() => {
    cancelledRef.current = false;
    globalSeenRef.current = new Set<string>();
    setSections([]);

    /**
     * Send requests in batches of 2, with a 400 ms gap between batches.
     * This prevents the upstream JioSaavn API from getting slammed with
     * 10 simultaneous connections right after the Render cold-start wakes.
     *
     * Each batch fires its 2 fetches in parallel, then we wait before
     * the next batch — so the total wall-clock time stays reasonable
     * while keeping the upstream connection count low.
     */
    const BATCH_SIZE = 2;
    const BATCH_DELAY_MS = 400;

    async function loadInBatches() {
      for (let i = 0; i < SECTION_DEFS.length; i += BATCH_SIZE) {
        if (cancelledRef.current) return;

        const batch = SECTION_DEFS.slice(i, i + BATCH_SIZE);

        // Fire batch in parallel
        const results = await Promise.all(
          batch.map(({ pool, seed }) =>
            fetchSection(pickQuery(pool, seed), 25)
          )
        );

        if (cancelledRef.current) return;

        // Push each result that has songs
        results.forEach((songs, idx) => {
          const { title } = batch[idx];
          const unique = dedup(songs, globalSeenRef.current);
          if (unique.length === 0) return;
          setSections((prev) => {
            const updated = [
              ...prev.filter((s) => s.title !== title),
              { title, songs: unique },
            ];
            // Keep sections in original defined order
            updated.sort(
              (a, b) =>
                SECTION_DEFS.findIndex((d) => d.title === a.title) -
                SECTION_DEFS.findIndex((d) => d.title === b.title)
            );
            return updated;
          });
        });

        // Wait before next batch (skip delay after last batch)
        if (i + BATCH_SIZE < SECTION_DEFS.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }
    }

    loadInBatches();

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const quickPickSongs = sections[0]?.songs.slice(0, 6) ?? [];

  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-20 px-4 pt-12 pb-3 flex items-center justify-between"
        style={{
          background: "rgba(18,18,18,0.97)",
          backdropFilter: "blur(20px)",
        }}
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
      <div className="px-4 pt-4 mb-6">
        <h2 className="text-base font-bold text-white mb-3">Quick Picks</h2>
        {quickPickSongs.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {quickPickSongs.map((song) => (
              <QuickPick key={song.id} song={song} queue={quickPickSongs} />
            ))}
          </div>
        ) : (
          /* Skeleton until first section arrives */
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
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

      {/* ── Song sections (appear progressively as batches resolve) ── */}
      {sections.length === 0 ? (
        /* Skeleton rows while first batch is still in-flight */
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
          <SongRow
            key={song.id}
            song={song}
            queue={songs}
            onRequireAuth={onRequireAuth}
          />
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