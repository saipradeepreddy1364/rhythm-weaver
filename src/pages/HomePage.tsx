import { allSongs } from "@/data/songs";
import { SongRow } from "@/components/SongRow";
import { SongCard } from "@/components/SongCard";
import { usePlayer } from "@/context/PlayerContext";
import { useMemo } from "react";

export default function HomePage() {
  const { recentlyPlayed } = usePlayer();

  const trendingHindi = useMemo(() => allSongs.filter(s => s.language === "Hindi").slice(0, 10), []);
  const trendingTelugu = useMemo(() => allSongs.filter(s => s.language === "Telugu").slice(0, 10), []);
  const topRomantic = useMemo(() => allSongs.filter(s => s.genre === "Romantic").slice(0, 10), []);
  const topMass = useMemo(() => allSongs.filter(s => s.genre === "Mass").slice(0, 10), []);

  return (
    <div className="pb-36 px-4 sm:px-6 pt-6 animate-fade-in">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Good Evening</h1>
      <p className="text-sm text-muted-foreground mb-6">What do you want to listen to?</p>

      {/* Quick picks grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
        {allSongs.slice(0, 6).map(song => (
          <QuickPick key={song.id} song={song} />
        ))}
      </div>

      {recentlyPlayed.length > 0 && (
        <Section title="Recently Played">
          {recentlyPlayed.map(song => (
            <SongRow key={song.id} song={song} queue={recentlyPlayed} />
          ))}
        </Section>
      )}

      <Section title="Trending Hindi">
        {trendingHindi.map(song => (
          <SongRow key={song.id} song={song} queue={trendingHindi} />
        ))}
      </Section>

      <Section title="Trending Telugu">
        {trendingTelugu.map(song => (
          <SongRow key={song.id} song={song} queue={trendingTelugu} />
        ))}
      </Section>

      <Section title="Romantic Vibes">
        {topRomantic.map(song => (
          <SongRow key={song.id} song={song} queue={topRomantic} />
        ))}
      </Section>

      <Section title="Mass Hits">
        {topMass.map(song => (
          <SongRow key={song.id} song={song} queue={topMass} />
        ))}
      </Section>

      {/* All songs list */}
      <h2 className="text-lg font-bold text-foreground mt-8 mb-3">All Songs</h2>
      <div className="space-y-0.5">
        {allSongs.slice(0, 50).map((song, i) => (
          <SongCard key={song.id} song={song} queue={allSongs.slice(0, 50)} index={i} />
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
        {children}
      </div>
    </div>
  );
}

function QuickPick({ song }: { song: import("@/data/songs").Song }) {
  const { playSong } = usePlayer();
  return (
    <button
      onClick={() => playSong(song, allSongs.slice(0, 50))}
      className="flex items-center gap-3 bg-card/60 hover:bg-accent rounded-md overflow-hidden transition-colors"
    >
      <div className={`w-12 h-12 bg-gradient-to-br ${song.albumArt} flex-shrink-0`} />
      <span className="text-xs font-medium text-foreground truncate pr-2">{song.title}</span>
    </button>
  );
}
