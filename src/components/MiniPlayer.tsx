import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, Music2 } from "lucide-react";
import { LikeButton } from "@/components/LikeButton";

interface MiniPlayerProps {
  onRequireAuth?: () => void;
}

export function MiniPlayer({ onRequireAuth }: MiniPlayerProps) {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    progress,
    duration,
    setShowPlayer,
  } = usePlayer();

  if (!currentSong) return null;

  const totalDuration =
    duration && isFinite(duration) && duration > 0
      ? duration
      : currentSong.duration || 1;

  const pct = Math.min(100, (progress / totalDuration) * 100);

  // SVG circular progress
  const RADIUS = 26;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;

  return (
    <div className="fixed bottom-14 left-0 right-0 z-50 px-3 pb-2 pointer-events-none">
      <div
        className="rounded-full overflow-hidden shadow-2xl pointer-events-auto flex items-center gap-3 px-3 py-2"
        style={{
          background: "rgba(38,28,32,0.97)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.07)",
          height: 72,
        }}
      >
        {/* ── Album art with circular progress ring + play/pause overlay ── */}
        <div className="relative flex-shrink-0" style={{ width: 60, height: 60 }}>
          {/* SVG ring */}
          <svg
            width="60"
            height="60"
            className="absolute inset-0"
            style={{ transform: "rotate(-90deg)" }}
          >
            {/* Track */}
            <circle
              cx="30"
              cy="30"
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="2.5"
            />
            {/* Progress */}
            <circle
              cx="30"
              cy="30"
              r={RADIUS}
              fill="none"
              stroke="#e8b4bc"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.3s ease" }}
            />
          </svg>

          {/* Album art circle */}
          <div
            className="absolute rounded-full overflow-hidden"
            style={{ inset: 5 }}
          >
            {currentSong.albumArt ? (
              <img
                src={currentSong.albumArt}
                alt={currentSong.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://via.placeholder.com/100x100?text=🎵";
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <Music2 className="w-4 h-4 text-black" />
              </div>
            )}
          </div>

          {/* Play/Pause overlay */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="absolute inset-0 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "rgba(0,0,0,0.30)" }}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white fill-white drop-shadow" />
            ) : (
              <Play className="w-5 h-5 text-white fill-white ml-0.5 drop-shadow" />
            )}
          </button>
        </div>

        {/* ── Song info — tapping opens full player ── */}
        <button
          className="flex-1 min-w-0 text-left"
          onClick={() => setShowPlayer(true)}
        >
          <p className="font-bold truncate text-white leading-tight" style={{ fontSize: 15 }}>
            {currentSong.title}
          </p>
          <p className="text-xs truncate mt-0.5 leading-tight" style={{ color: "rgba(255,255,255,0.5)" }}>
            {currentSong.artist}
          </p>
        </button>

        {/* ── Like button ── */}
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <LikeButton
              song={currentSong}
              onRequireAuth={onRequireAuth}
              size="sm"
              className="text-white/70 hover:text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}