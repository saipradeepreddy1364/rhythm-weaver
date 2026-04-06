import { useState } from "react";
import { Heart } from "lucide-react";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import type { Song } from "@/data/songs";

interface LikeButtonProps {
  song: Song;
  /** Show the auth modal when user isn't logged in */
  onRequireAuth?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function LikeButton({
  song,
  onRequireAuth,
  className = "",
  size = "md",
}: LikeButtonProps) {
  const { user } = useAuth();
  const { isLiked, toggleLike } = useLibrary();
  const [animating, setAnimating] = useState(false);

  const liked = isLiked(song.id);

  const sizeClasses = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user) {
      onRequireAuth?.();
      return;
    }

    setAnimating(true);
    await toggleLike(song);
    setTimeout(() => setAnimating(false), 400);
  };

  return (
    <button
      onClick={handleClick}
      title={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
      className={`flex items-center justify-center transition-all ${
        liked
          ? "text-rose-500 hover:text-rose-400"
          : "text-muted-foreground hover:text-foreground"
      } ${animating ? "scale-125" : "scale-100"} ${className}`}
      style={{ transition: "transform 0.2s cubic-bezier(.17,.67,.41,1.4)" }}
    >
      <Heart
        className={sizeClasses[size]}
        fill={liked ? "currentColor" : "none"}
      />
    </button>
  );
}