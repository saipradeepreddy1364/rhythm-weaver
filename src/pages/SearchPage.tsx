import { useState, useMemo } from "react";
import { allSongs } from "@/data/songs";
import { SongCard } from "@/components/SongCard";
import { Search, X } from "lucide-react";

const languages = ["All", "Hindi", "Telugu"] as const;
const decades = ["All", "1990s", "2000s", "2010s", "2020s"] as const;
const genreFilters = ["All", "Romantic", "Mass", "Melody", "Sad", "Dance", "Folk", "Classical"] as const;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string>("All");
  const [decade, setDecade] = useState<string>("All");
  const [genre, setGenre] = useState<string>("All");

  const filtered = useMemo(() => {
    return allSongs.filter(s => {
      if (query && !s.title.toLowerCase().includes(query.toLowerCase()) && !s.artist.toLowerCase().includes(query.toLowerCase())) return false;
      if (language !== "All" && s.language !== language) return false;
      if (genre !== "All" && s.genre !== genre) return false;
      if (decade !== "All") {
        const start = parseInt(decade);
        if (s.year < start || s.year >= start + 10) return false;
      }
      return true;
    }).slice(0, 100);
  }, [query, language, decade, genre]);

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
          className="w-full h-11 pl-10 pr-10 rounded-full bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2 mb-6">
        <FilterRow label="Language" options={languages} value={language} onChange={setLanguage} />
        <FilterRow label="Decade" options={decades} value={decade} onChange={setDecade} />
        <FilterRow label="Genre" options={genreFilters} value={genre} onChange={setGenre} />
      </div>

      {/* Results */}
      <p className="text-xs text-muted-foreground mb-2">{filtered.length} results</p>
      <div className="space-y-0.5">
        {filtered.map((song, i) => (
          <SongCard key={song.id} song={song} queue={filtered} index={i} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Search className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No songs found</p>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, options, value, onChange }: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <span className="text-xs text-muted-foreground flex-shrink-0 w-16">{label}</span>
      {options.map(opt => (
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
