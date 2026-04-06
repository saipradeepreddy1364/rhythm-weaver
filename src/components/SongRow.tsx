import { Song, formatDuration } from "@/data/songs";
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause } from "lucide-react";
import { LikeButton } from "@/components/LikeButton";
import { AddToPlaylistMenu } from "@/components/AddToPlaylistMenu";

interface SongRowProps {
  song: Song;
  queue?: Song[];
  onRequireAuth?: () => void;
}

export function SongRow({ song, queue, onRequireAuth }: SongRowProps) {
  const { playSong, currentSong, isPlaying, togglePlay } = usePlayer();
  const isActive = currentSong?.id === song.id;

  const handleClick = () => {
    if (isActive) togglePlay();
    else playSong(song, queue);
  };

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all active:scale-[0.98]"
      style={{
        background: isActive ? "rgba(249,115,22,0.1)" : "transparent",
      }}
      onClick={handleClick}
    >
      {/* Album art */}
      <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
        {song.albumArt ? (
          <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-500 to-pink-600" />
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
                    background: "#f97316",
                    height: delay === 150 ? "16px" : "10px",
                    animationDelay: `${delay}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {/* Play icon on inactive hover — handled by opacity on parent hover */}
        {!isActive && (
          <div className="absolute inset-0 bg-black/0 hover:bg-black/40 flex items-center justify-center transition-all">
            <Play className="w-4 h-4 text-white opacity-0 hover:opacity-100 fill-white" />
          </div>
        )}
      </div>

      {/* Song info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate leading-tight"
          style={{ color: isActive ? "#f97316" : "rgba(255,255,255,0.9)" }}
        >
          {song.title}
        </p>
        <p className="text-xs text-white/40 truncate mt-0.5 leading-tight">
          {song.artist}
          {song.duration ? ` · ${formatDuration(song.duration)}` : ""}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <LikeButton song={song} onRequireAuth={onRequireAuth} size="sm" className="p-2 text-white/40 hover:text-white" />
        <AddToPlaylistMenu song={song} onRequireAuth={onRequireAuth} />
      </div>
    </div>
  );
}