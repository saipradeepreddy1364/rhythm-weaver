import { useEffect, useState } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { SongCard } from "@/components/SongCard";
import { usePlayer } from "@/context/PlayerContext";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const { recentlyPlayed } = usePlayer();
  const [trendingHindi, setTrendingHindi] = useState<Song[]>([]);
  const [trendingTelugu, setTrendingTelugu] = useState<Song[]>([]);
  const [bollywood, setBollywood] = useState<Song[]>([]);
  const [arijit, setArijit] = useState<Song[]>([]);
  const [english, setEnglish] = useState<Song[]>([]);
  const [romantic, setRomantic] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.searchSongs("top hindi hits 2025", 1, 20),
      api.searchSongs("top telugu hits 2025", 1, 20),
      api.searchSongs("latest bollywood 2024 2025", 1, 20),
      api.searchSongs("arijit singh best songs", 1, 20),
      api.searchSongs("top english hits 2025", 1, 20),
      api.searchSongs("hindi romantic songs", 1, 20),
    ])
      .then(([hindi, telugu, bolly, arj, eng, rom]) => {
        setTrendingHindi((hindi?.data?.results || []).map(mapApiSong));
        setTrendingTelugu((telugu?.data?.results || []).map(mapApiSong));
        setBollywood((bolly?.data?.results || []).map(mapApiSong));
        setArijit((arj?.data?.results || []).map(mapApiSong));
        setEnglish((eng?.data?.results || []).map(mapApiSong));
        setRomantic((rom?.data?.results || []).map(mapApiSong));
      })
      .catch((err) => console.error("Failed to load songs:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const allFetched = [
    ...trendingHindi,
    ...trendingTelugu,
    ...bollywood,
    ...arijit,
    ...english,
    ...romantic,
  ].filter(
    (song, index, self) => index === self.findIndex((s) => s.id === song.id)
  );

  return (
    <div className="pb-36 px-4 sm:px-6 pt-6 animate-fade-in">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Good Evening</h1>
      <p className="text-sm text-muted-foreground mb-6">What do you want to listen to?</p>

      {trendingHindi.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
          {trendingHindi.slice(0, 6).map((song) => (
            <QuickPick key={song.id} song={song} queue={trendingHindi} />
          ))}
        </div>
      )}

      {recentlyPlayed.length > 0 && (
        <Section title="Recently Played">
          {recentlyPlayed.map((song) => (
            <SongRow key={song.id} song={song} queue={recentlyPlayed} />
          ))}
        </Section>
      )}

      {trendingHindi.length > 0 && (
        <Section title="Trending Hindi">
          {trendingHindi.map((song) => (
            <SongRow key={song.id} song={song} queue={trendingHindi} />
          ))}
        </Section>
      )}

      {trendingTelugu.length > 0 && (
        <Section title="Trending Telugu">
          {trendingTelugu.map((song) => (
            <SongRow key={song.id} song={song} queue={trendingTelugu} />
          ))}
        </Section>
      )}

      {bollywood.length > 0 && (
        <Section title="Latest Bollywood">
          {bollywood.map((song) => (
            <SongRow key={song.id} song={song} queue={bollywood} />
          ))}
        </Section>
      )}

      {arijit.length > 0 && (
        <Section title="Arijit Singh Hits">
          {arijit.map((song) => (
            <SongRow key={song.id} song={song} queue={arijit} />
          ))}
        </Section>
      )}

      {romantic.length > 0 && (
        <Section title="Romantic Vibes">
          {romantic.map((song) => (
            <SongRow key={song.id} song={song} queue={romantic} />
          ))}
        </Section>
      )}

      {english.length > 0 && (
        <Section title="English Hits">
          {english.map((song) => (
            <SongRow key={song.id} song={song} queue={english} />
          ))}
        </Section>
      )}

      {allFetched.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-foreground mt-8 mb-3">
            All Songs ({allFetched.length})
          </h2>
          <div className="space-y-0.5">
            {allFetched.map((song, i) => (
              <SongCard key={song.id} song={song} queue={allFetched} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {children}
      </div>
    </div>
  );
}

function QuickPick({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong } = usePlayer();
  return (
    <button
      onClick={() => playSong(song, queue)}
      className="flex items-center gap-3 bg-card/60 hover:bg-accent rounded-md overflow-hidden transition-colors text-left w-full"
    >
      {song.albumArt ? (
        <img src={song.albumArt} alt={song.title} className="w-12 h-12 object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-purple-600 flex-shrink-0" />
      )}
      <span className="text-xs font-medium text-foreground truncate pr-2">{song.title}</span>
    </button>
  );
}