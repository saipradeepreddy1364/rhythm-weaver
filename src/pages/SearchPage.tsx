/**
 * SearchPage — Full Spotify-like search
 * Features:
 *  - Sticky search bar
 *  - Albums & Movies grouped section with expandable song lists
 *  - Artists section (derived from song artists)
 *  - Individual songs section (singles not in albums)
 *  - No song limit — loads all results (up to 100 per query)
 *  - Infinite scroll support via "Load More"
 */

import { useState, useCallback, useRef } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import {
  Search, X, Loader2, Disc3, ChevronDown, ChevronUp,
  Play, User2, Music2,
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
  const [showAllSongs, setShowAllSongs]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastQueryRef = useRef("");

  const PAGE_SIZE = 50;

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
    // Only show artists with 2+ songs so it's meaningful
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
      setShowAllSongs(false);
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

  const toggleAlbum = (name: string) => {
    setExpandedAlbums((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Songs not belonging to any detected album
  const albumNames = new Set(albums.map((a) => a.name));
  const soloSongs = songs.filter(
    (s) => !albumNames.has(s.album || "") && !albumNames.has(s.movie || "")
  );
  const visibleArtists = showAllArtists ? artists : artists.slice(0, 6);
  const visibleSongs   = showAllSongs   ? soloSongs : soloSongs.slice(0, 15);

  return (
    <div className="pb-4 animate-fade-in" style={{ background: "#0a0a0a" }}>

      {/* Sticky search bar */}
      <div
        className="sticky top-0 z-20 px-4 pt-4 pb-3"
        style={{ background: "rgba(10,10,10,0.97)", backdropFilter: "blur(20px)" }}
      >
        <div
          className="relative flex items-center rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}
        >
          <Search className="absolute left-3.5 w-4 h-4 text-white/40 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Songs, artists, movies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
            className="w-full h-11 pl-10 pr-10 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            autoFocus
          />
          {query ? (
            <button onClick={handleClear} className="absolute right-3 p-1">
              <X className="w-4 h-4 text-white/40" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <div className="px-4 pt-2">
          {songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/30">
              <Music2 className="w-12 h-12 mb-3" />
              <p className="text-sm font-medium">No results for "{query}"</p>
              <p className="text-xs mt-1 text-white/20">Try a different song, artist, or movie</p>
            </div>
          ) : (
            <>
              {/* ── Artists section ── */}
              {artists.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                      Artists
                    </p>
                    {artists.length > 6 && (
                      <button
                        onClick={() => setShowAllArtists((v) => !v)}
                        className="text-xs text-orange-400 font-semibold"
                      >
                        {showAllArtists ? "Show less" : `See all ${artists.length}`}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
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
                              style={{ background: "rgba(255,255,255,0.1)" }}
                            >
                              <User2 className="w-7 h-7 text-white/40" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-medium text-white/80 text-center line-clamp-2 leading-tight">
                          {artist.name}
                        </p>
                        <p className="text-[10px] text-white/30">{artist.songCount} songs</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Albums & Movies section ── */}
              {albums.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
                    Albums & Movies
                  </p>
                  <div className="space-y-2">
                    {albums.map((album) => {
                      const expanded = expandedAlbums.has(album.name);
                      return (
                        <div
                          key={album.name}
                          className="rounded-2xl overflow-hidden"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.07)",
                          }}
                        >
                          {/* Album header row */}
                          <button
                            className="w-full flex items-center gap-3 p-3"
                            onClick={() => toggleAlbum(album.name)}
                          >
                            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-lg">
                              {album.coverArt ? (
                                <img
                                  src={album.coverArt}
                                  alt={album.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
                                >
                                  <Disc3 className="w-5 h-5 text-white" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{album.name}</p>
                              <p className="text-xs text-white/40 mt-0.5">
                                {album.songs.length} songs{album.year ? ` · ${album.year}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playSong(album.songs[0], album.songs);
                                }}
                                className="w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
                              >
                                <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                              </button>
                              {expanded
                                ? <ChevronUp className="w-4 h-4 text-white/30" />
                                : <ChevronDown className="w-4 h-4 text-white/30" />
                              }
                            </div>
                          </button>

                          {/* Expanded song list — all songs, no limit */}
                          {expanded && (
                            <div
                              className="border-t"
                              style={{ borderColor: "rgba(255,255,255,0.06)" }}
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

              {/* ── Individual Songs / Singles ── */}
              {soloSongs.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                      {albums.length > 0 ? "Singles" : `${songs.length} Songs`}
                    </p>
                    {soloSongs.length > 15 && (
                      <button
                        onClick={() => setShowAllSongs((v) => !v)}
                        className="text-xs text-orange-400 font-semibold"
                      >
                        {showAllSongs ? "Show less" : `See all ${soloSongs.length}`}
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {visibleSongs.map((song) => (
                      <SongRow
                        key={song.id}
                        song={song}
                        queue={soloSongs}
                        onRequireAuth={onRequireAuth}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Load More button ── */}
              {hasMore && (
                <div className="flex justify-center py-4">
                  {loadingMore ? (
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  ) : (
                    <button
                      onClick={loadMore}
                      className="px-8 py-2.5 rounded-full text-sm font-semibold text-white transition-all active:scale-95"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
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

      {/* Initial empty state */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-28 text-white/20 px-6">
          <Search className="w-14 h-14 mb-4" />
          <p className="text-sm font-semibold text-white/30">Search songs, artists or movies</p>
          <p className="text-xs mt-1 text-white/20">Press Enter to search</p>
        </div>
      )}
    </div>
  );
}