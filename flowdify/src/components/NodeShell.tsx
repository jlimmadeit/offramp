import { useState, useCallback, type ReactNode } from "react";
import { ACCENT_COLORS, KIND_ICONS, type NodeKindName } from "../lib/types";
import { useWorkspace } from "../context/WorkspaceContext";

interface NodeShellProps {
  nodeId: number;
  kindName: NodeKindName;
  title: string;
  children: ReactNode;
  accentOverride?: string;
}

export default function NodeShell({
  nodeId,
  kindName,
  title,
  children,
  accentOverride,
}: NodeShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const { updateNodeName } = useWorkspace();

  const color = accentOverride ?? ACCENT_COLORS[kindName];
  const icon = KIND_ICONS[kindName];

  const handleDoubleClick = useCallback(() => {
    setEditValue(title);
    setEditing(true);
  }, [title]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      updateNodeName(nodeId, trimmed);
    }
  }, [editValue, title, nodeId, updateNodeName]);

  return (
    <div
      className="bg-white rounded-xl shadow-node hover:shadow-node-hover transition-shadow duration-150 min-w-[240px] max-w-[320px]"
      style={{ borderTop: `2px solid ${color}` }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Accent icon pill */}
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {icon}
        </span>

        {/* Title */}
        {editing ? (
          <input
            className="text-[13px] font-semibold text-gray-900 bg-gray-100 rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="text-[13px] font-semibold text-gray-900 truncate flex-1 cursor-text"
            onDoubleClick={handleDoubleClick}
          >
            {title}
          </span>
        )}

        {/* Collapse chevron */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              collapsed ? "-rotate-90" : "rotate-0"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Body — collapsible */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          collapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
        }`}
      >
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}
