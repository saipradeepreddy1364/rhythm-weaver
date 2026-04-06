import { useState, useRef, useEffect } from "react";
import { ListPlus, Plus, Check, Loader2, ChevronRight } from "lucide-react";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import type { Song } from "@/data/songs";

interface AddToPlaylistMenuProps {
  song: Song;
  onRequireAuth?: () => void;
  children?: React.ReactNode; // custom trigger
}

export function AddToPlaylistMenu({
  song,
  onRequireAuth,
  children,
}: AddToPlaylistMenuProps) {
  const { user } = useAuth();
  const { playlists, addToPlaylist, createNewPlaylist } = useLibrary();

  const [open, setOpen]               = useState(false);
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState("");
  const [loadingId, setLoadingId]     = useState<string | null>(null);
  const [addedIds, setAddedIds]       = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { onRequireAuth?.(); return; }
    setOpen((v) => !v);
  };

  const handleAdd = async (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (addedIds.has(playlistId) || loadingId) return;
    setLoadingId(playlistId);
    await addToPlaylist(playlistId, song);
    setAddedIds((prev) => new Set(prev).add(playlistId));
    setLoadingId(null);
    setTimeout(() => setOpen(false), 600);
  };

  const handleCreate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!newName.trim()) return;
    setLoadingId("new");
    const playlist = await createNewPlaylist(newName.trim());
    if (playlist) {
      await addToPlaylist(playlist.id, song);
      setAddedIds((prev) => new Set(prev).add(playlist.id));
    }
    setLoadingId(null);
    setCreating(false);
    setNewName("");
    setTimeout(() => setOpen(false), 600);
  };

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {/* Trigger */}
      <div onClick={handleOpen}>
        {children ?? (
          <button
            title="Add to playlist"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ListPlus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-56 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Add to Playlist
            </p>
          </div>

          {/* Existing playlists */}
          <div className="max-h-44 overflow-y-auto">
            {playlists.length === 0 && !creating && (
              <p className="text-xs text-muted-foreground px-3 py-3 text-center">
                No playlists yet
              </p>
            )}
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={(e) => handleAdd(p.id, e)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left"
              >
                <div className="w-7 h-7 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {p.cover_art ? (
                    <img src={p.cover_art} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ListPlus className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-xs">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.song_count ?? 0} songs
                  </p>
                </div>
                {loadingId === p.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : addedIds.has(p.id) ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>

          {/* Create new playlist */}
          <div className="border-t border-border">
            {!creating ? (
              <button
                onClick={(e) => { e.stopPropagation(); setCreating(true); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-accent transition-colors"
              >
                <Plus className="w-4 h-4" />
                New playlist
              </button>
            ) : (
              <div className="px-3 py-2 flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate(e as any);
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  placeholder="Playlist name..."
                  className="flex-1 bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || loadingId === "new"}
                  className="bg-primary text-primary-foreground rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {loadingId === "new" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}