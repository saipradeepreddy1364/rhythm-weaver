import { useState, useCallback, useRef, useEffect } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { useAuth } from "@/context/AuthContext";
import {
  Search,
  X,
  Loader2,
  Disc3,
  Play,
  User2,
  Music2,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { AuthModal } from "@/components/AuthModal";
import { MiniPlayer } from "@/components/MiniPlayer";

interface SearchPageProps {
  onRequireAuth?: () => void;
}

interface Album {
  name: string;
  coverArt: string;
  songs: Song[];
  year?: number;
}

interface Artist {
  name: string;
  coverArt: string;
  songCount: number;
  songs: Song[];
}

// ─── Browse categories ────────────────────────────────────────────────────────

const BROWSE_CATEGORIES = [
  { label: "Trending",     query: "trending hindi songs 2025" },
  { label: "New Releases", query: "new bollywood songs 2025" },
  { label: "Hindi",        query: "top hindi hits 2025" },
  { label: "Telugu",       query: "trending telugu songs 2025" },
  { label: "Tamil",        query: "trending tamil songs 2025" },
  { label: "Romantic",     query: "hindi romantic songs 2025" },
  { label: "Punjabi",      query: "top punjabi songs 2025" },
  { label: "Devotional",   query: "devotional songs hindi 2025" },
  { label: "Malayalam",    query: "trending malayalam songs 2025" },
  { label: "Lofi/Chill",  query: "lofi chill hindi songs" },
  { label: "Retro",        query: "90s bollywood hits" },
  { label: "Kannada",      query: "trending kannada songs 2025" },
];

// ─── Language categories with sub-categories for full song loading ────────────

const LANGUAGE_EXTRA_QUERIES: Record<string, string[]> = {
  "Hindi":     ["popular hindi songs", "hindi film songs superhit", "hindi songs chartbuster"],
  "Telugu":    ["popular telugu songs", "telugu film songs superhit", "telugu songs chartbuster"],
  "Tamil":     ["popular tamil songs", "tamil film songs superhit", "kollywood superhit songs"],
  "Malayalam": ["popular malayalam songs", "malayalam film songs", "mollywood superhit songs"],
  "Kannada":   ["popular kannada songs", "kannada film songs", "sandalwood superhit songs"],
  "Punjabi":   ["popular punjabi songs", "punjabi hits", "punjabi new songs"],
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Category Song List Modal ─────────────────────────────────────────────────

function CategorySongModal({
  label,
  songs,
  coverArt,
  loading,
  onClose,
  onRequireAuth,
  fetchMore,
}: {
  label: string;
  songs: Song[];
  coverArt: string;
  loading: boolean;
  onClose: () => void;
  onRequireAuth: () => void;
  fetchMore?: () => void;
}) {
  const { playSong } = usePlayer();

  return (
    <div className="fixed inset-0 z-[55] flex flex-col" style={{ background: "#0d0d0d" }}>
      {coverArt && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${coverArt})`,
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
            <h2 className="text-lg font-bold text-white truncate">{label}</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {loading ? "Loading songs…" : `${songs.length} songs`}
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
        {coverArt && (
          <div className="px-4 mb-4 flex items-center justify-center flex-shrink-0">
            <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ width: 170, height: 170 }}>
              <img
                src={coverArt}
                alt={label}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/300x300?text=🎵"; }}
              />
            </div>
          </div>
        )}

        {/* Song list */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {loading && songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <p className="text-sm text-white/40">Loading songs…</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2 pb-40">
              {songs.map((song) => (
                <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
              ))}
              {loading && songs.length > 0 && (
                <div className="flex items-center justify-center py-4 gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                  <span className="text-xs text-white/40">Loading more…</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MiniPlayer always visible inside modal */}
      <MiniPlayer onRequireAuth={onRequireAuth} />
    </div>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

interface CategoryCardProps {
  label: string;
  query: string;
  onSelect: (label: string, songs: Song[], coverArt: string) => void;
}

function CategoryCard({ label, query, onSelect }: CategoryCardProps) {
  const [coverArt, setCoverArt] = useState<string | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loaded, setLoaded] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Fetch more songs for language categories by using extra queries
    const extraQueries = LANGUAGE_EXTRA_QUERIES[label] || [];
    const allQueries = [query, ...extraQueries];

    const fetchAll = async () => {
      const seen = new Set<string>();
      const allSongs: Song[] = [];

      for (const q of allQueries) {
        try {
          const res = await api.searchSongs(q, 1, 30);
          const fetched = extractResults(res).map(mapApiSong).filter((s: Song) => s.audioUrl);
          for (const s of fetched) {
            if (s.id && !seen.has(s.id)) {
              seen.add(s.id);
              allSongs.push(s);
            }
          }
        } catch { /* continue */ }
        await sleep(150);
      }

      const withArt = allSongs.filter((s: Song) => s.albumArt);
      if (withArt.length > 0) setCoverArt(withArt[0].albumArt!);
      setSongs(allSongs);
      setLoaded(true);
    };

    fetchAll().catch(() => setLoaded(true));
  }, [query, label]);

  return (
    <button
      onClick={() => onSelect(label, songs, coverArt || "")}
      className="flex flex-col items-start text-left active:scale-95 transition-transform"
      style={{ width: "100%" }}
    >
      <div
        className="relative rounded-xl overflow-hidden w-full shadow-md"
        style={{ aspectRatio: "1 / 1", background: "rgba(255,255,255,0.07)" }}
      >
        {coverArt ? (
          <img
            src={coverArt}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setCoverArt(null)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {!loaded ? (
              <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            ) : (
              <Music2 className="w-8 h-8" style={{ color: "rgba(255,255,255,0.2)" }} />
            )}
          </div>
        )}

        <div
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: "rgba(29,185,84,0.92)" }}
        >
          <Play className="w-3.5 h-3.5 text-black fill-black ml-0.5" />
        </div>
      </div>

      <p className="mt-2 text-sm font-semibold text-white truncate w-full leading-tight">{label}</p>
      <p className="text-xs mt-0.5 truncate w-full" style={{ color: "rgba(255,255,255,0.4)" }}>
        {loaded && songs.length > 0 ? `${songs.length} songs` : "Browse"}
      </p>
    </button>
  );
}

// ─── Album Detail Modal — loads ALL songs ─────────────────────────────────────

function AlbumModal({
  album,
  allSongs,
  onClose,
  onRequireAuth,
}: {
  album: Album;
  allSongs: Song[];
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();
  const [fullAlbumSongs, setFullAlbumSongs] = useState<Song[]>(album.songs);
  const [loadingFull, setLoadingFull] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Fetch all songs for this album by paginating
    const fetchAllAlbumSongs = async () => {
      const seen = new Set<string>(album.songs.map((s) => s.id));
      const all: Song[] = [...album.songs];
      const pageSize = 50;

      // Try multiple pages
      for (let page = 1; page <= 5; page++) {
        try {
          if (page > 1) await sleep(300);
          const res = await api.searchSongs(album.name, page, pageSize);
          const items = extractResults(res);
          const songs = items
            .map(mapApiSong)
            .filter((s: Song) => Boolean(s.audioUrl));

          // Filter to only songs from this album
          const albumSongs = songs.filter((s: Song) =>
            s.album?.toLowerCase().includes(album.name.toLowerCase()) ||
            s.movie?.toLowerCase().includes(album.name.toLowerCase()) ||
            album.name.toLowerCase().includes(s.album?.toLowerCase() || "") ||
            album.name.toLowerCase().includes(s.movie?.toLowerCase() || "")
          );

          const toAdd = albumSongs.length >= 1 ? albumSongs : songs;
          for (const s of toAdd) {
            if (s.id && !seen.has(s.id)) {
              seen.add(s.id);
              all.push(s);
            }
          }

          if (items.length < pageSize) break;
          if (all.length >= 100) break;
        } catch { break; }
      }

      setFullAlbumSongs(all);
      setLoadingFull(false);
    };

    fetchAllAlbumSongs().catch(() => setLoadingFull(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const albumSongIds = new Set(fullAlbumSongs.map((s) => s.id));
  const remainingSongs = allSongs.filter((s) => !albumSongIds.has(s.id));
  const fullQueue = [...fullAlbumSongs, ...remainingSongs];

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
        style={{ background: "linear-gradient(to bottom, rgba(13,13,13,0.6) 0%, rgba(13,13,13,0.95) 35%)" }}
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
            <h2 className="text-lg font-bold text-white truncate">{album.name}</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {loadingFull
                ? "Loading all songs…"
                : `${fullAlbumSongs.length} song${fullAlbumSongs.length !== 1 ? "s" : ""}`}
              {album.year ? ` · ${album.year}` : ""}
            </p>
          </div>
          <button
            onClick={() => playSong(fullAlbumSongs[0], fullQueue)}
            className="w-11 h-11 rounded-full flex items-center justify-center shadow-xl flex-shrink-0"
            style={{ background: "#1DB954" }}
          >
            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
          </button>
        </div>

        {/* Cover art */}
        <div className="px-4 mb-4 flex items-center justify-center flex-shrink-0">
          <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ width: 170, height: 170 }}>
            {album.coverArt ? (
              <img src={album.coverArt} alt={album.name} className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/300x300?text=🎵"; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <Disc3 className="w-12 h-12" style={{ color: "rgba(255,255,255,0.2)" }} />
              </div>
            )}
          </div>
        </div>

        {/* Songs */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="space-y-0.5 px-2 pb-40">
            {fullAlbumSongs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                queue={fullQueue}
                onRequireAuth={onRequireAuth}
              />
            ))}
            {loadingFull && (
              <div className="flex items-center justify-center py-4 gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                <span className="text-xs text-white/40">Fetching all songs…</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MiniPlayer visible inside album modal */}
      <MiniPlayer onRequireAuth={onRequireAuth} />
    </div>
  );
}

// ─── Artist Detail Modal — loads ALL songs for the artist ────────────────────

function ArtistModal({
  artist,
  allSongs,
  onClose,
  onRequireAuth,
}: {
  artist: Artist;
  allSongs: Song[];
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();
  const [fullSongs, setFullSongs] = useState<Song[]>(artist.songs);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchAll = async () => {
      const seen = new Set<string>(artist.songs.map((s) => s.id));
      const all: Song[] = [...artist.songs];
      const pageSize = 50;

      // Fetch up to 5 pages for the artist
      for (let page = 1; page <= 5; page++) {
        try {
          if (page > 1) await sleep(300);
          const res = await api.searchSongs(`${artist.name} songs`, page, pageSize);
          const items = extractResults(res);
          const songs = items
            .map(mapApiSong)
            .filter((s: Song) => Boolean(s.audioUrl));

          // Filter to songs by this artist
          const artistSongs = songs.filter((s: Song) =>
            s.artist?.toLowerCase().includes(artist.name.toLowerCase()) ||
            artist.name.toLowerCase().includes(s.artist?.toLowerCase() || "")
          );

          const toAdd = artistSongs.length >= 2 ? artistSongs : songs;
          for (const s of toAdd) {
            if (s.id && !seen.has(s.id)) {
              seen.add(s.id);
              all.push(s);
            }
          }
          if (items.length < pageSize) break;
          if (all.length >= 150) break;
        } catch { break; }
      }

      setFullSongs(all);
      setLoading(false);
    };

    fetchAll().catch(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "#0d0d0d" }}>
      {artist.coverArt && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${artist.coverArt})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(50px) saturate(2)",
            transform: "scale(1.3)",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(13,13,13,0.6) 0%, rgba(13,13,13,0.95) 35%)" }}
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
            <h2 className="text-lg font-bold text-white truncate">{artist.name}</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {loading ? "Loading all songs…" : `${fullSongs.length} songs`}
            </p>
          </div>
          {fullSongs.length > 0 && (
            <button
              onClick={() => playSong(fullSongs[0], fullSongs)}
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-xl flex-shrink-0"
              style={{ background: "#1DB954" }}
            >
              <Play className="w-5 h-5 text-black fill-black ml-0.5" />
            </button>
          )}
        </div>

        {/* Artist avatar */}
        <div className="px-4 mb-4 flex items-center justify-center flex-shrink-0">
          <div
            className="rounded-full overflow-hidden shadow-2xl"
            style={{ width: 130, height: 130, border: "3px solid rgba(255,255,255,0.1)" }}
          >
            {artist.coverArt ? (
              <img src={artist.coverArt} alt={artist.name} className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/200x200?text=🎵"; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <User2 className="w-14 h-14" style={{ color: "rgba(255,255,255,0.2)" }} />
              </div>
            )}
          </div>
        </div>

        {/* Songs */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="space-y-0.5 px-2 pb-40">
            {fullSongs.map((song) => (
              <SongRow key={song.id} song={song} queue={fullSongs} onRequireAuth={onRequireAuth} />
            ))}
            {loading && (
              <div className="flex items-center justify-center py-4 gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                <span className="text-xs text-white/40">Loading more songs…</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <MiniPlayer onRequireAuth={onRequireAuth} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupIntoAlbums(songs: Song[]): Album[] {
  const map = new Map<string, Album>();
  songs.forEach((song) => {
    const key = (song.album || song.movie || "").trim();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { name: key, coverArt: song.albumArt || "", songs: [], year: song.year });
    }
    map.get(key)!.songs.push(song);
  });
  return Array.from(map.values()).sort((a, b) => b.songs.length - a.songs.length);
}

function groupIntoArtists(songs: Song[]): Artist[] {
  const map = new Map<string, Artist>();
  songs.forEach((song) => {
    const name = (song.artist || "").trim();
    if (!name) return;
    if (!map.has(name)) {
      map.set(name, { name, coverArt: song.albumArt || "", songCount: 0, songs: [] });
    }
    const a = map.get(name)!;
    a.songCount++;
    a.songs.push(song);
  });
  return Array.from(map.values()).sort((a, b) => b.songCount - a.songCount);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SearchPage({ onRequireAuth }: SearchPageProps) {
  const { playSong } = usePlayer();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(new Set());
  const [showAllArtists, setShowAllArtists] = useState(false);
  const [activeAlbum, setActiveAlbum] = useState<Album | null>(null);
  const [activeArtist, setActiveArtist] = useState<Artist | null>(null);

  const [categoryModal, setCategoryModal] = useState<{
    label: string;
    songs: Song[];
    coverArt: string;
    loading: boolean;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PAGE_SIZE = 50;

  const handleRequireAuth = () => {
    if (onRequireAuth) onRequireAuth();
    setShowAuthModal(true);
  };

  // Handle category card click — open modal with songs
  const handleCategorySelect = (label: string, catSongs: Song[], coverArt: string) => {
    if (catSongs.length > 0) {
      setCategoryModal({ label, songs: catSongs, coverArt, loading: false });
    } else {
      // Still loading — open modal and fetch with all extra queries
      setCategoryModal({ label, songs: [], coverArt: "", loading: true });
      const cat = BROWSE_CATEGORIES.find((c) => c.label === label);
      if (cat) {
        const extraQueries = LANGUAGE_EXTRA_QUERIES[label] || [];
        const allQueries = [cat.query, ...extraQueries];

        const fetchAll = async () => {
          const seen = new Set<string>();
          const all: Song[] = [];

          for (const q of allQueries) {
            try {
              const res = await api.searchSongs(q, 1, 50);
              const fetched = extractResults(res).map(mapApiSong).filter((s: Song) => s.audioUrl);
              for (const s of fetched) {
                if (s.id && !seen.has(s.id)) {
                  seen.add(s.id);
                  all.push(s);
                }
              }
            } catch { /* continue */ }
            await sleep(150);
          }

          const withArt = all.filter((s: Song) => s.albumArt);
          setCategoryModal({
            label,
            songs: all,
            coverArt: withArt.length > 0 ? (withArt[0].albumArt || "") : "",
            loading: false,
          });
        };

        fetchAll().catch(() =>
          setCategoryModal((prev) => prev ? { ...prev, loading: false } : null)
        );
      }
    }
  };

  // Real-time search starts on first character
  const doSearch = useCallback((q: string, pg = 1) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSearched(false);
      setSongs([]);
      setAlbums([]);
      setArtists([]);
      return;
    }

    if (pg === 1) {
      setLoading(true);
      setSearched(true);
      setExpandedArtists(new Set());
      setShowAllArtists(false);
      setActiveAlbum(null);
      setActiveArtist(null);
      setPage(1);
    } else {
      setLoadingMore(true);
    }

    api
      .searchSongs(trimmed, pg, PAGE_SIZE)
      .then((res) => {
        const results = extractResults(res).map(mapApiSong).filter((s: Song) => s.audioUrl);
        if (pg === 1) {
          setSongs(results);
          setAlbums(groupIntoAlbums(results));
          setArtists(groupIntoArtists(results));
        } else {
          setSongs((prev) => {
            const merged = [...prev, ...results];
            setAlbums(groupIntoAlbums(merged));
            setArtists(groupIntoArtists(merged));
            return merged;
          });
        }
        setHasMore(results.length >= PAGE_SIZE);
      })
      .catch(() => {
        if (pg === 1) { setSongs([]); setAlbums([]); setArtists([]); }
        setHasMore(false);
      })
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, []);

  // Debounce: 150ms for near-instant results on each keystroke
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (query.trim()) {
      debounceTimer.current = setTimeout(() => doSearch(query, 1), 150);
    } else {
      setSearched(false);
      setSongs([]);
      setAlbums([]);
      setArtists([]);
    }
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query, doSearch]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    doSearch(query, nextPage);
  };

  const visibleArtists = showAllArtists ? artists : artists.slice(0, 8);

  return (
    <div className="w-full min-h-screen" style={{ background: "#121212", paddingBottom: "9rem" }}>

      {/* Category song list modal */}
      {categoryModal && (
        <CategorySongModal
          label={categoryModal.label}
          songs={categoryModal.songs}
          coverArt={categoryModal.coverArt}
          loading={categoryModal.loading}
          onClose={() => setCategoryModal(null)}
          onRequireAuth={handleRequireAuth}
        />
      )}

      {/* Album detail modal */}
      {activeAlbum && (
        <AlbumModal
          album={activeAlbum}
          allSongs={songs}
          onClose={() => setActiveAlbum(null)}
          onRequireAuth={handleRequireAuth}
        />
      )}

      {/* Artist detail modal */}
      {activeArtist && (
        <ArtistModal
          artist={activeArtist}
          allSongs={songs}
          onClose={() => setActiveArtist(null)}
          onRequireAuth={handleRequireAuth}
        />
      )}

      {/* ── Sticky search bar ── */}
      <div
        className="sticky top-0 z-20 px-4 pt-12 pb-3"
        style={{ background: "rgba(18,18,18,0.97)", backdropFilter: "blur(20px)" }}
      >
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <Search className="w-4 h-4 text-white/40 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Songs, artists, movies…"
            autoComplete="off"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="text-white/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-white/40 flex-shrink-0" />}
        </div>
      </div>

      {/* ── Browse categories ── */}
      {!searched && !query && (
        <div className="px-4 pt-4">
          <p className="text-base font-bold text-white mb-4">Browse Categories</p>
          <div className="grid grid-cols-2 gap-4">
            {BROWSE_CATEGORIES.map(({ label, query: catQuery }) => (
              <CategoryCard
                key={label}
                label={label}
                query={catQuery}
                onSelect={handleCategorySelect}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Search results ── */}
      {searched && (
        <div className="px-4 pt-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#1DB954" }} />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Searching…</p>
            </div>
          ) : songs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Music2 className="w-10 h-10" style={{ color: "rgba(255,255,255,0.12)" }} />
              <p className="font-semibold text-white/60">No results for "{query}"</p>
              <p className="text-sm text-white/35">Try a different search term</p>
            </div>
          ) : (
            <>
              {/* ── Top Result ── */}
              {songs[0] && (
                <div className="mb-6">
                  <p className="text-base font-bold text-white mb-3">Top Result</p>
                  <button
                    className="group relative w-full rounded-2xl p-4 text-left active:scale-[0.98] transition-transform overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                    onClick={() => playSong(songs[0], songs)}
                  >
                    <div className="w-16 h-16 rounded-xl overflow-hidden mb-3 shadow-lg">
                      {songs[0].albumArt ? (
                        <img src={songs[0].albumArt} alt={songs[0].title} className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/100x100?text=🎵"; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"
                          style={{ background: "linear-gradient(135deg,#1DB954,#1ed760)" }}>
                          <Music2 className="w-7 h-7 text-black" />
                        </div>
                      )}
                    </div>
                    <p className="text-lg font-bold text-white leading-tight truncate">{songs[0].title}</p>
                    <p className="text-sm mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Song · {songs[0].artist}
                    </p>
                    <div
                      className="absolute bottom-4 right-4 w-10 h-10 rounded-full flex items-center justify-center shadow-xl"
                      style={{ background: "#1DB954" }}
                    >
                      <Play className="w-4 h-4 text-black fill-black ml-0.5" />
                    </div>
                  </button>
                </div>
              )}

              {/* ── Albums — horizontal scroll with song count ── */}
              {albums.length > 0 && (
                <div className="mb-6">
                  <p className="text-base font-bold text-white mb-3">Albums & Movies</p>
                  <div
                    className="flex gap-4 overflow-x-auto pb-2"
                    style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                  >
                    {albums.map((album) => (
                      <div
                        key={album.name}
                        className="flex-shrink-0 cursor-pointer"
                        style={{ width: 140 }}
                        onClick={() => setActiveAlbum(album)}
                      >
                        <div
                          className="relative rounded-xl overflow-hidden mb-2 active:scale-95 transition-transform"
                          style={{ width: 140, height: 140 }}
                        >
                          {album.coverArt ? (
                            <img src={album.coverArt} alt={album.name} className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/300x300?text=🎵"; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"
                              style={{ background: "rgba(255,255,255,0.07)" }}>
                              <Disc3 className="w-10 h-10" style={{ color: "rgba(255,255,255,0.2)" }} />
                            </div>
                          )}
                          {/* Song count badge */}
                          <div
                            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: "rgba(0,0,0,0.75)", color: "rgba(255,255,255,0.9)" }}
                          >
                            {album.songs.length}+
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const albumSongIds = new Set(album.songs.map((s) => s.id));
                              const rest = songs.filter((s) => !albumSongIds.has(s.id));
                              playSong(album.songs[0], [...album.songs, ...rest]);
                            }}
                            className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform"
                            style={{ background: "#1DB954" }}
                          >
                            <Play className="w-3.5 h-3.5 text-black fill-black ml-0.5" />
                          </button>
                        </div>
                        <p className="text-sm font-semibold text-white truncate leading-tight">{album.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {album.songs.length} songs{album.year ? ` · ${album.year}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Songs ── */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-base font-bold text-white">Songs</p>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {songs.length} results
                  </span>
                </div>
                <div className="space-y-0.5">
                  {songs.map((song) => (
                    <SongRow key={song.id} song={song} queue={songs} onRequireAuth={handleRequireAuth} />
                  ))}
                </div>
              </div>

              {/* ── Artists — click opens full artist modal ── */}
              {artists.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-base font-bold text-white">Artists</p>
                    {artists.length > 8 && (
                      <button
                        onClick={() => setShowAllArtists((v) => !v)}
                        className="text-xs font-semibold"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                      >
                        {showAllArtists ? "Show less" : `See all ${artists.length}`}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {visibleArtists.map((artist) => {
                      const expanded = expandedArtists.has(artist.name);
                      return (
                        <div key={artist.name} className="rounded-xl overflow-hidden"
                          style={{ background: "rgba(255,255,255,0.05)" }}>
                          <button
                            className="w-full flex items-center gap-3 p-3"
                            onClick={() => setActiveArtist(artist)}
                          >
                            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 shadow-lg">
                              {artist.coverArt ? (
                                <img src={artist.coverArt} alt={artist.name} className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/100x100?text=🎵"; }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: "#333" }}>
                                  <User2 className="w-5 h-5" style={{ color: "rgba(255,255,255,0.3)" }} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{artist.name}</p>
                              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                                Artist · {artist.songCount} {artist.songCount === 1 ? "song" : "songs"} shown
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); playSong(artist.songs[0], artist.songs); }}
                                className="w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ background: "#1DB954" }}
                              >
                                <Play className="w-3.5 h-3.5 text-black fill-black ml-0.5" />
                              </button>
                              <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                                View all →
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Load More ── */}
              {hasMore && (
                <div className="flex justify-center py-4">
                  {loadingMore ? (
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#1DB954" }} />
                  ) : (
                    <button
                      onClick={loadMore}
                      className="px-8 py-3 rounded-full text-sm font-bold text-black transition-all active:scale-95"
                      style={{ background: "#1DB954" }}
                    >
                      Load more results
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}