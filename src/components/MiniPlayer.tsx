import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/songs";
import { Play, Pause, SkipForward, ChevronUp } from "lucide-react";
import { LikeButton } from "@/components/LikeButton";

interface MiniPlayerProps {
  onRequireAuth?: () => void;
}

export function MiniPlayer({ onRequireAuth }: MiniPlayerProps) {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    nextSong,
    progress,
    duration,
    setProgress,
    setShowPlayer,
  } = usePlayer();

  if (!currentSong) return null;

  const totalDuration = duration || currentSong.duration || 1;
  const pct = Math.min(100, (progress / totalDuration) * 100);

  return (
    <div className="fixed bottom-14 left-0 right-0 z-40 px-2 pb-1.5">
      <div
        className="rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "rgba(18,18,18,0.97)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Thin progress bar at very top */}
        <div
          className="h-0.5 w-full cursor-pointer"
          style={{ background: "rgba(255,255,255,0.08)" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            setProgress(Math.floor(ratio * totalDuration));
          }}
        >
          <div
            className="h-full transition-all duration-1000 ease-linear rounded-full"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #1DB954, #1ed760)",
            }}
          />
        </div>

        <div className="flex items-center gap-3 px-3 py-2.5">
          {/* Album art — tap to open full player */}
          <button
            onClick={() => setShowPlayer(true)}
            className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden shadow-lg"
          >
            {currentSong.albumArt ? (
              <img
                src={currentSong.albumArt}
                alt={currentSong.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x400?text=No+Image";
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-green-500 to-emerald-600" />
            )}
          </button>

          {/* Song info — tap to open full player */}
          <button
            className="flex-1 min-w-0 text-left"
            onClick={() => setShowPlayer(true)}
          >
            <p className="text-sm font-semibold truncate text-white leading-tight">
              {currentSong.title}
            </p>
            <p className="text-xs text-white/50 truncate mt-0.5 leading-tight">
              {currentSong.artist}
            </p>
          </button>

          {/* Controls */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <LikeButton
              song={currentSong}
              onRequireAuth={onRequireAuth}
              size="sm"
              className="p-2 text-white/60 hover:text-white"
            />

            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-95"
              style={{ background: "linear-gradient(135deg, #1DB954, #1ed760)" }}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-black fill-black" />
              ) : (
                <Play className="w-4 h-4 text-black fill-black ml-0.5" />
              )}
            </button>

            <button
              onClick={nextSong}
              className="p-2 text-white/60 hover:text-white transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}