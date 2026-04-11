import { useEffect, useState, useRef } from "react";
import { Mic2, RefreshCw, X } from "lucide-react";
import { api } from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LyricsPanelProps {
  /** JioSaavn song ID of the currently playing song */
  songId: string | null;
  /** Song title — shown while loading / on error */
  songTitle?: string;
  /** Called when the user taps the close/collapse button */
  onClose?: () => void;
}

type LyricsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found";   text: string }
  | { status: "missing" }
  | { status: "error" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Split raw lyrics into paragraphs, stripping leading/trailing blank lines */
function parseLyrics(raw: string): string[] {
  return raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** In-memory cache so we never re-fetch the same song in one session */
const lyricsCache = new Map<string, string | null>();

// ─── Component ────────────────────────────────────────────────────────────────

export function LyricsPanel({ songId, songTitle, onClose }: LyricsPanelProps) {
  const [state, setState] = useState<LyricsState>({ status: "idle" });
  const abortRef          = useRef<AbortController | null>(null);

  const fetchLyrics = async (id: string) => {
    // Hit the cache first
    if (lyricsCache.has(id)) {
      const cached = lyricsCache.get(id);
      setState(cached ? { status: "found", text: cached } : { status: "missing" });
      return;
    }

    setState({ status: "loading" });

    // Cancel any in-flight request for a previous song
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const result = await api.getSongLyrics(id);

      if (abortRef.current?.signal.aborted) return;

      if (result.success && result.data?.lyrics) {
        lyricsCache.set(id, result.data.lyrics);
        setState({ status: "found", text: result.data.lyrics });
      } else {
        lyricsCache.set(id, null);
        setState({ status: "missing" });
      }
    } catch {
      if (!abortRef.current?.signal.aborted) {
        setState({ status: "error" });
      }
    }
  };

  useEffect(() => {
    if (!songId) { setState({ status: "idle" }); return; }
    fetchLyrics(songId);
    return () => abortRef.current?.abort();
  }, [songId]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "rgba(0,0,0,0.6)", borderRadius: "1rem" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2">
          <Mic2 className="w-4 h-4" style={{ color: "#1DB954" }} />
          <span className="text-sm font-bold text-white">Lyrics</span>
          {songTitle && (
            <span
              className="text-xs truncate max-w-[140px]"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              · {songTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Retry button shown on error or missing */}
          {(state.status === "error" || state.status === "missing") && songId && (
            <button
              onClick={() => fetchLyrics(songId)}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ background: "rgba(255,255,255,0.08)" }}
              title="Try again"
            >
              <RefreshCw className="w-3.5 h-3.5 text-white/60" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <X className="w-3.5 h-3.5 text-white/60" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto px-5 py-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {state.status === "idle" && (
          <EmptyState icon="🎵" message="Play a song to see lyrics" />
        )}

        {state.status === "loading" && <LoadingSpinner />}

        {state.status === "found" && (
          <LyricsBody text={state.text} />
        )}

        {state.status === "missing" && (
          <EmptyState icon="📄" message="Lyrics not available for this song" />
        )}

        {state.status === "error" && (
          <EmptyState icon="⚠️" message="Could not load lyrics. Tap retry to try again." />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: "rgba(255,255,255,0.15)", borderTopColor: "#1DB954" }}
      />
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
        Fetching lyrics…
      </p>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
        {message}
      </p>
    </div>
  );
}

function LyricsBody({ text }: { text: string }) {
  const paragraphs = parseLyrics(text);

  return (
    <div className="space-y-5 pb-10">
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className="text-sm leading-7 whitespace-pre-line"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {para}
        </p>
      ))}
    </div>
  );
}

export default LyricsPanel;