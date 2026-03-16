import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "./context/AuthContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { setFlowstageKey } from "./lib/flowstage";
import Sidebar from "./components/Sidebar";
import Canvas from "./components/Canvas";
import SchedulePage from "./components/SchedulePage";
import StatisticsPage from "./components/StatisticsPage";
import AuthModal from "./components/AuthModal";

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

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, updateFlowstageKey } = useAuth();
  const hasKey = !!user?.flowstage_key;
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!user?.flowstage_key) return;
    setLoading(true);
    fetch("/api/decrypt-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted: user.flowstage_key }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.key) setKey(data.key);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.flowstage_key]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const err = await updateFlowstageKey(key);
    setSaving(false);
    if (err) {
      setError(err);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError(null);
    const err = await updateFlowstageKey("");
    setSaving(false);
    if (err) {
      setError(err);
    } else {
      setKey("");
      setShowKey(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[420px] animate-modal-in overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-[13px]"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
              Flowstage API key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={loading ? "Loading..." : "fs_..."}
                disabled={loading}
                className="w-full h-10 px-3 pr-10 rounded-lg bg-gray-50 border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 transition-colors font-mono disabled:opacity-50"
              />
              {key && (
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showKey ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              Your key is encrypted before being stored. Get yours from the Flowstage dashboard.
            </p>
          </div>

          {error && (
            <p className="text-[12px] text-red-500 font-medium">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !key.trim()}
              className="flex-1 h-10 rounded-lg bg-gray-900 text-white text-[13px] font-semibold tracking-tight hover:bg-gray-800 active:bg-black disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : saved ? "Saved" : "Save"}
            </button>
            {hasKey && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="h-10 px-4 rounded-lg border border-gray-200 text-[13px] font-medium text-gray-500 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [page, setPage] = useState<Page>("canvas");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setFlowstageKey(user?.flowstage_key ?? null);
  }, [user?.flowstage_key]);

  if (loading) return null;

  return (
    <WorkspaceProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-canvas">
        {!user && <AuthModal />}

        <HamburgerMenu currentPage={page} onNavigate={setPage} />

        {page === "canvas" && (
          <>
            <Sidebar />
            <Canvas />
          </>
        )}
        {page === "schedule" && <SchedulePage />}
        {page === "statistics" && <StatisticsPage />}

        {user && (
          <div className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 h-8 px-3 rounded-lg bg-white/90 backdrop-blur border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors text-[12px] font-medium text-gray-500 hover:text-gray-700"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-2 h-8 px-3 rounded-lg bg-white/90 backdrop-blur border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors text-[12px] font-medium text-gray-500 hover:text-gray-700"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
        )}

        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>
    </WorkspaceProvider>
  );
}
