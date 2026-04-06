import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Music2 } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "#121212" }}
    >
      <div className="text-center px-8">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <Music2 className="w-9 h-9" style={{ color: "rgba(255,255,255,0.3)" }} />
        </div>
        <h1 className="text-6xl font-black text-white mb-3">404</h1>
        <p className="text-lg font-bold text-white mb-2">Page not found</p>
        <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.5)" }}>
          The page you're looking for doesn't exist.
        </p>
        <a
          href="/"
          className="inline-block px-8 py-3 rounded-full text-sm font-bold text-black transition-all active:scale-95"
          style={{ background: "#1DB954" }}
        >
          Go home
        </a>
      </div>
    </div>
  );
};

export default NotFound;