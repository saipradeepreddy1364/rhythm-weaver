import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/songs";
import { LikeButton } from "@/components/LikeButton";
import { useState, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  Shuffle,
  Repeat,
  Music2,
  Mic2,
} from "lucide-react";

interface FullPlayerProps {
  onRequireAuth?: () => void;
}

// ── Lyrics fetcher ─────────────────────────────────────────────────────────────
const BASE_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

async function fetchLyrics(songId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/songs/${songId}/lyrics`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data === "string" && data.trim().length > 0) return data.trim();
    if (data?.lyrics && typeof data.lyrics === "string") return data.lyrics.trim();
    if (data?.data?.lyrics && typeof data.data.lyrics === "string") return data.data.lyrics.trim();
    if (typeof data?.data === "string" && data.data.trim().length > 0) return data.data.trim();
    return null;
  } catch {
    return null;
  }
}

export function FullPlayer({ onRequireAuth }: FullPlayerProps) {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    nextSong,
    prevSong,
    progress,
    duration,
    setProgress,
    showPlayer,
    setShowPlayer,
  } = usePlayer();

  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  // Reset lyrics state when song changes
  useEffect(() => {
    setLyrics(null);
    setLyricsLoading(false);
  }, [currentSong?.id]);

  // Fetch lyrics only when lyrics tab is opened
  useEffect(() => {
    if (!currentSong || !showLyrics) return;
    if (lyrics !== null) return; // already fetched for this song
    setLyricsLoading(true);
    fetchLyrics(currentSong.id).then((l) => {
      setLyrics(l ?? "");
      setLyricsLoading(false);
    });
  }, [currentSong?.id, showLyrics]);

  if (!currentSong || !showPlayer) return null;

  const totalDuration =
    duration && isFinite(duration) && duration > 0
      ? duration
      : currentSong.duration || 1;
  const pct = Math.min(100, (progress / totalDuration) * 100);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col animate-fade-in"
      style={{ background: "#0a0a0a", overflow: "hidden" }}
    >
      {/* ── Blurred album art background ── */}
      {currentSong.albumArt && (
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url(${currentSong.albumArt})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(60px) saturate(2.5)",
            transform: "scale(1.2)",
          }}
        />
      )}

      {/* ── Dark gradient overlay ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(10,10,10,0.50) 0%, rgba(10,10,10,0.90) 55%, rgba(10,10,10,0.98) 100%)",
        }}
      />

      {/* ── Main layout — fixed height columns, never scrolls ── */}
      <div
        className="relative flex flex-col w-full h-full px-6"
        style={{ overflow: "hidden" }}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-10 pb-2 flex-shrink-0">
          <button
            onClick={() => setShowPlayer(false)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <ChevronDown className="w-5 h-5 text-white" />
          </button>
          <p className="text-xs text-white/40 uppercase tracking-widest font-semibold">
            Now Playing
          </p>
          <div className="w-10" />
        </div>

        {/* ── Tab switcher: Cover / Lyrics ── */}
        <div className="flex items-center justify-center gap-1 mb-5 flex-shrink-0">
          <button
            onClick={() => setShowLyrics(false)}
            className="px-5 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: !showLyrics ? "rgba(255,255,255,0.18)" : "transparent",
              color: !showLyrics ? "#fff" : "rgba(255,255,255,0.4)",
            }}
          >
            Cover
          </button>
          <button
            onClick={() => setShowLyrics(true)}
            className="px-5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5"
            style={{
              background: showLyrics ? "rgba(255,255,255,0.18)" : "transparent",
              color: showLyrics ? "#fff" : "rgba(255,255,255,0.4)",
            }}
          >
            <Mic2 className="w-3 h-3" />
            Lyrics
          </button>
        </div>

        {/* ── Cover tab: album art, NO scrolling anywhere ── */}
        {!showLyrics && (
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ height: 240 }}
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                width: 220,
                height: 220,
                boxShadow: "0 24px 64px -12px rgba(0,0,0,0.9)",
              }}
            >
              {currentSong.albumArt ? (
                <img
                  src={currentSong.albumArt}
                  alt={currentSong.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://via.placeholder.com/400x400?text=🎵";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600">
                  <Music2 className="w-16 h-16 text-black/50" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Lyrics tab: ONLY the inner box scrolls, page does NOT scroll ── */}
        {showLyrics && (
          <div
            className="flex-shrink-0"
            style={{ height: 240 }}
          >
            <div
              className="w-full h-full rounded-2xl px-5 py-4"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
            >
              {lyricsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div
                    className="w-7 h-7 rounded-full border-2 animate-spin"
                    style={{
                      borderColor: "rgba(255,255,255,0.15)",
                      borderTopColor: "#1DB954",
                    }}
                  />
                </div>
              ) : lyrics && lyrics.length > 0 ? (
                <p
                  className="text-sm leading-7 whitespace-pre-wrap text-center"
                  style={{ color: "rgba(255,255,255,0.82)" }}
                >
                  {lyrics}
                </p>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Mic2
                    className="w-10 h-10"
                    style={{ color: "rgba(255,255,255,0.15)" }}
                  />
                  <p
                    className="text-xs font-medium text-center"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    Lyrics not available for this song
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Song Info + Like ── */}
        <div className="flex items-center gap-3 mt-5 mb-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate leading-tight">
              {currentSong.title}
            </h2>
            <p className="text-sm mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
              {currentSong.artist}
            </p>
            {currentSong.movie && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                {currentSong.movie}
              </p>
            )}
          </div>
          <LikeButton
            song={currentSong}
            onRequireAuth={onRequireAuth}
            size="lg"
            className="flex-shrink-0"
          />
        </div>

        {/* ── Seek Bar ── */}
        <div className="mb-5 flex-shrink-0">
          <div
            className="relative h-1.5 rounded-full cursor-pointer"
            style={{ background: "rgba(255,255,255,0.15)" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width)
              );
              setProgress(Math.floor(ratio * totalDuration));
            }}
          >
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all duration-100"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #1DB954, #1ed760)",
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md"
              style={{ left: `calc(${pct}% - 8px)` }}
            />
          </div>
          <div
            className="flex justify-between text-xs mt-2"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <span>{formatDuration(Math.floor(progress))}</span>
            <span>{formatDuration(Math.floor(totalDuration))}</span>
          </div>
        </div>

        {/* ── Playback Controls ── */}
        <div className="flex items-center justify-between flex-shrink-0">
          <button
            className="p-3 active:scale-90 transition-transform"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={prevSong}
            className="p-3 text-white active:scale-90 transition-transform"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform"
            style={{ background: "linear-gradient(135deg, #1DB954, #1ed760)" }}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 text-black fill-black" />
            ) : (
              <Play className="w-7 h-7 text-black fill-black ml-1" />
            )}
          </button>

          <button
            onClick={nextSong}
            className="p-3 text-white active:scale-90 transition-transform"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button
            className="p-3 active:scale-90 transition-transform"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <Repeat className="w-5 h-5" />
          </button>
        </div>

      </div>
    </div>
  );
}