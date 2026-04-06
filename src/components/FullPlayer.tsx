import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/songs";
import { LikeButton } from "@/components/LikeButton";
import {
  Play, Pause, SkipBack, SkipForward,
  ChevronDown, Shuffle, Repeat, ListMusic, Heart,
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

  const totalDuration = duration || currentSong.duration || 1;
  const pct = Math.min(100, (progress / totalDuration) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col animate-fade-in"
      style={{ background: "#0a0a0a" }}
    >
      {/* Blurred album art background */}
      {currentSong.albumArt && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${currentSong.albumArt})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(40px) saturate(2)",
          }}
        />
      )}

      {/* Dark overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(10,10,10,0.6) 0%, rgba(10,10,10,0.95) 100%)" }} />

      {/* Content */}
      <div className="relative flex flex-col flex-1 px-6">
        {/* Header */}
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

        {/* Album Art */}
        <div className="flex-1 flex items-center justify-center py-6">
          <div
            className="rounded-3xl overflow-hidden shadow-2xl"
            style={{
              width: "min(72vw, 300px)",
              height: "min(72vw, 300px)",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8)",
            }}
          >
            {currentSong.albumArt ? (
              <img
                src={currentSong.albumArt}
                alt={currentSong.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x400?text=🎵";
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600">
                <span className="text-black text-6xl">🎵</span>
              </div>
            )}
          </div>
        </div>

        {/* Song Info + Like */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate leading-tight">
              {currentSong.title}
            </h2>
            <p className="text-sm text-white/40 mt-1 truncate">{currentSong.artist}</p>
            {currentSong.movie && (
              <p className="text-xs text-white/30 mt-0.5 truncate">{currentSong.movie}</p>
            )}
          </div>
          <LikeButton
            song={currentSong}
            onRequireAuth={onRequireAuth}
            size="lg"
            className="text-white/40 hover:text-white p-2"
          />
        </div>

        {/* Seek bar */}
        <div className="mb-5">
          <div
            className="relative h-1 rounded-full cursor-pointer overflow-hidden"
            style={{ background: "rgba(255,255,255,0.12)" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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
          </div>
          <div className="flex justify-between text-xs text-white/30 mt-1.5">
            <span>{formatDuration(progress)}</span>
            <span>{formatDuration(totalDuration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-10">
          <button className="p-3 text-white/30 hover:text-white transition-colors">
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={prevSong}
            className="p-3 text-white/80 hover:text-white transition-colors active:scale-90"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-transform active:scale-90"
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
            className="p-3 text-white/80 hover:text-white transition-colors active:scale-90"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button className="p-3 text-white/30 hover:text-white transition-colors">
            <Repeat className="w-5 h-5" />
          </button>
        </div>

        {/* Queue info */}
        <div className="text-center text-xs text-white/30 pb-6">
          {queue.length > 0 && (
            <p>
              {queueIndex + 1} of {queue.length} • {queue.length} songs in queue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}