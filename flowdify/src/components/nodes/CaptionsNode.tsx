import { useState, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../context/WorkspaceContext";

interface CaptionsNodeData {
  dbId: number;
  label: string;
  kindName: "captions";
}

export default function CaptionsNode({
  data,
}: {
  data: CaptionsNodeData;
}) {
  const [captions, setCaptions] = useState<{ id: number; caption: string }[]>(
    []
  );
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { loadWorkspace } = useWorkspace();

  const loadCaptions = useCallback(async () => {
    if (loaded) return;
    const { data: rows } = await supabase
      .from("node_captions")
      .select("id, caption")
      .eq("node_id", data.dbId)
      .order("id");
    if (rows)
      setCaptions(rows.map((r) => ({ id: r.id, caption: r.caption ?? "" })));
    setLoaded(true);
  }, [data.dbId, loaded]);

  if (!loaded) loadCaptions();

  const addCaption = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const { data: row, error } = await supabase
      .from("node_captions")
      .insert({ node_id: data.dbId, caption: trimmed })
      .select("id, caption")
      .single();
    if (error || !row) {
      console.error("Failed to insert caption:", error?.message);
      return;
    }
    setCaptions((prev) => [...prev, { id: row.id, caption: row.caption ?? "" }]);
    setInput("");
    loadWorkspace();
  }, [input, data.dbId, loadWorkspace]);

  const removeCaption = useCallback(
    async (captionId: number) => {
      await supabase.from("node_captions").delete().eq("id", captionId);
      setCaptions((prev) => prev.filter((c) => c.id !== captionId));
      loadWorkspace();
    },
    [loadWorkspace]
  );

  return (
    <NodeShell nodeId={data.dbId} kindName="captions" title={data.label}>
      <div className="flex gap-1.5 mb-2 nopan nodrag">
        <input
          className="flex-1 text-[12px] px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200 outline-none focus:border-[#30D158] transition-colors"
          placeholder="Add a caption..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCaption();
          }}
        />
        <button
          onClick={addCaption}
          className="px-2.5 py-1.5 text-[12px] font-medium text-white rounded-md hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "#30D158" }}
        >
          +
        </button>
      </div>

      <div className="flex flex-col gap-1 nopan nodrag nowheel node-scroll">
        {captions.map((c, i) => (
          <div
            key={c.id}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-md group"
          >
            <span
              className="text-[11px] font-medium w-4 text-right flex-shrink-0"
              style={{ color: "#30D158" }}
            >
              {i + 1}
            </span>
            <span className="text-[12px] text-gray-700 flex-1 truncate">
              {c.caption}
            </span>
            <button
              onClick={() => removeCaption(c.id)}
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
        id="captions-out"
        style={{ background: "#30D158" }}
      />
    </NodeShell>
  );
}
