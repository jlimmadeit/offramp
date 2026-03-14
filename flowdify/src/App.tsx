import { useState, useRef, useEffect, useCallback } from "react";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import Sidebar from "./components/Sidebar";
import Canvas from "./components/Canvas";
import SchedulePage from "./components/SchedulePage";
import StatisticsPage from "./components/StatisticsPage";

type Page = "canvas" | "schedule" | "statistics";

function HamburgerMenu({
  currentPage,
  onNavigate,
}: {
  currentPage: Page;
  onNavigate: (p: Page) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  const items: { page: Page; label: string; icon: string }[] = [
    { page: "canvas", label: "Canvas", icon: "⊞" },
    { page: "schedule", label: "Schedule", icon: "▦" },
    { page: "statistics", label: "Statistics", icon: "▤" },
  ];

  return (
    <div ref={menuRef} className="fixed top-3 left-3 z-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 h-9 pl-2.5 pr-3.5 rounded-lg bg-white/90 backdrop-blur border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
        aria-label="Menu"
      >
        <div className="flex flex-col items-center justify-center gap-[3px]">
          <span className="block w-[14px] h-[1.5px] bg-gray-600 rounded-full" />
          <span className="block w-[14px] h-[1.5px] bg-gray-600 rounded-full" />
          <span className="block w-[14px] h-[1.5px] bg-gray-600 rounded-full" />
        </div>
        <span className="text-[14px] font-semibold text-gray-800 tracking-tight">
          Flowdify Social
        </span>
      </button>

      {open && (
        <div className="absolute top-11 left-0 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 animate-modal-in">
          {items.map((it) => (
            <button
              key={it.page}
              onClick={() => {
                onNavigate(it.page);
                close();
              }}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                currentPage === it.page
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="text-[14px] w-5 text-center opacity-70">
                {it.icon}
              </span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("canvas");

  return (
    <WorkspaceProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-canvas">
        <HamburgerMenu currentPage={page} onNavigate={setPage} />

        {page === "canvas" && (
          <>
            <Sidebar />
            <Canvas />
          </>
        )}
        {page === "schedule" && <SchedulePage />}
        {page === "statistics" && <StatisticsPage />}
      </div>
    </WorkspaceProvider>
  );
}
