import { useState, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../context/WorkspaceContext";

interface TextHooksNodeData {
  dbId: number;
  label: string;
  kindName: "text_hooks";
}

export default function TextHooksNode({
  data,
}: {
  data: TextHooksNodeData;
}) {
  const [hooks, setHooks] = useState<{ id: number; hook: string }[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { loadWorkspace, addNodeTextHook, removeNodeTextHook } = useWorkspace();

  const loadHooks = useCallback(async () => {
    if (loaded) return;
    const { data: rows } = await supabase
      .from("node_text_hooks")
      .select("id, hook")
      .eq("node_id", data.dbId)
      .order("id");
    if (rows) setHooks(rows.map((r) => ({ id: r.id, hook: r.hook ?? "" })));
    setLoaded(true);
  }, [data.dbId, loaded]);

  if (!loaded) loadHooks();

  const addHook = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const row = await addNodeTextHook(data.dbId, trimmed);
    if (row) {
      setHooks((prev) => [...prev, { id: row.id, hook: row.hook }]);
      setInput("");
      loadWorkspace();
    }
  }, [input, data.dbId, addNodeTextHook, loadWorkspace]);

  const removeHook = useCallback(
    async (hookId: number) => {
      await removeNodeTextHook(hookId);
      setHooks((prev) => prev.filter((h) => h.id !== hookId));
      loadWorkspace();
    },
    [removeNodeTextHook, loadWorkspace]
  );

  return (
    <NodeShell
      nodeId={data.dbId}
      kindName="text_hooks"
      title={data.label}
    >
      {/* Input */}
      <div className="flex gap-1.5 mb-2 nopan nodrag">
        <input
          className="flex-1 text-[12px] px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200 outline-none focus:border-node-textHooks transition-colors"
          placeholder="Add a hook..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addHook();
          }}
        />
        <button
          onClick={addHook}
          className="px-2.5 py-1.5 text-[12px] font-medium bg-node-textHooks text-white rounded-md hover:opacity-90 transition-opacity"
        >
          +
        </button>
      </div>

      {/* Hooks list */}
      <div className="flex flex-col gap-1 nopan nodrag nowheel node-scroll">
        {hooks.map((h, i) => (
          <div
            key={h.id}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-md group"
          >
            <span className="text-[11px] font-medium text-node-textHooks w-4 text-right flex-shrink-0">
              {i + 1}
            </span>
            <span className="text-[12px] text-gray-700 flex-1 truncate">
              {h.hook}
            </span>
            <button
              onClick={() => removeHook(h.id)}
              className="text-[11px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="text-out"
        style={{ background: "#FF9500" }}
      />
    </NodeShell>
  );
}
