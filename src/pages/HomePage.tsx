/**
 * HomePage — Spotify-like mobile-first music home screen
 * Features: Vertical scrolling sections with horizontal scrolling cards
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { api, extractResults } from "@/services/api";
import { Song, mapApiSong } from "@/data/songs";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import {
  Play, ChevronRight, Disc3, Flame, Clock,
  Sparkles, Radio, TrendingUp, Heart, Mic2,
  Music2, Headphones, Calendar, Star,
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
  year?: number;
}

interface Section {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  songs: Song[];
  albums?: Album[];
  type: "songs" | "albums" | "mix" | "featured";
}

const MOODS = [
  { label: "Chill", emoji: "🌙", gradient: "from-blue-500/20 to-purple-500/20" },
  { label: "Focus", emoji: "🎯", gradient: "from-green-500/20 to-teal-500/20" },
  { label: "Energize", emoji: "⚡", gradient: "from-yellow-500/20 to-orange-500/20" },
  { label: "Party", emoji: "🎉", gradient: "from-pink-500/20 to-red-500/20" },
  { label: "Romance", emoji: "💕", gradient: "from-rose-500/20 to-pink-500/20" },
  { label: "Feel-good", emoji: "😊", gradient: "from-emerald-500/20 to-green-500/20" },
  { label: "Commute", emoji: "🚇", gradient: "from-indigo-500/20 to-blue-500/20" },
  { label: "Gaming", emoji: "🎮", gradient: "from-purple-500/20 to-violet-500/20" },
];

const GENRES = [
  { label: "Hindi", icon: <Mic2 className="w-4 h-4" />, gradient: "from-orange-500/30 to-red-500/30" },
  { label: "Telugu", icon: <Music2 className="w-4 h-4" />, gradient: "from-purple-500/30 to-pink-500/30" },
  { label: "Tamil", icon: <Headphones className="w-4 h-4" />, gradient: "from-blue-500/30 to-cyan-500/30" },
  { label: "Punjabi", icon: <Calendar className="w-4 h-4" />, gradient: "from-yellow-500/30 to-orange-500/30" },
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [moodSongs, setMoodSongs] = useState<Song[]>([]);
  const [moodLoading, setMoodLoading] = useState(false);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<Album[]>([]);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch multiple trending/curated queries in parallel
      const queries = [
        { id: "trending", title: "Trending Now", subtitle: "Top hits this week", icon: <TrendingUp className="w-4 h-4" />, query: "trending hindi 2025", limit: 30 },
        { id: "telugu", title: "Telugu Blockbusters", subtitle: "Latest Tollywood hits", icon: <Flame className="w-4 h-4" />, query: "telugu hits 2025", limit: 30 },
        { id: "bollywood", title: "Bollywood Cafeteria", subtitle: "Fresh Hindi cinema", icon: <Sparkles className="w-4 h-4" />, query: "bollywood hits 2025", limit: 30 },
        { id: "lofi", title: "Late Night Vibes", subtitle: "Chill & relax", icon: <Radio className="w-4 h-4" />, query: "lofi chill hindi", limit: 25 },
        { id: "retro", title: "Evergreen Classics", subtitle: "Old is gold", icon: <Star className="w-4 h-4" />, query: "old hindi classic songs 90s", limit: 25 },
        { id: "romantic", title: "Romantic Rendezvous", subtitle: "Love songs for every mood", icon: <Heart className="w-4 h-4" />, query: "hindi romantic songs 2025", limit: 25 },
      ];

      const results = await Promise.all(
        queries.map(({ query, limit }) =>
          api.searchSongs(query, 1, limit)
            .then((res) => extractResults(res).map(mapApiSong))
            .catch(() => [] as Song[])
        )
      );

      const built: Section[] = queries.map(({ id, title, subtitle, icon }, i) => {
        const songs = results[i];
        const albums = groupIntoAlbums(songs);
        return { id, title, subtitle, icon, songs, albums, type: albums.length > 0 ? "mix" : "songs" };
      });

      setSections(built);

      // Create featured playlists section from first few albums
      const allAlbums = built.flatMap(s => s.albums || []);
      setFeaturedPlaylists(allAlbums.slice(0, 8));

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
      const res = await api.searchSongs(`${mood} hindi songs`, 1, 30);
      setMoodSongs(extractResults(res).map(mapApiSong));
    } catch {
      setMoodSongs([]);
    } finally {
      setMoodLoading(false);
      // Scroll to mood results
      setTimeout(() => {
        document.getElementById("mood-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  return (
    <div ref={scrollContainerRef} className="pb-36 animate-fade-in overflow-y-auto">
      
      {/* Hero Greeting Section */}
      <div className="px-4 mb-6 pt-2">
        <p className="text-white/40 text-sm font-medium tracking-wide">Good {greeting()},</p>
        <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">
          {user ? (user as any).user_metadata?.username ?? "Music Lover" : "Music Lover"} 🎵
        </h1>
        <p className="text-white/30 text-xs mt-1">Discover your next favorite song</p>
      </div>

      {/* ── Featured Playlists Banner (Spotify-like hero) ── */}
      {featuredPlaylists.length > 0 && (
        <div className="mb-6">
          <SectionHeader title="Featured Playlists" icon={<Star className="w-4 h-4" />} />
          <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
            {featuredPlaylists.slice(0, 6).map((playlist, idx) => (
              <FeaturedCard key={playlist.id} album={playlist} index={idx} />
            ))}
          </div>
        </div>
      )}

      {/* ── Mood & Genres Section (Horizontal Chips) ── */}
      <div className="mb-6">
        <SectionHeader title="Your Mood & Genres" icon={<Sparkles className="w-4 h-4" />} />
        
        {/* Mood Chips */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 mb-3" style={{ scrollbarWidth: "none" }}>
          {MOODS.map(({ label, emoji, gradient }) => (
            <button
              key={label}
              onClick={() => handleMoodClick(label)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-95 flex-shrink-0 ${
                selectedMood === label ? "shadow-lg" : ""
              }`}
              style={{
                background: selectedMood === label
                  ? "linear-gradient(135deg,#f97316,#ec4899)"
                  : `linear-gradient(135deg, ${gradient})`,
                color: selectedMood === label ? "#fff" : "rgba(255,255,255,0.8)",
                border: selectedMood === label ? "none" : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <span className="text-base">{emoji}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Genre Chips */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
          {GENRES.map(({ label, icon, gradient }) => (
            <button
              key={label}
              onClick={() => handleMoodClick(label)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-95 flex-shrink-0 ${
                selectedMood === label ? "shadow-lg" : ""
              }`}
              style={{
                background: selectedMood === label
                  ? "linear-gradient(135deg,#f97316,#ec4899)"
                  : `linear-gradient(135deg, ${gradient})`,
                color: selectedMood === label ? "#fff" : "rgba(255,255,255,0.8)",
                border: selectedMood === label ? "none" : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Mood results section */}
        {selectedMood && (
          <div id="mood-results" className="mt-4 px-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span className="text-lg">{MOODS.find(m => m.label === selectedMood)?.emoji || "🎵"}</span>
              {selectedMood} Songs
            </h3>
            {moodLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : moodSongs.length > 0 ? (
              <div className="space-y-0.5">
                {moodSongs.slice(0, 10).map((song) => (
                  <SongRow key={song.id} song={song} queue={moodSongs} onRequireAuth={onRequireAuth} />
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm text-center py-8">No songs found for this mood</p>
            )}
          </div>
        )}
      </div>

      {/* ── Recently Played Section (Horizontal Cards) ── */}
      {user && recentlyPlayed.length > 0 && (
        <div className="mb-6">
          <SectionHeader title="Recently Played" icon={<Clock className="w-4 h-4" />} />
          <HorizontalScrollCarousel>
            {recentlyPlayed.slice(0, 15).map((song) => (
              <HorizontalSongCard key={song.id} song={song} queue={recentlyPlayed} />
            ))}
          </HorizontalScrollCarousel>
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      )}

      {/* ── Dynamic Sections (Each with horizontal scrolling) ── */}
      {!loading && sections.map((section) => (
        <div key={section.id} className="mb-8">
          <SectionHeader title={section.title} subtitle={section.subtitle} icon={section.icon} />
          
          {/* Albums horizontal scroll */}
          {section.albums && section.albums.length > 0 && (
            <HorizontalScrollCarousel>
              {section.albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </HorizontalScrollCarousel>
          )}

          {/* Song rows for singles not in albums */}
          {(() => {
            const albumNames = new Set((section.albums || []).map((a) => a.name));
            const solo = section.songs.filter(
              (s) => !albumNames.has(s.album || "") && !albumNames.has(s.movie || "")
            );
            if (solo.length === 0) return null;
            return (
              <div className="px-4 space-y-0.5">
                {solo.slice(0, 8).map((song) => (
                  <SongRow key={song.id} song={song} queue={section.songs} onRequireAuth={onRequireAuth} />
                ))}
              </div>
            );
          })()}
        </div>
      ))}

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, icon, onMore }: { 
  title: string; 
  subtitle?: string; 
  icon?: React.ReactNode; 
  onMore?: () => void;
}) {
  return (
    <div className="flex items-end justify-between px-4 mb-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {icon && <span className="text-orange-400">{icon}</span>}
          <h2 className="font-bold text-lg text-white tracking-tight">{title}</h2>
        </div>
        {subtitle && <p className="text-xs text-white/30 mt-0.5">{subtitle}</p>}
      </div>
      {onMore && (
        <button onClick={onMore} className="text-white/30 hover:text-white/60 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

function HorizontalScrollCarousel({ children }: { children: React.ReactNode }) {
  return (
    <div 
      className="flex gap-3 overflow-x-auto px-4 pb-2 scroll-smooth"
      style={{ scrollbarWidth: "thin", scrollbarColor: "#f97316 rgba(255,255,255,0.1)" }}
    >
      {children}
    </div>
  );
}

function FeaturedCard({ album, index }: { album: Album; index: number }) {
  const { playSong } = usePlayer();
  const gradients = [
    "from-orange-500 to-red-500",
    "from-purple-500 to-pink-500",
    "from-blue-500 to-cyan-500",
    "from-green-500 to-emerald-500",
    "from-yellow-500 to-orange-500",
    "from-indigo-500 to-purple-500",
  ];
  
  return (
    <button
      onClick={() => playSong(album.songs[0], album.songs)}
      className="flex-shrink-0 w-40 text-left group active:scale-95 transition-all duration-200"
    >
      <div className="relative w-40 h-40 rounded-xl overflow-hidden mb-2 shadow-lg">
        {album.coverArt ? (
          <img src={album.coverArt} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradients[index % gradients.length]} flex items-center justify-center`}>
            <Disc3 className="w-12 h-12 text-white/60" />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <p className="text-sm font-semibold text-white truncate leading-tight">{album.name}</p>
      <p className="text-xs text-white/40 truncate mt-0.5">{album.songs.length} songs</p>
    </button>
  );
}

function HorizontalSongCard({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong, currentSong, isPlaying, togglePlay } = usePlayer();
  const isActive = currentSong?.id === song.id;

  return (
    <button
      onClick={() => isActive ? togglePlay() : playSong(song, queue)}
      className="flex-shrink-0 w-32 text-left group active:scale-95 transition-transform"
    >
      <div className="relative w-32 h-32 rounded-xl overflow-hidden mb-2 shadow-lg">
        {song.albumArt ? (
          <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-500 to-pink-500" />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
            {isActive && isPlaying
              ? <span className="w-3 h-3 border-2 border-white rounded-sm" />
              : <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            }
          </div>
        </div>
        {isActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-end gap-0.5">
            {[0, 150, 300].map((d) => (
              <div key={d} className="w-0.5 rounded-full animate-pulse" style={{ background: "#f97316", height: d === 150 ? "12px" : "8px", animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-white truncate leading-tight">{song.title}</p>
      <p className="text-[10px] text-white/40 truncate mt-0.5">{song.artist}</p>
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
      <div className="relative w-36 h-36 rounded-xl overflow-hidden mb-2 shadow-lg">
        {album.coverArt ? (
          <img src={album.coverArt} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
            <Disc3 className="w-8 h-8 text-white/60" />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <p className="text-sm font-semibold text-white truncate leading-tight">{album.name}</p>
      <p className="text-xs text-white/40 truncate mt-0.5">{album.artist}</p>
    </button>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}