import { allSongs } from "@/data/songs";
import { usePlayer } from "@/context/PlayerContext";
import { SongCard } from "@/components/SongCard";
import { Heart, Clock, Music } from "lucide-react";
import { useMemo, useState } from "react";

type Tab = "favorites" | "recent" | "all";

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>("favorites");
  const { favorites, recentlyPlayed } = usePlayer();

  const favSongs = useMemo(() => allSongs.filter(s => favorites.has(s.id)), [favorites]);

  const tabs = [
    { id: "favorites" as Tab, icon: Heart, label: "Favorites", count: favSongs.length },
    { id: "recent" as Tab, icon: Clock, label: "Recent", count: recentlyPlayed.length },
    { id: "all" as Tab, icon: Music, label: "All Songs", count: allSongs.length },
  ];

  const songs = tab === "favorites" ? favSongs : tab === "recent" ? recentlyPlayed : allSongs.slice(0, 100);

  return (
    <div className="pb-36 px-4 sm:px-6 pt-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-4">Your Library</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(({ id, icon: Icon, label, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span className="text-xs opacity-70">({count})</span>
          </button>
        ))}
      </div>

      {/* Songs */}
      {songs.length > 0 ? (
        <div className="space-y-0.5">
          {songs.map((song, i) => (
            <SongCard key={song.id} song={song} queue={songs} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          {tab === "favorites" ? (
            <>
              <Heart className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No favorites yet</p>
              <p className="text-xs mt-1">Tap the heart on any song</p>
            </>
          ) : (
            <>
              <Clock className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No recently played songs</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
