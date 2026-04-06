/**
 * HomePage — mobile-first music home screen
 * 
 * Changes from original:
 * - Album sections displayed horizontally (not just songs)
 * - No count badges/numbers on section headers
 * - Mood & Genre chips without counts
 * - Clean spacing for mobile APK
 */

import { useState, useEffect, useCallback } from "react";
import { api, extractResults } from "@/services/api";
import { Song, mapApiSong } from "@/data/songs";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import {
  Play, ChevronRight, Disc3, Flame, Clock,
  Sparkles, Radio, TrendingUp,
} from "lucide-react";
import { Loader2 } from "lucide-react";

interface HomePageProps {
  onRequireAuth: () => void;
}

interface Album {
  id: string;
  name: string;
  artist: string;
  coverArt: string;
  songs: Song[];
  year?: string;
}

interface Section {
  id: string;
  title: string;
  icon?: React.ReactNode;
  songs: Song[];
  albums?: Album[];
  type: "songs" | "albums" | "mix";
}

const MOODS = [
  { label: "Chill", emoji: "🌙" },
  { label: "Focus", emoji: "🎯" },
  { label: "Energize", emoji: "⚡" },
  { label: "Party", emoji: "🎉" },
  { label: "Romance", emoji: "💕" },
  { label: "Feel-good", emoji: "😊" },
  { label: "Commute", emoji: "🚇" },
  { label: "Gaming", emoji: "🎮" },
];

