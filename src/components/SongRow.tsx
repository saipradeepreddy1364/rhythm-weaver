import { Song, formatDuration } from "@/data/songs";
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, ListPlus, Download } from "lucide-react";
import { LikeButton } from "@/components/LikeButton";
import { AddToPlaylistMenu } from "@/components/AddToPlaylistMenu";
import { useState } from "react";

interface SongRowProps {
  song: Song;
  queue?: Song[];
  onRequireAuth?: () => void;
  fromLibrary?: boolean;
}

export function SongRow({ song, queue, onRequireAuth, fromLibrary }: SongRowProps) {
  const { playSong, currentSong, isPlaying, togglePlay, addToQueue } = usePlayer();
  const isActive = currentSong?.id === song.id;
  const [queued, setQueued] = useState(false);

  const handleClick = () => {
    if (isActive) togglePlay();
    else playSong(song, queue, fromLibrary);
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToQueue(song);
    setQueued(true);
    setTimeout(() => setQueued(false), 2000);
  };

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all active:scale-[0.98]"
      style={{
        background: isActive ? "rgba(29,185,84,0.1)" : "transparent",
      }}
      onClick={handleClick}
    >
      {/* Album art */}
      <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
        {song.albumArt ? (
          <img
            src={song.albumArt}
            alt={song.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://via.placeholder.com/100x100?text=🎵";
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center">
            <span className="text-white text-sm">🎵</span>
          </div>
        )}

        {/* Playing wave overlay */}
        {isActive && isPlaying && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="flex items-end gap-0.5 h-4">
              {[0, 150, 300].map((delay) => (
                <div
                  key={delay}
                  className="w-0.5 rounded-full animate-pulse"
                  style={{
                    background: "#1DB954",
                    height: delay === 150 ? "16px" : "10px",
                    animationDelay: `${delay}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Hover play icon on inactive */}
        {!isActive && (
          <div className="absolute inset-0 bg-black/0 hover:bg-black/40 flex items-center justify-center transition-all group">
            <Play className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 fill-white transition-opacity" />
          </div>
        )}
      </div>

      {/* Song info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate leading-tight"
          style={{ color: isActive ? "#1DB954" : "rgba(255,255,255,0.9)" }}
        >
          {song.title}
        </p>
        <p className="text-xs text-white/40 truncate mt-0.5 leading-tight">
          {song.artist}
          {song.movie ? ` • ${song.movie}` : ""}
          {song.duration ? ` · ${formatDuration(song.duration)}` : ""}
        </p>
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-0.5 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Add to Queue */}
        <button
          onClick={handleAddToQueue}
          title="Play next"
          className="p-2 rounded-full transition-all active:scale-90"
          style={{
            color: queued ? "#1DB954" : "rgba(255,255,255,0.4)",
          }}
        >
          <ListPlus className="w-4 h-4" />
        </button>

        <LikeButton
          song={song}
          onRequireAuth={onRequireAuth}
          size="sm"
          className="p-2 text-white/40 hover:text-white"
        />

        {/* Download Song */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(`https://musicbackend-xg4u.onrender.com/api/downloads/${song.id}/audio`, '_blank');
          }}
          title="Download Audio"
          className="p-2 rounded-full transition-all active:scale-90 text-white/40 hover:text-white"
        >
          <Download className="w-4 h-4" />
        </button>

        <AddToPlaylistMenu song={song} onRequireAuth={onRequireAuth} />
      </div>
    </div>
  );
}