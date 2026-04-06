import { useEffect, useState, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { SongCard } from "@/components/SongCard";
import { usePlayer } from "@/context/PlayerContext";
import { Disc3, Music2, Play, ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

const PLAYLISTS = {
  trendingHindi:  "1134543272",
  trendingTelugu: "1134543280",
  bollywood2025:  "1134543279",
  romantic:       "91369254",
  party:          "1134543281",
  retro:          "1134543277",
};

const SEARCH_PAGES = 4; // 4 × 50 = up to 200 songs per query

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Album {
  id: string;
  name: string;
  art: string;
  songs: Song[];
  year?: string;
}

// ─────────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────────

function mapPlaylistSongs(res: any): Song[] {
  return extractResults(res).map(mapApiSong).filter((s: Song) => s.audioUrl);
}

function mapSearchSongs(res: any): Song[] {
  return extractResults(res).map(mapApiSong).filter((s: Song) => s.audioUrl);
}

function dedupe(songs: Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function groupIntoAlbums(songs: Song[]): { albums: Album[]; singles: Song[] } {
  const map = new Map<string, Album>();
  const singles: Song[] = [];

  for (const song of songs) {
    const albumName: string =
      (song as any).album || (song as any).albumName || "";

    if (
      !albumName ||
      albumName.trim() === "" ||
      albumName.toLowerCase() === "unknown"
    ) {
      singles.push(song);
      continue;
    }

    const key = albumName.toLowerCase().trim();
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: albumName,
        art: song.albumArt || "",
        songs: [],
        year: (song as any).year || "",
      });
    }
    map.get(key)!.songs.push(song);
  }

  const albums = Array.from(map.values())
    .filter((a) => a.songs.length >= 2)
    .sort((a, b) => b.songs.length - a.songs.length);

  const soloAlbumSongs = Array.from(map.values())
    .filter((a) => a.songs.length < 2)
    .flatMap((a) => a.songs);

  return { albums, singles: [...singles, ...soloAlbumSongs] };
}

async function fetchAllSearchPages(
  query: string,
  maxPages = SEARCH_PAGES,
  perPage = 50
): Promise<Song[]> {
  const all: Song[] = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await api.searchSongs(query, page, perPage);
      const songs = mapSearchSongs(res);
      if (songs.length === 0) break;
      all.push(...songs);
      if (songs.length < perPage) break;
    } catch {
      break;
    }
  }
  return dedupe(all);
}

