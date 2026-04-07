import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, Music2, Volume2, VolumeX } from "lucide-react";
import { LikeButton } from "@/components/LikeButton";
import { useState, useEffect, useRef } from "react";

interface MiniPlayerProps {
  onRequireAuth?: () => void;
}

export function MiniPlayer({ onRequireAuth }: MiniPlayerProps) {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    progress,
    duration,
    volume,
    setVolume,
    setShowPlayer,
  } = usePlayer();

  const [showVolume, setShowVolume] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.7);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-close volume popup after 3 seconds of inactivity
  const resetHideTimer = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowVolume(false), 3000);
  };

  useEffect(() => {
    if (showVolume) resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showVolume]);

  if (!currentSong) return null;

  const totalDuration =
    duration && isFinite(duration) && duration > 0
      ? duration
      : currentSong.duration || 1;

  const pct = Math.min(100, (progress / totalDuration) * 100);

  // SVG circular progress
  const RADIUS = 26;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;

  const isMuted = volume === 0;

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMuted) {
      setVolume(prevVolume || 0.7);
    } else {
      setPrevVolume(volume);
      setVolume(0);
    }
    resetHideTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
    resetHideTimer();
  };

  return (
    <div className="fixed bottom-14 left-0 right-0 z-50 px-3 pb-2 pointer-events-none">
      <style>{`
        .mini-vol-slider { -webkit-appearance: none; appearance: none; background: transparent; width: 100%; height: 100%; cursor: pointer; }
        .mini-vol-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          margin-top: -3.5px;
        }
        .mini-vol-slider::-moz-range-thumb {
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          border: none;
        }
        .mini-vol-slider::-webkit-slider-runnable-track { height: 3px; background: transparent; }
        .mini-vol-slider::-moz-range-track { height: 3px; background: transparent; }
      `}</style>

      {/* ── Volume popup ── */}
      {showVolume && (
        <div
          className="pointer-events-auto mb-2 mx-2 rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{
            background: "rgba(28,18,22,0.97)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.07)",
            animation: "fadeSlideUp 0.15s ease",
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={resetHideTimer}
          onTouchMove={resetHideTimer}
        >
          <style>{`
            @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>
          <button onClick={toggleMute} style={{ color: isMuted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)" }}>
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Slim YouTube-style volume bar */}
          <div className="relative flex-1" style={{ height: 3 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
            <div
              className="absolute top-0 left-0 h-full rounded-full pointer-events-none"
              style={{
                width: `${volume * 100}%`,
                background: "linear-gradient(90deg,#e8b4bc,#f4c4cb)",
              }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={handleVolumeChange}
              className="mini-vol-slider absolute"
              style={{ top: "50%", transform: "translateY(-50%)", left: 0 }}
            />
          </div>

          <span className="text-xs font-medium w-7 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>
            {Math.round(volume * 100)}
          </span>
        </div>
      )}

      {/* ── Main pill ── */}
      <div
        className="rounded-full overflow-hidden shadow-2xl pointer-events-auto flex items-center gap-3 px-3 py-2"
        style={{
          background: "rgba(38,28,32,0.97)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.07)",
          height: 72,
        }}
      >
        {/* ── Album art with circular progress ring + play/pause overlay ── */}
        <div className="relative flex-shrink-0" style={{ width: 60, height: 60 }}>
          <svg
            width="60"
            height="60"
            className="absolute inset-0"
            style={{ transform: "rotate(-90deg)" }}
          >
            <circle cx="30" cy="30" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
            <circle
              cx="30" cy="30" r={RADIUS} fill="none" stroke="#e8b4bc" strokeWidth="2.5"
              strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.3s ease" }}
            />
          </svg>

          <div className="absolute rounded-full overflow-hidden" style={{ inset: 5 }}>
            {currentSong.albumArt ? (
              <img src={currentSong.albumArt} alt={currentSong.title} className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/100x100?text=🎵"; }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <Music2 className="w-4 h-4 text-black" />
              </div>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="absolute inset-0 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "rgba(0,0,0,0.30)" }}
          >
            {isPlaying
              ? <Pause className="w-5 h-5 text-white fill-white drop-shadow" />
              : <Play className="w-5 h-5 text-white fill-white ml-0.5 drop-shadow" />
            }
          </button>
        </div>

        {/* ── Song info ── */}
        <button className="flex-1 min-w-0 text-left" onClick={() => setShowPlayer(true)}>
          <p className="font-bold truncate text-white leading-tight" style={{ fontSize: 15 }}>
            {currentSong.title}
          </p>
          <p className="text-xs truncate mt-0.5 leading-tight" style={{ color: "rgba(255,255,255,0.5)" }}>
            {currentSong.artist}
          </p>
        </button>

        {/* ── Volume button ── */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowVolume((v) => {
              if (!v) resetHideTimer();
              return !v;
            });
          }}
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{
            background: showVolume ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)",
            color: isMuted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)",
          }}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* ── Like button ── */}
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
            <LikeButton song={currentSong} onRequireAuth={onRequireAuth} size="sm" className="text-white/70 hover:text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}