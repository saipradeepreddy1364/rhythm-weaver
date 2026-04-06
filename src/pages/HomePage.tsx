/**
 * HomePage — Spotify-like mobile home screen
 * Features:
 *  - 2×N quick-access grid (like Spotify "Good evening")
 *  - Horizontal album/movie carousels
 *  - Individual movie album cards with cover art
 *  - Category chips (language) → loads vertically below
 *  - Both vertical list rows and horizontal card scrolls
 *  - No minimum song count enforced
 *  - True Spotify mobile aesthetic
 */

import { useState, useEffect, useCallback } from "react";
import { api, extractResults } from "@/services/api";
import { Song, mapApiSong } from "@/data/songs";
import { SongRow } from "@/components/SongRow";
import { usePlayer } from "@/context/PlayerContext";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import {
  Play, Pause, ChevronRight, Disc3, Flame,
  Sparkles, TrendingUp, Heart, Mic2,
  Music2, Headphones, Star, Globe2, Loader2,
  Radio, Zap, Clock, Bell, Settings,
} from "lucide-react";

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
  showSongRows?: boolean;
}

function groupIntoAlbums(songs: Song[]): Album[] {
  const map = new Map<string, Album>();
  songs.forEach((s) => {
    const key = s.album || s.movie || "";
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { id: key, name: key, artist: s.artist, coverArt: s.albumArt || "", songs: [], year: s.year });
    }
    map.get(key)!.songs.push(s);
  });
  return Array.from(map.values()).filter((a) => a.songs.length >= 1);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const QUICK_ACCESS = [
  { label: "Liked Songs",   gradient: "from-indigo-700 to-blue-600",   icon: <Heart className="w-4 h-4 fill-white text-white" /> },
  { label: "Latest Telugu", gradient: "from-orange-600 to-red-600",    icon: <Zap className="w-4 h-4 text-white" /> },
  { label: "Hindi Hits",    gradient: "from-pink-600 to-rose-600",     icon: <Mic2 className="w-4 h-4 text-white" /> },
  { label: "Tamil Fresh",   gradient: "from-purple-700 to-violet-600", icon: <Headphones className="w-4 h-4 text-white" /> },
  { label: "Punjabi Beats", gradient: "from-yellow-600 to-amber-500",  icon: <Music2 className="w-4 h-4 text-white" /> },
  { label: "Chill Vibes",   gradient: "from-teal-600 to-cyan-500",     icon: <Radio className="w-4 h-4 text-white" /> },
];

const LANGUAGES = [
  { label: "Hindi",     query: "hindi songs 2025",      color: "#f97316" },
  { label: "Telugu",    query: "telugu songs 2025",     color: "#ec4899" },
  { label: "Tamil",     query: "tamil songs 2025",      color: "#8b5cf6" },
  { label: "Kannada",   query: "kannada songs 2025",    color: "#06b6d4" },
  { label: "Malayalam", query: "malayalam songs 2025",  color: "#10b981" },
  { label: "Punjabi",   query: "punjabi songs 2025",    color: "#f59e0b" },
  { label: "Bengali",   query: "bengali songs 2025",    color: "#e11d48" },
  { label: "Marathi",   query: "marathi songs 2025",    color: "#6366f1" },
  { label: "English",   query: "english pop hits 2025", color: "#64748b" },
];

