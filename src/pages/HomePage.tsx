import { useEffect, useState } from "react";
import { Song, mapApiSong } from "@/data/songs";
import { api, extractResults } from "@/services/api";
import { SongRow } from "@/components/SongRow";
import { SongCard } from "@/components/SongCard";
import { usePlayer } from "@/context/PlayerContext";
import { Loader2 } from "lucide-react";

const BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

const PLAYLISTS = {
  trendingHindi: "1134543272",
  trendingTelugu: "1134543280",
  bollywood2025:  "1134543279",
  romantic:       "91369254",
  party:          "1134543281",
  retro:          "1134543277",
};

function mapPlaylistSongs(res: any): Song[] {
  const songs = extractResults(res);
  return songs.map(mapApiSong).filter((s: Song) => s.audioUrl);
}

function mapSearchSongs(res: any): Song[] {
  const songs = extractResults(res);
  return songs.map(mapApiSong).filter((s: Song) => s.audioUrl);
}

async function wakeServer(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/search/songs?query=hindi&page=1&limit=1`);
  } catch {
    // ignore — just waking the free Render instance
  }
}

interface HomePageProps {
  onRequireAuth?: () => void;
}

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { recentlyPlayed } = usePlayer();
  const [trendingHindi,  setTrendingHindi]  = useState<Song[]>([]);
  const [trendingTelugu, setTrendingTelugu] = useState<Song[]>([]);
  const [bollywood,      setBollywood]      = useState<Song[]>([]);
  const [romantic,       setRomantic]       = useState<Song[]>([]);
  const [party,          setParty]          = useState<Song[]>([]);
  const [retro,          setRetro]          = useState<Song[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [waking,         setWaking]         = useState(true);

  useEffect(() => {
    const load = async () => {
      setWaking(true);
      await wakeServer();
      setWaking(false);

      try {
        const [hindi, telugu, bolly, rom, par, ret] = await Promise.all([
          api.getPlaylist(PLAYLISTS.trendingHindi),
          api.getPlaylist(PLAYLISTS.trendingTelugu),
          api.getPlaylist(PLAYLISTS.bollywood2025),
          api.getPlaylist(PLAYLISTS.romantic),
          api.getPlaylist(PLAYLISTS.party),
          api.getPlaylist(PLAYLISTS.retro),
        ]);

        const h  = mapPlaylistSongs(hindi);
        const t  = mapPlaylistSongs(telugu);
        const b  = mapPlaylistSongs(bolly);
        const r  = mapPlaylistSongs(rom);
        const p  = mapPlaylistSongs(par);
        const re = mapPlaylistSongs(ret);

        const fallbacks: Promise<void>[] = [];

        if (h.length === 0)
          fallbacks.push(api.searchSongs("top hindi hits 2025", 1, 20).then((res) => setTrendingHindi(mapSearchSongs(res))));
        else setTrendingHindi(h);

        if (t.length === 0)
          fallbacks.push(api.searchSongs("top telugu hits 2025", 1, 20).then((res) => setTrendingTelugu(mapSearchSongs(res))));
        else setTrendingTelugu(t);

        if (b.length === 0)
          fallbacks.push(api.searchSongs("latest bollywood 2025", 1, 20).then((res) => setBollywood(mapSearchSongs(res))));
        else setBollywood(b);

        if (r.length === 0)
          fallbacks.push(api.searchSongs("hindi romantic songs", 1, 20).then((res) => setRomantic(mapSearchSongs(res))));
        else setRomantic(r);

        if (p.length === 0)
          fallbacks.push(api.searchSongs("party hits hindi", 1, 20).then((res) => setParty(mapSearchSongs(res))));
        else setParty(p);

        if (re.length === 0)
          fallbacks.push(api.searchSongs("old hindi classic songs", 1, 20).then((res) => setRetro(mapSearchSongs(res))));
        else setRetro(re);

        await Promise.all(fallbacks);
      } catch (err) {
        console.error("Failed to load playlists, using search fallback:", err);
        try {
          const [h, t, b] = await Promise.all([
            api.searchSongs("top hindi hits 2025",   1, 20),
            api.searchSongs("top telugu hits 2025",  1, 20),
            api.searchSongs("latest bollywood 2025", 1, 20),
          ]);
          setTrendingHindi(mapSearchSongs(h));
          setTrendingTelugu(mapSearchSongs(t));
          setBollywood(mapSearchSongs(b));
        } catch { /* nothing we can do */ }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (waking || loading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-3"
        style={{ background: "#121212" }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1DB954" }} />
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          {waking ? "Starting music server..." : "Loading songs..."}
        </p>
        {waking && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Free server wakes up in ~15 seconds
          </p>
        )}
      </div>
    );
  }

  const allFetched = [
    ...trendingHindi,
    ...trendingTelugu,
    ...bollywood,
    ...romantic,
    ...party,
    ...retro,
  ].filter((song, index, self) => index === self.findIndex((s) => s.id === song.id));

  return (
    <div className="w-full" style={{ background: "#121212", paddingBottom: "9rem" }}>
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-white mb-0.5">Good Evening</h1>
        <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>
          What do you want to listen to?
        </p>

        {/* Quick picks grid — 2 cols, full width, mobile-safe */}
        {trendingHindi.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-7 w-full">
            {trendingHindi.slice(0, 6).map((song) => (
              <QuickPick key={song.id} song={song} queue={trendingHindi} />
            ))}
          </div>
        )}
      </div>

      {recentlyPlayed.length > 0 && (
        <Section title="Recently Played">
          {recentlyPlayed.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={recentlyPlayed}
              onRequireAuth={onRequireAuth}
            />
          ))}
        </Section>
      )}

      {trendingHindi.length > 0 && (
        <Section title="Trending Hindi">
          {trendingHindi.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={trendingHindi}
              onRequireAuth={onRequireAuth}
            />
          ))}
        </Section>
      )}

      {trendingTelugu.length > 0 && (
        <Section title="Trending Telugu">
          {trendingTelugu.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={trendingTelugu}
              onRequireAuth={onRequireAuth}
            />
          ))}
        </Section>
      )}

      {bollywood.length > 0 && (
        <Section title="Latest Bollywood">
          {bollywood.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={bollywood}
              onRequireAuth={onRequireAuth}
            />
          ))}
        </Section>
      )}

      {romantic.length > 0 && (
        <Section title="Romantic Vibes">
          {romantic.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={romantic}
              onRequireAuth={onRequireAuth}
            />
          ))}
        </Section>
      )}

      {party.length > 0 && (
        <Section title="Party Hits">
          {party.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={party}
              onRequireAuth={onRequireAuth}
            />
          ))}
        </Section>
      )}

      {retro.length > 0 && (
        <Section title="Old is Gold">
          {retro.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={retro}
              onRequireAuth={onRequireAuth}
            />
          ))}
        </Section>
      )}

      {allFetched.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="text-base font-bold text-white mb-3">All Songs</h2>
          <div className="space-y-0.5">
            {allFetched.map((song, i) => (
              <SongCard key={song.id} song={song} queue={allFetched} index={i} />
            ))}
          </div>
        </div>
      )}

      {allFetched.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            No songs loaded
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            Try refreshing the page
          </p>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-white mb-2 px-4">{title}</h2>
      <div
        className="flex gap-3 overflow-x-auto px-4 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
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
      className="flex items-center gap-2 rounded-lg overflow-hidden transition-all active:scale-95 text-left w-full"
      style={{ background: "rgba(255,255,255,0.08)", minWidth: 0 }}
    >
      {song.albumArt ? (
        <img
          src={song.albumArt}
          alt={song.title}
          className="w-12 h-12 object-cover flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div
          className="w-12 h-12 flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#f43f5e,#7c3aed)" }}
        />
      )}
      <span
        className="text-xs font-semibold truncate pr-2"
        style={{ color: "rgba(255,255,255,0.9)" }}
      >
        {song.title}
      </span>
    </button>
  );
}