async function wakeServer(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/search/songs?query=hindi&page=1&limit=1`);
  } catch {
    // silent wake
  }
}

// ─────────────────────────────────────────────
// Skeleton shimmer — shown while loading
// ─────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-[140px] animate-pulse">
      <div className="w-[140px] h-[140px] rounded-md bg-white/10 mb-2" />
      <div className="h-3 bg-white/10 rounded w-4/5 mb-1.5" />
      <div className="h-2.5 bg-white/10 rounded w-3/5" />
    </div>
  );
}

function SkeletonQuickPick() {
  return (
    <div className="flex items-center bg-[#282828] rounded overflow-hidden animate-pulse h-14">
      <div className="w-14 h-14 bg-white/10 flex-shrink-0" />
      <div className="h-3 bg-white/10 rounded w-3/5 ml-3" />
    </div>
  );
}

function SkeletonSection({ count = 5 }: { count?: number }) {
  return (
    <div className="mb-7">
      <div className="h-5 bg-white/10 rounded w-44 mb-4 animate-pulse" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export default function HomePage() {
  const { recentlyPlayed } = usePlayer();

  const [hindiSingles,  setHindiSingles]  = useState<Song[]>([]);
  const [hindiAlbums,   setHindiAlbums]   = useState<Album[]>([]);
  const [teluguSingles, setTeluguSingles] = useState<Song[]>([]);
  const [teluguAlbums,  setTeluguAlbums]  = useState<Album[]>([]);
  const [bollywood,     setBollywood]     = useState<Song[]>([]);
  const [romantic,      setRomantic]      = useState<Song[]>([]);
  const [party,         setParty]         = useState<Song[]>([]);
  const [retro,         setRetro]         = useState<Song[]>([]);

  // Granular ready flags — page renders immediately with skeletons,
  // each section swaps in as data arrives (no full-page loading block)
  const [quickReady,  setQuickReady]  = useState(false);
  const [hindiReady,  setHindiReady]  = useState(false);
  const [teluguReady, setTeluguReady] = useState(false);
  const [extrasReady, setExtrasReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Fire-and-forget wake — never blocks the page
      wakeServer();

      try {
        // ── Phase 1: Playlists (fast, ~1-2 s) ────────────────────
        const [hindiRes, teluguRes, bollyRes, romRes, parRes, retroRes] =
          await Promise.all([
            api.getPlaylist(PLAYLISTS.trendingHindi).catch(() => null),
            api.getPlaylist(PLAYLISTS.trendingTelugu).catch(() => null),
            api.getPlaylist(PLAYLISTS.bollywood2025).catch(() => null),
            api.getPlaylist(PLAYLISTS.romantic).catch(() => null),
            api.getPlaylist(PLAYLISTS.party).catch(() => null),
            api.getPlaylist(PLAYLISTS.retro).catch(() => null),
          ]);

        let hindiSongs  = hindiRes  ? mapPlaylistSongs(hindiRes)  : [];
        let teluguSongs = teluguRes ? mapPlaylistSongs(teluguRes) : [];
        let bolly       = bollyRes  ? mapPlaylistSongs(bollyRes)  : [];
        let rom         = romRes    ? mapPlaylistSongs(romRes)     : [];
        let par         = parRes    ? mapPlaylistSongs(parRes)     : [];
        let ret         = retroRes  ? mapPlaylistSongs(retroRes)   : [];

        // Immediately show whatever we got from playlists
        if (hindiSongs.length > 0) {
          const { albums: hA, singles: hS } = groupIntoAlbums(hindiSongs);
          setHindiSingles(hS);
          setHindiAlbums(hA);
        }
        if (teluguSongs.length > 0) {
          const { albums: tA, singles: tS } = groupIntoAlbums(teluguSongs);
          setTeluguSingles(tS);
          setTeluguAlbums(tA);
        }
        setBollywood(bolly);
        setRomantic(rom);
        setParty(par);
        setRetro(ret);
        setQuickReady(true);
        setExtrasReady(true);

        // ── Phase 2: Enrich Hindi (all search pages) ─────────────
        const [hindiSearch, hindiOld] = await Promise.all([
          fetchAllSearchPages("hindi songs 2025",         SEARCH_PAGES, 50),
          fetchAllSearchPages("top hindi hits evergreen",  3,           50),
        ]);
        hindiSongs = dedupe([...hindiSongs, ...hindiSearch, ...hindiOld]);
        const { albums: hA2, singles: hS2 } = groupIntoAlbums(hindiSongs);
        setHindiSingles(hS2);
        setHindiAlbums(hA2);
        setHindiReady(true);

        // ── Phase 3: Enrich Telugu (all search pages) ────────────
        const [tSearch, tOld, tMovies] = await Promise.all([
          fetchAllSearchPages("telugu songs 2024 2025",    SEARCH_PAGES, 50),
          fetchAllSearchPages("telugu hit songs all time",  3,           50),
          fetchAllSearchPages("telugu movie songs",         3,           50),
        ]);
        teluguSongs = dedupe([...teluguSongs, ...tSearch, ...tOld, ...tMovies]);
        const { albums: tA2, singles: tS2 } = groupIntoAlbums(teluguSongs);
        setTeluguSingles(tS2);
        setTeluguAlbums(tA2);
        setTeluguReady(true);

        // ── Phase 4: Enrich extras ────────────────────────────────
        if (bolly.length < 30) {
          const extra = await fetchAllSearchPages("latest bollywood 2025", 3, 50);
          setBollywood(dedupe([...bolly, ...extra]));
        }
        if (rom.length < 10)
          setRomantic(await fetchAllSearchPages("hindi romantic songs",     2, 50));
        if (par.length < 10)
          setParty(await fetchAllSearchPages("party hits hindi dj",         2, 50));
        if (ret.length < 10)
          setRetro(await fetchAllSearchPages("old hindi classic songs 90s", 2, 50));

      } catch (err) {
        console.error("Load error:", err);
        try {
          const [h, t, b] = await Promise.all([
            fetchAllSearchPages("top hindi hits 2025", 3, 50),
            fetchAllSearchPages("telugu songs 2025",   3, 50),
            fetchAllSearchPages("latest bollywood",    2, 50),
          ]);
          const { albums: hA, singles: hS } = groupIntoAlbums(h);
          const { albums: tA, singles: tS } = groupIntoAlbums(t);
          setHindiSingles(hS);  setHindiAlbums(hA);
          setTeluguSingles(tS); setTeluguAlbums(tA);
          setBollywood(b);
        } catch { /* nothing */ }
        setQuickReady(true);
        setHindiReady(true);
        setTeluguReady(true);
        setExtrasReady(true);
      }
    };

    load();
  }, []);

  const allFetched = dedupe([
    ...hindiSingles,
    ...teluguSingles,
    ...bollywood,
    ...romantic,
    ...party,
    ...retro,
    ...hindiAlbums.flatMap((a) => a.songs),
    ...teluguAlbums.flatMap((a) => a.songs),
  ]);

  const quickPicks = hindiSingles.slice(0, 6);

  return (
    // pb-44 = ~176px clears both the player bar (~80px) and bottom nav (~64px)
    <div className="pb-44 px-4 sm:px-6 pt-4 bg-[#121212] min-h-screen">

      {/* ── Quick Picks 2×3 grid ──────────────────────── */}
      <section className="mb-6 mt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {quickReady
            ? quickPicks.map((song) => (
                <QuickPick key={song.id} song={song} queue={hindiSingles} />
              ))
            : Array.from({ length: 6 }).map((_, i) => (
                <SkeletonQuickPick key={i} />
              ))}
        </div>
      </section>

      {/* ── Recently Played ───────────────────────────── */}
      {recentlyPlayed.length > 0 && (
        <HScrollSection title="Recently Played">
          {recentlyPlayed.map((song) => (
            <SongCard key={song.id} song={song} queue={recentlyPlayed} index={0} />
          ))}
        </HScrollSection>
      )}

      {/* ════════════════════════════════════════════════
          HINDI SECTION
      ════════════════════════════════════════════════ */}
      <LangDivider label="हिन्दी · Hindi" />

      {hindiReady ? (
        <>
          {hindiAlbums.length > 0 && (
            <HScrollSection
              title={`Hindi Albums (${hindiAlbums.length})`}
              icon={<Disc3 className="w-4 h-4" />}
            >
              {hindiAlbums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </HScrollSection>
          )}
          {hindiSingles.length > 0 && (
            <HScrollSection
              title={`Hindi Singles (${hindiSingles.length})`}
              icon={<Music2 className="w-4 h-4" />}
            >
              {hindiSingles.map((song) => (
                <SongCard key={song.id} song={song} queue={hindiSingles} index={0} />
              ))}
            </HScrollSection>
          )}
        </>
      ) : (
        <>
          <SkeletonSection count={5} />
          <SkeletonSection count={5} />
        </>
      )}

      {extrasReady ? (
        <>
          {bollywood.length > 0 && (
            <HScrollSection title={`Latest Bollywood (${bollywood.length})`}>
              {bollywood.map((song) => (
                <SongCard key={song.id} song={song} queue={bollywood} index={0} />
              ))}
            </HScrollSection>
          )}
          {romantic.length > 0 && (
            <HScrollSection title={`Romantic Vibes (${romantic.length})`}>
              {romantic.map((song) => (
                <SongCard key={song.id} song={song} queue={romantic} index={0} />
              ))}
            </HScrollSection>
          )}
          {party.length > 0 && (
            <HScrollSection title={`Party Hits (${party.length})`}>
              {party.map((song) => (
                <SongCard key={song.id} song={song} queue={party} index={0} />
              ))}
            </HScrollSection>
          )}
          {retro.length > 0 && (
            <HScrollSection title={`Old is Gold (${retro.length})`}>
              {retro.map((song) => (
                <SongCard key={song.id} song={song} queue={retro} index={0} />
              ))}
            </HScrollSection>
          )}
        </>
      ) : (
        <>
          <SkeletonSection />
          <SkeletonSection />
        </>
      )}

      {/* ════════════════════════════════════════════════
          TELUGU SECTION
      ════════════════════════════════════════════════ */}
      <LangDivider label="తెలుగు · Telugu" />

      {teluguReady ? (
        <>
          {teluguAlbums.length > 0 && (
            <HScrollSection
              title={`Telugu Albums (${teluguAlbums.length})`}
              icon={<Disc3 className="w-4 h-4" />}
            >
              {teluguAlbums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </HScrollSection>
          )}
          {teluguSingles.length > 0 && (
            <HScrollSection
              title={`Telugu Singles (${teluguSingles.length})`}
              icon={<Music2 className="w-4 h-4" />}
            >
              {teluguSingles.map((song) => (
                <SongCard key={song.id} song={song} queue={teluguSingles} index={0} />
              ))}
            </HScrollSection>
          )}
        </>
      ) : (
        <>
          <SkeletonSection count={5} />
          <SkeletonSection count={5} />
        </>
      )}

      {/* ════════════════════════════════════════════════
          ALL SONGS — full vertical list
      ════════════════════════════════════════════════ */}
      {allFetched.length > 0 && (
        <>
          <LangDivider label={`All Songs · ${allFetched.length.toLocaleString()}`} />
          <div className="space-y-0.5">
            {allFetched.map((song) => (
              <SongRow key={song.id} song={song} queue={allFetched} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

/** Spotify-style section divider with centred label */
function LangDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="h-px flex-1 bg-white/[0.08]" />
      <span className="text-[11px] font-bold tracking-widest text-white/35 uppercase whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

/** Horizontally scrollable shelf */
function HScrollSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[#1DB954]">{icon}</span>}
          <h2 className="text-[15px] font-bold text-white">{title}</h2>
        </div>
        <button className="flex items-center gap-0.5 text-[11px] font-semibold tracking-wider text-white/40 hover:text-white transition-colors uppercase">
          See all <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
    </div>
  );
}

/** Album / playlist card */
function AlbumCard({ album }: { album: Album }) {
  const { playSong } = usePlayer();

  return (
    <button
      onClick={() => album.songs.length > 0 && playSong(album.songs[0], album.songs)}
      className="flex-shrink-0 w-[140px] group text-left"
    >
      <div className="relative w-[140px] h-[140px] rounded-md overflow-hidden mb-2 bg-[#282828]">
        {album.art ? (
          <img
            src={album.art}
            alt={album.name}
            className="w-full h-full object-cover group-hover:brightness-75 transition-all duration-200"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc3 className="w-10 h-10 text-white/20" />
          </div>
        )}
        {/* Green Spotify-style play button */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-150">
          <div className="w-10 h-10 rounded-full bg-[#1DB954] flex items-center justify-center shadow-2xl">
            <Play className="w-5 h-5 text-black fill-current ml-0.5" />
          </div>
        </div>
      </div>
      <p className="text-[13px] font-semibold text-white truncate">{album.name}</p>
      <p className="text-[11px] text-white/50 mt-0.5 truncate">
        {album.year ? `${album.year} · ` : ""}
        {album.songs.length} tracks
      </p>
    </button>
  );
}

/** Quick-pick tile in the 2×3 grid at the top */
function QuickPick({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong } = usePlayer();
  return (
    <button
      onClick={() => playSong(song, queue)}
      className="flex items-center bg-[#282828] hover:bg-[#3E3E3E] rounded overflow-hidden transition-colors text-left w-full group h-14"
    >
      {song.albumArt ? (
        <img
          src={song.albumArt}
          alt={song.title}
          className="w-14 h-14 object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 bg-gradient-to-br from-[#1DB954]/30 to-[#1a1a1a] flex-shrink-0" />
      )}
      <span className="text-[12px] font-semibold text-white truncate px-3 flex-1">
        {song.title}
      </span>
      <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-[#1DB954] flex items-center justify-center">
          <Play className="w-3.5 h-3.5 text-black fill-current ml-0.5" />
        </div>
      </div>
    </button>
  );
}