import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/songs";
import { LikeButton } from "@/components/LikeButton";
import { useState, useEffect, useRef } from "react";
import { api } from "@/services/api";
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
  Video,
  Download,
  ListPlus,
  Loader2,
} from "lucide-react";

interface FullPlayerProps {
  onRequireAuth?: () => void;
}

const BACKEND_URL =
  (import.meta as any).env?.VITE_API_BACKEND_URL ||
  "https://musicbackend-xg4u.onrender.com/api";

// Strip HTML tags and decode common HTML entities that JioSaavn returns in lyrics
function cleanLyricsHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&mut;/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Extract lyrics text from any response shape the backend / JioSaavn may return
function extractLyricsText(data: any): string | null {
  const inner = data?.data ?? data;

  const candidates = [
    inner?.lyrics,
    inner?.snippet,
    inner?.lyric,
    inner?.lyricsSnippet,
    inner?.lyrics_snippet,
    data?.lyrics,
    data?.snippet,
    typeof inner === "string" ? inner : null,
    typeof data  === "string" ? data  : null,
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

type TabType = "cover" | "lyrics" | "video";

interface VideoStream {
  quality: string;
  url: string;
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
    addToQueue,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();

  const [activeTab, setActiveTab] = useState<TabType>("cover");
  
  // Lyrics State
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  
  // Video State
  const [videoStreams, setVideoStreams] = useState<VideoStream[]>([]);
  const [selectedStream, setSelectedStream] = useState<VideoStream | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [queuedFlash, setQueuedFlash] = useState(false);

  // Reset tab and video when song changes
  useEffect(() => {
    setActiveTab("cover");
    setLyrics(null);
    setVideoStreams([]);
    setSelectedStream(null);
    setVideoError(null);
  }, [currentSong?.id]);

  // Pre-fetch lyrics as soon as a song is set
  useEffect(() => {
    if (!currentSong) return;
    setLyricsLoading(true);
    fetchLyrics(currentSong.id).then((l) => {
      setLyrics(l ?? "");
      setLyricsLoading(false);
    });
  }, [currentSong?.id]);

  // Fetch video streams when user clicks "Video" tab
  useEffect(() => {
    if (activeTab !== "video" || !currentSong) return;
    if (videoStreams.length > 0) return; // already loaded for this song

    setVideoLoading(true);
    setVideoError(null);

    api.getSongVideoUrl(currentSong.id)
      .then((res) => {
        // Handle streams response array safely
        const streams: VideoStream[] = res.streams ?? res.data?.streams ?? (Array.isArray(res) ? res : []);
        if (Array.isArray(streams) && streams.length > 0) {
          setVideoStreams(streams);
          // Auto-select highest quality (usually first or custom sorted)
          setSelectedStream(streams[0]);
        } else {
          setVideoError("No video streams available for this song.");
        }
        setVideoLoading(false);
      })
      .catch(() => {
        setVideoError("Failed to load video streams.");
        setVideoLoading(false);
      });
  }, [activeTab, currentSong?.id]);

  if (!currentSong || !showPlayer) return null;

  const totalDuration =
    duration && isFinite(duration) && duration > 1
      ? duration
      : (currentSong.duration && currentSong.duration > 1 ? currentSong.duration : 0);
  const pct = totalDuration > 0 ? Math.min(100, (progress / totalDuration) * 100) : 0;

  const handleAddToQueue = () => {
    addToQueue(currentSong);
    setQueuedFlash(true);
    setTimeout(() => setQueuedFlash(false), 2000);
  };

  const handleDownload = () => {
    const downloadUrl = `${BACKEND_URL}/downloads/${currentSong.id}/audio`;
    window.open(downloadUrl, "_blank");
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
            onClick={() => setActiveTab("cover")}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: activeTab === "cover" ? "rgba(255,255,255,0.18)" : "transparent",
              color: activeTab === "cover" ? "#fff" : "rgba(255,255,255,0.4)",
            }}
          >
            Cover
          </button>
          <button
            onClick={() => setActiveTab("lyrics")}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5"
            style={{
              background: activeTab === "lyrics" ? "rgba(255,255,255,0.18)" : "transparent",
              color: activeTab === "lyrics" ? "#fff" : "rgba(255,255,255,0.4)",
            }}
          >
            <Mic2 className="w-3 h-3" />
            Lyrics
          </button>
          <button
            onClick={() => setActiveTab("video")}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5"
            style={{
              background: activeTab === "video" ? "rgba(255,255,255,0.18)" : "transparent",
              color: activeTab === "video" ? "#fff" : "rgba(255,255,255,0.4)",
            }}
          >
            <Video className="w-3 h-3" />
            Video
          </button>
        </div>

        {/* ── Cover tab ── */}
        {activeTab === "cover" && (
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
        {activeTab === "lyrics" && (
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
                  <Loader2 className="w-7 h-7 rounded-full border-2 animate-spin"
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

        {/* ── Video tab ── */}
        {activeTab === "video" && (
          <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ height: 230, overflow: "hidden" }}>
            {videoLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1DB954" }} />
              </div>
            ) : videoError ? (
              <div className="flex flex-col items-center justify-center gap-2 text-center px-4">
                <Video className="w-10 h-10 opacity-30" />
                <p className="text-xs text-white/40">{videoError}</p>
              </div>
            ) : selectedStream ? (
              <div className="flex flex-col items-center w-full h-full gap-2 justify-center">
                {/* Custom Video Element */}
                <div className="w-full aspect-video max-h-[170px] bg-black rounded-xl overflow-hidden shadow-2xl relative">
                  <video
                    key={selectedStream.url}
                    src={selectedStream.url}
                    className="w-full h-full object-contain"
                    controls
                    playsInline
                    autoPlay
                    onPlay={() => {
                      // Stop background audio playback when video plays
                      if (isPlaying) {
                        togglePlay();
                      }
                    }}
                  />
                </div>
                
                {/* Quality Selector */}
                <div className="flex items-center gap-1.5 flex-wrap justify-center overflow-y-auto max-h-[48px]">
                  {videoStreams.map((stream) => (
                    <button
                      key={stream.quality}
                      onClick={() => setSelectedStream(stream)}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all border"
                      style={{
                        background: selectedStream.quality === stream.quality ? "#1DB954" : "rgba(255,255,255,0.06)",
                        borderColor: selectedStream.quality === stream.quality ? "#1DB954" : "rgba(255,255,255,0.12)",
                        color: selectedStream.quality === stream.quality ? "#000" : "rgba(255,255,255,0.6)"
                      }}
                    >
                      {stream.quality}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Song Info + Actions (Like / Download) ── */}
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
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Download Button */}
            <button
              onClick={handleDownload}
              title="Download Audio"
              className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              <Download className="w-5 h-5 text-white" />
            </button>

            {/* Like Button */}
            <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
              <LikeButton song={currentSong} onRequireAuth={onRequireAuth} size="lg" className="flex-shrink-0" />
            </div>
          </div>
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
        <div className="flex items-center justify-between mb-8 flex-shrink-0">
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
      </div>
    </div>
  );
}