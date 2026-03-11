import { useState, useCallback, useEffect, useRef } from "react";
import { ACCENT_COLORS, KIND_ICONS, type NodeKindName } from "../lib/types";

interface NameNodeModalProps {
  kindName: NodeKindName;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const KIND_LABELS: Record<NodeKindName, string> = {
  videos: "Videos",
  audios: "Audio snippets",
  text_hooks: "Text hooks",
  edits: "Edit style",
  edit_styles: "Edit Styles",
  aesthetic: "Aesthetic",
  account_group: "Account",
};

export default function NameNodeModal({
  kindName,
  onConfirm,
  onCancel,
  loading = false,
}: NameNodeModalProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onConfirm(trimmed);
  }, [value, loading, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
      if (e.key === "Escape") onCancel();
    },
    [handleSubmit, onCancel]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onCancel();
    },
    [onCancel]
  );

  const color = ACCENT_COLORS[kindName];
  const icon = KIND_ICONS[kindName];
  const label = KIND_LABELS[kindName];
  const isEmpty = value.trim().length === 0;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-[360px] animate-modal-in overflow-hidden">
        {/* Header strip */}
        <div className="px-6 pt-6 pb-4 flex flex-col items-center gap-3">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[16px] font-bold"
            style={{ backgroundColor: color }}
          >
            {icon}
          </span>
          <div className="text-center">
            <h2 className="text-[15px] font-semibold text-gray-900">
              New {label}
            </h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Give it a name to get started
            </p>
          </div>
        </div>

        {/* Input */}
        <div className="px-6 pb-4">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${label} name…`}
            disabled={loading}
            className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 bg-gray-50 rounded-lg border border-gray-200 outline-none transition-all duration-150 placeholder:text-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 h-[38px] text-[13px] font-medium text-gray-500 bg-gray-50 rounded-lg transition-colors duration-150 hover:bg-gray-100 active:bg-gray-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isEmpty || loading}
            className="flex-1 h-[38px] text-[13px] font-semibold text-white rounded-lg transition-all duration-150 disabled:opacity-40"
            style={{
              backgroundColor: isEmpty || loading ? "#999" : color,
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                  <path d="M14.5 8a6.5 6.5 0 00-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Creating…
              </span>
            ) : (
              "Create"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
