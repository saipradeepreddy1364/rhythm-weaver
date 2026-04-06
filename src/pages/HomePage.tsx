import { useEffect, useState, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { SongCard } from "@/components/SongCard";
import { LikeButton } from "@/components/LikeButton";
import { AddToPlaylistMenu } from "@/components/AddToPlaylistMenu";
import { usePlayer } from "@/context/PlayerContext";
import { useLibrary } from "@/context/LibraryContext";
import { Loader2, ChevronRight, Disc3, Music2, Play } from "lucide-react";

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

const SEARCH_PAGES = 4;

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
// Helpers
// ─────────────────────────────────────────────

function mapPlaylistSongs(res: any): Song[] {
  const songs = extractResults(res);
  return songs.map(mapApiSong).filter((s: Song) => s.audioUrl);
}

function mapSearchSongs(res: any): Song[] {
  const songs = extractResults(res);
  return songs.map(mapApiSong).filter((s: Song) => s.audioUrl);
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
    const albumName: string = (song as any).album || (song as any).albumName || "";
    if (!albumName || albumName.trim() === "" || albumName.toLowerCase() === "unknown") {
      singles.push(song);
      continue;
    }
    const key = albumName.toLowerCase().trim();
    if (!map.has(key)) {
      map.set(key, { id: key, name: albumName, art: song.albumArt || "", songs: [], year: (song as any).year || "" });
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

async function fetchAllSearchPages(query: string, maxPages = SEARCH_PAGES, perPage = 50): Promise<Song[]> {
  const all: Song[] = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await api.searchSongs(query, page, perPage);
      const songs = mapSearchSongs(res);
      if (songs.length === 0) break;
      all.push(...songs);
      if (songs.length < perPage) break;
    } catch { break; }
  }
  return dedupe(all);
}

async function wakeServer(): Promise<void> {
  try { await fetch(`${BASE_URL}/search/songs?query=hindi&page=1&limit=1`); } catch {}
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  if (h < 21) return "Good Evening";
  return "Good Night";
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

interface HomePageProps {
  onRequireAuth: () => void;
}

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { addToRecentlyPlayed } = useLibrary();

  const [hindiSingles,  setHindiSingles]  = useState<Song[]>([]);
  const [hindiAlbums,   setHindiAlbums]   = useState<Album[]>([]);
  const [teluguSingles, setTeluguSingles] = useState<Song[]>([]);
  const [teluguAlbums,  setTeluguAlbums]  = useState<Album[]>([]);
  const [bollywood,     setBollywood]     = useState<Song[]>([]);
  const [romantic,      setRomantic]      = useState<Song[]>([]);
  const [party,         setParty]         = useState<Song[]>([]);
  const [retro,         setRetro]         = useState<Song[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [waking,        setWaking]        = useState(true);
  const [progress,      setProgress]      = useState("");

  useEffect(() => {
    const load = async () => {
      setWaking(true);
      setProgress("Starting music server...");
      await wakeServer();
      setWaking(false);
      setProgress("Loading songs...");

      try {
        const [hindiRes, teluguRes, bollyRes, romRes, parRes, retroRes] = await Promise.all([
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
        let rom         = romRes    ? mapPlaylistSongs(romRes)    : [];
        let par         = parRes    ? mapPlaylistSongs(parRes)    : [];
        let ret         = retroRes  ? mapPlaylistSongs(retroRes)  : [];

        setProgress("Loading Hindi songs...");
        const hindiSearch    = await fetchAllSearchPages("hindi songs 2025",        SEARCH_PAGES, 50);
        const hindiOld       = await fetchAllSearchPages("top hindi hits evergreen", 3, 50);
        hindiSongs = dedupe([...hindiSongs, ...hindiSearch, ...hindiOld]);

        setProgress("Loading Telugu songs...");
        const teluguSearch   = await fetchAllSearchPages("telugu songs 2024 2025",  SEARCH_PAGES, 50);
        const teluguOld      = await fetchAllSearchPages("telugu hit songs all time", 3, 50);
        const teluguMovies   = await fetchAllSearchPages("telugu movie songs",       3, 50);
        teluguSongs = dedupe([...teluguSongs, ...teluguSearch, ...teluguOld, ...teluguMovies]);

        setProgress("Loading Bollywood...");
        if (bolly.length < 30) {
          const extra = await fetchAllSearchPages("latest bollywood 2025", 3, 50);
          bolly = dedupe([...bolly, ...extra]);
        }

        if (rom.length < 10) rom = await fetchAllSearchPages("hindi romantic songs",    2, 50);
        if (par.length < 10) par = await fetchAllSearchPages("party hits hindi dj",     2, 50);
        if (ret.length < 10) ret = await fetchAllSearchPages("old hindi classic songs 90s", 2, 50);

        const { albums: hAlbums, singles: hSingles } = groupIntoAlbums(hindiSongs);
        const { albums: tAlbums, singles: tSingles } = groupIntoAlbums(teluguSongs);

        setHindiSingles(hSingles);
        setHindiAlbums(hAlbums);
        setTeluguSingles(tSingles);
        setTeluguAlbums(tAlbums);
        setBollywood(bolly);
        setRomantic(rom);
        setParty(par);
        setRetro(ret);

      } catch (err) {
        console.error("Load error:", err);
        try {
          setProgress("Trying fallback...");
          const [h, t, b] = await Promise.all([
            fetchAllSearchPages("top hindi hits 2025", 3, 50),
            fetchAllSearchPages("telugu songs 2025",   3, 50),
            fetchAllSearchPages("latest bollywood",    2, 50),
          ]);
          const { albums: hAlbums, singles: hSingles } = groupIntoAlbums(h);
          const { albums: tAlbums, singles: tSingles } = groupIntoAlbums(t);
          setHindiSingles(hSingles);  setHindiAlbums(hAlbums);
          setTeluguSingles(tSingles); setTeluguAlbums(tAlbums);
          setBollywood(b);
        } catch {}
      } finally {
        setLoading(false);
        setProgress("");
      }
    };

    load();
  }, []);

  if (waking || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{progress || "Loading..."}</p>
        {waking && (
          <p className="text-xs text-muted-foreground opacity-60">
            Free server wakes up in ~15 seconds
          </p>
        )}
      </div>
    );
  }

  const allFetched = dedupe([
    ...hindiSingles, ...teluguSingles,
    ...bollywood, ...romantic, ...party, ...retro,
    ...hindiAlbums.flatMap((a) => a.songs),
    ...teluguAlbums.flatMap((a) => a.songs),
  ]);

  const quickPicks = hindiSingles.slice(0, 6);

  return (
    <div className="pb-36 px-4 sm:px-6 pt-6 animate-fade-in">

      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
        {getGreeting()} 👋
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {allFetched.length > 0
          ? `${allFetched.length.toLocaleString()} songs ready to play`
          : "What do you want to listen to?"}
      </p>

      {/* Quick Picks */}
      {quickPicks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
          {quickPicks.map((song) => (
            <QuickPick
              key={song.id}
              song={song}
              queue={hindiSingles}
              onRequireAuth={onRequireAuth}
              onPlay={() => addToRecentlyPlayed(song)}
            />
          ))}
        </div>
      )}

      {/* ═══════════ HINDI ═══════════ */}
      <SectionDivider label="हिन्दी · Hindi" />

      {hindiAlbums.length > 0 && (
        <HScrollSection title={`Hindi Albums (${hindiAlbums.length})`} icon={<Disc3 className="w-4 h-4" />}>
          {hindiAlbums.map((album) => (
            <AlbumCard key={album.id} album={album} onPlay={() => addToRecentlyPlayed(album.songs[0])} />
          ))}
        </HScrollSection>
      )}

      {hindiSingles.length > 0 && (
        <HScrollSection title={`Hindi Singles (${hindiSingles.length})`} icon={<Music2 className="w-4 h-4" />}>
          {hindiSingles.map((song) => (
            <SongCardWithActions
              key={song.id}
              song={song}
              queue={hindiSingles}
              onRequireAuth={onRequireAuth}
              onPlay={() => addToRecentlyPlayed(song)}
            />
          ))}
        </HScrollSection>
      )}

      {bollywood.length > 0 && (
        <HScrollSection title={`Latest Bollywood (${bollywood.length})`}>
          {bollywood.map((song) => (
            <SongCardWithActions key={song.id} song={song} queue={bollywood} onRequireAuth={onRequireAuth} onPlay={() => addToRecentlyPlayed(song)} />
          ))}
        </HScrollSection>
      )}

      {romantic.length > 0 && (
        <HScrollSection title={`Romantic Vibes (${romantic.length})`}>
          {romantic.map((song) => (
            <SongCardWithActions key={song.id} song={song} queue={romantic} onRequireAuth={onRequireAuth} onPlay={() => addToRecentlyPlayed(song)} />
          ))}
        </HScrollSection>
      )}

      {retro.length > 0 && (
        <HScrollSection title={`Old is Gold (${retro.length})`}>
          {retro.map((song) => (
            <SongCardWithActions key={song.id} song={song} queue={retro} onRequireAuth={onRequireAuth} onPlay={() => addToRecentlyPlayed(song)} />
          ))}
        </HScrollSection>
      )}

      {party.length > 0 && (
        <HScrollSection title={`Party Hits (${party.length})`}>
          {party.map((song) => (
            <SongCardWithActions key={song.id} song={song} queue={party} onRequireAuth={onRequireAuth} onPlay={() => addToRecentlyPlayed(song)} />
          ))}
        </HScrollSection>
      )}

      {/* ═══════════ TELUGU ═══════════ */}
      <SectionDivider label="తెలుగు · Telugu" />

      {teluguAlbums.length > 0 && (
        <HScrollSection title={`Telugu Albums (${teluguAlbums.length})`} icon={<Disc3 className="w-4 h-4" />}>
          {teluguAlbums.map((album) => (
            <AlbumCard key={album.id} album={album} onPlay={() => addToRecentlyPlayed(album.songs[0])} />
          ))}
        </HScrollSection>
      )}

      {teluguSingles.length > 0 && (
        <HScrollSection title={`Telugu Singles (${teluguSingles.length})`} icon={<Music2 className="w-4 h-4" />}>
          {teluguSingles.map((song) => (
            <SongCardWithActions
              key={song.id}
              song={song}
              queue={teluguSingles}
              onRequireAuth={onRequireAuth}
              onPlay={() => addToRecentlyPlayed(song)}
            />
          ))}
        </HScrollSection>
      )}

      {/* ═══════════ ALL SONGS ═══════════ */}
      {allFetched.length > 0 && (
        <>
          <SectionDivider label={`All Songs · ${allFetched.length.toLocaleString()}`} />
          <div className="space-y-0.5">
            {allFetched.map((song) => (
              <SongRow key={song.id} song={song} queue={allFetched} />
            ))}
          </div>
        </>
      )}

      {allFetched.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-sm">No songs loaded</p>
          <p className="text-xs mt-1">Try refreshing the page</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function HScrollSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-primary">{icon}</span>}
        <h2 className="text-base font-bold text-foreground flex-1 truncate">{title}</h2>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
    </div>
  );
}

function AlbumCard({ album, onPlay }: { album: Album; onPlay?: () => void }) {
  const { playSong } = usePlayer();

  const handlePlay = () => {
    if (album.songs.length > 0) {
      playSong(album.songs[0], album.songs);
      onPlay?.();
    }
  };

  return (
    <button onClick={handlePlay} className="flex-shrink-0 w-36 group text-left">
      <div className="relative w-36 h-36 rounded-lg overflow-hidden mb-2 bg-gradient-to-br from-rose-500/20 to-purple-600/20">
        {album.art ? (
          <img src={album.art} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc3 className="w-10 h-10 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 text-primary-foreground fill-current ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full">
          {album.songs.length} tracks
        </div>
      </div>
      <p className="text-xs font-semibold text-foreground truncate leading-tight">{album.name}</p>
      {album.year && <p className="text-[10px] text-muted-foreground mt-0.5">{album.year}</p>}
    </button>
  );
}

/** SongCard extended with Like + Add-to-playlist buttons */
function SongCardWithActions({
  song,
  queue,
  onRequireAuth,
  onPlay,
}: {
  song: Song;
  queue: Song[];
  onRequireAuth: () => void;
  onPlay?: () => void;
}) {
  const { playSong } = usePlayer();

  return (
    <div className="flex-shrink-0 w-32 group">
      {/* Art / play area */}
      <button
        onClick={() => { playSong(song, queue); onPlay?.(); }}
        className="relative w-32 h-32 rounded-lg overflow-hidden mb-1.5 bg-gradient-to-br from-rose-500/20 to-purple-600/20 block"
      >
        {song.albumArt ? (
          <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music2 className="w-8 h-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <Play className="w-4 h-4 text-primary-foreground fill-current ml-0.5" />
          </div>
        </div>
      </button>

      <p className="text-xs font-medium text-foreground truncate leading-tight">{song.title}</p>
      <p className="text-[10px] text-muted-foreground truncate">{song.artist}</p>

      {/* Like + Add to playlist */}
      <div className="flex items-center gap-2 mt-1">
        <LikeButton song={song} onRequireAuth={onRequireAuth} size="sm" />
        <AddToPlaylistMenu song={song} onRequireAuth={onRequireAuth}>
          <button
            title="Add to playlist"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Play className="w-3 h-3 rotate-90" style={{ transform: "rotate(0deg)" }} />
          </button>
        </AddToPlaylistMenu>
      </div>
    </div>
  );
}

function QuickPick({
  song,
  queue,
  onRequireAuth,
  onPlay,
}: {
  song: Song;
  queue: Song[];
  onRequireAuth: () => void;
  onPlay?: () => void;
}) {
  const { playSong } = usePlayer();
  return (
    <div className="flex items-center gap-3 bg-card/60 hover:bg-accent rounded-md overflow-hidden transition-colors w-full group">
      <button
        onClick={() => { playSong(song, queue); onPlay?.(); }}
        className="flex items-center gap-3 flex-1 text-left min-w-0 py-0"
      >
        {song.albumArt ? (
          <img src={song.albumArt} alt={song.title} className="w-12 h-12 object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-purple-600 flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground truncate">{song.title}</span>
      </button>
      <div className="pr-2 flex-shrink-0">
        <LikeButton song={song} onRequireAuth={onRequireAuth} size="sm" />
      </div>
    </div>
  );
}