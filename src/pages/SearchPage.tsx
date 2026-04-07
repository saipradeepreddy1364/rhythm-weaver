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

// ─── Browse categories — each fetches real album art only (no color cards) ──────

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

// ─── Category Song List Modal ─────────────────────────────────────────────────

function CategorySongModal({
  label,
  songs,
  coverArt,
  loading,
  onClose,
  onRequireAuth,
}: {
  label: string;
  songs: Song[];
  coverArt: string;
  loading: boolean;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();

  return (
    <div className="fixed inset-0 z-[55] flex flex-col" style={{ background: "#0d0d0d" }}>
      {/* Blurred background */}
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
            <div className="space-y-0.5 px-2 pb-32">
              {songs.map((song) => (
                <SongRow key={song.id} song={song} queue={songs} onRequireAuth={onRequireAuth} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Plain album-image category card (no color overlay) ──────────────────────

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
    api.searchSongs(query, 1, 20)
      .then((res) => {
        const fetched = extractResults(res).map(mapApiSong).filter((s: Song) => s.audioUrl);
        const withArt = fetched.filter((s: Song) => s.albumArt);
        if (withArt.length > 0) setCoverArt(withArt[0].albumArt!);
        setSongs(fetched);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [query]);

  return (
    <button
      onClick={() => onSelect(label, songs, coverArt || "")}
      className="relative rounded-2xl overflow-hidden active:scale-95 transition-transform text-left"
      style={{ height: 110, background: "rgba(255,255,255,0.06)" }}
    >
      {/* Full-bleed album art */}
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

      {/* Bottom gradient + label */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)" }}
      />
      <span className="absolute bottom-2.5 left-3 text-sm font-bold text-white drop-shadow-lg leading-tight z-10">
        {label}
      </span>
    </button>
  );
}

// ─── Album Detail Modal ───────────────────────────────────────────────────────

function AlbumModal({
  album,
  onClose,
  onRequireAuth,
}: {
  album: Album;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { playSong } = usePlayer();

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
              {album.songs.length === 1 ? "Single" : `${album.songs.length} songs`}
              {album.year ? ` · ${album.year}` : ""}
            </p>
          </div>
          <button
            onClick={() => playSong(album.songs[0], album.songs)}
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
          <div className="space-y-0.5 px-2 pb-32">
            {album.songs.map((song) => (
              <SongRow key={song.id} song={song} queue={album.songs} onRequireAuth={onRequireAuth} />
            ))}
          </div>
        </div>
      </div>
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

  // Category song list modal state
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
  const handleCategorySelect = (label: string, songs: Song[], coverArt: string) => {
    if (songs.length > 0) {
      setCategoryModal({ label, songs, coverArt, loading: false });
    } else {
      // Still loading — open modal and fetch
      setCategoryModal({ label, songs: [], coverArt: "", loading: true });
      const cat = BROWSE_CATEGORIES.find((c) => c.label === label);
      if (cat) {
        api.searchSongs(cat.query, 1, 50)
          .then((res) => {
            const fetched = extractResults(res).map(mapApiSong).filter((s: Song) => s.audioUrl);
            const withArt = fetched.filter((s: Song) => s.albumArt);
            setCategoryModal({
              label,
              songs: fetched,
              coverArt: withArt.length > 0 ? (withArt[0].albumArt || "") : "",
              loading: false,
            });
          })
          .catch(() => setCategoryModal((prev) => prev ? { ...prev, loading: false } : null));
      }
    }
  };

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

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (query.trim()) {
      debounceTimer.current = setTimeout(() => doSearch(query, 1), 300);
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

  const toggleArtist = (name: string) => {
    setExpandedArtists((prev) => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });
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
          onClose={() => setActiveAlbum(null)}
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

      {/* ── Browse categories — plain album images, 2-col grid ── */}
      {!searched && !query && (
        <div className="px-4 pt-4">
          <p className="text-base font-bold text-white mb-4">Browse Categories</p>
          <div className="grid grid-cols-2 gap-3">
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

              {/* ── Albums — horizontal scroll, click opens modal ── */}
              {albums.length > 0 && (
                <div className="mb-6">
                  <p className="text-base font-bold text-white mb-3">
                    Albums & Movies
                  </p>

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
                          <button
                            onClick={(e) => { e.stopPropagation(); playSong(album.songs[0], album.songs); }}
                            className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform"
                            style={{ background: "#1DB954" }}
                          >
                            <Play className="w-3.5 h-3.5 text-black fill-black ml-0.5" />
                          </button>
                        </div>
                        <p className="text-sm font-semibold text-white truncate leading-tight">{album.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {album.songs.length === 1 ? "Single" : `${album.songs.length} songs`}
                          {album.year ? ` · ${album.year}` : ""}
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
                </div>
                <div className="space-y-0.5">
                  {songs.map((song) => (
                    <SongRow key={song.id} song={song} queue={songs} onRequireAuth={handleRequireAuth} />
                  ))}
                </div>
              </div>

              {/* ── Artists ── */}
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
                          <button className="w-full flex items-center gap-3 p-3" onClick={() => toggleArtist(artist.name)}>
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
                                Artist · {artist.songCount} {artist.songCount === 1 ? "song" : "songs"}
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
                              {expanded
                                ? <ChevronUp className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
                                : <ChevronDown className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
                              }
                            </div>
                          </button>
                          {expanded && (
                            <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                              {artist.songs.map((song) => (
                                <SongRow key={song.id} song={song} queue={artist.songs} onRequireAuth={handleRequireAuth} />
                              ))}
                            </div>
                          )}
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