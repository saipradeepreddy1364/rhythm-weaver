import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/songs";
import { LikeButton } from "@/components/LikeButton";
import { useState, useEffect, useRef } from "react";
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
  Volume2,
  VolumeX,
  ListPlus,
} from "lucide-react";

interface FullPlayerProps {
  onRequireAuth?: () => void;
}

const BACKEND_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://musicbackend-g2sp.onrender.com/api";

// Strip HTML tags and decode common HTML entities that JioSaavn returns in lyrics
function cleanLyricsHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")   // <br> → newline
    .replace(/<[^>]+>/g, "")         // strip all other tags
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")      // collapse 3+ blank lines → 2
    .trim();
}

// Extract lyrics text from any response shape the backend / JioSaavn may return
function extractLyricsText(data: any): string | null {
  const candidates = [
    data?.data?.lyrics,
    data?.data?.snippet,
    data?.lyrics,
    data?.snippet,
    data?.data,
    typeof data === "string" ? data : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 5) {
      const cleaned = cleanLyricsHtml(c);
      if (cleaned.length > 5) return cleaned;
    }
  }
  return null;
}

async function fetchLyrics(songId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/songs/${songId}/lyrics`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return extractLyricsText(data);
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
    volume,
    setVolume,
    showPlayer,
    setShowPlayer,
    addToQueue,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();

  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.7);
  const [showVolume, setShowVolume] = useState(false);
  const [queuedFlash, setQueuedFlash] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowVolume(false), 3000);
  };

  useEffect(() => {
    if (showVolume) resetHideTimer();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [showVolume]);

  useEffect(() => {
    if (showPlayer) setShowLyrics(false);
  }, [currentSong?.id]); // reset to Cover tab only when song changes, not on every open

  // Reset lyrics when song changes
  useEffect(() => {
    setLyrics(null);
    setLyricsLoading(false);
  }, [currentSong?.id]);

  // Pre-fetch lyrics as soon as a song is set — so the Lyrics tab opens instantly
  useEffect(() => {
    if (!currentSong) return;
    setLyricsLoading(true);
    fetchLyrics(currentSong.id).then((l) => {
      setLyrics(l ?? "");
      setLyricsLoading(false);
    });
  }, [currentSong?.id]);

  if (!currentSong || !showPlayer) return null;

  const totalDuration =
    duration && isFinite(duration) && duration > 1
      ? duration
      : (currentSong.duration && currentSong.duration > 1 ? currentSong.duration : 0);
  const pct = totalDuration > 0 ? Math.min(100, (progress / totalDuration) * 100) : 0;

  const isMuted = volume === 0;

  const toggleMute = () => {
    if (isMuted) {
      setVolume(prevVolume || 0.7);
    } else {
      setPrevVolume(volume);
      setVolume(0);
    }
    resetHideTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
    resetHideTimer();
  };

  const handleAddToQueue = () => {
    addToQueue(currentSong);
    setQueuedFlash(true);
    setTimeout(() => setQueuedFlash(false), 2000);
  };

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

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(10,10,10,0.50) 0%, rgba(10,10,10,0.90) 55%, rgba(10,10,10,0.98) 100%)",
        }}
      />

      <style>{`
        .lyrics-scroll::-webkit-scrollbar { width: 3px; }
        .lyrics-scroll::-webkit-scrollbar-track { background: transparent; }
        .lyrics-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 99px; }

        .full-vol-slider { -webkit-appearance: none; appearance: none; background: transparent; width: 100%; height: 100%; cursor: pointer; }
        .full-vol-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px; height: 12px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          margin-top: -4.5px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        .full-vol-slider::-moz-range-thumb {
          width: 12px; height: 12px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          border: none;
        }
        .full-vol-slider::-webkit-slider-runnable-track { height: 3px; background: transparent; }
        .full-vol-slider::-moz-range-track { height: 3px; background: transparent; }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="relative flex flex-col w-full h-full px-6" style={{ overflow: "hidden" }}>
        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-10 pb-2 flex-shrink-0">
          <button
            onClick={() => setShowPlayer(false)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <ChevronDown className="w-5 h-5 text-white" />
          </button>
          <p className="text-xs text-white/40 uppercase tracking-widest font-semibold">Now Playing</p>
          {/* Add to Queue button in header */}
          <button
            onClick={handleAddToQueue}
            title="Play next"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{
              background: queuedFlash ? "rgba(29,185,84,0.2)" : "rgba(255,255,255,0.08)",
              color: queuedFlash ? "#1DB954" : "rgba(255,255,255,0.6)",
            }}
          >
            <ListPlus className="w-5 h-5" />
          </button>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex items-center justify-center gap-1 mb-4 flex-shrink-0">
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

        {/* ── Cover tab ── */}
        {!showLyrics && (
          <div className="flex items-center justify-center flex-shrink-0" style={{ height: 230, overflow: "hidden" }}>
            <div
              className="rounded-2xl overflow-hidden"
              style={{ width: 210, height: 210, boxShadow: "0 24px 64px -12px rgba(0,0,0,0.9)" }}
            >
              {currentSong.albumArt ? (
                <img src={currentSong.albumArt} alt={currentSong.title} className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x400?text=🎵"; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600">
                  <Music2 className="w-16 h-16 text-black/50" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Lyrics tab ── */}
        {showLyrics && (
          <div className="flex-shrink-0" style={{ height: 230, overflow: "hidden" }}>
            <div
              className="lyrics-scroll w-full h-full rounded-2xl px-5 py-4"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(255,255,255,0.2) transparent",
              }}
            >
              {lyricsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-7 h-7 rounded-full border-2 animate-spin"
                    style={{ borderColor: "rgba(255,255,255,0.15)", borderTopColor: "#1DB954" }} />
                </div>
              ) : lyrics && lyrics.length > 0 ? (
                <p className="text-sm leading-8 whitespace-pre-wrap text-center" style={{ color: "rgba(255,255,255,0.82)" }}>
                  {lyrics}
                </p>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Mic2 className="w-10 h-10" style={{ color: "rgba(255,255,255,0.15)" }} />
                  <p className="text-xs font-medium text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Lyrics not available for this song
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Song Info + Like ── */}
        <div className="flex items-center gap-3 mt-4 mb-2 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate leading-tight">{currentSong.title}</h2>
            <p className="text-sm mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
              {currentSong.artist}
            </p>
            {currentSong.movie && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                {currentSong.movie}
              </p>
            )}
          </div>
          <LikeButton song={currentSong} onRequireAuth={onRequireAuth} size="lg" className="flex-shrink-0" />
        </div>

        {/* ── Seek Bar with percentage ── */}
        <div className="mb-3 flex-shrink-0">
          <div
            className="relative h-1.5 rounded-full cursor-pointer"
            style={{ background: "rgba(255,255,255,0.15)" }}
            onClick={(e) => {
              if (totalDuration <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setProgress(Math.floor(ratio * totalDuration));
            }}
          >
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all duration-100"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, #1DB954, #1ed760)" }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md"
              style={{ left: `calc(${pct}% - 8px)` }}
            />
          </div>
          <div className="flex justify-between items-center text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>{totalDuration > 0 ? formatDuration(Math.floor(progress)) : "--:--"}</span>
            {/* Percentage in center */}
            <span className="font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
              {totalDuration > 0 ? `${Math.round(pct)}%` : "…"}
            </span>
            <span>{totalDuration > 0 ? formatDuration(Math.floor(totalDuration)) : "--:--"}</span>
          </div>
        </div>

        {/* ── Playback Controls ── */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <button
            onClick={toggleShuffle}
            className="p-3 active:scale-90 transition-transform relative"
            style={{ color: shuffle ? "#1DB954" : "rgba(255,255,255,0.5)" }}
          >
            <Shuffle className="w-5 h-5" />
            {shuffle && (
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-400" />
            )}
          </button>
          <button onClick={prevSong} className="p-3 text-white active:scale-90 transition-transform">
            <SkipBack className="w-7 h-7 fill-current" />
          </button>
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform"
            style={{ background: "linear-gradient(135deg, #1DB954, #1ed760)" }}
          >
            {isPlaying
              ? <Pause className="w-7 h-7 text-black fill-black" />
              : <Play className="w-7 h-7 text-black fill-black ml-1" />
            }
          </button>
          <button onClick={nextSong} className="p-3 text-white active:scale-90 transition-transform">
            <SkipForward className="w-7 h-7 fill-current" />
          </button>
          <button
            onClick={cycleRepeat}
            className="p-3 active:scale-90 transition-transform relative"
            style={{ color: repeat !== "off" ? "#1DB954" : "rgba(255,255,255,0.5)" }}
          >
            <Repeat className="w-5 h-5" />
            {repeat === "one" && (
              <span
                className="absolute top-2 right-2 text-[8px] font-bold leading-none"
                style={{ color: "#1DB954" }}
              >1</span>
            )}
            {repeat !== "off" && (
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-400" />
            )}
          </button>
        </div>

        {/* ── Volume popup — appears above the volume toggle button ── */}
        {showVolume && (
          <div
            className="flex-shrink-0 mb-3 rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{
              background: "rgba(22,14,18,0.95)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              animation: "fadeSlideUp 0.15s ease",
            }}
            onMouseMove={resetHideTimer}
            onTouchMove={resetHideTimer}
          >
            <button
              onClick={toggleMute}
              className="flex-shrink-0 active:scale-90 transition-transform"
              style={{ color: isMuted ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.75)" }}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Slim 3px YouTube-style volume bar */}
            <div className="relative flex-1" style={{ height: 3 }}>
              <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
              <div
                className="absolute top-0 left-0 h-full rounded-full pointer-events-none"
                style={{
                  width: `${volume * 100}%`,
                  background: "linear-gradient(90deg, #1DB954, #1ed760)",
                }}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeChange}
                className="full-vol-slider absolute"
                style={{ top: "50%", transform: "translateY(-50%)", left: 0 }}
              />
            </div>

            <span className="text-xs font-semibold w-8 text-right flex-shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
              {Math.round(volume * 100)}%
            </span>
          </div>
        )}

        {/* ── Volume toggle button ── */}
        <div className="flex items-center justify-center flex-shrink-0 pb-2">
          <button
            onClick={() => {
              setShowVolume((v) => {
                if (!v) resetHideTimer();
                return !v;
              });
            }}
            className="flex items-center gap-2 px-5 py-2 rounded-full transition-all active:scale-95"
            style={{
              background: showVolume ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
              color: isMuted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
            }}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span className="text-xs font-semibold">{Math.round(volume * 100)}%</span>
          </button>
        </div>
      </div>
    </div>
  );
}