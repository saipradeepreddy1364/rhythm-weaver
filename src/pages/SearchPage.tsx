/**
 * SearchPage — Full Spotify-like search
 * Features:
 *  - Sticky search bar (Spotify style)
 *  - Browse categories grid when no search active
 *  - Albums & Movies grouped section with expandable song lists
 *  - Artists section (derived from song artists)
 *  - Individual songs section — NO 40 song limit, shows ALL results
 *  - "Load More" for infinite pagination
 *  - PAGE_SIZE bumped to 100 per fetch
 */

import { useState, useCallback, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import {
  Search, X, Loader2, Disc3, ChevronDown, ChevronUp,
  Play, User2, Music2, Mic2, Headphones, Globe2,
  Heart, Flame, Zap, Radio, Star, TrendingUp, Sparkles,
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

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

const BROWSE_CATEGORIES = [
  { label: "Trending",   icon: TrendingUp,  color1: "#f97316", color2: "#ef4444" },
  { label: "New Releases", icon: Sparkles,  color1: "#8b5cf6", color2: "#ec4899" },
  { label: "Hindi",      icon: Mic2,        color1: "#f59e0b", color2: "#f97316" },
  { label: "Telugu",     icon: Music2,      color1: "#ec4899", color2: "#f43f5e" },
  { label: "Tamil",      icon: Headphones,  color1: "#6366f1", color2: "#8b5cf6" },
  { label: "Romantic",   icon: Heart,       color1: "#e11d48", color2: "#f43f5e" },
  { label: "Punjabi",    icon: Zap,         color1: "#d97706", color2: "#f59e0b" },
  { label: "Devotional", icon: Star,        color1: "#0891b2", color2: "#06b6d4" },
  { label: "Malayalam",  icon: Globe2,      color1: "#059669", color2: "#10b981" },
  { label: "Lofi/Chill", icon: Radio,       color1: "#4f46e5", color2: "#6366f1" },
  { label: "Retro",      icon: Flame,       color1: "#7c3aed", color2: "#8b5cf6" },
  { label: "Kannada",    icon: Music2,      color1: "#dc2626", color2: "#ef4444" },
];

export default function SearchPage({ onRequireAuth }: SearchPageProps) {
  const { playSong } = usePlayer();
  const [query, setQuery]             = useState("");
  const [songs, setSongs]             = useState<Song[]>([]);
  const [albums, setAlbums]           = useState<Album[]>([]);
  const [artists, setArtists]         = useState<Artist[]>([]);
  const [loading, setLoading]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched]       = useState(false);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());
  const [showAllArtists, setShowAllArtists] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastQueryRef = useRef("");

  // Increased from 50 → 100 to show more songs per fetch
  const PAGE_SIZE = 100;

  const groupIntoAlbums = (songs: Song[]): Album[] => {
    const map = new Map<string, Album>();
    songs.forEach((song) => {
      const key = song.album || song.movie || "";
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { name: key, coverArt: song.albumArt || "", songs: [], year: song.year });
      }
      map.get(key)!.songs.push(song);
    });
    return Array.from(map.values()).filter((a) => a.songs.length >= 2);
  };

  const groupIntoArtists = (songs: Song[]): Artist[] => {
    const map = new Map<string, Artist>();
    songs.forEach((song) => {
      const name = song.artist || "";
      if (!name) return;
      if (!map.has(name)) {
        map.set(name, { name, coverArt: song.albumArt || "", songCount: 0, songs: [] });
      }
      const a = map.get(name)!;
      a.songCount++;
      a.songs.push(song);
    });
    return Array.from(map.values())
      .filter((a) => a.songCount >= 2)
      .sort((a, b) => b.songCount - a.songCount)
      .slice(0, 20);
  };

  const doSearch = useCallback((q: string, pg = 1, append = false) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    lastQueryRef.current = trimmed;

    if (pg === 1) {
      setLoading(true);
      setSearched(true);
      setExpandedAlbums(new Set());
      setShowAllArtists(false);
    } else {
      setLoadingMore(true);
    }

    api
      .searchSongs(trimmed, pg, PAGE_SIZE)
      .then((res) => {
        const results = extractResults(res).map(mapApiSong);
        if (pg === 1) {
          setSongs(results);
          setAlbums(groupIntoAlbums(results));
          setArtists(groupIntoArtists(results));
          setPage(1);
        } else {
          setSongs((prev) => {
            const merged = [...prev, ...results];
            setAlbums(groupIntoAlbums(merged));
            setArtists(groupIntoArtists(merged));
            return merged;
          });
        }
        setHasMore(results.length === PAGE_SIZE);
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

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    doSearch(lastQueryRef.current, nextPage, true);
  };

  const handleClear = () => {
    setQuery("");
    setSongs([]);
    setAlbums([]);
    setArtists([]);
    setSearched(false);
    setHasMore(false);
    inputRef.current?.focus();
  };

  const handleBrowseClick = (cat: typeof BROWSE_CATEGORIES[0]) => {
    setQuery(cat.label);
    doSearch(cat.label + " songs");
  };

  const toggleAlbum = (name: string) => {
    setExpandedAlbums((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ALL solo songs shown — no slice limit
  const albumNames = new Set(albums.map((a) => a.name));
  const soloSongs = songs.filter(
    (s) => !albumNames.has(s.album || "") && !albumNames.has(s.movie || "")
  );
  const visibleArtists = showAllArtists ? artists : artists.slice(0, 6);

  return (
    <div className="pb-4" style={{ background: "#121212" }}>

      {/* ── Sticky search bar ── */}
      <div
        className="sticky top-0 z-20 px-4 pt-12 pb-3"
        style={{ background: "rgba(18,18,18,0.97)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="text-2xl font-bold text-white mb-4">Search</h1>
        <div
          className="relative flex items-center rounded-lg overflow-hidden"
          style={{ background: "#2a2a2a" }}
        >
          <Search className="absolute left-3.5 w-5 h-5" style={{ color: "rgba(255,255,255,0.6)" }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="What do you want to listen to?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
            className="w-full h-12 pl-11 pr-11 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none font-medium"
          />
          {query ? (
            <button onClick={handleClear} className="absolute right-3.5 p-1">
              <X className="w-5 h-5" style={{ color: "rgba(255,255,255,0.5)" }} />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1DB954" }} />
        </div>
      )}

      {/* ── Browse categories (shown when no search) ── */}
      {!loading && !searched && (
        <div className="px-4 mt-2">
          <p className="text-base font-bold text-white mb-4">Browse all</p>
          <div className="grid grid-cols-2 gap-3">
            {BROWSE_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.label}
                  onClick={() => handleBrowseClick(cat)}
                  className="relative h-24 rounded-lg overflow-hidden text-left active:scale-95 transition-transform"
                  style={{
                    background: `linear-gradient(135deg, ${cat.color1}, ${cat.color2})`,
                  }}
                >
                  <span className="absolute bottom-2 left-3 text-sm font-bold text-white leading-tight">
                    {cat.label}
                  </span>
                  <div
                    className="absolute bottom-1 right-2 rotate-12 opacity-70"
                  >
                    <Icon className="w-12 h-12 text-white/60" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Search results ── */}
      {!loading && searched && (
        <div className="px-4 mt-2">

          {/* No results */}
          {songs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-lg font-bold text-white mb-2">No results found</p>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                Try different keywords or check your spelling
              </p>
            </div>
          )}

          {songs.length > 0 && (
            <>
              {/* ── Top result (first song featured) ── */}
              {songs[0] && (
                <div className="mb-6">
                  <p className="text-base font-bold text-white mb-3">Top result</p>
                  <button
                    onClick={() => playSong(songs[0], songs)}
                    className="w-full text-left rounded-lg p-4 group active:scale-95 transition-transform relative overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                  >
                    {songs[0].albumArt ? (
                      <img
                        src={songs[0].albumArt}
                        alt={songs[0].title}
                        className="w-24 h-24 rounded-lg object-cover mb-3 shadow-xl"
                      />
                    ) : (
                      <div
                        className="w-24 h-24 rounded-lg flex items-center justify-center mb-3 shadow-xl"
                        style={{ background: "#333" }}
                      >
                        <Music2 className="w-10 h-10" style={{ color: "rgba(255,255,255,0.3)" }} />
                      </div>
                    )}
                    <p className="text-xl font-bold text-white leading-tight">{songs[0].title}</p>
                    <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Song · {songs[0].artist}
                    </p>
                    {/* Green play button */}
                    <div
                      className="absolute bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-all translate-y-1 group-hover:translate-y-0 group-active:translate-y-0"
                      style={{ background: "#1DB954" }}
                    >
                      <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                    </div>
                  </button>
                </div>
              )}

              {/* ── Songs section ── */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-base font-bold text-white">Songs</p>
                  <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {songs.length} results
                  </span>
                </div>
                {/* ALL songs displayed — no cap */}
                <div className="space-y-0.5">
                  {songs.map((song) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      queue={songs}
                      onRequireAuth={onRequireAuth}
                    />
                  ))}
                </div>
              </div>

              {/* ── Artists section ── */}
              {artists.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-base font-bold text-white">Artists</p>
                    {artists.length > 6 && (
                      <button
                        onClick={() => setShowAllArtists((v) => !v)}
                        className="text-xs font-semibold"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                      >
                        {showAllArtists ? "Show less" : `See all ${artists.length}`}
                      </button>
                    )}
                  </div>
                  <div
                    className="flex gap-4 overflow-x-auto pb-2"
                    style={{ scrollbarWidth: "none" } as React.CSSProperties}
                  >
                    {visibleArtists.map((artist) => (
                      <button
                        key={artist.name}
                        onClick={() => playSong(artist.songs[0], artist.songs)}
                        className="flex-shrink-0 flex flex-col items-center gap-2 w-20 active:scale-95 transition-transform"
                      >
                        <div className="w-16 h-16 rounded-full overflow-hidden shadow-lg">
                          {artist.coverArt ? (
                            <img src={artist.coverArt} alt={artist.name} className="w-full h-full object-cover" />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{ background: "#333" }}
                            >
                              <User2 className="w-7 h-7" style={{ color: "rgba(255,255,255,0.3)" }} />
                            </div>
                          )}
                        </div>
                        <p
                          className="text-xs font-medium text-white text-center line-clamp-2 leading-tight"
                        >
                          {artist.name}
                        </p>
                        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Artist</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Albums & Movies section ── */}
              {albums.length > 0 && (
                <div className="mb-6">
                  <p className="text-base font-bold text-white mb-3">Albums & Movies</p>
                  <div className="space-y-2">
                    {albums.map((album) => {
                      const expanded = expandedAlbums.has(album.name);
                      return (
                        <div
                          key={album.name}
                          className="rounded-lg overflow-hidden"
                          style={{
                            background: "rgba(255,255,255,0.05)",
                          }}
                        >
                          {/* Album header row */}
                          <button
                            className="w-full flex items-center gap-3 p-3"
                            onClick={() => toggleAlbum(album.name)}
                          >
                            <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 shadow-lg">
                              {album.coverArt ? (
                                <img
                                  src={album.coverArt}
                                  alt={album.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  style={{ background: "#333" }}
                                >
                                  <Disc3 className="w-5 h-5" style={{ color: "rgba(255,255,255,0.3)" }} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{album.name}</p>
                              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                                Album · {album.songs.length} songs{album.year ? ` · ${album.year}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playSong(album.songs[0], album.songs);
                                }}
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

                          {/* Expanded song list — ALL songs, no limit */}
                          {expanded && (
                            <div
                              className="border-t"
                              style={{ borderColor: "rgba(255,255,255,0.08)" }}
                            >
                              {album.songs.map((song) => (
                                <SongRow
                                  key={song.id}
                                  song={song}
                                  queue={album.songs}
                                  onRequireAuth={onRequireAuth}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Load More button ── */}
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
    </div>
  );
}