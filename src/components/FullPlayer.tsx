import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/songs";
import { LikeButton } from "@/components/LikeButton";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  Shuffle,
  Repeat,
  Music2,
} from "lucide-react";

interface FullPlayerProps {
  onRequireAuth?: () => void;
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
    queue,
    queueIndex,
  } = usePlayer();

  if (!currentSong || !showPlayer) return null;

  const totalDuration = (duration && isFinite(duration) && duration > 0)
    ? duration
    : (currentSong.duration || 1);
  const pct = Math.min(100, (progress / totalDuration) * 100);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col animate-fade-in"
      style={{ background: "#0a0a0a" }}
    >
      {/* Blurred album art background */}
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

      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.92) 60%, rgba(10,10,10,0.98) 100%)",
        }}
      />

      {/* Scrollable top: header + art only */}
      <div className="relative flex flex-col flex-1 overflow-y-auto px-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-12 pb-4">
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

        {/* ── Album Art ── */}
        <div className="flex items-center justify-center py-2">
          <div
            className="rounded-3xl overflow-hidden shadow-2xl"
            style={{
              width: "min(72vw, 300px)",
              height: "min(72vw, 300px)",
              boxShadow: "0 32px 80px -16px rgba(0,0,0,0.85)",
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
                <Music2 className="w-20 h-20 text-black/50" />
              </div>
            )}
          </div>
        </div>
      </div>{/* end scrollable */}

      {/* ── Fixed bottom: song info + seek + controls (never scrolls away) ── */}
      <div className="relative px-6 pb-10 pt-4">

        {/* ── Song Info + Like ── */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate leading-tight">
              {currentSong.title}
            </h2>
            <p className="text-sm text-white/50 mt-0.5 truncate">{currentSong.artist}</p>
            {currentSong.movie && (
              <p className="text-xs text-white/30 mt-0.5 truncate">{currentSong.movie}</p>
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
        <div className="mb-5">
          <div
            className="relative h-1.5 rounded-full cursor-pointer"
            style={{ background: "rgba(255,255,255,0.15)" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setProgress(Math.floor(ratio * totalDuration));
            }}
          >
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all duration-100"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, #1DB954, #1ed760)" }}
            />
            {/* Thumb — always visible (no hover needed on mobile) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md"
              style={{ left: `calc(${pct}% - 8px)` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>{formatDuration(Math.floor(progress))}</span>
            <span>{formatDuration(Math.floor(totalDuration))}</span>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex items-center justify-between">
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

        {/* ── Queue Info ── */}
        {queue.length > 0 && (
          <div className="text-center text-xs mt-4" style={{ color: "rgba(255,255,255,0.25)" }}>
            {queueIndex + 1} of {queue.length} songs
          </div>
        )}
      </div>
    </div>
  );
}