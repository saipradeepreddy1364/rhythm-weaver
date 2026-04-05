import { Song } from "@/data/songs";
import { usePlayer } from "@/context/PlayerContext";
import { Play } from "lucide-react";

interface SongRowProps {
  song: Song;
  queue?: Song[];
}

export function SongRow({ song, queue }: SongRowProps) {
  const { playSong, currentSong, isPlaying } = usePlayer();
  const isActive = currentSong?.id === song.id;

  return (
    <div
      className="group relative w-40 flex-shrink-0 cursor-pointer"
      onClick={() => playSong(song, queue)}
    >
      <div className={`w-40 h-40 rounded-lg bg-gradient-to-br ${song.albumArt} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
            </div>
          </div>
        </div>
        {isActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-end gap-0.5 h-4">
            <div className="w-1 bg-primary animate-pulse rounded-full h-2" style={{ animationDelay: "0ms" }} />
            <div className="w-1 bg-primary animate-pulse rounded-full h-4" style={{ animationDelay: "150ms" }} />
            <div className="w-1 bg-primary animate-pulse rounded-full h-3" style={{ animationDelay: "300ms" }} />
          </div>
        )}
      </div>
      <p className={`mt-2 text-sm font-medium truncate ${isActive ? "text-primary" : "text-foreground"}`}>
        {song.title}
      </p>
      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
    </div>
  );
}
