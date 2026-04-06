import { Home, Search, Library } from "lucide-react";

type Page = "home" | "search" | "library";

interface BottomNavProps {
  page: Page;
  onNavigate: (page: Page) => void;
}

const tabs: { key: Page; label: string; Icon: typeof Home }[] = [
  { key: "home",    label: "Home",    Icon: Home    },
  { key: "search",  label: "Search",  Icon: Search  },
  { key: "library", label: "Library", Icon: Library },
];

export function BottomNav({ page, onNavigate }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 h-14 flex items-center"
      style={{
        background: "rgba(10,10,10,0.97)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {tabs.map(({ key, label, Icon }) => {
        const active = page === key;
        return (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-all active:scale-95"
          >
            <Icon
              className="w-5 h-5 transition-colors"
              style={{ color: active ? "#1DB954" : "rgba(255,255,255,0.4)" }}
            />
            <span
              className="text-[10px] font-medium tracking-wide transition-colors"
              style={{ color: active ? "#1DB954" : "rgba(255,255,255,0.4)" }}
            >
              {label}
            </span>
            {active && (
              <span
                className="absolute bottom-0 w-8 h-0.5 rounded-full"
                style={{ background: "linear-gradient(90deg,#1DB954,#1ed760)" }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}