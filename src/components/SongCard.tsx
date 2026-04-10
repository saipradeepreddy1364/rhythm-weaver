import { useState, useEffect, useCallback } from "react";
import { Song, formatDuration } from "@/data/songs";
import { usePlayer } from "@/context/PlayerContext";
import { api } from "@/services/api";
import { Heart, Play, Pause, FileText, X, Loader2 } from "lucide-react";

interface SongCardProps {
  song: Song;
  queue?: Song[];
  index?: number;
}

// ─── Lyrics Panel ─────────────────────────────────────────────────────────────
// A slide-up full-screen overlay that fetches and displays lyrics for a song.
// Calls GET /songs/{id}/lyrics via api.getSongLyrics — wired to SongController.java.
function LyricsPanel({
  song,
  onClose,
}: {
  song: Song;
  onClose: () => void;
}) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setLyrics(null);

    api.getSongLyrics(song.id)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data?.lyrics) {
          setLyrics(res.data.lyrics);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [song.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(10,10,10,0.97)", backdropFilter: "blur(16px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold tracking-widest uppercase text-green-400 mb-1">
            Lyrics
          </p>
          <p className="text-base font-bold text-white truncate">{song.title}</p>
          <p className="text-xs text-white/50 truncate">{song.artist}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-4 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.1)" }}
          aria-label="Close lyrics"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 pb-10">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-green-400" />
            <p className="text-sm text-white/40">Fetching lyrics…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <FileText className="w-10 h-10 text-white/20" />
            <p className="text-base font-semibold text-white/60">Lyrics not available</p>
            <p className="text-xs text-white/30 leading-relaxed">
              We couldn't find lyrics for this song. Try again later.
            </p>
          </div>
        )}

        {!loading && !error && lyrics && (
          <pre
            className="whitespace-pre-wrap text-sm leading-8 text-white/80 font-sans"
            style={{ fontFamily: "inherit" }}
          >
            {lyrics}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── SongCard ─────────────────────────────────────────────────────────────────

export function SongCard({ song, queue, index }: SongCardProps) {
  const { playSong, currentSong, isPlaying, togglePlay, toggleFavorite, isFavorite } =
    usePlayer();
  const isActive = currentSong?.id === song.id;
  const [showLyrics, setShowLyrics] = useState(false);

  const handleClick = () => {
    if (isActive) {
      togglePlay();
    } else {
      playSong(song, queue);
    }
  };

  const handleLyricsClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Start the song first if it isn't already the active one
      if (!isActive) playSong(song, queue);
      setShowLyrics(true);
    },
    [isActive, playSong, song, queue]
  );

  return (
    <>
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
                (e.target as HTMLImageElement).src =
                  "https://via.placeholder.com/400x400?text=No+Image";
              }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-rose-500 to-purple-600" />
          )}
          {isActive && isPlaying && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="flex items-end gap-0.5 h-4">
                <div
                  className="w-0.5 bg-primary-foreground animate-pulse h-2"
                  style={{ animationDelay: "0ms" }}
                />
                <div
                  className="w-0.5 bg-primary-foreground animate-pulse h-4"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="w-0.5 bg-primary-foreground animate-pulse h-3"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Song info */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              isActive ? "text-primary" : "text-foreground"
            }`}
          >
            {song.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
        </div>

        {/* Language tag */}
        <span className="text-xs text-muted-foreground hidden sm:block">
          {song.language || ""}
        </span>

        {/* Lyrics button — visible on hover */}
        <button
          onClick={handleLyricsClick}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
          title="Show lyrics"
          aria-label="Show lyrics"
        >
          <FileText
            className={`w-4 h-4 ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          />
        </button>

        {/* Favorite button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(song.id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
          aria-label={isFavorite(song.id) ? "Unlike" : "Like"}
        >
          <Heart
            className={`w-4 h-4 ${
              isFavorite(song.id) ? "fill-primary text-primary" : "text-muted-foreground"
            }`}
          />
        </button>

        {/* Duration */}
        <span className="text-xs text-muted-foreground w-10 text-right">
          {formatDuration(song.duration)}
        </span>
      </div>

      {/* Lyrics full-screen overlay */}
      {showLyrics && (
        <LyricsPanel song={song} onClose={() => setShowLyrics(false)} />
      )}
    </>
  );
}