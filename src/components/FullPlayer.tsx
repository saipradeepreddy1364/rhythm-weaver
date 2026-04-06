import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/songs";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  ChevronDown,
  Shuffle,
  Repeat,
} from "lucide-react";

export function FullPlayer() {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    nextSong,
    prevSong,
    progress,
    duration,
    setProgress,
    toggleFavorite,
    isFavorite,
    showPlayer,
    setShowPlayer,
  } = usePlayer();

  if (!currentSong || !showPlayer) return null;

  const totalDuration = duration || currentSong.duration || 1;
  const pct = (progress / totalDuration) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={() => setShowPlayer(false)}>
          <ChevronDown className="w-6 h-6 text-foreground" />
        </button>
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
          Now Playing
        </p>
        <div className="w-6" />
      </div>

      {/* Album Art */}
      <div className="flex-1 flex items-center justify-center px-12">
        <div
          className="w-72 h-72 sm:w-80 sm:h-80 rounded-2xl overflow-hidden shadow-2xl"
          style={{ boxShadow: "0 25px 60px -15px rgba(0,0,0,0.5)" }}
        >
          {currentSong.albumArt ? (
            <img
              src={currentSong.albumArt}
              alt={currentSong.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-rose-500 to-purple-600" />
          )}
        </div>
      </div>

      {/* Song Info */}
      <div className="px-8 mt-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-foreground truncate">
              {currentSong.title}
            </h2>
            <p className="text-sm text-muted-foreground">{currentSong.artist}</p>
          </div>
          <button
            onClick={() => toggleFavorite(currentSong.id)}
            className="p-2"
          >
            <Heart
              className={`w-6 h-6 ${
                isFavorite(currentSong.id)
                  ? "fill-primary text-primary"
                  : "text-muted-foreground"
              }`}
            />
          </button>
        </div>

        {/* Seek bar */}
        <div className="mt-4">
          <input
            type="range"
            min={0}
            max={totalDuration}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatDuration(progress)}</span>
            <span>{formatDuration(totalDuration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6 mt-4 mb-8">
          <button className="p-2">
            <Shuffle className="w-5 h-5 text-muted-foreground" />
          </button>
          <button onClick={prevSong} className="p-2">
            <SkipBack className="w-7 h-7 text-foreground fill-foreground" />
          </button>
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 text-background" />
            ) : (
              <Play className="w-7 h-7 text-background ml-1" />
            )}
          </button>
          <button onClick={nextSong} className="p-2">
            <SkipForward className="w-7 h-7 text-foreground fill-foreground" />
          </button>
          <button className="p-2">
            <Repeat className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}