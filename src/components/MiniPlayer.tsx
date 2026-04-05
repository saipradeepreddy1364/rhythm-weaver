import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/songs";
import { Play, Pause, SkipBack, SkipForward, Heart, ChevronUp } from "lucide-react";
import { useEffect } from "react";

export function MiniPlayer() {
  const {
    currentSong, isPlaying, togglePlay, nextSong, prevSong,
    progress, setProgress, toggleFavorite, isFavorite, setShowPlayer,
  } = usePlayer();

  useEffect(() => {
    if (!isPlaying || !currentSong) return;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= currentSong.duration) {
          nextSong();
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentSong, setProgress, nextSong]);

  if (!currentSong) return null;

  const pct = (progress / currentSong.duration) * 100;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 glass-surface border-t border-border animate-slide-up">
      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div className="h-full bg-primary transition-all duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center gap-3 px-4 py-2">
        {/* Album art */}
        <div
          className={`w-10 h-10 rounded bg-gradient-to-br ${currentSong.albumArt} flex-shrink-0 cursor-pointer ${isPlaying ? "animate-spin-slow" : ""}`}
          style={{ borderRadius: "50%" }}
          onClick={() => setShowPlayer(true)}
        />

        {/* Song info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowPlayer(true)}>
          <p className="text-sm font-medium truncate text-foreground">{currentSong.title}</p>
          <p className="text-xs text-muted-foreground truncate">{currentSong.artist}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button onClick={toggleFavorite.bind(null, currentSong.id)} className="p-2">
            <Heart className={`w-4 h-4 ${isFavorite(currentSong.id) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
          <button onClick={prevSong} className="p-2">
            <SkipBack className="w-4 h-4 text-foreground" />
          </button>
          <button onClick={togglePlay} className="p-2 bg-foreground rounded-full w-8 h-8 flex items-center justify-center">
            {isPlaying ? <Pause className="w-4 h-4 text-background" /> : <Play className="w-4 h-4 text-background ml-0.5" />}
          </button>
          <button onClick={nextSong} className="p-2">
            <SkipForward className="w-4 h-4 text-foreground" />
          </button>
          <button onClick={() => setShowPlayer(true)} className="p-2 sm:hidden">
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
