import { useState, useEffect, useCallback } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongCard } from "@/components/SongCard";
import { Search, X, Loader2 } from "lucide-react";

const languages = ["All", "Hindi", "Telugu", "English", "Punjabi"] as const;
const genreFilters = ["All", "Romantic", "Sad", "Dance", "Folk", "Classical", "Pop"] as const;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string>("All");
  const [genre, setGenre] = useState<string>("All");
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const buildQuery = useCallback(() => {
    let q = query.trim();
    if (!q) {
      if (language !== "All") q = `top ${language.toLowerCase()} hits 2025`;
      else q = "top hits 2025";
    }
    if (genre !== "All") q += ` ${genre.toLowerCase()}`;
    return q;
  }, [query, language, genre]);

  const doSearch = useCallback(() => {
    setLoading(true);
    setSearched(true);
    const q = buildQuery();
    api.searchSongs(q, 1, 50)
      .then((res) => {
        const results = extractResults(res).map(mapApiSong);
        setSongs(results);
      })
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, [buildQuery]);

  // Auto-search when filters change
  useEffect(() => {
    if (language !== "All" || genre !== "All") {
      doSearch();
    }
  }, [language, genre]);

  // Debounce query input
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => doSearch(), 500);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="pb-36 px-4 sm:px-6 pt-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-4">Search</h1>

      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Songs, artists..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          className="w-full h-11 pl-10 pr-10 rounded-full bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setSongs([]); setSearched(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2 mb-6">
        <FilterRow
          label="Language"
          options={languages}
          value={language}
          onChange={setLanguage}
        />
        <FilterRow
          label="Genre"
          options={genreFilters}
          value={genre}
          onChange={setGenre}
        />
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
          <p className="text-xs text-muted-foreground mb-2">{songs.length} results</p>
          <div className="space-y-0.5">
            {songs.map((song, i) => (
              <SongCard key={song.id} song={song} queue={songs} index={i} />
            ))}
          </div>
          {songs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Search className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No songs found</p>
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
          <p className="text-xs mt-1">Or pick a language filter above</p>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <span className="text-xs text-muted-foreground flex-shrink-0 w-16">{label}</span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-colors ${
            value === opt
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}