export default function HomePage({ onRequireAuth }: HomePageProps) {
  const { playSong } = usePlayer();
  const { recentlyPlayed } = useLibrary();
  const { user } = useAuth();

  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [langSongs, setLangSongs] = useState<Song[]>([]);
  const [langAlbums, setLangAlbums] = useState<Album[]>([]);
  const [langLoading, setLangLoading] = useState(false);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const queries = [
        { id: "trending",   title: "Trending Now",         subtitle: "Top hits this week",      icon: <TrendingUp className="w-4 h-4" />, query: "trending india 2025",           showSongRows: false },
        { id: "telugu25",   title: "Telugu Blockbusters",  subtitle: "Latest Tollywood fire",   icon: <Flame className="w-4 h-4" />,      query: "telugu hits 2025",              showSongRows: true  },
        { id: "hindi25",    title: "Bollywood Now",        subtitle: "Fresh from Bollywood",    icon: <Sparkles className="w-4 h-4" />,   query: "bollywood 2025",                showSongRows: true  },
        { id: "tamil25",    title: "Kollywood Vibes",      subtitle: "Tamil chart-toppers",     icon: <Music2 className="w-4 h-4" />,     query: "tamil hits 2025",               showSongRows: true  },
        { id: "punjabi",    title: "Punjabi Bangers",      subtitle: "Dance & party anthems",   icon: <Zap className="w-4 h-4" />,        query: "punjabi songs 2025",            showSongRows: false },
        { id: "kannada",    title: "Sandalwood Hits",      subtitle: "Latest Kannada music",    icon: <Globe2 className="w-4 h-4" />,     query: "kannada songs 2025",            showSongRows: true  },
        { id: "malayalam",  title: "Mollywood Melodies",   subtitle: "Kerala's finest",         icon: <Headphones className="w-4 h-4" />, query: "malayalam hits 2025",           showSongRows: true  },
        { id: "retro",      title: "Evergreen Classics",   subtitle: "All-time favourites",     icon: <Star className="w-4 h-4" />,       query: "old hindi classic songs 90s",   showSongRows: true  },
        { id: "romantic",   title: "Love Songs",           subtitle: "For every mood",          icon: <Heart className="w-4 h-4" />,      query: "romantic hindi songs",          showSongRows: true  },
        { id: "lofi",       title: "Late Night Lofi",      subtitle: "Chill & focus",           icon: <Radio className="w-4 h-4" />,      query: "lofi chill hindi",              showSongRows: false },
        { id: "anirudh",    title: "Anirudh Universe",     subtitle: "The maestro's world",     icon: <Mic2 className="w-4 h-4" />,       query: "anirudh ravichander hits",      showSongRows: true  },
        { id: "arrahman",   title: "A.R. Rahman Classics", subtitle: "Timeless masterpieces",   icon: <Star className="w-4 h-4" />,       query: "a r rahman hits",               showSongRows: true  },
        { id: "devotional", title: "Devotional & Bhakti",  subtitle: "Spiritual classics",      icon: <Sparkles className="w-4 h-4" />,   query: "devotional bhakti songs hindi", showSongRows: false },
        { id: "english",    title: "Global Hits",          subtitle: "English pop & more",      icon: <Globe2 className="w-4 h-4" />,     query: "english pop hits 2025",         showSongRows: false },
      ];

      const results = await Promise.all(
        queries.map(({ query }) =>
          api.searchSongs(query, 1, 50)
            .then((res) => extractResults(res).map(mapApiSong))
            .catch(() => [] as Song[])
        )
      );

      const built: Section[] = queries.map(({ id, title, subtitle, icon, showSongRows }, i) => {
        const songs = results[i];
        const albums = groupIntoAlbums(songs);
        return { id, title, subtitle, icon, songs, albums, showSongRows };
      });

      setSections(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHome(); }, [loadHome]);

  const handleLangClick = async (lang: typeof LANGUAGES[0]) => {
    if (activeLang === lang.label) {
      setActiveLang(null);
      setLangSongs([]);
      setLangAlbums([]);
      return;
    }
    setActiveLang(lang.label);
    setLangLoading(true);
    try {
      const res = await api.searchSongs(lang.query, 1, 60);
      const songs = extractResults(res).map(mapApiSong);
      setLangSongs(songs);
      setLangAlbums(groupIntoAlbums(songs));
    } catch {
      setLangSongs([]);
      setLangAlbums([]);
    } finally {
      setLangLoading(false);
      setTimeout(() => {
        document.getElementById("lang-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  const recentSongs = recentlyPlayed.slice(0, 6);

  return (
    <div className="pb-4 overflow-y-auto" style={{ background: "#121212" }}>

      {/* ── Top bar (Spotify style) ── */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          {user ? (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,#1DB954,#1ed760)" }}
            >
              {user.email?.charAt(0).toUpperCase() ?? "U"}
            </div>
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <span className="text-white/60 text-xs font-bold">P</span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Good {greeting()}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <Bell className="w-4 h-4 text-white/70" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <Clock className="w-4 h-4 text-white/70" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <Settings className="w-4 h-4 text-white/70" />
          </button>
        </div>
      </div>

      {/* ── Filter chips (All / Music / Podcasts) ── */}
      <div className="flex gap-2 px-4 mb-5">
        {["All", "Music", "Podcasts"].map((chip, i) => (
          <button
            key={chip}
            className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{
              background: i === 0 ? "#1DB954" : "rgba(255,255,255,0.1)",
              color: "#fff",
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* ── Quick Access 2-col Grid (Spotify style) ── */}
      <div className="px-4 mb-6">
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACCESS.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-0 rounded-md overflow-hidden text-left active:scale-95 transition-transform"
              style={{ background: "rgba(255,255,255,0.12)", height: "52px" }}
            >
              {/* Left color block with icon */}
              <div
                className={`w-14 h-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${item.gradient}`}
              >
                {item.icon}
              </div>
              <span className="flex-1 px-3 text-sm font-semibold text-white leading-tight line-clamp-2">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Recently Played ── */}
      {recentSongs.length > 0 && (
        <div className="mb-6">
          <SectionHeader title="Recently played" />
          <HorizontalScroll>
            {recentSongs.map((song) => (
              <SongCard key={song.id} song={song} queue={recentSongs} />
            ))}
          </HorizontalScroll>
        </div>
      )}

      {/* ── Language chips ── */}
      <div className="mb-2 px-4">
        <p className="text-[13px] font-semibold text-white/40 uppercase tracking-widest mb-3">Browse by language</p>
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.label}
              onClick={() => handleLangClick(lang)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-95"
              style={{
                background: activeLang === lang.label ? lang.color : "rgba(255,255,255,0.08)",
                color: activeLang === lang.label ? "#fff" : "rgba(255,255,255,0.7)",
                border: activeLang === lang.label ? "none" : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Language results ── */}
      {activeLang && (
        <div id="lang-results" className="mb-6 mt-4">
          {langLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#1DB954" }} />
            </div>
          ) : (
            <>
              <SectionHeader title={`${activeLang} Albums`} />
              {langAlbums.length > 0 && (
                <HorizontalScroll>
                  {langAlbums.map((album) => (
                    <AlbumCard key={album.id} album={album} />
                  ))}
                </HorizontalScroll>
              )}
              {langSongs.length > 0 && (
                <div className="mt-3 px-2 space-y-0.5">
                  {langSongs.map((song) => (
                    <SongRow key={song.id} song={song} queue={langSongs} onRequireAuth={onRequireAuth} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1DB954" }} />
        </div>
      )}

      {/* ── Dynamic Sections ── */}
      {!loading && sections.map((section) => {
        const albumNames = new Set((section.albums || []).map((a) => a.name));
        const soloSongs = section.songs.filter(
          (s) => !albumNames.has(s.album || "") && !albumNames.has(s.movie || "")
        );

        const hasAlbums = section.albums && section.albums.length > 0;
        const hasSoloSongs = soloSongs.length > 0;

        if (!hasAlbums && !hasSoloSongs) return null;

        return (
          <div key={section.id} className="mb-8">
            <SectionHeader
              title={section.title}
              subtitle={section.subtitle}
              icon={section.icon}
            />

            {/* Movie/Album cards — horizontal scroll */}
            {hasAlbums && (
              <HorizontalScroll>
                {section.albums!.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </HorizontalScroll>
            )}

            {/* Solo song cards — horizontal scroll */}
            {hasSoloSongs && !section.showSongRows && (
              <HorizontalScroll>
                {soloSongs.map((song) => (
                  <SongCard key={song.id} song={song} queue={soloSongs} />
                ))}
              </HorizontalScroll>
            )}

            {/* Solo song rows — vertical list */}
            {hasSoloSongs && section.showSongRows && (
              <div className="px-2 space-y-0.5">
                {soloSongs.map((song) => (
                  <SongRow key={song.id} song={song} queue={section.songs} onRequireAuth={onRequireAuth} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="h-4" />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  icon,
  onMore,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onMore?: () => void;
}) {
  return (
    <div className="flex items-end justify-between px-4 mb-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {icon && <span style={{ color: "#1DB954" }}>{icon}</span>}
          <h2 className="font-bold text-[17px] text-white tracking-tight leading-tight">{title}</h2>
        </div>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{subtitle}</p>}
      </div>
      {onMore && (
        <button onClick={onMore} className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: "#1DB954" }}>
          See all <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function HorizontalScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-4 overflow-x-auto px-4 pb-2"
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const { playSong } = usePlayer();
  return (
    <button
      onClick={() => album.songs[0] && playSong(album.songs[0], album.songs)}
      className="flex-shrink-0 w-40 text-left group active:scale-95 transition-transform"
    >
      <div className="relative w-40 h-40 rounded-lg overflow-hidden mb-2 shadow-lg">
        {album.coverArt ? (
          <img
            src={album.coverArt}
            alt={album.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#333,#555)" }}
          >
            <Disc3 className="w-10 h-10" style={{ color: "rgba(255,255,255,0.3)" }} />
          </div>
        )}
        {/* Green play button on hover/active */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-all translate-y-1 group-hover:translate-y-0 group-active:translate-y-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-xl"
            style={{ background: "#1DB954" }}
          >
            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
          </div>
        </div>
      </div>
      <p className="text-sm font-semibold text-white truncate leading-tight">{album.name}</p>
      <p className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
        {album.artist}{album.year ? ` · ${album.year}` : ""}
      </p>
    </button>
  );
}

function SongCard({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong, currentSong, isPlaying, togglePlay } = usePlayer();
  const isActive = currentSong?.id === song.id;

  return (
    <button
      onClick={() => (isActive ? togglePlay() : playSong(song, queue))}
      className="flex-shrink-0 w-36 text-left group active:scale-95 transition-transform"
    >
      <div className="relative w-36 h-36 rounded-lg overflow-hidden mb-2 shadow-lg">
        {song.albumArt ? (
          <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "#333" }}
          >
            <Music2 className="w-8 h-8" style={{ color: "rgba(255,255,255,0.2)" }} />
          </div>
        )}
        {/* Play bars when active */}
        {isActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-end gap-0.5">
            {[8, 14, 10].map((h, i) => (
              <div
                key={i}
                className="w-0.5 rounded-full animate-pulse"
                style={{ background: "#1DB954", height: `${h}px`, animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        )}
        {/* Play/pause overlay when active */}
        {isActive && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.35)" }}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-white text-white" />
            ) : (
              <Play className="w-8 h-8 fill-white text-white ml-1" />
            )}
          </div>
        )}
        {/* Green play button on hover (inactive) */}
        {!isActive && (
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-all translate-y-1 group-hover:translate-y-0 group-active:translate-y-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: "#1DB954" }}
            >
              <Play className="w-4 h-4 text-black fill-black ml-0.5" />
            </div>
          </div>
        )}
      </div>
      <p className="text-sm font-semibold text-white truncate leading-tight">{song.title}</p>
      <p className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{song.artist}</p>
    </button>
  );
}