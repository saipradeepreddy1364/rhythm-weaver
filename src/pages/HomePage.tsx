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
  Radio, Zap, Clock,
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
  { label: "Liked Songs",    gradient: "from-indigo-600 to-blue-500",   icon: <Heart className="w-4 h-4 fill-white" /> },
  { label: "Latest Telugu",  gradient: "from-orange-500 to-red-500",    icon: <Zap className="w-4 h-4" /> },
  { label: "Hindi Hits",     gradient: "from-pink-500 to-rose-500",     icon: <Mic2 className="w-4 h-4" /> },
  { label: "Tamil Fresh",    gradient: "from-purple-500 to-violet-500", icon: <Headphones className="w-4 h-4" /> },
  { label: "Punjabi Beats",  gradient: "from-yellow-500 to-amber-500",  icon: <Music2 className="w-4 h-4" /> },
  { label: "Chill Vibes",    gradient: "from-teal-500 to-cyan-500",     icon: <Radio className="w-4 h-4" /> },
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
        { id: "trending",  title: "Trending Now",          subtitle: "Top hits this week",        icon: <TrendingUp className="w-4 h-4" />, query: "trending india 2025",           showSongRows: false },
        { id: "telugu25",  title: "Telugu Blockbusters",   subtitle: "Latest Tollywood fire",     icon: <Flame className="w-4 h-4" />,      query: "telugu hits 2025",              showSongRows: true  },
        { id: "hindi25",   title: "Bollywood Now",         subtitle: "Fresh from Bollywood",      icon: <Sparkles className="w-4 h-4" />,   query: "bollywood 2025",                showSongRows: true  },
        { id: "tamil25",   title: "Kollywood Vibes",       subtitle: "Tamil chart-toppers",       icon: <Music2 className="w-4 h-4" />,     query: "tamil hits 2025",               showSongRows: true  },
        { id: "punjabi",   title: "Punjabi Bangers",       subtitle: "Dance & party anthems",     icon: <Zap className="w-4 h-4" />,        query: "punjabi songs 2025",            showSongRows: false },
        { id: "kannada",   title: "Sandalwood Hits",       subtitle: "Latest Kannada music",      icon: <Globe2 className="w-4 h-4" />,     query: "kannada songs 2025",            showSongRows: true  },
        { id: "malayalam", title: "Mollywood Melodies",    subtitle: "Kerala's finest",           icon: <Headphones className="w-4 h-4" />, query: "malayalam hits 2025",           showSongRows: true  },
        { id: "retro",     title: "Evergreen Classics",    subtitle: "All-time favourites",       icon: <Star className="w-4 h-4" />,       query: "old hindi classic songs 90s",   showSongRows: true  },
        { id: "romantic",  title: "Love Songs",            subtitle: "For every mood",            icon: <Heart className="w-4 h-4" />,      query: "romantic hindi songs",          showSongRows: true  },
        { id: "lofi",      title: "Late Night Lofi",       subtitle: "Chill & focus",             icon: <Radio className="w-4 h-4" />,      query: "lofi chill hindi",              showSongRows: false },
        { id: "anirudh",   title: "Anirudh Universe",      subtitle: "The maestro's world",       icon: <Mic2 className="w-4 h-4" />,       query: "anirudh ravichander hits",      showSongRows: true  },
        { id: "arrahman",  title: "A.R. Rahman Classics",  subtitle: "Timeless masterpieces",     icon: <Star className="w-4 h-4" />,       query: "a r rahman hits",               showSongRows: true  },
        { id: "devotional",title: "Devotional & Bhakti",   subtitle: "Spiritual classics",        icon: <Sparkles className="w-4 h-4" />,   query: "devotional bhakti songs hindi", showSongRows: false },
        { id: "english",   title: "Global Hits",           subtitle: "English pop & more",        icon: <Globe2 className="w-4 h-4" />,     query: "english pop hits 2025",         showSongRows: false },
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
    <div className="pb-4 overflow-y-auto" style={{ background: "#0a0a0a" }}>

      {/* ── Greeting ── */}
      <div className="px-4 pt-5 pb-4">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Good {greeting()}
          {user && <span className="text-white/50">, {user.email?.split("@")[0]}</span>}
        </h1>
      </div>

      {/* ── Quick Access 2-col Grid (Spotify style) ── */}
      <div className="px-4 mb-6">
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACCESS.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-3 rounded-lg overflow-hidden text-left active:scale-95 transition-transform"
              style={{ background: "rgba(255,255,255,0.08)", height: "52px" }}
            >
              <div
                className={`w-14 h-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${item.gradient}`}
              >
                <span className="text-white">{item.icon}</span>
              </div>
              <span className="text-sm font-semibold text-white pr-2 leading-tight">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Recently Played ── */}
      {recentSongs.length > 0 && (
        <div className="mb-6">
          <SectionHeader title="Recently Played" icon={<Clock className="w-4 h-4" />} />
          <HorizontalScroll>
            {recentSongs.map((song) => (
              <SongCard key={song.id} song={song} queue={recentSongs} />
            ))}
          </HorizontalScroll>
        </div>
      )}

      {/* ── Language Filter Chips ── */}
      <div className="mb-6">
        <SectionHeader title="Browse by Language" />
        <div
          className="flex gap-2 overflow-x-auto px-4 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {LANGUAGES.map((lang) => {
            const active = activeLang === lang.label;
            return (
              <button
                key={lang.label}
                onClick={() => handleLangClick(lang)}
                className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
                style={{
                  background: active ? lang.color : "rgba(255,255,255,0.08)",
                  color: active ? "#fff" : "rgba(255,255,255,0.6)",
                  border: `1px solid ${active ? lang.color : "transparent"}`,
                }}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Language Results ── */}
      {activeLang && (
        <div id="lang-results" className="mb-6">
          {langLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <>
              {langAlbums.length > 0 && (
                <div className="mb-4">
                  <SectionHeader title={`${activeLang} Albums`} subtitle="Movie & album collections" />
                  <HorizontalScroll>
                    {langAlbums.map((album) => (
                      <AlbumCard key={album.id} album={album} />
                    ))}
                  </HorizontalScroll>
                </div>
              )}
              {langSongs.length > 0 && (
                <div className="mb-4">
                  <SectionHeader title={`${activeLang} Songs`} />
                  <div className="px-2 space-y-0.5">
                    {langSongs.map((song) => (
                      <SongRow key={song.id} song={song} queue={langSongs} onRequireAuth={onRequireAuth} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
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
          {icon && <span className="text-orange-400">{icon}</span>}
          <h2 className="font-bold text-[17px] text-white tracking-tight leading-tight">{title}</h2>
        </div>
        {subtitle && <p className="text-xs text-white/30 mt-0.5">{subtitle}</p>}
      </div>
      {onMore && (
        <button onClick={onMore} className="flex items-center gap-0.5 text-xs text-white/30 hover:text-white/60">
          See all <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function HorizontalScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-3 overflow-x-auto px-4 pb-2"
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
      className="flex-shrink-0 w-36 text-left group active:scale-95 transition-transform"
    >
      <div className="relative w-36 h-36 rounded-xl overflow-hidden mb-2 shadow-lg">
        {album.coverArt ? (
          <img
            src={album.coverArt}
            alt={album.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
            <Disc3 className="w-8 h-8 text-white/60" />
          </div>
        )}
        {/* Play overlay on active */}
        <div className="absolute inset-0 bg-black/0 group-active:bg-black/40 transition-all flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 group-active:opacity-100 transition-all"
            style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}
          >
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </div>
        </div>
        {/* Song count badge */}
        {album.songs.length > 1 && (
          <div
            className="absolute bottom-2 left-2 text-[10px] font-semibold text-white/80 px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            {album.songs.length} songs
          </div>
        )}
      </div>
      <p className="text-sm font-semibold text-white truncate leading-tight">{album.name}</p>
      <p className="text-xs text-white/40 truncate mt-0.5">{album.artist}</p>
    </button>
  );
}

function SongCard({ song, queue }: { song: Song; queue: Song[] }) {
  const { playSong, currentSong, isPlaying, togglePlay } = usePlayer();
  const isActive = currentSong?.id === song.id;

  return (
    <button
      onClick={() => (isActive ? togglePlay() : playSong(song, queue))}
      className="flex-shrink-0 w-32 text-left group active:scale-95 transition-transform"
    >
      <div className="relative w-32 h-32 rounded-xl overflow-hidden mb-2 shadow-lg">
        {song.albumArt ? (
          <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-500 to-pink-500" />
        )}
        {isActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-end gap-0.5">
            {[0, 150, 300].map((d) => (
              <div
                key={d}
                className="w-0.5 rounded-full animate-pulse"
                style={{ background: "#f97316", height: d === 150 ? "12px" : "8px", animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}
        {/* Pause overlay when active */}
        {isActive && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white fill-white" />
            ) : (
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            )}
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-white truncate leading-tight">{song.title}</p>
      <p className="text-[10px] text-white/40 truncate mt-0.5">{song.artist}</p>
    </button>
  );
}