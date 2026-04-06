import { useState, useCallback } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongCard } from "@/components/SongCard";
import { Search, X, Loader2 } from "lucide-react";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    api
      .searchSongs(trimmed, 1, 50)
      .then((res) => {
        const results = extractResults(res).map(mapApiSong);
        setSongs(results);
      })
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, []);

  const handleClear = () => {
    setQuery("");
    setSongs([]);
    setSearched(false);
  };

  return (
    <div className="pb-36 px-4 sm:px-6 pt-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-4">Search</h1>

      {/* Search input */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search songs, artists, albums..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
          className="w-full h-12 pl-10 pr-10 rounded-full bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          autoFocus
        />
        {query ? (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            {songs.length} results for &quot;{query}&quot;
          </p>
          <div className="space-y-0.5">
            {songs.map((song, i) => (
              <SongCard key={song.id} song={song} queue={songs} index={i} />
            ))}
          </div>
          {songs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Search className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No results found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          )}
        </>
      )}

      {/* Initial state */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Search className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Search for songs or artists</p>
          <p className="text-xs mt-1">Press Enter to search</p>
        </div>
      )}
    </div>
  );
}