function groupIntoAlbums(songs: Song[]): Album[] {
  const map = new Map<string, Album>();
  songs.forEach((s) => {
    const key = s.album || s.movie || "";
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: key,
        artist: s.artist,
        coverArt: s.albumArt || "",
        songs: [],
        year: s.year,
      });
    }
    map.get(key)!.songs.push(s);
  });
  return Array.from(map.values()).filter((a) => a.songs.length >= 2);
}

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { playSong } = usePlayer();
  const { recentlyPlayed } = useLibrary();
  const { user } = useAuth();

  const [sections, setSections]     = useState<Section[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [moodSongs, setMoodSongs]   = useState<Song[]>([]);
  const [moodLoading, setMoodLoading] = useState(false);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch multiple trending/curated queries in parallel
      const queries = [
        { id: "trending", title: "Trending Now", icon: <TrendingUp className="w-4 h-4" />, query: "trending hindi 2024" },
        { id: "telugu", title: "Telugu Hits", icon: <Flame className="w-4 h-4" />, query: "telugu hits 2024" },
        { id: "bollywood", title: "Bollywood", icon: <Sparkles className="w-4 h-4" />, query: "bollywood hits 2024" },
        { id: "lofi", title: "Late Night Vibes", icon: <Radio className="w-4 h-4" />, query: "lofi chill hindi" },
      ];

      const results = await Promise.all(
        queries.map(({ query }) =>
          api.searchSongs(query, 1, 20)
            .then((res) => extractResults(res).map(mapApiSong))
            .catch(() => [] as Song[])
        )
      );

      const built: Section[] = queries.map(({ id, title, icon }, i) => {
        const songs = results[i];
        const albums = groupIntoAlbums(songs);
        return { id, title, icon, songs, albums, type: albums.length > 0 ? "mix" : "songs" };
      });

      setSections(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHome(); }, [loadHome]);

  const handleMoodClick = async (mood: string) => {
    if (selectedMood === mood) {
      setSelectedMood(null);
      setMoodSongs([]);
      return;
    }
    setSelectedMood(mood);
    setMoodLoading(true);
    try {
      const res = await api.searchSongs(`${mood} hindi songs`, 1, 20);
      setMoodSongs(extractResults(res).map(mapApiSong));
    } catch {
      setMoodSongs([]);
    } finally {
      setMoodLoading(false);
    }
  };

  return (
    <div className="pt-4 pb-4 animate-fade-in">

      {/* Greeting */}
      <div className="px-4 mb-5">
        <p className="text-white/40 text-sm">Good {greeting()},</p>
        <h1 className="text-2xl font-bold text-white mt-0.5">
          {user ? (user as any).profile?.username ?? "Music Lover" : "Music Lover"} 🎵
        </h1>
      </div>

      {/* ── Mood & Genres ─────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionHeader title="Mood & Genres" icon={<Sparkles className="w-4 h-4" />} />
        <div className="flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
          {MOODS.map(({ label, emoji }) => (
            <button
              key={label}
              onClick={() => handleMoodClick(label)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-95 flex-shrink-0"
              style={{
                background: selectedMood === label
                  ? "linear-gradient(135deg,#f97316,#ec4899)"
                  : "rgba(255,255,255,0.07)",
                color: selectedMood === label ? "#fff" : "rgba(255,255,255,0.6)",
                border: selectedMood === label ? "none" : "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {emoji} {label}
            </button>
          ))}
        </div>

        {/* Mood results */}
        {selectedMood && (
          <div className="mt-3 px-4">
            {moodLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
              </div>
            ) : (
              <div className="space-y-0.5">
                {moodSongs.slice(0, 8).map((s) => (
                  <SongRow key={s.id} song={s} queue={moodSongs} onRequireAuth={onRequireAuth} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Recently Played (logged in users) ────────────────────── */}
      {user && recentlyPlayed.length > 0 && (
        <div className="mb-6">
          <SectionHeader title="Recently Played" icon={<Clock className="w-4 h-4" />} />
          <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
            {recentlyPlayed.slice(0, 10).map((song) => (
              <HorizontalSongCard key={song.id} song={song} queue={recentlyPlayed} />
            ))}
          </div>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
        </div>
      )}

      {/* ── Dynamic Sections ──────────────────────────────────────── */}
      {!loading && sections.map((section) => (
        <div key={section.id} className="mb-7">
          <SectionHeader title={section.title} icon={section.icon} />

          {/* Albums horizontal scroll */}
          {section.albums && section.albums.length > 0 && (
            <div className="flex gap-3 overflow-x-auto px-4 pb-1 mb-3" style={{ scrollbarWidth: "none" }}>
              {section.albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          )}

          {/* Song rows — songs NOT in any album */}
          {(() => {
            const albumNames = new Set((section.albums || []).map((a) => a.name));
            const solo = section.songs.filter(
              (s) => !albumNames.has(s.album || "") && !albumNames.has(s.movie || "")
            );
            if (solo.length === 0) return null;
            return (
              <div className="px-4 space-y-0.5">
                {solo.slice(0, 6).map((s) => (
                  <SongRow key={s.id} song={s} queue={section.songs} onRequireAuth={onRequireAuth} />
                ))}
              </div>
            );
          })()}
        </div>
      ))}

      <div className="h-4" />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, icon, onMore }: { title: string; icon?: React.ReactNode; onMore?: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 mb-3">
      <div className="flex items-center gap-2">
        {icon && <span className="text-orange-400">{icon}</span>}
        <h2 className="font-bold text-base text-white">{title}</h2>
      </div>
      {onMore && (
        <button onClick={onMore} className="text-white/30 hover:text-white/60 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

function HorizontalSongCard({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong, currentSong, isPlaying, togglePlay } = usePlayer();
  const isActive = currentSong?.id === song.id;

  return (
    <button
      onClick={() => isActive ? togglePlay() : playSong(song, queue)}
      className="flex-shrink-0 w-28 text-left group"
    >
      <div className="relative w-28 h-28 rounded-xl overflow-hidden mb-2 shadow-lg">
        {song.albumArt ? (
          <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }} />
        )}
        <div className="absolute inset-0 bg-black/0 group-active:bg-black/30 transition-all flex items-center justify-center">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-active:opacity-100 transition-all"
            style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
          >
            {isActive && isPlaying
              ? <span className="w-3 h-3 border-2 border-white rounded-sm" />
              : <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            }
          </div>
        </div>
        {isActive && isPlaying && (
          <div className="absolute bottom-1.5 right-1.5 flex items-end gap-0.5">
            {[0, 150, 300].map((d) => (
              <div key={d} className="w-0.5 rounded-full animate-pulse" style={{ background: "#f97316", height: d === 150 ? "12px" : "8px", animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-white truncate leading-tight">{song.title}</p>
      <p className="text-[11px] text-white/40 truncate mt-0.5">{song.artist}</p>
    </button>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const { playSong } = usePlayer();
  return (
    <button
      onClick={() => playSong(album.songs[0], album.songs)}
      className="flex-shrink-0 w-36 text-left group active:scale-95 transition-transform"
    >
      <div className="relative w-36 h-36 rounded-2xl overflow-hidden mb-2 shadow-xl">
        {album.coverArt ? (
          <img src={album.coverArt} alt={album.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}>
            <Disc3 className="w-8 h-8 text-white" />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-active:bg-black/30 transition-all flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-active:opacity-100 shadow-xl transition-all"
            style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
          >
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <p className="text-xs font-bold text-white truncate leading-tight">{album.name}</p>
      <p className="text-[11px] text-white/40 truncate mt-0.5">{album.songs.length} songs</p>
    </button>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}