import { Song, formatDuration } from "@/data/songs";
import { usePlayer } from "@/context/PlayerContext";
import { Heart, Play, Pause } from "lucide-react";

interface SongCardProps {
  song: Song;
  queue?: Song[];
  index?: number;
}

export function SongCard({ song, queue, index }: SongCardProps) {
  const { playSong, currentSong, isPlaying, togglePlay, toggleFavorite, isFavorite } = usePlayer();
  const isActive = currentSong?.id === song.id;

  const handleClick = () => {
    if (isActive) {
      togglePlay();
    } else {
      playSong(song, queue);
    }
  };

  return (
    <div
      className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all duration-200 ${
        isActive ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={handleClick}
    >
      {/* Index or play icon */}
      {index !== undefined && (
        <span className="w-6 text-center text-sm text-muted-foreground group-hover:hidden">
          {index + 1}
        </span>
      )}
      {index !== undefined && (
        <span className="w-6 text-center hidden group-hover:block">
          {isActive && isPlaying ? (
            <Pause className="w-4 h-4 text-primary" />
          ) : (
            <Play className="w-4 h-4 text-foreground" />
          )}
        </span>
      )}

      {/* Album art */}
      <div className="w-10 h-10 rounded flex-shrink-0 overflow-hidden bg-card relative">
        {song.albumArt ? (
          <img
            src={song.albumArt}
            alt={song.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x400?text=No+Image";
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-rose-500 to-purple-600" />
        )}
        {isActive && isPlaying && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="flex items-end gap-0.5 h-4">
              <div className="w-0.5 bg-primary-foreground animate-pulse h-2" style={{ animationDelay: "0ms" }} />
              <div className="w-0.5 bg-primary-foreground animate-pulse h-4" style={{ animationDelay: "150ms" }} />
              <div className="w-0.5 bg-primary-foreground animate-pulse h-3" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Song info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : "text-foreground"}`}>
          {song.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
      </div>

      {/* Duration */}
      <span className="text-xs text-muted-foreground hidden sm:block">
        {song.language || ""}
      </span>

      {/* Favorite button */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleFavorite(song.id); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
      >
        <Heart
          className={`w-4 h-4 ${
            isFavorite(song.id) ? "fill-primary text-primary" : "text-muted-foreground"
          }`}
        />
      </button>

      <span className="text-xs text-muted-foreground w-10 text-right">
        {formatDuration(song.duration)}
      </span>
    </div>
  );
}